import express from 'express';
import multer from 'multer';
import { extractText } from 'unpdf';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';
import fs from 'fs';
import 'dotenv/config';

const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
const { client_id, client_secret, redirect_uris } = credentials.web;

const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const upload = multer({ storage: multer.memoryStorage() });

/* --- HELPERS --- */

const parseWeight = (w) => {
    if (w == null) return null;
    const num = parseFloat(String(w).replace('%', '').trim());
    return isNaN(num) ? null : num;
};

/* --- AUTH MIDDLEWARE --- */

async function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    const token = authHeader.slice(7);
    try {
        const user = await prisma.user.findUnique({ where: { sessionToken: token } });
        if (!user) return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
        req.user = user;
        next();
    } catch {
        res.status(500).json({ error: 'Authentication check failed.' });
    }
}

/* --- GOOGLE CALENDAR HELPER --- */

async function syncDeadlineToCalendar(deadline, user) {
    if (!user.refreshToken) throw new Error('Google Calendar not connected for this account.');

    const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    client.setCredentials({ refresh_token: user.refreshToken });

    const calendar = google.calendar({ version: 'v3', auth: client });

    const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: deadline.title,
            description: `Weight: ${deadline.weight != null ? deadline.weight + '%' : 'N/A'}`,
            start: { date: new Date(deadline.dueDate).toISOString().split('T')[0] },
            end: { date: new Date(deadline.dueDate).toISOString().split('T')[0] },
        },
    });

    return response.data.htmlLink;
}

/* --- GOOGLE OAUTH ROUTES (public) --- */

app.get('/api/auth/google/url', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.email',
        ],
    });
    res.json({ url: authUrl });
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided.');

    try {
        const { tokens } = await oauth2Client.getToken(code);

        const authedClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        authedClient.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: authedClient });
        const userInfo = await oauth2.userinfo.get();

        const sessionToken = randomBytes(32).toString('hex');

        await prisma.user.upsert({
            where: { email: userInfo.data.email },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                sessionToken,
            },
            create: {
                email: userInfo.data.email,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                sessionToken,
            },
        });

        const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
        res.redirect(
            `${frontendUrl}?auth=success&email=${encodeURIComponent(userInfo.data.email)}&token=${sessionToken}`
        );
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send('Authentication failed.');
    }
});

/* --- PROTECTED ROUTES --- */

app.post('/api/parse-syllabus', authenticate, upload.single('syllabus'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Please upload a syllabus PDF file.' });

        const pdfResult = await extractText(new Uint8Array(req.file.buffer), { mergePages: true });
        const rawText = pdfResult.text;

        if (!rawText?.trim()) return res.status(422).json({ error: 'Could not extract text from this PDF.' });

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze this syllabus text and extract all assignments, midterms, quizzes, labs, and final exams. Return valid JSON only with 'courseCode' (string) and 'deadlines' (array of objects with title, dueDate (ISO string), weight, concentrationArea). \n\n${rawText}`,
            config: {
                systemInstruction: 'You are the parser engine for OutlineOwl.',
                responseMimeType: 'application/json',
            },
        });

        const structuredData = JSON.parse(aiResponse.text);

        if (!Array.isArray(structuredData.deadlines)) {
            throw new Error('AI failed to return a valid deadlines array.');
        }

        const savedCourse = await prisma.course.create({
            data: {
                courseCode: structuredData.courseCode || 'Unknown Course',
                userId: req.user.id,
                deadlines: {
                    create: structuredData.deadlines.map(d => ({
                        title: d.title,
                        dueDate: new Date(d.dueDate),
                        weight: parseWeight(d.weight),
                        concentrationArea: d.concentrationArea || null,
                    })),
                },
            },
            include: { deadlines: true },
        });

        return res.status(200).json({ message: 'Syllabus parsed!', course: savedCourse });
    } catch (error) {
        console.error('Parse error:', error);
        return res.status(500).json({ error: error.message || 'The engine failed.' });
    }
});

app.get('/api/courses', authenticate, async (req, res) => {
    try {
        const courses = await prisma.course.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        return res.status(500).json({ error: 'Failed to fetch courses.' });
    }
});

app.get('/api/courses/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid course ID.' });

    try {
        const course = await prisma.course.findFirst({
            where: { id, userId: req.user.id },
            include: { deadlines: { orderBy: { dueDate: 'asc' } } },
        });
        if (!course) return res.status(404).json({ error: 'Course not found.' });
        return res.json(course);
    } catch (error) {
        console.error('Error fetching course:', error);
        return res.status(500).json({ error: 'Failed to fetch course details.' });
    }
});

app.put('/api/deadlines/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid deadline ID.' });

    const { title, dueDate, weight, concentrationArea } = req.body;
    if (!title || !dueDate) return res.status(400).json({ error: 'Title and due date are required.' });

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: 'Invalid due date.' });

    try {
        // Verify the deadline belongs to this user via its course
        const deadline = await prisma.deadline.findFirst({
            where: { id, course: { userId: req.user.id } },
        });
        if (!deadline) return res.status(404).json({ error: 'Deadline not found.' });

        const updated = await prisma.deadline.update({
            where: { id },
            data: { title, dueDate: parsedDate, weight: parseWeight(weight), concentrationArea },
        });
        return res.json({ message: 'Updated', deadline: updated });
    } catch (error) {
        console.error('Error updating deadline:', error);
        return res.status(500).json({ error: 'Failed to update deadline.' });
    }
});

app.delete('/api/courses/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid course ID.' });

    try {
        const course = await prisma.course.findFirst({ where: { id, userId: req.user.id } });
        if (!course) return res.status(404).json({ error: 'Course not found.' });

        await prisma.course.delete({ where: { id } });
        return res.json({ message: 'Course deleted.' });
    } catch (error) {
        console.error('Error deleting course:', error);
        return res.status(500).json({ error: 'Failed to delete course.' });
    }
});

app.post('/api/sync-deadline/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid deadline ID.' });

    try {
        const deadline = await prisma.deadline.findFirst({
            where: { id, course: { userId: req.user.id } },
        });
        if (!deadline) return res.status(404).json({ error: 'Deadline not found.' });

        const calendarLink = await syncDeadlineToCalendar(deadline, req.user);
        return res.json({ message: 'Successfully synced!', link: calendarLink });
    } catch (error) {
        console.error('Sync error:', error);
        return res.status(500).json({ error: error.message || 'Failed to sync to calendar.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🦉 OutlineOwl engine fired up on port ${PORT}`);
});

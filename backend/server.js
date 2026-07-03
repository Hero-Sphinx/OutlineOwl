import express from 'express';
import multer from 'multer';
import { extractText } from 'unpdf';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import fs from 'fs';
import 'dotenv/config';

const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
const { client_id, client_secret, redirect_uris } = credentials.web;

const oauth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

console.log("Google OAuth Client initialized successfully!");

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/* --- HELPERS --- */

const parseWeight = (w) => {
    if (w == null) return null;
    const num = parseFloat(String(w).replace('%', '').trim());
    return isNaN(num) ? null : num;
};

/* --- GOOGLE CALENDAR HELPER --- */

async function syncDeadlineToCalendar(deadline, userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user || !user.refreshToken) throw new Error("User not authenticated.");

    const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    client.setCredentials({ refresh_token: user.refreshToken });

    const calendar = google.calendar({ version: 'v3', auth: client });

    const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: deadline.title,
            description: `Weight: ${deadline.weight || 'N/A'}`,
            start: { date: new Date(deadline.dueDate).toISOString().split('T')[0] },
            end: { date: new Date(deadline.dueDate).toISOString().split('T')[0] },
        },
    });

    return response.data.htmlLink;
}

/* --- GOOGLE OAUTH ROUTES --- */

app.get('/api/auth/google/url', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.email'
        ]
    });
    res.json({ url: authUrl });
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided.");

    try {
        const { tokens } = await oauth2Client.getToken(code);

        const authedClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        authedClient.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: authedClient });
        const userInfo = await oauth2.userinfo.get();

        await prisma.user.upsert({
            where: { email: userInfo.data.email },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token
            },
            create: {
                email: userInfo.data.email,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token
            }
        });

        res.send(`Successfully authenticated ${userInfo.data.email}! Tokens saved to DB.`);
    } catch (error) {
        console.error("Auth error:", error);
        res.status(500).send("Authentication failed.");
    }
});

/* --- SYLLABUS & COURSE ROUTES --- */

app.post('/api/sync-deadline/:id', async (req, res) => {
    try {
        const deadline = await prisma.deadline.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!deadline) return res.status(404).json({ error: "Deadline not found." });

        const calendarLink = await syncDeadlineToCalendar(deadline, 'salamiolanrewajutemmy@gmail.com');

        res.json({ message: "Successfully synced!", link: calendarLink });
    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ error: "Failed to sync to calendar." });
    }
});

app.post('/api/parse-syllabus', upload.single('syllabus'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Please upload a syllabus PDF file.' });

        const uint8Array = new Uint8Array(req.file.buffer);
        const pdfResult = await extractText(uint8Array, { mergePages: true });
        const rawText = pdfResult.text;

        if (!rawText || rawText.trim().length === 0) return res.status(422).json({ error: 'Could not extract text.' });

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze this syllabus text and extract all assignments, midterms, quizzes, labs, and final exams. Return valid JSON only with 'courseCode' (string) and 'deadlines' (array of objects with title, dueDate (ISO string), weight, concentrationArea). \n\n${rawText}`,
            config: {
                systemInstruction: "You are the parser engine for OutlineOwl.",
                responseMimeType: "application/json",
            }
        });

        const structuredData = JSON.parse(aiResponse.text);

        if (!structuredData.deadlines || !Array.isArray(structuredData.deadlines)) {
            throw new Error("AI failed to return a valid deadlines array.");
        }

        const savedCourse = await prisma.course.create({
            data: {
                courseCode: structuredData.courseCode || "Unknown Course",
                deadlines: {
                    create: structuredData.deadlines.map(d => ({
                        title: d.title,
                        dueDate: new Date(d.dueDate),
                        weight: parseWeight(d.weight),
                        concentrationArea: d.concentrationArea || null
                    }))
                }
            },
            include: { deadlines: true }
        });

        return res.status(200).json({ message: "Syllabus parsed!", course: savedCourse });
    } catch (error) {
        console.error("OutlineOwl Engine Error:", error);
        return res.status(500).json({ error: error.message || 'The engine failed.' });
    }
});

app.get('/api/courses', async (req, res) => {
    try {
        const courses = await prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
        return res.json(courses);
    } catch (error) {
        console.error("Error fetching courses:", error);
        return res.status(500).json({ error: 'Failed to fetch courses.' });
    }
});

app.get('/api/courses/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid course ID.' });

    try {
        const course = await prisma.course.findUnique({
            where: { id },
            include: { deadlines: { orderBy: { dueDate: 'asc' } } }
        });
        if (!course) return res.status(404).json({ error: 'Course not found.' });
        return res.json(course);
    } catch (error) {
        console.error("Error fetching course:", error);
        return res.status(500).json({ error: 'Failed to fetch course details.' });
    }
});

app.put('/api/deadlines/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid deadline ID.' });

    const { title, dueDate, weight, concentrationArea } = req.body;
    if (!title || !dueDate) return res.status(400).json({ error: 'Title and due date are required.' });

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: 'Invalid due date.' });

    try {
        const updated = await prisma.deadline.update({
            where: { id },
            data: { title, dueDate: parsedDate, weight: parseWeight(weight), concentrationArea }
        });
        return res.json({ message: "Updated", deadline: updated });
    } catch (error) {
        console.error("Error updating deadline:", error);
        return res.status(500).json({ error: 'Failed to update deadline.' });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid course ID.' });

    try {
        await prisma.course.delete({ where: { id } });
        return res.json({ message: 'Course deleted' });
    } catch (error) {
        console.error("Error deleting course:", error);
        return res.status(500).json({ error: 'Failed to delete course.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🦉 OutlineOwl engine fired up on port ${PORT}`);
});

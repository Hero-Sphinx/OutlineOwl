import express from 'express';
import multer from 'multer';
import { extractText } from 'unpdf';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';
import twilio from 'twilio';
import cron from 'node-cron';
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

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

/* --- HELPERS --- */

const parseWeight = (w) => {
    if (w == null) return null;
    const num = parseFloat(String(w).replace('%', '').trim());
    return isNaN(num) ? null : num;
};

const formatDate = (d) => new Date(d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

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

    const description = [
        deadline.weight != null ? `Weight: ${deadline.weight}%` : null,
        deadline.concentrationArea ? `Topic: ${deadline.concentrationArea}` : null,
        deadline.studyTips ? `\nStudy Plan:\n${deadline.studyTips}` : null,
    ].filter(Boolean).join('\n');

    const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: deadline.title,
            description,
            start: { date: new Date(deadline.dueDate).toISOString().split('T')[0] },
            end: { date: new Date(deadline.dueDate).toISOString().split('T')[0] },
        },
    });

    return response.data.htmlLink;
}

/* --- TWILIO SMS HELPER --- */

async function sendSmsReminder(user, deadline, course, hoursUntilDue) {
    if (!twilioClient) {
        console.warn('Twilio not configured — skipping SMS.');
        return;
    }
    if (!user.phone) return;

    const timeLabel = hoursUntilDue <= 24 ? '24 Hours' : '3 Days';
    const body = [
        `🦉 OutlineOwl — ${timeLabel} Reminder`,
        ``,
        `📚 ${course.courseCode}: ${deadline.title}`,
        `📅 Due: ${formatDate(deadline.dueDate)}`,
        deadline.weight != null ? `⚖️  Weight: ${deadline.weight}%` : null,
        ``,
        deadline.studyTips
            ? `Study Plan:\n${deadline.studyTips}`
            : `Make sure you're prepared — check your course materials and get started now.`,
        ``,
        `Stay on track! 💪`,
    ].filter(line => line !== null).join('\n');

    await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone,
    });
}

/* --- CRON: SMS REMINDERS (runs every hour) --- */

cron.schedule('0 * * * *', async () => {
    console.log('🕐 Running deadline SMS check...');
    const now = new Date();

    try {
        // 3-day window: due between 71h and 73h from now
        const in3dMin = new Date(now.getTime() + 71 * 60 * 60 * 1000);
        const in3dMax = new Date(now.getTime() + 73 * 60 * 60 * 1000);

        // 24h window: due between 23h and 25h from now
        const in24hMin = new Date(now.getTime() + 23 * 60 * 60 * 1000);
        const in24hMax = new Date(now.getTime() + 25 * 60 * 60 * 1000);

        const upcoming = await prisma.deadline.findMany({
            where: {
                OR: [
                    { dueDate: { gte: in3dMin, lte: in3dMax }, smsReminder3d: false },
                    { dueDate: { gte: in24hMin, lte: in24hMax }, smsReminder24h: false },
                ],
            },
            include: {
                course: { include: { user: true } },
            },
        });

        for (const deadline of upcoming) {
            const { course } = deadline;
            const user = course.user;
            if (!user.phone) continue;

            const hoursUntilDue = (new Date(deadline.dueDate) - now) / (1000 * 60 * 60);
            const is3d = hoursUntilDue > 24;

            try {
                await sendSmsReminder(user, deadline, course, hoursUntilDue);
                await prisma.deadline.update({
                    where: { id: deadline.id },
                    data: is3d ? { smsReminder3d: true } : { smsReminder24h: true },
                });
                console.log(`✅ SMS sent to ${user.email} for "${deadline.title}" (${is3d ? '3d' : '24h'})`);
            } catch (err) {
                console.error(`❌ SMS failed for deadline ${deadline.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Cron error:', err.message);
    }
});

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

/* --- USER PROFILE ROUTES --- */

app.get('/api/user/profile', authenticate, async (req, res) => {
    return res.json({
        email: req.user.email,
        program: req.user.program,
        phone: req.user.phone,
    });
});

app.put('/api/user/profile', authenticate, async (req, res) => {
    const { program, phone } = req.body;
    if (!program?.trim()) return res.status(400).json({ error: 'Program is required.' });

    try {
        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                program: program.trim(),
                phone: phone?.trim() || null,
            },
        });
        return res.json({ program: updated.program, phone: updated.phone });
    } catch {
        return res.status(500).json({ error: 'Failed to update profile.' });
    }
});

/* --- PROTECTED ROUTES --- */

app.post('/api/parse-syllabus', authenticate, upload.single('syllabus'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Please upload a syllabus PDF file.' });

        const pdfResult = await extractText(new Uint8Array(req.file.buffer), { mergePages: true });
        const rawText = pdfResult.text;

        if (!rawText?.trim()) return res.status(422).json({ error: 'Could not extract text from this PDF.' });

        const program = req.user.program || 'a university program';

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are the parser engine for OutlineOwl, a student deadline tracker.
The student is studying ${program}.

Analyze the syllabus below and extract every graded assessment (assignments, midterms, quizzes, labs, projects, final exams).

Return valid JSON only with this exact structure:
{
  "courseCode": "string",
  "deadlines": [
    {
      "title": "string",
      "dueDate": "ISO date string",
      "weight": number or null,
      "concentrationArea": "string — the main topic or unit this assessment covers",
      "studyTips": "string — a concise, practical 3-part study guide for a ${program} student: (1) WHAT to focus on: key topics and concepts, (2) WHERE to find it: specific resources like textbook chapters, lecture slides, or online tools, (3) HOW to study it: the best technique (e.g. practice problems, flashcards, past papers). Keep it under 120 words."
    }
  ]
}

Syllabus:
${rawText}`,
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
                        studyTips: d.studyTips || null,
                    })),
                },
            },
            include: { deadlines: true },
        });

        // Auto-sync all deadlines to Google Calendar
        let calendarSynced = 0;
        if (req.user.refreshToken) {
            const results = await Promise.allSettled(
                savedCourse.deadlines.map(d => syncDeadlineToCalendar(d, req.user))
            );
            calendarSynced = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) console.warn(`Calendar sync: ${calendarSynced} succeeded, ${failed} failed.`);
        }

        return res.status(200).json({
            message: 'Syllabus parsed!',
            course: savedCourse,
            calendarSynced,
        });
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
    } catch {
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
    } catch {
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
        const existing = await prisma.deadline.findFirst({
            where: { id, course: { userId: req.user.id } },
        });
        if (!existing) return res.status(404).json({ error: 'Deadline not found.' });

        const updated = await prisma.deadline.update({
            where: { id },
            data: { title, dueDate: parsedDate, weight: parseWeight(weight), concentrationArea },
        });
        return res.json({ message: 'Updated', deadline: updated });
    } catch {
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
    } catch {
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
        return res.status(500).json({ error: error.message || 'Failed to sync to calendar.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🦉 OutlineOwl engine fired up on port ${PORT}`);
});

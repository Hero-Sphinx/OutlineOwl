# 🦉 OutlineOwl

> **Upload a syllabus. Never miss a deadline again.**

OutlineOwl is an AI-powered student deadline tracker. Drop in a course outline PDF and the system automatically extracts every graded assessment, syncs them to your Google Calendar, generates a personalized study plan for each one, and sends you SMS reminders 3 days and 24 hours before they're due.

**Live →** [outlineowl.vercel.app](https://outlineowl.vercel.app)

---

## ✨ Features

| Feature | Description |
|---|---|
| **AI Syllabus Parsing** | Upload any PDF syllabus — Gemini 2.5 Flash extracts every deadline, weight, and topic automatically |
| **Personalized Study Tips** | The AI generates a WHAT / WHERE / HOW study guide for each assessment, tailored to your program |
| **Google Calendar Sync** | All deadlines are pushed to your Google Calendar the moment a syllabus is parsed |
| **SMS Reminders** | Twilio sends you a study-plan-packed SMS 3 days and 24 hours before each deadline |
| **Multi-User** | Every user gets their own account, courses, and data — fully isolated |
| **Session Auth** | Google OAuth 2.0 with secure session tokens — no passwords, no fuss |
| **Mobile Friendly** | Fully responsive with a slide-in sidebar drawer on mobile |

---

## 🔄 How It Works

```
1.  Student signs in with Google
        ↓
2.  Drops a PDF syllabus into the app
        ↓
3.  Backend extracts text from the PDF
        ↓
4.  Gemini 2.5 Flash parses every deadline + generates study tips per assessment
        ↓
5.  Deadlines saved to the database
        ↓
6.  All deadlines auto-synced to the student's Google Calendar
        ↓
7.  Cron job runs every hour — sends Twilio SMS at the 3-day and 24-hour windows
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        STUDENT                              │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND  ·  Vercel                        │
│                                                             │
│         React 19  ·  Vite  ·  Tailwind CSS 4               │
│                                                             │
│   Sidebar  ·  CourseWorkspace  ·  DeadlineCard              │
│   OnboardingModal  ·  Google OAuth redirect                 │
└──────────────────────────┬──────────────────────────────────┘
                           │  REST  (Bearer token)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND  ·  Render                         │
│                                                             │
│              Express 5  ·  Node.js  ·  Prisma 6            │
│                                                             │
│  ┌─────────────────┐   ┌──────────────────────────────┐    │
│  │  Google OAuth   │   │     Gemini 2.5 Flash  AI     │    │
│  │  Session Tokens │   │  PDF parse · study tips gen  │    │
│  └─────────────────┘   └──────────────────────────────┘    │
│                                                             │
│  ┌─────────────────┐   ┌──────────────────────────────┐    │
│  │ Google Calendar │   │  node-cron  (every hour)     │    │
│  │   Events API    │   │  Twilio SMS  ·  3d & 24h     │    │
│  └─────────────────┘   └──────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │  Prisma ORM
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               DATABASE  ·  Neon  (PostgreSQL)               │
│                                                             │
│     User  ──< Course  ──< Deadline                         │
│     (sessionToken, program, phone)                          │
│     (courseCode, userId)                                    │
│     (title, dueDate, weight, studyTips, smsReminder flags)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

**Frontend**
- [React 19](https://react.dev) — UI framework
- [Vite](https://vitejs.dev) — build tool
- [Tailwind CSS 4](https://tailwindcss.com) — styling
- [react-dropzone](https://react-dropzone.js.org) — PDF drag-and-drop

**Backend**
- [Express 5](https://expressjs.com) — web framework
- [Prisma 6](https://www.prisma.io) — ORM
- [unpdf](https://github.com/unjs/unpdf) — PDF text extraction
- [node-cron](https://github.com/node-cron/node-cron) — scheduled SMS jobs

**AI & Integrations**
- [Google Gemini 2.5 Flash](https://deepmind.google/technologies/gemini/) — syllabus parsing & study tip generation
- [Google OAuth 2.0](https://developers.google.com/identity) — authentication
- [Google Calendar API](https://developers.google.com/calendar) — deadline sync
- [Twilio](https://www.twilio.com) — SMS reminders

**Infrastructure**
- [Vercel](https://vercel.com) — frontend hosting
- [Render](https://render.com) — backend hosting
- [Neon](https://neon.tech) — serverless PostgreSQL

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- A PostgreSQL database (or Neon account)
- Google Cloud project with OAuth 2.0 credentials and Calendar API enabled
- Gemini API key
- Twilio account (optional — SMS reminders skip gracefully if not configured)

### 1. Clone the repo

```bash
git clone https://github.com/Hero-Sphinx/OutlineOwl.git
cd OutlineOwl
```

### 2. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Configure environment variables

Create `backend/.env`:

```env
PORT=5000
DATABASE_URL="postgresql://..."

GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

GEMINI_API_KEY=your_gemini_key

TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

### 4. Push the database schema

```bash
cd backend
npx prisma db push
```

### 5. Start both servers

```bash
# Backend
cd backend && npm run dev

# Frontend (separate terminal)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 🌍 Deployment

| Service | Purpose | Config |
|---|---|---|
| **Vercel** | Frontend | Root dir: `frontend` · Env: `VITE_API_URL` |
| **Render** | Backend | Root dir: `backend` · Build: `npm install && npm run build && npx prisma db push` · Start: `npm start` |
| **Neon** | Database | Copy connection string → `DATABASE_URL` on Render |
| **UptimeRobot** | Keep Render awake | Monitor `https://outlineowl.onrender.com/health` every 5 min |

After deploying, add your Render callback URL to **Google Cloud Console → OAuth consent screen → Authorized redirect URIs**:
```
https://outlineowl.onrender.com/api/auth/google/callback
```

---

## 📁 Project Structure

```
OutlineOwl/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma       # Database models
│   ├── server.js               # Express app, all routes, cron job
│   └── package.json
│
└── frontend/
    └── src/
        ├── App.jsx                     # Root — all state & handlers
        └── components/
            ├── Sidebar.jsx             # Course list, drop zone, auth
            ├── CourseWorkspace.jsx     # Deadline list view
            ├── DeadlineCard.jsx        # Deadline card + study tips
            └── OnboardingModal.jsx     # First-login program & phone setup
```

---

## 🔐 Auth Flow

```
User clicks "Sign in with Google"
    → Frontend hits GET /api/auth/google/url
    → Backend returns Google OAuth URL
    → User redirected to Google
    → Google redirects to /api/auth/google/callback?code=...
    → Backend exchanges code for tokens, upserts user, generates sessionToken
    → Redirects to frontend with ?auth=success&token=...
    → Frontend stores token in localStorage
    → All subsequent requests use Authorization: Bearer <token>
```

---

*Built for students who have better things to do than track deadlines manually.*

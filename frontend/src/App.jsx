import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import CourseWorkspace from './components/CourseWorkspace';
import OnboardingModal from './components/OnboardingModal';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export default function App() {
  // Course data
  const [courses, setCourses] = useState([]);
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [activeCourseData, setActiveCourseData] = useState(null);

  // UI states
  const [parsing, setParsing] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Inline deadline editing
  const [editingDeadlineId, setEditingDeadlineId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', dueDate: '', weight: '', concentrationArea: '' });

  // Auth
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('owl_user_email'));
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem('owl_session_token'));

  // Profile
  const [userProgram, setUserProgram] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Calendar sync
  const [syncingId, setSyncingId] = useState(null);
  const [syncedId, setSyncedId] = useState(null);

  // Pick up email + token after Google OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      const email = params.get('email');
      const token = params.get('token');
      if (email && token) {
        setUserEmail(email);
        setSessionToken(token);
        localStorage.setItem('owl_user_email', email);
        localStorage.setItem('owl_session_token', token);
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  /* ── Auth helpers ──────────────────────────────────────────────── */

  const signOut = useCallback(() => {
    setUserEmail(null);
    setSessionToken(null);
    setUserProgram(null);
    setCourses([]);
    setActiveCourseId(null);
    setActiveCourseData(null);
    setShowOnboarding(false);
    localStorage.removeItem('owl_user_email');
    localStorage.removeItem('owl_session_token');
  }, []);

  const authFetch = useCallback(async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
    });
    if (res.status === 401) {
      signOut();
      throw new Error('SESSION_EXPIRED');
    }
    return res;
  }, [sessionToken, signOut]);

  /* ── Profile ───────────────────────────────────────────────────── */

  const fetchProfile = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await authFetch(`${API_BASE}/api/user/profile`);
      if (!res.ok) return;
      const data = await res.json();
      setUserProgram(data.program);
      if (!data.program) setShowOnboarding(true);
    } catch (err) {
      if (err.message !== 'SESSION_EXPIRED') console.error('Profile fetch failed:', err);
    }
  }, [sessionToken, authFetch]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleOnboardingComplete = useCallback(async ({ program, phone }) => {
    const res = await authFetch(`${API_BASE}/api/user/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program, phone }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save profile.');
    }
    const data = await res.json();
    setUserProgram(data.program);
    setShowOnboarding(false);
    showSuccess('Profile saved! Your study tips will now be personalised.');
  }, [authFetch]);

  /* ── Data fetching ─────────────────────────────────────────────── */

  const fetchCourseIndex = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await authFetch(`${API_BASE}/api/courses`);
      const data = await res.json();
      if (res.ok) {
        setCourses(data);
        if (data.length > 0) setActiveCourseId(prev => prev ?? data[0].id);
      } else {
        setError('Failed to load courses.');
      }
    } catch (err) {
      if (err.message !== 'SESSION_EXPIRED') setError('Could not connect to the server.');
    }
  }, [sessionToken, authFetch]);

  useEffect(() => { fetchCourseIndex(); }, [fetchCourseIndex]);

  useEffect(() => {
    if (!activeCourseId || !sessionToken) return;
    let cancelled = false;

    const load = async () => {
      setLoadingDetails(true);
      try {
        const res = await authFetch(`${API_BASE}/api/courses/${activeCourseId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setActiveCourseData(data);
        else setError(data.error || 'Failed to load course details.');
      } catch (err) {
        if (!cancelled && err.message !== 'SESSION_EXPIRED') setError('Could not load course details.');
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [activeCourseId, sessionToken, authFetch]);

  /* ── Helpers ───────────────────────────────────────────────────── */

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleCourseSelect = useCallback((id) => {
    setActiveCourseId(id);
    setSidebarOpen(false);
  }, []);

  /* ── Syllabus parsing ──────────────────────────────────────────── */

  const onDrop = useCallback(async acceptedFiles => {
    const file = acceptedFiles[0];
    if (!file) return;

    setParsing(true);
    setError(null);
    setSidebarOpen(false);

    const formData = new FormData();
    formData.append('syllabus', file);

    try {
      const res = await authFetch(`${API_BASE}/api/parse-syllabus`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse syllabus.');
      await fetchCourseIndex();
      setActiveCourseId(data.course.id);
      if (data.calendarSynced > 0) {
        showSuccess(`${data.calendarSynced} deadline${data.calendarSynced === 1 ? '' : 's'} added to your Google Calendar.`);
      }
    } catch (err) {
      if (err.message !== 'SESSION_EXPIRED') setError(err.message);
    } finally {
      setParsing(false);
    }
  }, [authFetch, fetchCourseIndex]);

  /* ── Deadline editing ──────────────────────────────────────────── */

  const startEditing = useCallback(deadline => {
    setEditingDeadlineId(deadline.id);
    setEditForm({
      title: deadline.title,
      dueDate: new Date(deadline.dueDate).toISOString().split('T')[0],
      weight: deadline.weight ?? '',
      concentrationArea: deadline.concentrationArea || '',
    });
  }, []);

  const handleEditFormChange = useCallback((field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const saveDeadlineUpdate = useCallback(async id => {
    try {
      const res = await authFetch(`${API_BASE}/api/deadlines/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setActiveCourseData(prev => ({
          ...prev,
          deadlines: prev.deadlines.map(d =>
            d.id === id
              ? { ...d, ...editForm, dueDate: new Date(editForm.dueDate).toISOString() }
              : d
          ),
        }));
        setEditingDeadlineId(null);
      } else {
        setError('Failed to save changes.');
      }
    } catch (err) {
      if (err.message !== 'SESSION_EXPIRED') setError('Could not save changes.');
    }
  }, [authFetch, editForm]);

  /* ── Course deletion ───────────────────────────────────────────── */

  const deleteCourse = useCallback(async id => {
    if (!window.confirm('Delete this course and all its deadlines?')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/courses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveCourseId(null);
        setActiveCourseData(null);
        await fetchCourseIndex();
      } else {
        setError('Failed to delete course.');
      }
    } catch (err) {
      if (err.message !== 'SESSION_EXPIRED') setError('Could not delete course.');
    }
  }, [authFetch, fetchCourseIndex]);

  /* ── Google Calendar ───────────────────────────────────────────── */

  const handleConnectGoogle = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/google/url`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setError('Could not reach the server. Make sure the backend is running.');
    }
  }, []);

  const handleSyncToCalendar = useCallback(async deadlineId => {
    setSyncingId(deadlineId);
    try {
      const res = await authFetch(`${API_BASE}/api/sync-deadline/${deadlineId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSyncedId(deadlineId);
      setTimeout(() => setSyncedId(null), 3000);
    } catch (err) {
      if (err.message !== 'SESSION_EXPIRED') setError(err.message || 'Failed to sync to Google Calendar.');
    } finally {
      setSyncingId(null);
    }
  }, [authFetch]);

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">

      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      <Sidebar
        courses={courses}
        activeCourseId={activeCourseId}
        onCourseSelect={handleCourseSelect}
        onDeleteCourse={deleteCourse}
        parsing={parsing}
        onDrop={onDrop}
        userEmail={userEmail}
        userProgram={userProgram}
        onConnectGoogle={handleConnectGoogle}
        onSignOut={signOut}
        onEditProfile={() => setShowOnboarding(true)}
        isAuthenticated={!!sessionToken}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 flex-shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-white transition-colors p-1"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-black tracking-wider text-indigo-400 uppercase">OutlineOwl</span>
        </div>

        {successMessage && (
          <div className="bg-green-500/10 border-b border-green-500/20 text-green-400 px-4 md:px-6 py-3
            text-sm flex items-center justify-between gap-4 flex-shrink-0">
            <span className="font-medium">✓ {successMessage}</span>
            <button type="button" onClick={() => setSuccessMessage(null)}
              className="text-xs opacity-60 hover:opacity-100 transition-opacity flex-shrink-0">Dismiss</button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border-b border-red-500/20 text-red-400 px-4 md:px-6 py-3
            text-sm flex items-center justify-between gap-4 flex-shrink-0">
            <span className="font-medium">⚠️ {error}</span>
            <button type="button" onClick={() => setError(null)}
              className="text-xs opacity-60 hover:opacity-100 transition-opacity flex-shrink-0">Dismiss</button>
          </div>
        )}

        {parsing && (
          <div className="bg-indigo-600 text-white px-6 py-2.5 text-xs font-bold
            tracking-widest text-center animate-pulse uppercase flex-shrink-0">
            🦉 Extracting syllabus deadlines — please wait...
          </div>
        )}

        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {!sessionToken ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <span className="text-6xl mb-4" aria-hidden="true">🦉</span>
              <h3 className="text-xl font-bold text-white mb-2">Welcome to OutlineOwl</h3>
              <p className="text-sm text-slate-500 max-w-xs">
                Sign in with Google using the button in the sidebar to start tracking your deadlines.
              </p>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="mt-4 md:hidden px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white
                  text-sm font-semibold rounded-xl transition-colors"
              >
                Open Menu to Sign In
              </button>
            </div>
          ) : (
            <CourseWorkspace
              courseData={activeCourseData}
              loadingDetails={loadingDetails}
              editingDeadlineId={editingDeadlineId}
              editForm={editForm}
              onStartEditing={startEditing}
              onSaveUpdate={saveDeadlineUpdate}
              onCancelEdit={() => setEditingDeadlineId(null)}
              onEditFormChange={handleEditFormChange}
              onSyncToCalendar={handleSyncToCalendar}
              syncingId={syncingId}
              syncedId={syncedId}
              userEmail={userEmail}
            />
          )}
        </div>
      </main>
    </div>
  );
}

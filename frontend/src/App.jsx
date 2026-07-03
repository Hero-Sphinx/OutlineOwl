import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import CourseWorkspace from './components/CourseWorkspace';

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

  // Inline deadline editing
  const [editingDeadlineId, setEditingDeadlineId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', dueDate: '', weight: '', concentrationArea: '' });

  // Google Calendar auth
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('owl_user_email'));
  const [syncingId, setSyncingId] = useState(null);
  const [syncedId, setSyncedId] = useState(null);

  // Pick up the email after Google redirects back to the app
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      const email = params.get('email');
      if (email) {
        setUserEmail(email);
        localStorage.setItem('owl_user_email', email);
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  /* ── Data fetching ─────────────────────────────────────────────── */

  const fetchCourseIndex = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/courses`);
      const data = await res.json();
      if (res.ok) {
        setCourses(data);
        if (data.length > 0) setActiveCourseId(prev => prev ?? data[0].id);
      } else {
        setError('Failed to load courses.');
      }
    } catch {
      setError('Could not connect to the server.');
    }
  }, []);

  useEffect(() => { fetchCourseIndex(); }, [fetchCourseIndex]);

  useEffect(() => {
    if (!activeCourseId) return;
    let cancelled = false;

    const load = async () => {
      setLoadingDetails(true);
      try {
        const res = await fetch(`${API_BASE}/api/courses/${activeCourseId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setActiveCourseData(data);
        else setError(data.error || 'Failed to load course details.');
      } catch {
        if (!cancelled) setError('Could not load course details.');
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [activeCourseId]);

  /* ── Syllabus parsing ──────────────────────────────────────────── */

  const onDrop = useCallback(async acceptedFiles => {
    const file = acceptedFiles[0];
    if (!file) return;

    setParsing(true);
    setError(null);

    const formData = new FormData();
    formData.append('syllabus', file);

    try {
      const res = await fetch(`${API_BASE}/api/parse-syllabus`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse syllabus.');
      await fetchCourseIndex();
      setActiveCourseId(data.course.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }, [fetchCourseIndex]);

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
      const res = await fetch(`${API_BASE}/api/deadlines/${id}`, {
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
    } catch {
      setError('Could not save changes.');
    }
  }, [editForm]);

  /* ── Course deletion ───────────────────────────────────────────── */

  const deleteCourse = useCallback(async id => {
    if (!window.confirm('Delete this course and all its deadlines?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/courses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveCourseId(null);
        setActiveCourseData(null);
        await fetchCourseIndex();
      } else {
        setError('Failed to delete course.');
      }
    } catch {
      setError('Could not delete course.');
    }
  }, [fetchCourseIndex]);

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
    if (!userEmail) {
      setError('Connect your Google Calendar first using the button in the sidebar.');
      return;
    }
    setSyncingId(deadlineId);
    try {
      const res = await fetch(`${API_BASE}/api/sync-deadline/${deadlineId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSyncedId(deadlineId);
      setTimeout(() => setSyncedId(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to sync to Google Calendar.');
    } finally {
      setSyncingId(null);
    }
  }, [userEmail]);

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <Sidebar
        courses={courses}
        activeCourseId={activeCourseId}
        onCourseSelect={setActiveCourseId}
        onDeleteCourse={deleteCourse}
        parsing={parsing}
        onDrop={onDrop}
        userEmail={userEmail}
        onConnectGoogle={handleConnectGoogle}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {error && (
          <div className="bg-red-500/10 border-b border-red-500/20 text-red-400 px-6 py-3
            text-sm flex items-center justify-between gap-4 flex-shrink-0">
            <span className="font-medium">⚠️ {error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs opacity-60 hover:opacity-100 flex-shrink-0 transition-opacity"
            >
              Dismiss
            </button>
          </div>
        )}

        {parsing && (
          <div className="bg-indigo-600 text-white px-6 py-2.5 text-xs font-bold
            tracking-widest text-center animate-pulse uppercase flex-shrink-0">
            🦉 Extracting syllabus deadlines — please wait...
          </div>
        )}

        <div className="flex-1 p-8 overflow-y-auto">
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
        </div>
      </main>
    </div>
  );
}

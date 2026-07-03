import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

const toDateInput = (d) => new Date(d).toISOString().split('T')[0];

function App() {
  const [courses, setCourses] = useState([]);
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [activeCourseData, setActiveCourseData] = useState(null);

  const [parsing, setParsing] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState(null);

  const [editingDeadlineId, setEditingDeadlineId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', dueDate: '', weight: '', concentrationArea: '' });

  // 1. FETCH ALL COURSES (Loads left sidebar index tray)
  const fetchCourseIndex = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/courses`);
      const data = await response.json();
      if (response.ok) {
        setCourses(data);
        // Only select the first course if nothing is active yet
        if (data.length > 0) {
          setActiveCourseId(prev => prev ?? data[0].id);
        }
      } else {
        setError('Failed to load courses.');
      }
    } catch (err) {
      console.error("Failed fetching indexes:", err);
      setError('Could not connect to the server.');
    }
  }, []);

  useEffect(() => {
    fetchCourseIndex();
  }, [fetchCourseIndex]);

  // 2. FETCH ACTIVE COURSE WORKSPACE (Loads primary list window view)
  useEffect(() => {
    if (!activeCourseId) return;

    const fetchCourseDetails = async () => {
      setLoadingDetails(true);
      try {
        const response = await fetch(`${API_BASE}/api/courses/${activeCourseId}`);
        const data = await response.json();
        if (response.ok) {
          setActiveCourseData(data);
        } else {
          setError(data.error || 'Failed to load course details.');
        }
      } catch (err) {
        setError('Could not load course details.');
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchCourseDetails();
  }, [activeCourseId]);

  // 3. PARSE FILE HANDLER (File drag-and-drop layer)
  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setParsing(true);
    setError(null);

    const formData = new FormData();
    formData.append('syllabus', file);

    try {
      const response = await fetch(`${API_BASE}/api/parse-syllabus`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to parse syllabus.');

      await fetchCourseIndex();
      setActiveCourseId(data.course.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }, [fetchCourseIndex]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  // 4. INLINE EDIT MODIFIERS
  const startEditing = (deadline) => {
    setEditingDeadlineId(deadline.id);
    setEditForm({
      title: deadline.title,
      dueDate: toDateInput(deadline.dueDate),
      weight: deadline.weight || '',
      concentrationArea: deadline.concentrationArea || ''
    });
  };

  const saveDeadlineUpdate = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/api/deadlines/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        setActiveCourseData(prev => ({
          ...prev,
          deadlines: prev.deadlines.map(d => d.id === id ? { ...d, ...editForm, dueDate: new Date(editForm.dueDate).toISOString() } : d)
        }));
        setEditingDeadlineId(null);
      } else {
        setError('Failed to save changes.');
      }
    } catch (err) {
      setError('Could not save changes.');
    }
  };

  // 5. ERASE WORKSPACE HANDLER
  const deleteCourseWorkspace = async (id) => {
    if (!window.confirm("Are you sure you want to completely erase this course track?")) return;
    try {
      const response = await fetch(`${API_BASE}/api/courses/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setActiveCourseId(null);
        setActiveCourseData(null);
        await fetchCourseIndex();
      } else {
        setError('Failed to delete course.');
      }
    } catch (err) {
      setError('Could not delete course.');
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col justify-between">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-3xl" aria-hidden="true">🦉</span>
            <h1 className="text-xl font-black tracking-wider text-indigo-400 uppercase">OutlineOwl</h1>
          </div>

          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Tracking Workspaces</h2>
          <div className="space-y-2">
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCourseId(c.id)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all font-semibold text-sm flex justify-between items-center group
                  ${activeCourseId === c.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900/50 text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
              >
                <span>📘 {c.courseCode}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteCourseWorkspace(c.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-xs px-1 transition-all"
                  aria-label={`Delete ${c.courseCode}`}
                >
                  <span aria-hidden="true">🗑️</span>
                </button>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <div {...getRootProps()} className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all bg-slate-900/40 hover:bg-slate-900/80 ${isDragActive ? 'border-indigo-500' : 'border-slate-700'}`}>
            <input {...getInputProps()} />
            <p className="text-xs text-slate-400 font-medium">
              {parsing ? "Parsing File..." : "⚡ Drop a new syllabus here"}
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 font-semibold text-sm flex items-center justify-between">
            <span>⚠️ Error: {error}</span>
            <button onClick={() => setError(null)} className="text-xs opacity-60 hover:opacity-100">Dismiss</button>
          </div>
        )}

        {parsing && (
          <div className="bg-indigo-600 text-white px-6 py-2.5 text-xs font-bold tracking-widest text-center animate-pulse uppercase">
            🦉 The Owl is extracting syllabus lines... Hold tight...
          </div>
        )}

        <div className="flex-1 p-8 overflow-y-auto">
          {loadingDetails ? (
            <div className="h-full flex items-center justify-center text-slate-500 font-medium animate-pulse">Syncing timeline items...</div>
          ) : activeCourseData ? (
            <div className="max-w-5xl mx-auto">
              <div className="border-b border-slate-800 pb-6 mb-8 flex justify-between items-end">
                <div>
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Course Workspace Dashboard</div>
                  <h2 className="text-4xl font-black text-white tracking-tight">{activeCourseData.courseCode}</h2>
                </div>
                <div className="text-xs font-mono text-slate-500">
                  Total Deadlines: <span className="text-slate-300 font-bold">{activeCourseData.deadlines?.length || 0}</span>
                </div>
              </div>

              <div className="space-y-4">
                {activeCourseData.deadlines?.map((deadline) => {
                  const isEditing = editingDeadlineId === deadline.id;
                  const cleanDate = toDateInput(deadline.dueDate);

                  return (
                    <div key={deadline.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all shadow-sm">
                      {isEditing ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                            <input type="date" value={editForm.dueDate} onChange={e => setEditForm({...editForm, dueDate: e.target.value})} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                            <input type="text" value={editForm.weight} onChange={e => setEditForm({...editForm, weight: e.target.value})} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                          </div>
                          <textarea value={editForm.concentrationArea} onChange={e => setEditForm({...editForm, concentrationArea: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 h-20" />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingDeadlineId(null)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold">Cancel</button>
                            <button onClick={() => saveDeadlineUpdate(deadline.id)} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold">Save Changes</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col md:flex-row md:items-start gap-4 justify-between group">
                          <div className="flex-1 flex flex-col md:flex-row md:items-start gap-6">
                            <div className="min-w-[110px]">
                              <span className="inline-block bg-slate-900 border border-slate-800 text-indigo-400 font-mono text-xs px-3 py-1.5 rounded-lg font-bold shadow-inner">
                                <span aria-hidden="true">📅</span> {cleanDate}
                              </span>
                            </div>
                            <div className="flex-1">
                              <h3 className="font-bold text-slate-100 text-lg">{deadline.title}</h3>
                              {deadline.concentrationArea && (
                                <p className="text-slate-400 text-sm mt-2">{deadline.concentrationArea}</p>
                              )}
                            </div>
                          </div>
                          <button onClick={() => startEditing(deadline)} className="md:opacity-0 group-hover:opacity-100 text-xs text-slate-500 hover:text-indigo-400 transition-all font-semibold py-1 px-2 hover:bg-slate-900 rounded-md">✏️ Edit</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="text-6xl mb-4" aria-hidden="true">🚀</span>
              <h3 className="text-xl font-bold text-white mb-2">Initialize OutlineOwl Dashboard</h3>
              <p className="text-sm text-slate-500">Drop a syllabus PDF into the tray to start tracking.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

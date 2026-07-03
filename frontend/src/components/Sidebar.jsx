import { useDropzone } from 'react-dropzone';

export default function Sidebar({
  courses,
  activeCourseId,
  onCourseSelect,
  onDeleteCourse,
  parsing,
  onDrop,
  userEmail,
  onConnectGoogle,
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  return (
    <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col justify-between flex-shrink-0">
      {/* Header + course list */}
      <div className="p-6 overflow-y-auto flex-1">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl" aria-hidden="true">🦉</span>
          <h1 className="text-xl font-black tracking-wider text-indigo-400 uppercase">OutlineOwl</h1>
        </div>

        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
          Tracking Workspaces
        </h2>

        <div className="space-y-2">
          {courses.length === 0 && (
            <p className="text-xs text-slate-600 italic px-1">No courses yet. Drop a syllabus below.</p>
          )}
          {courses.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => onCourseSelect(c.id)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all font-semibold text-sm
                flex justify-between items-center group
                ${activeCourseId === c.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-slate-900/50 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
            >
              <span>📘 {c.courseCode}</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDeleteCourse(c.id); }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-xs px-1 transition-all"
                aria-label={`Delete ${c.courseCode}`}
              >
                <span aria-hidden="true">🗑️</span>
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* Footer: drop zone + Google auth status */}
      <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-3">
        <div
          {...getRootProps()}
          className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
            bg-slate-900/40 hover:bg-slate-900/80
            ${isDragActive ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-700'}`}
        >
          <input {...getInputProps()} />
          <p className="text-xs text-slate-400 font-medium">
            {parsing ? 'Parsing syllabus...' : '⚡ Drop a syllabus PDF here'}
          </p>
        </div>

        {userEmail ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" aria-hidden="true" />
            <span className="text-xs text-green-400 font-medium truncate" title={userEmail}>
              {userEmail}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onConnectGoogle}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5
              bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500
              rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-all"
          >
            <GoogleIcon />
            Connect Google Calendar
          </button>
        )}
      </div>
    </aside>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

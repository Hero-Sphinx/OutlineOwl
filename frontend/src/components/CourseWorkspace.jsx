import DeadlineCard from './DeadlineCard';

export default function CourseWorkspace({
  courseData,
  loadingDetails,
  editingDeadlineId,
  editForm,
  onStartEditing,
  onSaveUpdate,
  onCancelEdit,
  onEditFormChange,
  onSyncToCalendar,
  syncingId,
  userEmail,
}) {
  if (loadingDetails) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-slate-500 font-medium animate-pulse">Loading course details...</p>
      </div>
    );
  }

  if (!courseData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <span className="text-6xl mb-4" aria-hidden="true">🚀</span>
        <h3 className="text-xl font-bold text-white mb-2">Welcome to OutlineOwl</h3>
        <p className="text-sm text-slate-500 max-w-xs">
          Drop a syllabus PDF into the tray on the left to automatically extract and track your deadlines.
        </p>
      </div>
    );
  }

  const deadlines = courseData.deadlines ?? [];

  return (
    <div className="max-w-4xl mx-auto w-full">
      {/* Course header */}
      <div className="border-b border-slate-800 pb-6 mb-8 flex justify-between items-end">
        <div>
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">
            Course Workspace
          </p>
          <h2 className="text-4xl font-black text-white tracking-tight">
            {courseData.courseCode}
          </h2>
        </div>
        <div className="text-xs font-mono text-slate-500 text-right">
          <span className="block">Deadlines</span>
          <span className="text-2xl font-black text-slate-300">{deadlines.length}</span>
        </div>
      </div>

      {/* Deadline list */}
      {deadlines.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">
          No deadlines were extracted for this course.
        </p>
      ) : (
        <div className="space-y-4">
          {deadlines.map(deadline => (
            <DeadlineCard
              key={deadline.id}
              deadline={deadline}
              isEditing={editingDeadlineId === deadline.id}
              editForm={editForm}
              onStartEditing={onStartEditing}
              onSaveUpdate={onSaveUpdate}
              onCancelEdit={onCancelEdit}
              onEditFormChange={onEditFormChange}
              onSyncToCalendar={onSyncToCalendar}
              syncing={syncingId === deadline.id}
              userEmail={userEmail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

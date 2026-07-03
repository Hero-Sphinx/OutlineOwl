const toDateInput = d => new Date(d).toISOString().split('T')[0];

export default function DeadlineCard({
  deadline,
  isEditing,
  editForm,
  onStartEditing,
  onSaveUpdate,
  onCancelEdit,
  onEditFormChange,
  onSyncToCalendar,
  syncing,
  userEmail,
}) {
  const cleanDate = toDateInput(deadline.dueDate);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all shadow-sm">
      {isEditing ? (
        <EditForm
          editForm={editForm}
          onEditFormChange={onEditFormChange}
          onSave={() => onSaveUpdate(deadline.id)}
          onCancel={onCancelEdit}
        />
      ) : (
        <DeadlineView
          deadline={deadline}
          cleanDate={cleanDate}
          onEdit={() => onStartEditing(deadline)}
          onSync={() => onSyncToCalendar(deadline.id)}
          syncing={syncing}
          userEmail={userEmail}
        />
      )}
    </div>
  );
}

function EditForm({ editForm, onEditFormChange, onSave, onCancel }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input
          type="text"
          placeholder="Title"
          value={editForm.title}
          onChange={e => onEditFormChange('title', e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
            placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <input
          type="date"
          value={editForm.dueDate}
          onChange={e => onEditFormChange('dueDate', e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
            focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <input
          type="text"
          placeholder="Weight (e.g. 25)"
          value={editForm.weight}
          onChange={e => onEditFormChange('weight', e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
            placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>
      <textarea
        placeholder="Topic / concentration area (optional)"
        value={editForm.concentrationArea}
        onChange={e => onEditFormChange('concentrationArea', e.target.value)}
        rows={3}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
          placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300
            rounded-lg text-xs font-semibold transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white
            rounded-lg text-xs font-semibold transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

function DeadlineView({ deadline, cleanDate, onEdit, onSync, syncing, userEmail }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start gap-4 justify-between group">
      <div className="flex-1 flex flex-col md:flex-row md:items-start gap-6">
        <div className="min-w-[120px]">
          <span className="inline-block bg-slate-900 border border-slate-800 text-indigo-400
            font-mono text-xs px-3 py-1.5 rounded-lg font-bold shadow-inner">
            <span aria-hidden="true">📅</span> {cleanDate}
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-slate-100 text-base">{deadline.title}</h3>
            {deadline.weight != null && (
              <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-400
                border border-indigo-500/20 px-2 py-0.5 rounded-full">
                {deadline.weight}%
              </span>
            )}
          </div>
          {deadline.concentrationArea && (
            <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
              {deadline.concentrationArea}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 md:opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        {userEmail && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            title="Sync to Google Calendar"
            className="text-slate-500 hover:text-green-400 disabled:opacity-40
              text-xs py-1 px-2 hover:bg-slate-900 rounded-md transition-colors"
          >
            {syncing ? (
              <span className="animate-pulse">⏳</span>
            ) : (
              <span aria-hidden="true">📆</span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-slate-500 hover:text-indigo-400
            font-semibold py-1 px-2 hover:bg-slate-900 rounded-md transition-colors"
        >
          ✏️ Edit
        </button>
      </div>
    </div>
  );
}

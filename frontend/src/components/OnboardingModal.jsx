import { useState } from 'react';

export default function OnboardingModal({ onComplete }) {
  const [program, setProgram] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!program.trim()) { setError('Please enter your program.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onComplete({ program: program.trim(), phone: phone.trim() });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">

        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl" aria-hidden="true">🦉</span>
          <div>
            <h2 className="text-lg font-black text-white">Welcome to OutlineOwl</h2>
            <p className="text-xs text-slate-400">Let's personalise your experience</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              What are you studying? <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={program}
              onChange={e => setProgram(e.target.value)}
              placeholder="e.g. Computer Science, Nursing, Business"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm
                text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
            <p className="text-xs text-slate-600 mt-1.5">
              The AI uses this to generate personalised study tips for each assessment.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Phone number for SMS reminders <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm
                text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              You'll receive SMS reminders 3 days and 24 hours before each deadline. Include country code.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400 font-medium">⚠️ {error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
              text-white font-bold text-sm rounded-xl transition-colors"
          >
            {saving ? 'Setting up your account...' : 'Get Started →'}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { createSession } from '../lib/session';
export default function JamCreate({ enabled }) {
  const { user, loading } = useAuth(), navigate = useNavigate();
  const [mode, setMode] = useState('dj'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submitted = useRef(false);
  useEffect(() => { if (!loading && !user) navigate('/login?next=/jam/new', { replace: true }); }, [user, loading, navigate]);
  async function create(event) {
    event.preventDefault();
    if (!user || submitted.current) return;
    submitted.current = true; setBusy(true); setError('');
    try { const session = await createSession(enabled ? mode : 'dj'); navigate('/jam/' + session.invite_code, { replace: true }); }
    catch (failure) { setError(failure.message); submitted.current = false; setBusy(false); }
  }
  return <main className="screen bg-[#f4f5f0] p-6">
    <button aria-label="Back" title="Back" className="self-start p-2" onClick={() => navigate('/')}><ArrowLeft /></button>
    <form className="w-full max-w-sm mx-auto my-auto" onSubmit={create}>
      <h1 className="text-3xl font-black mb-8">Start a Jam</h1>
      <fieldset disabled={busy} className="border-y-2 border-black py-5 mb-6">
        <legend className="font-bold">Playback mode</legend>
        <label className="flex gap-3 py-3"><input type="radio" name="mode" value="dj" checked={mode === 'dj'} onChange={() => setMode('dj')} />
          <span><strong>DJ-led</strong><span className="block text-sm text-gray-600">One DJ controls the room queue.</span></span></label>
        {enabled && <label className="flex gap-3 py-3"><input type="radio" name="mode" value="independent" checked={mode === 'independent'} onChange={() => setMode('independent')} />
          <span><strong>Shared Queue</strong><span className="block text-sm text-gray-600">Everyone listens independently.</span></span></label>}
      </fieldset>
      {error && <p role="alert" className="text-red-700 mb-4">{error}</p>}
      <button className="brutal-btn w-full py-4 flex items-center justify-center gap-2" disabled={busy || loading || !user}>
        <Plus size={18} />{busy ? 'Creating...' : 'Create Jam'}</button>
    </form>
  </main>;
}

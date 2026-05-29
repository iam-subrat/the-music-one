import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import TuiToggle from './TuiToggle';
import s from './tui.module.css';

const BANNER = String.raw`
 ███╗   ███╗██╗   ██╗███████╗██╗ ██████╗     ██████╗ ███╗   ██╗███████╗
 ████╗ ████║██║   ██║██╔════╝██║██╔════╝    ██╔═══██╗████╗  ██║██╔════╝
 ██╔████╔██║██║   ██║███████╗██║██║         ██║   ██║██╔██╗ ██║█████╗
 ██║╚██╔╝██║██║   ██║╚════██║██║██║         ██║   ██║██║╚██╗██║██╔══╝
 ██║ ╚═╝ ██║╚██████╔╝███████║██║╚██████╗    ╚██████╔╝██║ ╚████║███████╗
 ╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝ ╚═════╝     ╚═════╝ ╚═╝  ╚═══╝╚══════╝
`;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toTimeString().slice(0, 8);
}

export default function TerminalShell({ title = 'musicone.sh', status, children, showBanner = false, tagline, onScreenClick }) {
  const { user, profile, signInWithGoogle, signOut } = useAuth();
  const clock = useClock();

  function handleScreenClick(e) {
    if (!onScreenClick) return;
    if (e.target.closest('a, button, input, textarea, [role="button"]')) return;
    if (window.getSelection?.()?.toString()) return; // preserve text selection
    onScreenClick();
  }

  return (
    <div className={s.shell}>
      <div className={s.crt}>
        <div className={s.scan} />
        <div className={s.titlebar}>
          <div className={s.dots}>
            <span className={`${s.dot} ${s.red}`} />
            <span className={`${s.dot} ${s.amber}`} />
            <span className={`${s.dot} ${s.green}`} />
          </div>
          <div className={s.titleText}>{title}</div>
          <div className={s.titleStatus}>
            {status ? <span><b>●</b> {status}</span> : null}
            <span>{clock}</span>
          </div>
        </div>

        <div className={s.screen} onClick={handleScreenClick}>
          {showBanner && <pre className={s.banner}>{BANNER}</pre>}
          {tagline && <div className={s.tagline}>{tagline}</div>}

          <div className={s.authLine}>
            {user ? (
              <>
                <span>
                  session: <b>{profile?.display_name || profile?.email || user.id.slice(0, 8)}</b>
                  {profile?.preferred_platform ? ` · platform=${profile.preferred_platform}` : ''}
                </span>
                <button className={s.authBtn} onClick={signOut}>[ logout ]</button>
              </>
            ) : (
              <>
                <span>session: <b>guest</b> — login enables jam sessions</span>
                <button className={s.authBtn} onClick={signInWithGoogle}>[ login: google ]</button>
              </>
            )}
          </div>

          {children}
        </div>
      </div>
      <TuiToggle />
    </div>
  );
}

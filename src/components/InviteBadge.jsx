import s from '../styles/jam.module.css';
import { useToast } from './Toast';

export default function InviteBadge({ code }) {
  const toast = useToast();
  const url = `${window.location.origin}/jam/${code}`;

  return (
    <div className={s.inviteBadge}>
      Invite: <span className={s.inviteCode}>{code}</span>
      <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '5px 10px' }}
        onClick={() => navigator.clipboard.writeText(url).then(() => toast('Invite link copied!'))}>
        Copy
      </button>
    </div>
  );
}

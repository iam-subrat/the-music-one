import { useEffect, useRef, useState } from 'react';
import s from '../styles/jam.module.css';
import { useToast } from './Toast';
import JamIcon from './JamIcon';

export default function InviteBadge({ code }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef(null);
  const copyRequest = useRef(0);
  const url = `${window.location.origin}/jam/${code}`;

  useEffect(() => {
    setCopied(false);
    return () => {
      clearTimeout(resetTimer.current);
      copyRequest.current++;
    };
  }, [code]);

  async function copyInvite() {
    const request = ++copyRequest.current;
    try {
      await navigator.clipboard.writeText(url);
      if (request !== copyRequest.current) return;
      clearTimeout(resetTimer.current);
      setCopied(true);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
      toast('Invite link copied!');
    } catch {
      if (request !== copyRequest.current) return;
      clearTimeout(resetTimer.current);
      setCopied(false);
      toast('Could not copy the invite link.');
    }
  }

  return (
    <div className={s.inviteBadge}>
      <span className={s.inviteLabel}>Invite code</span>
      <span className={s.inviteCode}>{code}</span>
      <button type="button" className={s.inviteCopy} aria-label={copied ? 'Invite link copied' : 'Copy invite link'} title={copied ? 'Invite link copied' : 'Copy invite link'}
        onClick={copyInvite}>
        <JamIcon name={copied ? 'check' : 'copy'} size={16} />
      </button>
    </div>
  );
}

import { Trash2 } from 'lucide-react';
import s from '../styles/jam.module.css';

export default function DeleteVoteButton({ title, count, threshold, hasVoted, disabled, onClick, className }) {
  return <button type="button" className={className} disabled={disabled} onClick={onClick}
    aria-label={`Delete ${title}, ${count} of ${threshold} votes`} aria-pressed={!!hasVoted}
    title={hasVoted ? "Remove your vote to delete from this room's queue." : "Vote to remove from this room's queue. Click again to withdraw your vote."}>
    <Trash2 size={15} aria-hidden="true" />
    <span>Delete</span>
    <span className={s.deleteVoteCount}>{count}/{threshold} votes</span>
  </button>;
}

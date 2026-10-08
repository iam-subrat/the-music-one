import { useState } from "react";
import { FLAGS } from "../lib/flags";
import { useSkipVotes } from "../hooks/useSkipVotes";
import { castSkipVote, playSpecificSong, removeSkipVote } from "../lib/queue";
import s from "../styles/jam.module.css";
import JamIcon from "./JamIcon";

export default function QueueCard({
  item,
  index,
  isDj,
  sessionId,
  userId,
  participantCount,
  onQueueChange,
  local,
  modeVersion = 0,
  selected = false,
  onStartPlayback,
}) {
  const { count: skipVotes, hasVoted, refresh: refreshVotes } = useSkipVotes(local ? null : item.id, userId, sessionId, false);
  const [isVoting, setIsVoting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [playError, setPlayError] = useState('');
  const skipThreshold = Math.floor(participantCount / 2) + 1;
  const statusCls =
    item.status === "skipped"
      ? s.queueCardSkipped
      : item.resolve_status === "resolving"
        ? s.queueCardResolving
        : item.resolve_status === "failed"
          ? s.queueCardFailed
          : "";

  return (
    <div data-queue-item={item.id} aria-current={selected ? 'true' : undefined} className={`${s.queueCard} ${statusCls} ${selected ? s.personalCurrent : ''}`}>
      {item.thumbnail_url ? (
        <img className={s.queueThumb} src={item.thumbnail_url} alt="" />
      ) : (
        <div className={s.queueThumb} />
      )}
      <div className={s.queueMeta}>
        <div className={s.queueTitle} title={item.title}>
          {item.title}
        </div>
        <div className={s.queueArtist} title={item.artist}>
          {item.artist}
        </div>
        <div className={s.queueBy}>
          by {item.profiles?.display_name || "someone"}
        </div>
        {playError && <div role="alert" className={s.playbackError}>{playError}</div>}
      </div>
      {item.resolve_status === "resolving" && (
        <span className={s.resolvingBadge}>Resolving…</span>
      )}
      {item.resolve_status === "failed" && (
        <span className={s.failedBadge}>Failed</span>
      )}

      {!local && FLAGS.VOTE_TO_SKIP &&
        item.status !== "playing" &&
        item.status !== "skipped" && (
        <button
          className={`${s.queueVoteBtn} ${hasVoted ? s.queueVoteBtnVoted : ""}`}
          disabled={isVoting}
          onClick={handleSkipVote}
        >
          {hasVoted ? "Unvote" : "Skip"} ({skipVotes}/{skipThreshold})
        </button>
      )}

      {(local || isDj) &&
        (local || item.status !== "playing") &&
        item.status !== "skipped" &&
        item.resolve_status !== "failed" && (
          <button
            className={s.queuePlayBtn}
            disabled={item.resolve_status === 'resolving' || local?.state.loading || isStarting}
            onClick={async () => {
              if (local) { local.select(item); return; }
              setIsStarting(true); setPlayError('');
              const cancelStart = onStartPlayback?.(item);
              try { await playSpecificSong(sessionId, item.id, modeVersion); onQueueChange?.(); }
              catch (error) { cancelStart?.(); setPlayError(error.message); }
              finally { setIsStarting(false); }
            }}
            aria-label={`Play ${item.title}`}
            title={`Play ${item.title}`}
          >
            <JamIcon name="play" size={15} />
          </button>
        )}
      {index != null && <div className={s.queuePos}>#{index}</div>}
    </div>
  );

  async function handleSkipVote() {
    setIsVoting(true);
    try {
      if (hasVoted) {
        await removeSkipVote(item.id);
        await refreshVotes();
      } else {
        const skipped = await castSkipVote(item.id);
        if (skipped) onQueueChange?.();
        else await refreshVotes();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsVoting(false);
    }
  }
}

import s from "../styles/jam.module.css";
import QueueCard from "./QueueCard";
import AddSongForm from "./AddSongForm";

export function getUpcoming(items, repeatMode) {
  if (!items || items.length === 0) return [];
  const playing = items.find((i) => i.status === "playing");

  if (repeatMode === "song") {
    return playing ? [{ ...playing, status: "queued" }] : [];
  }

  const eligible = items.filter(
    (i) => i.status !== "skipped" && i.status !== "playing",
  );
  if (!playing) return eligible;

  // Songs after current playing position till the last song added
  const after = eligible
    .filter((i) => i.position > playing.position)
    .sort((a, b) => a.position - b.position);

  if (repeatMode === "queue") {
    const before = eligible
      .filter((i) => i.position < playing.position)
      .sort((a, b) => a.position - b.position);
    return [...after, ...before];
  }

  return after;
}

export default function QueueList({
  items,
  repeatMode,
  sessionId,
  userId,
  participantCount,
  profile,
  isDj,
  onPlatformDetected,
  onAdded,
  onQueueChange,
  showAdd = true,
}) {
  const upcoming = getUpcoming(items, repeatMode);
  return (
    <section className={s.queueSection} aria-labelledby="queue-heading">
      {showAdd && (
        <AddSongForm
          sessionId={sessionId}
          userId={userId}
          profile={profile}
          onPlatformDetected={onPlatformDetected}
          onAdded={onAdded}
        />
      )}
      <div className={s.sectionHeading}>
        <div>
          <p className={s.eyebrow}>Coming up</p>
          <h3 id="queue-heading">Queue</h3>
        </div>
        <span className={s.queueCount}>{upcoming.length} song{upcoming.length !== 1 ? "s" : ""}</span>
      </div>
      <div className={s.queueList}>
        {upcoming.length === 0 ? (
          <p
            style={{
              color: "var(--muted)",
              fontSize: "0.85rem",
              padding: "8px 0",
            }}
          >
            {repeatMode === "queue" && items?.length > 0
              ? "Looping all songs…"
              : "Queue is empty. Add a song above!"}
          </p>
        ) : (
          upcoming.map((item, i) => (
            <QueueCard
              key={item.id}
              item={item}
              index={i + 1}
              isDj={isDj}
              sessionId={sessionId}
              userId={userId}
              participantCount={participantCount}
              onQueueChange={onQueueChange}
            />
          ))
        )}
      </div>
    </section>
  );
}

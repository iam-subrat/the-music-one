import { useLayoutEffect, useRef, useState } from "react";
import s from "./tui.module.css";

const BAR_COUNT = 7;

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function TuiPlaybackIndicator({
  playerState,
  currentTime,
  duration,
  repeatMode = "none",
  statusLabel,
}) {
  const isPlaying = playerState === 1;
  const isPaused = playerState === 2;
  const barsRef = useRef(null);
  const settleFrameRef = useRef(null);
  const [motion, setMotion] = useState(isPlaying ? "playing" : "paused");
  const repeatLabel = repeatMode === "none" ? "off" : repeatMode;

  useLayoutEffect(() => {
    const bars = [...(barsRef.current?.querySelectorAll("i") || [])];
    if (!bars.length) return undefined;

    if (settleFrameRef.current) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }

    if (isPlaying) {
      bars.forEach((bar) => {
        bar.style.removeProperty("transform");
        bar.style.removeProperty("opacity");
      });
      setMotion("playing");
      return undefined;
    }

    if (motion !== "playing") return undefined;

    bars.forEach((bar) => {
      const computed = window.getComputedStyle(bar);
      bar.style.transform = computed.transform;
      bar.style.opacity = computed.opacity;
    });
    setMotion("paused");
    settleFrameRef.current = requestAnimationFrame(() => {
      bars.forEach((bar) => {
        bar.style.transform = "scaleY(.3)";
        bar.style.opacity = ".48";
      });
    });

    return () => {
      if (settleFrameRef.current) cancelAnimationFrame(settleFrameRef.current);
    };
  }, [isPlaying]);

  return (
    <div
      className={s.playbackIndicator}
      data-playing={String(isPlaying)}
      data-motion={motion}
      role="status"
    >
      <span ref={barsRef} aria-hidden="true" className={s.playbackBars}>
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <i key={index} style={{ "--bar-index": index }} />
        ))}
      </span>
      <span className={s.playbackState}>
        {statusLabel || (isPlaying ? "PLAYING" : isPaused ? "PAUSED" : "READY")}
      </span>
      <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      <span>↻ {repeatLabel}</span>
    </div>
  );
}

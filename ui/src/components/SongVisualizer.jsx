import { useLayoutEffect, useRef, useState } from "react";
import s from "../styles/jam.module.css";

const BARS = [
  [22, "1.8s", "-0.55s", 0.38, 1.16, 0.74, 1.0],
  [33, "1.25s", "-0.92s", 0.5, 1.46, 0.94, 1.26],
  [44, "1.65s", "-0.24s", 0.42, 1.2, 0.77, 1.03],
  [55, "1.1s", "-0.7s", 0.56, 1.38, 0.88, 1.19],
  [66, "1.48s", "-1.05s", 0.45, 1.26, 0.81, 1.08],
  [38, "1.28s", "-0.38s", 0.52, 1.5, 0.96, 1.29],
  [58, "1.72s", "-0.86s", 0.4, 1.2, 0.77, 1.03],
  [47, "1.16s", "-0.6s", 0.55, 1.4, 0.9, 1.2],
  [63, "1.52s", "-0.17s", 0.43, 1.3, 0.83, 1.12],
  [35, "1.34s", "-0.76s", 0.5, 1.44, 0.92, 1.24],
  [25, "1.9s", "-0.45s", 0.38, 1.12, 0.72, 0.96],
];

export default function SongVisualizer({ isPlaying, artworkUrl }) {
  const barsRef = useRef(null);
  const settleFrameRef = useRef(null);
  const [motion, setMotion] = useState(isPlaying ? "playing" : "paused");

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
        bar.style.transform = `scaleY(${bar.style.getPropertyValue("--bar-idle")})`;
        bar.style.opacity = ".46";
      });
    });

    return () => {
      if (settleFrameRef.current) cancelAnimationFrame(settleFrameRef.current);
    };
  }, [isPlaying]);

  return (
    <div
      aria-hidden="true"
      className={s.songVisualizer}
      data-layer="foreground"
      data-motion={motion}
      data-playing={isPlaying ? "true" : "false"}
      data-testid="song-visualizer"
      style={artworkUrl ? { "--visualizer-artwork": `url("${artworkUrl}")` } : undefined}
    >
      <div ref={barsRef} className={s.songVisualizerBars}>
        {BARS.map(([height, duration, delay, idle, peak, mid, late], index) => (
          <i
            key={index}
            style={{
              "--bar-index": index,
              "--bar-height": `${height}%`,
              "--bar-duration": duration,
              "--bar-delay": delay,
              "--bar-idle": idle,
              "--bar-peak": peak,
              "--bar-mid": mid,
              "--bar-late": late,
            }}
          />
        ))}
      </div>
    </div>
  );
}

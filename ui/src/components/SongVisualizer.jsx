import s from "../styles/jam.module.css";

const BARS = Array.from({ length: 11 });

export default function SongVisualizer({ isPlaying, artworkUrl }) {
  return (
    <div
      aria-hidden="true"
      className={s.songVisualizer}
      data-playing={isPlaying ? "true" : "false"}
      data-testid="song-visualizer"
      style={artworkUrl ? { "--visualizer-artwork": `url("${artworkUrl}")` } : undefined}
    >
      <div className={s.songVisualizerBars}>
        {BARS.map((_, index) => (
          <i
            key={index}
            style={{ "--bar-index": index, "--bar-height": `${22 + (index % 5) * 11}%` }}
          />
        ))}
      </div>
    </div>
  );
}

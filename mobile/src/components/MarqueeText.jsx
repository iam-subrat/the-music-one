import { useEffect, useRef, useState, memo } from "react";

function MarqueeText({
  text = "",
  as: Component = "div",
  className = "",
  speed = 30,
}) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [overflows, setOverflows] = useState(false);
  const [duration, setDuration] = useState(8);

  useEffect(() => {
    let lastContainerWidth = 0;

    const checkOverflow = () => {
      if (!containerRef.current || !measureRef.current) return;
      const textWidth = measureRef.current.getBoundingClientRect().width;
      const containerWidth = containerRef.current.getBoundingClientRect().width;

      if (containerWidth <= 0) return;

      // Hysteresis buffer: only overflow if text genuinely exceeds container by > 4px
      const isOverflow = textWidth > containerWidth + 4;

      setOverflows((prev) => (prev !== isOverflow ? isOverflow : prev));

      if (isOverflow) {
        // Comfortable scroll speed: ~30px/sec + 4s pauses (2s start, 2s end)
        const scrollDist = textWidth + 32; // 32px is pr-8
        const scrollTime = scrollDist / speed;
        const totalDuration = Math.max(6, Math.round(scrollTime + 4));
        setDuration((prev) =>
          Math.abs(prev - totalDuration) >= 1 ? totalDuration : prev,
        );
      }
    };

    // Initial check
    checkOverflow();

    // Check on resize, but ignore subpixel/negligible fluctuations (<= 3px)
    // to avoid layout loops or interrupting active CSS animations
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (Math.abs(width - lastContainerWidth) > 3) {
            lastContainerWidth = width;
            checkOverflow();
          }
        }
      });
      if (containerRef.current) {
        ro.observe(containerRef.current);
      }
    }

    return () => {
      ro?.disconnect();
    };
  }, [text, speed]);

  return (
    <Component
      ref={containerRef}
      className={`relative overflow-hidden w-full ${overflows ? "marquee-mask" : ""} ${className}`}
    >
      <span
        ref={measureRef}
        className="absolute invisible pointer-events-none whitespace-nowrap opacity-0"
        style={{ position: "absolute", top: 0, left: 0 }}
        aria-hidden="true"
      >
        {text}
      </span>

      {overflows ? (
        <span
          className="inline-flex w-max animate-marquee whitespace-nowrap will-change-transform active:[animation-play-state:paused] hover:[animation-play-state:paused]"
          style={{ animationDuration: `${duration}s` }}
        >
          <span className="pr-8">{text}</span>
          <span className="pr-8" aria-hidden="true">
            {text}
          </span>
        </span>
      ) : (
        <span className="block truncate">{text}</span>
      )}
    </Component>
  );
}

export default memo(MarqueeText);

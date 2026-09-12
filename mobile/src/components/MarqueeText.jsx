import { useEffect, useRef, useState } from "react";

export default function MarqueeText({
  text = "",
  as: Component = "div",
  className = "",
  speed = 35,
}) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [overflows, setOverflows] = useState(false);
  const [duration, setDuration] = useState(10);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && measureRef.current) {
        const textWidth = measureRef.current.offsetWidth;
        const containerWidth = containerRef.current.clientWidth;
        const isOverflow = textWidth > containerWidth;
        setOverflows(isOverflow);
        if (isOverflow) {
          const calcDuration = Math.max(
            5,
            Math.round((textWidth + 32) / speed),
          );
          setDuration(calcDuration);
        }
      }
    };

    const rafId = requestAnimationFrame(checkOverflow);

    const ro = new ResizeObserver(() => {
      checkOverflow();
    });

    if (containerRef.current) {
      ro.observe(containerRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
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

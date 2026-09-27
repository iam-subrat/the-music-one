const paths = {
  previous: <><path d="M5 5v14" strokeWidth="2.6" /><path d="m19 5-12 7 12 7V5Z" fill="currentColor" stroke="none" /></>,
  next: <><path d="M19 5v14" strokeWidth="2.6" /><path d="M5 5v14l12-7L5 5Z" fill="currentColor" stroke="none" /></>,
  play: <path d="M8 5v14l11-7L8 5Z" fill="currentColor" stroke="none" />,
  pause: <><path d="M8 5v14" strokeWidth="3.5" /><path d="M16 5v14" strokeWidth="3.5" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  repeat: <><path d="m17 2 3 3-3 3" /><path d="M4 11V8a3 3 0 0 1 3-3h13" /><path d="m7 22-3-3 3-3" /><path d="M20 13v3a3 3 0 0 1-3 3H4" /></>,
  skip: <><path d="M5 12h12" /><path d="m13 8 4 4-4 4" /><path d="M20 7v10" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12 15h5" /></>,
};

export default function JamIcon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import JamIcon from './JamIcon';
import s from '../styles/jam.module.css';

const options = [['none', 'Off'], ['song', 'Song'], ['queue', 'Queue']];
export default function RepeatMenu({ value = 'none', onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null), menu = useRef(null);
  const id = useId();
  const label = options.find(([key]) => key === value)?.[1] || 'Off';
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('[aria-checked="true"]')?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function keyboard(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...menu.current.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }
  return <div className={s.repeatMenu} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} className={s.repeatTrigger} type="button" aria-label={`Repeat: ${label}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={disabled} onClick={() => setOpen(!open)} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); }
      }}>
      <JamIcon name="repeat" size={16} /><span>Repeat</span><strong>{label}</strong><span aria-hidden="true" className={s.menuChevron} />
    </button>
    {open && <div ref={menu} id={id} className={s.repeatOptions} role="menu" aria-label="Repeat mode" onKeyDown={keyboard}>
      {options.map(([key, text]) => <button key={key} type="button" role="menuitemradio" aria-checked={key === value}
        tabIndex={-1} onClick={() => { close(true); onChange(key); }}>
        <span>{text}</span>{key === value && <JamIcon name="check" size={15} />}
      </button>)}
    </div>}
  </div>;
}

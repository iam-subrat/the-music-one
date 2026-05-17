// ui/src/components/base/NeuButton.jsx
export default function NeuButton({
  children,
  variant = 'ghost',
  icon,
  onClick,
  type = 'button',
  disabled = false,
  style,
  ...props
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 24px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
  };

  const variants = {
    primary: {
      background: 'linear-gradient(145deg, #9b88e0, #7660c7)',
      color: '#fff',
      boxShadow: '5px 5px 14px var(--accent-glow), -4px -4px 14px var(--sl)',
    },
    ghost: {
      background: 'var(--surface)',
      color: 'var(--icons)',
      boxShadow: 'var(--raised-sm)',
    },
  };

  function handleMouseEnter(e) {
    if (disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.boxShadow = '7px 7px 20px var(--accent-glow), -5px -5px 16px var(--sl)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    } else {
      e.currentTarget.style.boxShadow = 'var(--raised)';
      e.currentTarget.style.color = 'var(--text)';
    }
  }

  function handleMouseLeave(e) {
    e.currentTarget.style.boxShadow = variants[variant].boxShadow;
    e.currentTarget.style.transform = '';
    e.currentTarget.style.color = variants[variant].color;
  }

  function handleMouseDown(e) {
    if (disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.boxShadow = 'inset 4px 4px 10px rgba(0,0,0,0.2), inset -3px -3px 8px rgba(255,255,255,0.1)';
    } else {
      e.currentTarget.style.boxShadow = 'var(--pressed)';
    }
    e.currentTarget.style.transform = 'translateY(1px)';
  }

  function handleMouseUp(e) {
    e.currentTarget.style.boxShadow = variants[variant].boxShadow;
    e.currentTarget.style.transform = '';
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      {...props}
    >
      {children}
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
    </button>
  );
}

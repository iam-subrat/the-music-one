// ui/src/components/base/NeuInput.jsx
export default function NeuInput({ icon, value, onChange, placeholder, type = 'text', disabled = false, style }) {
  const base = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--surface)',
    boxShadow: 'var(--raised-sm)',
    fontFamily: 'inherit',
    fontSize: '0.93rem',
    transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    ...style,
  };

  return (
    <div style={base}>
      {icon && (
        <span style={{ display: 'flex', alignItems: 'center', opacity: 0.45, flexShrink: 0, color: 'var(--icons)' }}>
          {icon}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          outline: 'none',
        }}
      />
    </div>
  );
}

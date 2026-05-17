// ui/src/components/base/NeuInput.jsx
import { useState } from 'react';

export default function NeuInput({ icon, value, onChange, placeholder, type = 'text', disabled = false, style }) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        borderRadius: 'var(--radius-sm)',
        padding: 5,
        background: 'var(--surface)',
        boxShadow: focused
          ? 'var(--raised), 0 0 0 3px var(--accent-soft)'
          : 'var(--raised)',
        transition: 'box-shadow 0.25s ease',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 11,
          padding: '13px 16px',
          background: 'var(--surface)',
          boxShadow: 'var(--recessed)',
        }}
      >
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: '0.93rem',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

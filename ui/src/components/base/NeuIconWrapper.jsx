// ui/src/components/base/NeuIconWrapper.jsx
export default function NeuIconWrapper({ children, size = 48, radius = 14, style }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--surface)',
        boxShadow: 'var(--raised-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--icons)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

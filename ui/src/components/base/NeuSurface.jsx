// ui/src/components/base/NeuSurface.jsx
const SHADOW = {
  sm: 'var(--raised-sm)',
  md: 'var(--raised)',
  lg: 'var(--raised-lg)',
};

export default function NeuSurface({ children, size = 'md', style, className, ...props }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        boxShadow: SHADOW[size],
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

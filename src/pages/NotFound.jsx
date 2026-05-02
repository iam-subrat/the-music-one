export default function NotFound() {
  return (
    <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>404</h2>
      <p style={{ color: 'var(--muted)', marginTop: 8 }}>Page not found.</p>
      <a href="/" className="btn" style={{ marginTop: 20 }}>Go home</a>
    </div>
  );
}

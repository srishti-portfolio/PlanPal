export function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="auth-page" id="main">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/favicon.svg" alt="" width="40" height="40" />
          <span>PlanPal</span>
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
      <p className="auth-tagline">Plan weddings, birthdays and community events with an AI co-planner.</p>
    </main>
  );
}

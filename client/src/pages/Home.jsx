import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { Field } from '../components/Field.jsx';
import { Alert, EmptyState, Loading, RoleBadge, StatusBadge } from '../components/Feedback.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatRange } from '../utils/format.js';
import { effectiveEventStatus, upcomingEvents } from '../utils/status.js';

function JoinEventForm() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const cleaned = code.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(cleaned)) {
      setError('Event codes are 8 letters/numbers, e.g. K7PM2QXA.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { event } = await api('/events/join', { method: 'POST', body: { code: cleaned } });
      navigate(`/events/${event.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" noValidate>
      <Field
        label="Event code"
        hint="Ask the event head for the code."
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={14}
        className="code-input"
        value={code}
        error={error}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" className="btn btn-secondary" disabled={busy}>
        {busy ? 'Joining…' : 'Join event'}
      </button>
    </form>
  );
}

export function EventCard({ event }) {
  return (
    <li>
      <Link to={`/events/${event.id}`} className="event-card">
        <span className="event-card-type">{event.eventType ?? 'Event'}</span>
        <span className="event-card-name">{event.name}</span>
        <span className="event-card-dates">{formatRange(event.startDate, event.endDate)}</span>
        <span className="row gap-sm">
          <StatusBadge status={effectiveEventStatus(event)} />
          <RoleBadge role={event.role} />
        </span>
      </Link>
    </li>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { data, error, loading } = useApi('/events');
  const upcoming = data ? upcomingEvents(data.events) : [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Hi {user.name.split(' ')[0]} 👋</h1>
        <p className="muted">What are we celebrating next?</p>
      </header>

      <div className="grid-2 home-actions">
        <section className="card card-accent" aria-labelledby="create-title">
          <h2 id="create-title">Create an event</h2>
          <p className="muted">You&apos;ll be the event head. Get a code to invite people and AI-recommended tasks.</p>
          <Link to="/events/new" className="btn btn-primary">
            + Create event
          </Link>
        </section>
        <section className="card" aria-labelledby="join-title">
          <h2 id="join-title">Join an event</h2>
          <JoinEventForm />
        </section>
      </div>

      <section aria-labelledby="upcoming-title" className="section">
        <h2 id="upcoming-title">Upcoming events</h2>
        {loading && <Loading />}
        <Alert>{error?.message}</Alert>
        {data && upcoming.length === 0 && (
          <EmptyState title="No upcoming events">
            <p>Create one or join with a code to see it here.</p>
          </EmptyState>
        )}
        {upcoming.length > 0 && (
          <ul className="event-grid">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

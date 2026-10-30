import { Link } from 'react-router-dom';
import { Alert, EmptyState, Loading, RoleBadge, StatusBadge } from '../components/Feedback.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDate } from '../utils/format.js';
import { effectiveEventStatus } from '../utils/status.js';

/** Every event the account is part of, with when they created/joined it and when it ends. */
export default function Events() {
  const { data, error, loading } = useApi('/events');
  const events = data?.events ?? [];

  return (
    <div className="page">
      <header className="page-header row space-between">
        <div>
          <h1>Your events</h1>
          <p className="muted">Everything you created or joined.</p>
        </div>
        <Link to="/events/new" className="btn btn-primary">
          + Create event
        </Link>
      </header>

      {loading && <Loading />}
      <Alert>{error?.message}</Alert>
      {data && events.length === 0 && (
        <EmptyState title="You haven't joined any events yet">
          <p>
            <Link to="/">Create or join one from Home.</Link>
          </p>
        </EmptyState>
      )}

      {events.length > 0 && (
        <div className="table-wrap">
          <table className="events-table">
            <caption className="sr-only">Your events</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Your role</th>
                <th scope="col">Created / joined on</th>
                <th scope="col">End date</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <th scope="row">
                    <Link to={`/events/${event.id}`}>{event.name}</Link>
                    <span className="muted small block">{event.eventType ?? 'Type not set'}</span>
                  </th>
                  <td data-label="Your role">
                    <RoleBadge role={event.role} />
                  </td>
                  <td data-label={event.role === 'head' ? 'Created on' : 'Joined on'}>
                    {formatDate(event.joinedAt)}
                    <span className="muted small block">{event.role === 'head' ? 'created' : 'joined'}</span>
                  </td>
                  <td data-label="End date">{formatDate(event.endDate)}</td>
                  <td data-label="Status">
                    <StatusBadge status={effectiveEventStatus(event)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

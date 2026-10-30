import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { AiSuggestions } from '../components/events/AiSuggestions.jsx';
import { EventDetailsForm } from '../components/events/EventDetailsForm.jsx';
import { ImportantDates } from '../components/events/ImportantDates.jsx';
import { KanbanBoard } from '../components/events/KanbanBoard.jsx';
import { MembersPanel } from '../components/events/MembersPanel.jsx';
import { TaskForm } from '../components/events/TaskForm.jsx';
import { Alert, EmptyState, Loading, RoleBadge, StatusBadge } from '../components/Feedback.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useTaskActions } from '../hooks/useTaskActions.js';
import { formatDateTime, formatMoney, formatRange } from '../utils/format.js';
import { effectiveEventStatus, EVENT_STATUS_OPTIONS } from '../utils/status.js';

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the code is still visible to copy manually */
    }
  }
  return (
    <span className="code-chip">
      Join code <strong className="code">{code}</strong>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Code copied to clipboard' : ''}
      </span>
    </span>
  );
}

function MyEventNotes({ eventId }) {
  const { data } = useApi(`/notes?eventId=${eventId}`);
  if (!data) return null;
  return data.notes.length === 0 ? (
    <p className="muted">
      No notes linked to this event. <Link to="/you#notes">Write one</Link>
    </p>
  ) : (
    <ul className="note-list">
      {data.notes.map((note) => (
        <li key={note.id} className="note">
          <p className="note-content">{note.content}</p>
          <span className="muted small">{formatDateTime(note.updatedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, error, loading, setData } = useApi(`/events/${eventId}`);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState('');

  const setSlice = useCallback(
    (key) => (updater) =>
      setData((d) => ({ ...d, [key]: typeof updater === 'function' ? updater(d[key]) : updater })),
    [setData],
  );
  const setTasks = useCallback((updater) => setSlice('tasks')(updater), [setSlice]);
  const taskActions = useTaskActions(eventId, setTasks, setActionError);

  if (loading && !data) return <Loading label="Loading event…" />;
  if (error) {
    return (
      <div className="page">
        <Alert>{error.message}</Alert>
        <Link to="/events">← Back to events</Link>
      </div>
    );
  }
  if (!data) return null;

  const { event, role, importantDates, tasks, members } = data;
  const isHead = role === 'head';
  const canEdit = role === 'head' || role === 'editor';
  const status = effectiveEventStatus(event);

  async function changeEventStatus(nextStatus) {
    setActionError('');
    try {
      const { event: saved } = await api(`/events/${eventId}`, { method: 'PATCH', body: { status: nextStatus } });
      setData((d) => ({ ...d, event: { ...d.event, ...saved } }));
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function leaveOrDelete() {
    const question = isHead
      ? `Delete "${event.name}" for everyone? This cannot be undone.`
      : `Leave "${event.name}"? You'll need the code to rejoin.`;
    if (!window.confirm(question)) return;
    try {
      await api(isHead ? `/events/${eventId}` : `/events/${eventId}/leave`, { method: isHead ? 'DELETE' : 'POST' });
      navigate('/events', { replace: true });
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div className="page">
      <Link to="/events" className="back-link">
        ← All events
      </Link>

      <header className="event-header">
        <div>
          <p className="eyebrow">{event.eventType ?? 'Event'}</p>
          <h1>{event.name}</h1>
          <p className="muted">{formatRange(event.startDate, event.endDate)}</p>
          <div className="row gap-sm wrap">
            <StatusBadge status={status} />
            <RoleBadge role={role} />
            {isHead && event.code && <CopyCode code={event.code} />}
          </div>
        </div>
        <div className="event-header-actions">
          <Link to={`/assistant?event=${eventId}`} className="btn btn-primary">
            ✨ Ask AI about this event
          </Link>
          {isHead && (
            <div className="field compact">
              <label htmlFor="event-status">Event status</label>
              <select id="event-status" value={event.status} onChange={(e) => changeEventStatus(e.target.value)}>
                {EVENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      <Alert>{actionError}</Alert>
      {status === 'delayed' && (
        <Alert type="warning">The end date has passed and this event is not marked finished, so it shows as delayed.</Alert>
      )}

      <section className="card section" aria-labelledby="board-title">
        <div className="row space-between">
          <h2 id="board-title">Task dashboard</h2>
          <span className="muted small">
            {tasks.filter((t) => t.status === 'completed').length}/{tasks.length} completed
          </span>
        </div>
        {tasks.length === 0 && !canEdit ? (
          <EmptyState title="No tasks yet" />
        ) : (
          <KanbanBoard
            tasks={tasks}
            canEdit={canEdit}
            maxDate={event.endDate}
            onStatusChange={taskActions.changeStatus}
            onUpdate={taskActions.update}
            onDelete={taskActions.remove}
          />
        )}
        {canEdit && (
          <div className="grid-2 section">
            <details className="card-inset">
              <summary>+ Add a task</summary>
              <TaskForm onSubmit={taskActions.add} maxDate={event.endDate} />
            </details>
            <div className="card-inset">
              <AiSuggestions eventId={eventId} onAdded={taskActions.addMany} />
            </div>
          </div>
        )}
      </section>

      <div className="grid-2 section">
        <section className="card" aria-labelledby="details-title">
          <div className="row space-between">
            <h2 id="details-title">Details</h2>
            {canEdit && !editing && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <EventDetailsForm
              event={event}
              fields={['name', 'startDate', 'endDate', 'eventType', 'budget', 'description']}
              onCancel={() => setEditing(false)}
              onSaved={(saved) => {
                setData((d) => ({ ...d, event: { ...d.event, ...saved } }));
                setEditing(false);
              }}
            />
          ) : (
            <dl className="details">
              <dt>Type</dt>
              <dd>{event.eventType ?? '—'}</dd>
              <dt>Timeline</dt>
              <dd>{formatRange(event.startDate, event.endDate)}</dd>
              <dt>Budget</dt>
              <dd>{formatMoney(event.budget)}</dd>
              <dt>Description</dt>
              <dd className="pre-wrap">{event.description ?? '—'}</dd>
            </dl>
          )}
        </section>

        <section className="card" aria-labelledby="dates-title">
          <h2 id="dates-title">Important dates</h2>
          <ImportantDates
            eventId={eventId}
            dates={importantDates}
            canEdit={canEdit}
            onChange={setSlice('importantDates')}
            maxDate={event.endDate}
          />
        </section>
      </div>

      <div className="grid-2 section">
        <section className="card" aria-labelledby="members-title">
          <h2 id="members-title">People ({members.length})</h2>
          <MembersPanel
            eventId={eventId}
            members={members}
            isHead={isHead}
            currentUserId={user.id}
            onChange={setSlice('members')}
          />
        </section>
        <section className="card" aria-labelledby="notes-title">
          <h2 id="notes-title">My notes</h2>
          <MyEventNotes eventId={eventId} />
        </section>
      </div>

      <div className="section">
        <button type="button" className="btn btn-ghost danger" onClick={leaveOrDelete}>
          {isHead ? 'Delete event' : 'Leave event'}
        </button>
      </div>
    </div>
  );
}

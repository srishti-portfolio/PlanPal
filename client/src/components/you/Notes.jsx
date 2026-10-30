import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { formatDateTime } from '../../utils/format.js';
import { Alert, Loading } from '../Feedback.jsx';

function EventSelect({ id, events, value, onChange }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not linked to an event</option>
      {events.map((ev) => (
        <option key={ev.id} value={ev.id}>
          {ev.name}
        </option>
      ))}
    </select>
  );
}

function NoteItem({ note, events, onSaved, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [eventId, setEventId] = useState(note.eventId ?? '');
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const { note: saved } = await api(`/notes/${note.id}`, {
        method: 'PATCH',
        body: { content, eventId: eventId || null },
      });
      onSaved(saved);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    }
  }

  if (editing) {
    return (
      <li className="note">
        <form className="stack" onSubmit={save}>
          <Alert>{error}</Alert>
          <label htmlFor={`note-edit-${note.id}`} className="sr-only">
            Edit note
          </label>
          <textarea id={`note-edit-${note.id}`} rows={3} maxLength={5000} value={content} onChange={(e) => setContent(e.target.value)} />
          <label htmlFor={`note-event-${note.id}`} className="small">
            Linked event
          </label>
          <EventSelect id={`note-event-${note.id}`} events={events} value={eventId} onChange={setEventId} />
          <div className="row">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!content.trim()}>
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="note">
      <p className="note-content">{note.content}</p>
      <div className="row space-between wrap">
        <span className="muted small">
          {note.eventId ? (
            <>
              📅 <Link to={`/events/${note.eventId}`}>{note.eventName}</Link> ·{' '}
            </>
          ) : null}
          {formatDateTime(note.updatedAt)}
        </span>
        <span className="row gap-sm">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => onDelete(note)}>
            Delete
          </button>
        </span>
      </div>
    </li>
  );
}

/** Personal notes; optionally linked to an event. Saved only when the user presses Save. */
export function Notes() {
  const notesState = useApi('/notes');
  const eventsState = useApi('/events');
  const events = eventsState.data?.events ?? [];
  const [content, setContent] = useState('');
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (!content.trim()) {
      setError('Write something before saving');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { note } = await api('/notes', { method: 'POST', body: { content: content.trim(), eventId: eventId || null } });
      notesState.setData((d) => ({ notes: [note, ...(d?.notes ?? [])] }));
      setContent('');
      setEventId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(note) {
    if (!window.confirm('Delete this note?')) return;
    try {
      await api(`/notes/${note.id}`, { method: 'DELETE' });
      notesState.setData((d) => ({ notes: d.notes.filter((n) => n.id !== note.id) }));
    } catch (err) {
      setError(err.message);
    }
  }

  const replace = (saved) => notesState.setData((d) => ({ notes: d.notes.map((n) => (n.id === saved.id ? saved : n)) }));

  return (
    <div className="stack">
      <form className="stack" onSubmit={save}>
        <Alert>{error}</Alert>
        <label htmlFor="new-note">New note</label>
        <textarea
          id="new-note"
          rows={4}
          maxLength={5000}
          placeholder="Ideas, reminders, vendor phone numbers…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <label htmlFor="new-note-event" className="small">
          Link to an event (optional)
        </label>
        <EventSelect id="new-note-event" events={events} value={eventId} onChange={setEventId} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>

      {notesState.loading && <Loading />}
      <Alert>{notesState.error?.message}</Alert>
      {notesState.data?.notes.length > 0 && (
        <ul className="note-list" aria-label="Saved notes">
          {notesState.data.notes.map((note) => (
            <NoteItem key={note.id} note={note} events={events} onSaved={replace} onDelete={remove} />
          ))}
        </ul>
      )}
    </div>
  );
}

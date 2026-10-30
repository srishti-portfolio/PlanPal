import { useState } from 'react';
import { api } from '../../api/client.js';
import { formatDate } from '../../utils/format.js';
import { Field } from '../Field.jsx';
import { Alert, EmptyState } from '../Feedback.jsx';

/** List of important dates with add/remove for editors. */
export function ImportantDates({ eventId, dates, canEdit, onChange, minDate, maxDate }) {
  const [form, setForm] = useState({ date: '', title: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { importantDate } = await api(`/events/${eventId}/dates`, { method: 'POST', body: form });
      onChange([...dates, importantDate].sort((a, b) => a.date.localeCompare(b.date)));
      setForm({ date: '', title: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    setError('');
    try {
      await api(`/events/${eventId}/dates/${item.id}`, { method: 'DELETE' });
      onChange(dates.filter((d) => d.id !== item.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <Alert>{error}</Alert>
      {dates.length === 0 ? (
        <EmptyState title="No important dates yet">
          {canEdit && <p>Add things like the haldi ceremony, RSVP deadline or venue visit.</p>}
        </EmptyState>
      ) : (
        <ul className="date-list">
          {dates.map((item) => (
            <li key={item.id}>
              <time dateTime={item.date}>{formatDate(item.date)}</time>
              <span>{item.title}</span>
              {canEdit && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(item)} aria-label={`Remove ${item.title}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} className="inline-form" aria-label="Add important date">
          <Field
            label="Date"
            type="date"
            required
            min={minDate || undefined}
            max={maxDate || undefined}
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <Field
            label="What happens on this date?"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            {busy ? 'Adding…' : 'Add date'}
          </button>
        </form>
      )}
    </div>
  );
}

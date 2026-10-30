import { useState } from 'react';
import { api } from '../../api/client.js';
import { Field } from '../Field.jsx';
import { Alert } from '../Feedback.jsx';

export const EVENT_TYPE_SUGGESTIONS = [
  'Wedding',
  'Birthday',
  'Anniversary',
  'Engagement',
  'Baby shower',
  'Housewarming',
  'Graduation party',
  'Festival celebration',
  'Community meetup',
  'Charity fundraiser',
  'Reunion',
  'Corporate offsite',
];

const toForm = (event) => ({
  name: event.name ?? '',
  startDate: event.startDate ?? '',
  endDate: event.endDate ?? '',
  eventType: event.eventType ?? '',
  budget: event.budget ?? '',
  description: event.description ?? '',
});

/**
 * Edit a subset of an event's fields (`fields` decides which) and PATCH only those.
 * Used both by the creation wizard steps and the event page.
 */
export function EventDetailsForm({ event, fields, onSaved, submitLabel = 'Save', onCancel, requireAll = false }) {
  const [form, setForm] = useState(() => toForm(event));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const show = (field) => fields.includes(field);
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (show('endDate') && form.startDate && form.endDate && form.endDate < form.startDate) {
      setError('The end date must be on or after the start date.');
      return;
    }
    const body = Object.fromEntries(
      fields.map((field) => {
        const value = typeof form[field] === 'string' ? form[field].trim() : form[field];
        if (field === 'budget') return [field, value === '' ? null : Number(value)];
        return [field, value === '' ? null : value];
      }),
    );
    setSaving(true);
    setError('');
    try {
      const { event: saved } = await api(`/events/${event.id}`, { method: 'PATCH', body });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" noValidate={false}>
      <Alert>{error}</Alert>
      {show('name') && (
        <Field label="Event name" value={form.name} onChange={update('name')} required maxLength={120} />
      )}
      {(show('startDate') || show('endDate')) && (
        <div className="grid-2">
          <Field label="Start date" type="date" value={form.startDate} onChange={update('startDate')} required={requireAll} />
          <Field
            label="End date"
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={update('endDate')}
            required={requireAll}
          />
        </div>
      )}
      {show('eventType') && (
        <>
          <Field
            label="What kind of event is it?"
            hint="Type anything — e.g. Wedding, 30th birthday, Diwali community dinner."
            value={form.eventType}
            onChange={update('eventType')}
            list="event-type-suggestions"
            maxLength={60}
            required={requireAll}
          />
          <datalist id="event-type-suggestions">
            {EVENT_TYPE_SUGGESTIONS.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </>
      )}
      {show('budget') && (
        <Field
          label="Total budget (optional)"
          hint="Helps the AI suggest a realistic budget breakdown."
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={form.budget}
          onChange={update('budget')}
        />
      )}
      {show('description') && (
        <Field
          as="textarea"
          label="Description (optional)"
          hint="Guests, venue ideas, theme, anything the AI should know."
          rows={3}
          maxLength={2000}
          value={form.description}
          onChange={update('description')}
        />
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

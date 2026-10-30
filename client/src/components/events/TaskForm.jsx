import { useState } from 'react';
import { Field } from '../Field.jsx';
import { Alert } from '../Feedback.jsx';

const EMPTY = { title: '', description: '', startDate: '', dueDate: '' };

/** Create or edit a task. `onSubmit` receives clean values and may throw to show an error. */
export function TaskForm({ initial, onSubmit, onCancel, submitLabel = 'Add task', maxDate }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...initial, description: initial?.description ?? '' }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) {
      setError('The due date must be on or after the start date.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        title: form.title.trim(),
        description: form.description.trim() || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
      });
      if (!initial) setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack task-form" aria-label={initial ? 'Edit task' : 'New task'}>
      <Alert>{error}</Alert>
      <Field label="Task" required maxLength={160} value={form.title} onChange={update('title')} />
      <Field as="textarea" label="Description" rows={2} maxLength={2000} value={form.description} onChange={update('description')} />
      <div className="grid-2">
        <Field label="Start date" type="date" max={maxDate || undefined} value={form.startDate} onChange={update('startDate')} />
        <Field
          label="Due date"
          type="date"
          min={form.startDate || undefined}
          max={maxDate || undefined}
          value={form.dueDate}
          onChange={update('dueDate')}
        />
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
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

import { useState } from 'react';
import { api } from '../../api/client.js';
import { formatRange } from '../../utils/format.js';
import { Alert, Loading } from '../Feedback.jsx';

/** Ask Gemini for tasks tailored to the event, let the user pick which to keep. */
export function AiSuggestions({ eventId, onAdded }) {
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [state, setState] = useState('idle'); // idle | loading | adding
  const [error, setError] = useState('');

  async function fetchSuggestions() {
    setState('loading');
    setError('');
    try {
      const data = await api(`/events/${eventId}/tasks/suggestions`, { method: 'POST' });
      setSuggestions(data.suggestions);
      setSelected(new Set(data.suggestions.map((_, i) => i)));
      if (data.suggestions.length === 0) setError('The AI had no new suggestions. Try adding more details to the event.');
    } catch (err) {
      setError(err.message);
    } finally {
      setState('idle');
    }
  }

  function toggle(index) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function addSelected() {
    const tasks = suggestions
      .filter((_, i) => selected.has(i))
      .map((s) => ({ ...s, aiGenerated: true, status: 'not_started' }));
    setState('adding');
    setError('');
    try {
      const data = await api(`/events/${eventId}/tasks/bulk`, { method: 'POST', body: { tasks } });
      onAdded(data.tasks);
      setSuggestions([]);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setState('idle');
    }
  }

  return (
    <section className="ai-suggestions" aria-labelledby="ai-suggestions-title">
      <div className="row space-between">
        <h3 id="ai-suggestions-title" className="h4">
          <span aria-hidden="true">✨ </span>AI task recommendations
        </h3>
        <button type="button" className="btn btn-secondary" onClick={fetchSuggestions} disabled={state !== 'idle'}>
          {suggestions.length ? 'Suggest again' : 'Suggest tasks'}
        </button>
      </div>
      <Alert>{error}</Alert>
      {state === 'loading' && <Loading label="Gemini is planning your tasks…" />}
      {suggestions.length > 0 && (
        <>
          <fieldset className="suggestion-list">
            <legend className="sr-only">Choose which suggested tasks to add</legend>
            {suggestions.map((s, i) => (
              <label key={`${s.title}-${i}`} className="suggestion">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                <span>
                  <strong>{s.title}</strong>
                  <span className="muted small"> · {formatRange(s.startDate, s.dueDate)}</span>
                  {s.description && <span className="suggestion-desc">{s.description}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="btn btn-primary" onClick={addSelected} disabled={selected.size === 0 || state !== 'idle'}>
            {state === 'adding' ? 'Adding…' : `Add ${selected.size} selected task${selected.size === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </section>
  );
}

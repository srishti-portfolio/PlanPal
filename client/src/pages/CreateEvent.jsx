import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { AiSuggestions } from '../components/events/AiSuggestions.jsx';
import { EventDetailsForm } from '../components/events/EventDetailsForm.jsx';
import { ImportantDates } from '../components/events/ImportantDates.jsx';
import { TaskForm } from '../components/events/TaskForm.jsx';
import { Field } from '../components/Field.jsx';
import { Alert } from '../components/Feedback.jsx';
import { useTaskActions } from '../hooks/useTaskActions.js';
import { formatRange } from '../utils/format.js';

const STEPS = ['Name', 'Timeline', 'Event type', 'Important dates', 'Tasks'];

function StepIndicator({ current }) {
  return (
    <ol className="steps" aria-label="Event setup progress">
      {STEPS.map((label, i) => (
        <li key={label} className={i < current ? 'done' : i === current ? 'active' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="step-num" aria-hidden="true">{i + 1}</span>
          <span className="step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function NameStep({ onCreated }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give your event a name');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { event } = await api('/events', { method: 'POST', body: { name: name.trim() } });
      onCreated(event);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" noValidate>
      <Field
        label="What's the event called?"
        hint="e.g. Riya & Arjun's Wedding, Mom's 60th Birthday, Block Party 2026"
        maxLength={120}
        value={name}
        error={error}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Creating…' : 'Create event'}
      </button>
    </form>
  );
}

/** Step-by-step wizard: name → timeline → type → important dates → tasks. */
export default function CreateEvent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [event, setEvent] = useState(null);
  const [dates, setDates] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const headingRef = useRef(null);
  const onError = useCallback((message) => setError(message), []);
  const taskActions = useTaskActions(event?.id, setTasks, onError);

  // Move focus to the step heading so screen-reader and keyboard users follow along.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const next = (savedEvent) => {
    if (savedEvent) setEvent((prev) => ({ ...prev, ...savedEvent }));
    setStep((s) => s + 1);
  };

  return (
    <div className="page narrow">
      <Link to="/" className="back-link">
        ← Home
      </Link>
      <h1>Create an event</h1>
      <StepIndicator current={step} />

      {event?.code && (
        <div className="code-banner" role="status">
          <span>Event code:</span> <strong className="code">{event.code}</strong>
          <span className="muted small">Share this so people can join. You decide what access they get.</span>
        </div>
      )}

      <section className="card stack" aria-labelledby="step-title">
        <h2 id="step-title" ref={headingRef} tabIndex={-1}>
          {['Name your event', 'When is it?', 'What kind of event is it?', 'Important dates', 'Plan the tasks'][step]}
        </h2>

        {step === 0 && <NameStep onCreated={(created) => next(created)} />}

        {step === 1 && (
          <EventDetailsForm event={event} fields={['startDate', 'endDate']} requireAll submitLabel="Next" onSaved={next} />
        )}

        {step === 2 && (
          <EventDetailsForm
            event={event}
            fields={['eventType', 'budget', 'description']}
            requireAll
            submitLabel="Next"
            onSaved={next}
          />
        )}

        {step === 3 && (
          <>
            <p className="muted">
              Add key days and what happens on them (e.g. mehendi, venue booking, RSVP deadline). Event runs{' '}
              {formatRange(event.startDate, event.endDate)}.
            </p>
            <ImportantDates eventId={event.id} dates={dates} canEdit onChange={setDates} maxDate={event.endDate} />
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => next()}>
                {dates.length ? 'Next' : 'Skip for now'}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Alert>{error}</Alert>
            <AiSuggestions eventId={event.id} onAdded={taskActions.addMany} />
            {tasks.length > 0 && (
              <div>
                <h3 className="h4">Your tasks ({tasks.length})</h3>
                <ul className="simple-list">
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <strong>{t.title}</strong> <span className="muted small">{formatRange(t.startDate, t.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details className="card-inset">
              <summary>Add your own task</summary>
              <TaskForm onSubmit={taskActions.add} maxDate={event.endDate} />
            </details>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/events/${event.id}`)}>
                Finish &amp; open dashboard
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

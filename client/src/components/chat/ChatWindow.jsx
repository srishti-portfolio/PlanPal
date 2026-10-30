import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Loading } from '../Feedback.jsx';
import { MessageContent } from '../MessageContent.jsx';

const STARTERS = {
  general: [
    'Plan a budget-friendly 30th birthday for 25 people',
    'What vendors do I need for a small wedding?',
    'Give me 5 unique themes for a community fundraiser',
  ],
  event: [
    'Break down my budget by category',
    'What should I be doing this week?',
    'Create a vendor checklist for this event',
    'Suggest personalised decor and food ideas',
  ],
};

function LinkToEvent({ chat, events, onLinked }) {
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');

  async function link(nextEventId) {
    setError('');
    try {
      const { chat: saved } = await api(`/chats/${chat.id}`, { method: 'PATCH', body: { eventId: nextEventId } });
      onLinked(saved);
      setEventId('');
    } catch (err) {
      setError(err.message);
    }
  }

  if (chat.eventId) {
    return (
      <div className="row gap-sm wrap">
        <span className="tag tag-event">
          Linked to <Link to={`/events/${chat.eventId}`}>{chat.eventName}</Link>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => link(null)}>
          Unlink
        </button>
        <Alert>{error}</Alert>
      </div>
    );
  }

  return (
    <form
      className="row gap-sm wrap"
      onSubmit={(e) => {
        e.preventDefault();
        if (eventId) link(eventId);
      }}
    >
      <label htmlFor={`link-${chat.id}`} className="small">
        Link this chat to an existing event
      </label>
      <select id={`link-${chat.id}`} value={eventId} onChange={(e) => setEventId(e.target.value)}>
        <option value="">Choose event…</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-secondary btn-sm" disabled={!eventId}>
        Link
      </button>
      <Alert>{error}</Alert>
    </form>
  );
}

export function ChatWindow({ chatId, events, onChatUpdated, onDelete }) {
  const { data, error, loading, setData } = useApi(`/chats/${chatId}`);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [sendError, setSendError] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [data?.messages.length, pending]);

  async function send(text) {
    const content = text.trim();
    if (!content || pending) return;
    setPending(content);
    setDraft('');
    setSendError('');
    try {
      const result = await api(`/chats/${chatId}/messages`, { method: 'POST', body: { content } });
      setData((d) => ({ chat: result.chat, messages: [...d.messages, ...result.messages] }));
      onChatUpdated(result.chat);
    } catch (err) {
      setSendError(err.message);
      setDraft(content);
    } finally {
      setPending(null);
      inputRef.current?.focus();
    }
  }

  if (loading && !data) return <Loading label="Loading chat…" />;
  if (error) return <Alert>{error.message}</Alert>;
  if (!data) return null;

  const { chat, messages } = data;
  const starters = chat.eventId ? STARTERS.event : STARTERS.general;

  return (
    <section className="chat-window" aria-labelledby="chat-title">
      <header className="chat-header">
        <div className="stack-sm">
          <h2 id="chat-title" className="h4">
            {chat.title}
          </h2>
          <LinkToEvent
            chat={chat}
            events={events}
            onLinked={(saved) => {
              setData((d) => ({ ...d, chat: saved }));
              onChatUpdated(saved);
            }}
          />
        </div>
        <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => onDelete(chat)}>
          Delete chat
        </button>
      </header>

      <div className="messages" role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && !pending && (
          <div className="chat-empty">
            <p className="muted">
              {chat.eventId
                ? `Ask anything about ${chat.eventName}. The AI can see its dates, budget and tasks.`
                : 'Ask anything about event planning — budgets, timelines, vendors, ideas.'}
            </p>
            <div className="starters">
              {starters.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message message-${m.role}`}>
            <span className="sr-only">{m.role === 'user' ? 'You said:' : 'PlanPal said:'}</span>
            {m.role === 'model' ? <MessageContent text={m.content} /> : <p className="pre-wrap">{m.content}</p>}
          </div>
        ))}
        {pending && (
          <>
            <div className="message message-user">
              <p className="pre-wrap">{pending}</p>
            </div>
            <div className="message message-model">
              <span className="typing" role="status">
                PlanPal is thinking…
              </span>
            </div>
          </>
        )}
        <div ref={endRef} />
      </div>

      <Alert>{sendError}</Alert>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Message PlanPal
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={2}
          maxLength={4000}
          placeholder="Ask about budgets, timelines, vendors, ideas…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || Boolean(pending)}>
          Send
        </button>
      </form>
    </section>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { ChatWindow } from '../components/chat/ChatWindow.jsx';
import { Alert, EmptyState, Loading } from '../components/Feedback.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDateTime } from '../utils/format.js';

/**
 * Three ways to chat:
 *  1. General chat, later linked to an event from the chat header.
 *  2. Chat about an existing event (AI gets that event's details).
 *  3. General chat that is never linked.
 */
function NewChatForm({ events, initialEventId, onCreated }) {
  const [mode, setMode] = useState(initialEventId ? 'event' : 'general');
  const [eventId, setEventId] = useState(initialEventId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'event' && !eventId) {
      setError('Choose an event to chat about');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { chat } = await api('/chats', { method: 'POST', body: { eventId: mode === 'event' ? eventId : null } });
      onCreated(chat);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack new-chat">
      <fieldset className="radio-group">
        <legend>Start a new chat</legend>
        <label>
          <input type="radio" name="mode" value="general" checked={mode === 'general'} onChange={() => setMode('general')} />
          General planning chat
        </label>
        <label>
          <input type="radio" name="mode" value="event" checked={mode === 'event'} onChange={() => setMode('event')} />
          About one of my events
        </label>
      </fieldset>
      {mode === 'event' && (
        <div className="field">
          <label htmlFor="new-chat-event">Event</label>
          <select id="new-chat-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Choose event…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Alert>{error}</Alert>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Starting…' : 'Start chat'}
      </button>
    </form>
  );
}

export default function Assistant() {
  const [params, setParams] = useSearchParams();
  const activeId = params.get('chat');
  const chatsState = useApi('/chats');
  const eventsState = useApi('/events');
  const events = eventsState.data?.events ?? [];
  const chats = chatsState.data?.chats ?? [];
  const [error, setError] = useState('');

  const openChat = (id) => setParams(id ? { chat: id } : {});

  function upsertChat(chat) {
    chatsState.setData((d) => ({
      chats: [chat, ...(d?.chats ?? []).filter((c) => c.id !== chat.id)],
    }));
  }

  async function deleteChat(chat) {
    if (!window.confirm(`Delete the chat "${chat.title}"?`)) return;
    try {
      await api(`/chats/${chat.id}`, { method: 'DELETE' });
      chatsState.setData((d) => ({ chats: d.chats.filter((c) => c.id !== chat.id) }));
      openChat(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page assistant">
      <header className="page-header">
        <h1>AI Assistant</h1>
        <p className="muted">Powered by Google Gemini. Your chats are private to your account.</p>
      </header>
      <Alert>{error}</Alert>

      <div className="assistant-layout">
        <aside className="card chat-sidebar" aria-label="Chats">
          <NewChatForm
            key={params.get('event') ?? 'none'}
            events={events}
            initialEventId={params.get('event')}
            onCreated={(chat) => {
              upsertChat(chat);
              openChat(chat.id);
            }}
          />
          <h2 className="h4">Your chats</h2>
          {chatsState.loading && <Loading />}
          {chatsState.data && chats.length === 0 && <p className="muted small">No chats yet.</p>}
          <ul className="chat-list">
            {chats.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  className={`chat-list-item ${chat.id === activeId ? 'active' : ''}`}
                  aria-current={chat.id === activeId ? 'true' : undefined}
                  onClick={() => openChat(chat.id)}
                >
                  <span className="chat-list-title">{chat.title}</span>
                  <span className="muted small">
                    {chat.eventName ? `📅 ${chat.eventName} · ` : ''}
                    {formatDateTime(chat.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="card chat-main">
          {activeId ? (
            <ChatWindow key={activeId} chatId={activeId} events={events} onChatUpdated={upsertChat} onDelete={deleteChat} />
          ) : (
            <EmptyState title="Pick a chat or start a new one">
              <p>Ask for budget breakdowns, timelines, vendor checklists and personalised ideas.</p>
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { setAiClientForTesting } from '../src/services/ai.js';
import { authHeader, authUserQuery, CHAT_ID, EVENT_ID, mockQueries, roleQuery } from './helpers.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));

const app = createApp();
const generateContent = vi.fn();
setAiClientForTesting({ models: { generateContent } });

const chatRow = (overrides = {}) => ({
  id: CHAT_ID,
  title: 'New chat',
  event_id: null,
  event_name: null,
  created_at: '2026-10-30T10:00:00Z',
  updated_at: '2026-10-30T10:00:00Z',
  ...overrides,
});

/** Mock for the single statement that saves both messages and updates the chat. */
const saveMessagesQuery = () => [
  'WITH saved AS',
  ([, userText, modelText, title]) =>
    [
      { id: 'u1', role: 'user', content: userText },
      { id: 'm1', role: 'model', content: modelText },
    ].map((m) => ({ ...m, created_at: '2026-10-30T10:01:00Z', chat_title: title, chat_updated_at: '2026-10-30T10:01:00Z' })),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('chats', () => {
  it('cannot read another account\'s chat', async () => {
    mockQueries([authUserQuery(), ['FROM chats c LEFT JOIN events', () => []]]);
    const res = await request(app).get(`/api/chats/${CHAT_ID}`).set(authHeader());
    expect(res.status).toBe(404);
  });

  it('cannot link a chat to an event the user is not part of', async () => {
    mockQueries([authUserQuery(), ['FROM chats c LEFT JOIN events', () => [chatRow()]], roleQuery(null)]);
    const res = await request(app).patch(`/api/chats/${CHAT_ID}`).set(authHeader()).send({ eventId: EVENT_ID });
    expect(res.status).toBe(404);
  });

  it('sends the history to Gemini and stores both messages', async () => {
    generateContent.mockResolvedValue({ text: 'Here is a budget plan.' });
    mockQueries([
      authUserQuery(),
      ['FROM chats c LEFT JOIN events', () => [chatRow()]],
      ['FROM chat_messages WHERE chat_id', () => [{ role: 'user', content: 'Hi' }, { role: 'model', content: 'Hello!' }]],
      saveMessagesQuery(),
    ]);

    const res = await request(app)
      .post(`/api/chats/${CHAT_ID}/messages`)
      .set(authHeader())
      .send({ content: 'Plan a budget for 50 guests' });

    expect(res.status).toBe(201);
    expect(res.body.messages.map((m) => m.content)).toEqual(['Plan a budget for 50 guests', 'Here is a budget plan.']);
    expect(res.body.chat.title).toBe('Plan a budget for 50 guests');
    const call = generateContent.mock.calls[0][0];
    expect(call.contents).toHaveLength(3);
    expect(call.contents.at(-1)).toEqual({ role: 'user', parts: [{ text: 'Plan a budget for 50 guests' }] });
    expect(call.config.systemInstruction).not.toContain('The user is planning this event');
    expect(call.config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    // Fetch chat, then one parallel read, then one write: no per-message transaction.
    expect(query.mock.calls.filter(([sql]) => !sql.includes('FROM users WHERE id'))).toHaveLength(3);
  });

  it('includes the linked event as context', async () => {
    generateContent.mockResolvedValue({ text: 'Sure.' });
    mockQueries([
      authUserQuery(),
      ['FROM chats c LEFT JOIN events', () => [chatRow({ event_id: EVENT_ID, event_name: 'Diwali Mela' })]],
      ['FROM chat_messages WHERE chat_id', () => []],
      roleQuery('viewer'),
      ['FROM events e WHERE e.id', () => [{ id: EVENT_ID, name: 'Diwali Mela', event_type: 'Festival', status: 'in_progress' }]],
      ['FROM important_dates', () => []],
      ['FROM tasks', () => []],
      saveMessagesQuery(),
    ]);

    const res = await request(app).post(`/api/chats/${CHAT_ID}/messages`).set(authHeader()).send({ content: 'Ideas?' });

    expect(res.status).toBe(201);
    const { systemInstruction } = generateContent.mock.calls[0][0].config;
    expect(systemInstruction).toContain('<event_context>');
    expect(systemInstruction).toContain('Diwali Mela');
  });

  it('returns 502 and saves nothing when Gemini fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    generateContent.mockRejectedValue(new Error('quota exceeded'));
    mockQueries([
      authUserQuery(),
      ['FROM chats c LEFT JOIN events', () => [chatRow()]],
      ['FROM chat_messages WHERE chat_id', () => []],
    ]);

    const res = await request(app).post(`/api/chats/${CHAT_ID}/messages`).set(authHeader()).send({ content: 'Hello' });

    expect(res.status).toBe(502);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO chat_messages'))).toBe(false);
  });

  it('rejects empty messages', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).post(`/api/chats/${CHAT_ID}/messages`).set(authHeader()).send({ content: '   ' });
    expect(res.status).toBe(400);
  });
});
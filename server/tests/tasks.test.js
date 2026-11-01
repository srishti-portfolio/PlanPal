import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { query, withTransaction } from '../src/db/pool.js';
import { setAiClientForTesting } from '../src/services/ai.js';
import { authHeader, authUserQuery, EVENT_ID, mockQueries, roleQuery } from './helpers.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));

const app = createApp();
const generateContent = vi.fn();
setAiClientForTesting({ models: { generateContent } });

const TASK_ID = '66666666-6666-4666-8666-666666666666';
const tasksUrl = `/api/events/${EVENT_ID}/tasks`;

const insertTaskQuery = () => [
  'INSERT INTO tasks',
  ([eventId, title, description, startDate, dueDate, status, aiGenerated]) => [
    { id: TASK_ID, event_id: eventId, title, description, start_date: startDate, due_date: dueDate, status, ai_generated: aiGenerated },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET tasks', () => {
  it('lets any member, including view-only, see the tasks', async () => {
    mockQueries([
      authUserQuery(),
      roleQuery('viewer'),
      ['FROM tasks WHERE event_id', () => [{ id: TASK_ID, title: 'Book venue', status: 'not_started', due_date: '2026-11-20' }]],
    ]);
    const res = await request(app).get(tasksUrl).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.tasks[0]).toMatchObject({ title: 'Book venue', dueDate: '2026-11-20' });
  });
});

describe('POST tasks', () => {
  it('creates a task that starts as "not started"', async () => {
    mockQueries([authUserQuery(), roleQuery('editor'), insertTaskQuery()]);
    const res = await request(app)
      .post(tasksUrl)
      .set(authHeader())
      .send({ title: 'Book venue', description: 'Visit 3 halls', startDate: '2026-11-01', dueDate: '2026-11-10' });
    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({ title: 'Book venue', status: 'not_started', aiGenerated: false });
  });

  it('blocks view-only members', async () => {
    mockQueries([authUserQuery(), roleQuery('viewer')]);
    const res = await request(app).post(tasksUrl).set(authHeader()).send({ title: 'Book venue' });
    expect(res.status).toBe(403);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO tasks'))).toBe(false);
  });

  it('requires a title', async () => {
    mockQueries([authUserQuery(), roleQuery('editor')]);
    const res = await request(app).post(tasksUrl).set(authHeader()).send({ title: '  ' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid dates', async () => {
    mockQueries([authUserQuery(), roleQuery('editor')]);
    const res = await request(app).post(tasksUrl).set(authHeader()).send({ title: 'X', dueDate: '10/11/2026' });
    expect(res.status).toBe(400);
  });
});

describe('POST tasks/bulk', () => {
  it('adds all selected suggestions in a single transaction', async () => {
    mockQueries([authUserQuery(), roleQuery('editor'), insertTaskQuery()]);
    const res = await request(app)
      .post(`${tasksUrl}/bulk`)
      .set(authHeader())
      .send({ tasks: [{ title: 'Caterer', aiGenerated: true }, { title: 'Photographer', aiGenerated: true }] });
    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks.every((t) => t.aiGenerated)).toBe(true);
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty list', async () => {
    mockQueries([authUserQuery(), roleQuery('editor')]);
    const res = await request(app).post(`${tasksUrl}/bulk`).set(authHeader()).send({ tasks: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST tasks/suggestions (Gemini)', () => {
  const eventQueries = [
    ['FROM events e WHERE e.id', () => [{ id: EVENT_ID, name: 'Riya turns 30', event_type: 'Birthday', end_date: '2099-12-05', status: 'not_started' }]],
    ['FROM important_dates', () => []],
    ['FROM tasks WHERE event_id', () => []],
  ];

  it('returns AI suggestions for editors', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify([{ title: 'Choose a theme', description: 'Pick colours', startDate: '2099-11-01', dueDate: '2099-11-05' }]),
    });
    mockQueries([authUserQuery(), roleQuery('editor'), ...eventQueries]);

    const res = await request(app).post(`${tasksUrl}/suggestions`).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([
      { title: 'Choose a theme', description: 'Pick colours', startDate: '2099-11-01', dueDate: '2099-11-05' },
    ]);
    expect(generateContent.mock.calls[0][0].contents).toContain('Riya turns 30');
  });

  it('does not call Gemini for view-only members', async () => {
    mockQueries([authUserQuery(), roleQuery('viewer')]);
    const res = await request(app).post(`${tasksUrl}/suggestions`).set(authHeader());
    expect(res.status).toBe(403);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('returns 502 when Gemini fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    generateContent.mockRejectedValue(new Error('quota exceeded'));
    mockQueries([authUserQuery(), roleQuery('editor'), ...eventQueries]);
    const res = await request(app).post(`${tasksUrl}/suggestions`).set(authHeader());
    expect(res.status).toBe(502);
  });
});

describe('DELETE task', () => {
  it('deletes a task in this event', async () => {
    mockQueries([authUserQuery(), roleQuery('head'), ['DELETE FROM tasks', () => ({ rowCount: 1 })]]);
    const res = await request(app).delete(`${tasksUrl}/${TASK_ID}`).set(authHeader());
    expect(res.status).toBe(204);
    const [, params] = query.mock.calls.find(([sql]) => sql.includes('DELETE FROM tasks'));
    expect(params).toEqual([TASK_ID, EVENT_ID]); // scoped to the event, so ids from other events can't be deleted
  });

  it('returns 404 for a task that is not in this event', async () => {
    mockQueries([authUserQuery(), roleQuery('editor'), ['DELETE FROM tasks', () => ({ rowCount: 0 })]]);
    const res = await request(app).delete(`${tasksUrl}/${TASK_ID}`).set(authHeader());
    expect(res.status).toBe(404);
  });
});

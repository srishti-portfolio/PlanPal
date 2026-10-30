import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { authHeader, authUserQuery, EVENT_ID, mockQueries, OTHER_USER_ID, roleQuery, USER } from './helpers.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));

const app = createApp();
const event = {
  id: EVENT_ID,
  code: 'ABCD2345',
  name: 'Mehta Wedding',
  event_type: 'Wedding',
  start_date: '2026-12-10',
  end_date: '2026-12-12',
  status: 'not_started',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/events', () => {
  it('creates the event with a random code and makes the creator the head', async () => {
    mockQueries([
      authUserQuery(),
      ['INSERT INTO events', ([code, name]) => [{ ...event, code, name }]],
      ["VALUES ($1, $2, 'head')", () => ({ rowCount: 1 })],
    ]);

    const res = await request(app).post('/api/events').set(authHeader()).send({ name: '  Mehta Wedding ' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('head');
    expect(res.body.event.name).toBe('Mehta Wedding');
    expect(res.body.event.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('requires a name', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).post('/api/events').set(authHeader()).send({ name: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/events/join', () => {
  it('joins as view-only by default', async () => {
    mockQueries([
      authUserQuery(),
      ['FROM events WHERE code = $1', ([code]) => (code === 'ABCD2345' ? [event] : [])],
      ['INSERT INTO event_members', () => ({ rowCount: 1 })],
    ]);
    const res = await request(app).post('/api/events/join').set(authHeader()).send({ code: 'abcd2345' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ event: { id: EVENT_ID, name: event.name }, alreadyMember: false });
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO event_members'));
    expect(insert[0]).toContain("'viewer'");
  });

  it('returns 404 for an unknown code', async () => {
    mockQueries([authUserQuery(), ['FROM events WHERE code = $1', () => []]]);
    const res = await request(app).post('/api/events/join').set(authHeader()).send({ code: 'ZZZZ9999' });
    expect(res.status).toBe(404);
  });

  it('rejects codes with invalid characters before touching the database', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).post('/api/events/join').set(authHeader()).send({ code: "x' OR 1=1--" });
    expect(res.status).toBe(400);
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM events'))).toBe(false);
  });
});

describe('GET /api/events/:eventId', () => {
  const detailQueries = (role) => [
    authUserQuery(),
    roleQuery(role),
    ['FROM events e WHERE e.id', () => [event]],
    ['FROM important_dates', () => []],
    ['FROM tasks', () => []],
    [
      'FROM event_members m JOIN users',
      () => [
        { id: USER.id, name: 'Asha', email: USER.email, role, joined_at: '2026-10-01' },
        { id: OTHER_USER_ID, name: 'Ravi', email: 'ravi@example.com', role: 'head', joined_at: '2026-09-01' },
      ],
    ],
  ];

  it('hides the event from non-members with 404', async () => {
    mockQueries([authUserQuery(), roleQuery(null)]);
    const res = await request(app).get(`/api/events/${EVENT_ID}`).set(authHeader());
    expect(res.status).toBe(404);
  });

  it('rejects malformed ids', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).get('/api/events/not-a-uuid').set(authHeader());
    expect(res.status).toBe(400);
  });

  it('hides the join code and member emails from viewers', async () => {
    mockQueries(detailQueries('viewer'));
    const res = await request(app).get(`/api/events/${EVENT_ID}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
    expect(res.body.event).not.toHaveProperty('code');
    expect(res.body.members.every((m) => !('email' in m))).toBe(true);
  });

  it('shows the join code to the head', async () => {
    mockQueries(detailQueries('head'));
    const res = await request(app).get(`/api/events/${EVENT_ID}`).set(authHeader());
    expect(res.body.event.code).toBe('ABCD2345');
  });
});

describe('PATCH /api/events/:eventId', () => {
  it('blocks view-only members', async () => {
    mockQueries([authUserQuery(), roleQuery('viewer')]);
    const res = await request(app).patch(`/api/events/${EVENT_ID}`).set(authHeader()).send({ name: 'New' });
    expect(res.status).toBe(403);
  });

  it('lets only the head change the event status', async () => {
    mockQueries([authUserQuery(), roleQuery('editor')]);
    const res = await request(app).patch(`/api/events/${EVENT_ID}`).set(authHeader()).send({ status: 'finished' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/event head/);
  });

  it('rejects an end date before the start date', async () => {
    mockQueries([authUserQuery(), roleQuery('head')]);
    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}`)
      .set(authHeader())
      .send({ startDate: '2026-12-10', endDate: '2026-12-01' });
    expect(res.status).toBe(400);
  });

  it('updates only the fields that were sent', async () => {
    mockQueries([authUserQuery(), roleQuery('editor'), ['UPDATE events SET', () => [{ ...event, event_type: 'Reception' }]]]);
    const res = await request(app).patch(`/api/events/${EVENT_ID}`).set(authHeader()).send({ eventType: 'Reception' });
    expect(res.status).toBe(200);
    expect(res.body.event.eventType).toBe('Reception');
    const [sql, params] = query.mock.calls.find(([s]) => s.includes('UPDATE events SET'));
    expect(sql).toContain('event_type = $2');
    expect(sql).not.toContain('name =');
    expect(params).toEqual([EVENT_ID, 'Reception']);
  });
});

describe('member management', () => {
  it('lets the head give a member edit access', async () => {
    mockQueries([
      authUserQuery(),
      roleQuery('head'),
      ['UPDATE event_members SET role', () => [{ user_id: OTHER_USER_ID, role: 'editor' }]],
    ]);
    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}/members/${OTHER_USER_ID}`)
      .set(authHeader())
      .send({ role: 'editor' });
    expect(res.status).toBe(200);
    expect(res.body.member).toEqual({ userId: OTHER_USER_ID, role: 'editor' });
  });

  it('does not allow promoting someone to head', async () => {
    mockQueries([authUserQuery(), roleQuery('head')]);
    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}/members/${OTHER_USER_ID}`)
      .set(authHeader())
      .send({ role: 'head' });
    expect(res.status).toBe(400);
  });

  it('stops editors from removing people', async () => {
    mockQueries([authUserQuery(), roleQuery('editor')]);
    const res = await request(app).delete(`/api/events/${EVENT_ID}/members/${OTHER_USER_ID}`).set(authHeader());
    expect(res.status).toBe(403);
  });

  it('stops the head from removing themselves', async () => {
    mockQueries([authUserQuery(), roleQuery('head')]);
    const res = await request(app).delete(`/api/events/${EVENT_ID}/members/${USER.id}`).set(authHeader());
    expect(res.status).toBe(400);
  });
});

describe('tasks', () => {
  it('validates due date is not before start date', async () => {
    mockQueries([authUserQuery(), roleQuery('editor')]);
    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/tasks`)
      .set(authHeader())
      .send({ title: 'Book venue', startDate: '2026-11-10', dueDate: '2026-11-01' });
    expect(res.status).toBe(400);
  });

  it('rejects "delayed" as a manual status (it is computed)', async () => {
    mockQueries([authUserQuery(), roleQuery('editor')]);
    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}/tasks/${OTHER_USER_ID}`)
      .set(authHeader())
      .send({ status: 'delayed' });
    expect(res.status).toBe(400);
  });

  it('lets an editor move a task to in progress', async () => {
    mockQueries([
      authUserQuery(),
      roleQuery('editor'),
      ['UPDATE tasks SET', () => [{ id: OTHER_USER_ID, title: 'Book venue', status: 'in_progress' }]],
    ]);
    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}/tasks/${OTHER_USER_ID}`)
      .set(authHeader())
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('in_progress');
  });
});

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { authHeader, authUserQuery, EVENT_ID, mockQueries, roleQuery, USER } from './helpers.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));

const app = createApp();
const NOTE_ID = '55555555-5555-4555-8555-555555555555';

const noteRow = (overrides = {}) => ({
  id: NOTE_ID,
  content: 'Call the florist',
  event_id: null,
  event_name: null,
  created_at: '2026-10-30T10:00:00Z',
  updated_at: '2026-10-30T10:00:00Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/notes', () => {
  it('saves a note that is not linked to any event', async () => {
    mockQueries([
      authUserQuery(),
      ['INSERT INTO notes', () => [{ id: NOTE_ID }]],
      ['FROM notes n LEFT JOIN events', () => [noteRow()]],
    ]);
    const res = await request(app).post('/api/notes').set(authHeader()).send({ content: ' Call the florist ' });
    expect(res.status).toBe(201);
    expect(res.body.note).toMatchObject({ content: 'Call the florist', eventId: null });
    const [, params] = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO notes'));
    expect(params).toEqual([USER.id, null, 'Call the florist']);
  });

  it('links a note to an event the user belongs to', async () => {
    mockQueries([
      authUserQuery(),
      roleQuery('viewer'),
      ['INSERT INTO notes', () => [{ id: NOTE_ID }]],
      ['FROM notes n LEFT JOIN events', () => [noteRow({ event_id: EVENT_ID, event_name: 'Diwali Mela' })]],
    ]);
    const res = await request(app).post('/api/notes').set(authHeader()).send({ content: 'Lights', eventId: EVENT_ID });
    expect(res.status).toBe(201);
    expect(res.body.note).toMatchObject({ eventId: EVENT_ID, eventName: 'Diwali Mela' });
  });

  it('refuses to link a note to an event the user is not part of', async () => {
    mockQueries([authUserQuery(), roleQuery(null)]);
    const res = await request(app).post('/api/notes').set(authHeader()).send({ content: 'x', eventId: EVENT_ID });
    expect(res.status).toBe(404);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO notes'))).toBe(false);
  });

  it('rejects an empty note', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).post('/api/notes').set(authHeader()).send({ content: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Write something before saving');
  });

  it('rejects notes longer than 5000 characters', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).post('/api/notes').set(authHeader()).send({ content: 'a'.repeat(5001) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/notes', () => {
  it("lists only the caller's notes, optionally filtered by event", async () => {
    mockQueries([authUserQuery(), ['FROM notes n LEFT JOIN events', () => [noteRow()]]]);
    const res = await request(app).get(`/api/notes?eventId=${EVENT_ID}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    const [sql, params] = query.mock.calls.find(([s]) => s.includes('FROM notes n'));
    expect(sql).toContain('n.user_id = $1');
    expect(params).toEqual([USER.id, EVENT_ID]);
  });

  it('rejects a malformed event filter', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).get('/api/notes?eventId=abc').set(authHeader());
    expect(res.status).toBe(400);
  });
});

describe('PATCH and DELETE /api/notes/:noteId', () => {
  it("cannot edit another account's note", async () => {
    mockQueries([authUserQuery(), ['FROM notes n LEFT JOIN events', () => []]]);
    const res = await request(app).patch(`/api/notes/${NOTE_ID}`).set(authHeader()).send({ content: 'Hacked' });
    expect(res.status).toBe(404);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE notes'))).toBe(false);
  });

  it('can unlink a note from its event', async () => {
    mockQueries([
      authUserQuery(),
      ['FROM notes n LEFT JOIN events', () => [noteRow()]],
      ['UPDATE notes SET', () => ({ rowCount: 1 })],
    ]);
    const res = await request(app).patch(`/api/notes/${NOTE_ID}`).set(authHeader()).send({ eventId: null });
    expect(res.status).toBe(200);
    const [, params] = query.mock.calls.find(([sql]) => sql.includes('UPDATE notes SET'));
    expect(params).toEqual([NOTE_ID, null, true, null]);
  });

  it('deletes the caller\'s own note', async () => {
    mockQueries([authUserQuery(), ['DELETE FROM notes', () => ({ rowCount: 1 })]]);
    const res = await request(app).delete(`/api/notes/${NOTE_ID}`).set(authHeader());
    expect(res.status).toBe(204);
  });

  it('returns 404 when deleting a note that is not the caller\'s', async () => {
    mockQueries([authUserQuery(), ['DELETE FROM notes', () => ({ rowCount: 0 })]]);
    const res = await request(app).delete(`/api/notes/${NOTE_ID}`).set(authHeader());
    expect(res.status).toBe(404);
  });
});

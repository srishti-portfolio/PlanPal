import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { errorHandler, HttpError } from '../src/middleware/errors.js';
import { validate } from '../src/middleware/validate.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));

const app = createApp();

function fakeResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function handle(err) {
  const res = fakeResponse();
  errorHandler(err, {}, res, () => {});
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('errorHandler', () => {
  it('passes HttpError status, message and details through', () => {
    expect(handle(new HttpError(403, 'No access', [{ field: 'x' }]))).toEqual({
      status: 403,
      body: { error: 'No access', details: [{ field: 'x' }] },
    });
  });

  it.each([
    ['23505', 409],
    ['23503', 400],
    ['22P02', 400],
    ['22007', 400],
  ])('maps Postgres error %s to HTTP %i', (code, status) => {
    expect(handle(Object.assign(new Error('db'), { code })).status).toBe(status);
  });

  it('gives a clear message for the date-order constraint', () => {
    const err = Object.assign(new Error('db'), { code: '23514', constraint: 'events_dates_order' });
    expect(handle(err)).toEqual({ status: 400, body: { error: 'The end date must be on or after the start date' } });
  });

  it('never leaks internal error details', () => {
    const result = handle(new Error('password=hunter2 at db.internal:5432'));
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('hunter2');
  });
});

describe('validate middleware', () => {
  const schema = { body: z.object({ age: z.coerce.number().int().min(18, 'Must be an adult') }) };

  it('stores parsed (coerced) values on req.valid', () => {
    const req = { body: { age: '21' } };
    const next = vi.fn();
    validate(schema)(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.valid.body).toEqual({ age: 21 });
  });

  it('forwards a 400 with field details on invalid input', () => {
    const next = vi.fn();
    validate(schema)({ body: { age: 12 } }, {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Must be an adult');
    expect(err.details).toEqual([{ field: 'age', message: 'Must be an adult' }]);
  });
});

describe('app-level protections', () => {
  it('reports the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });

  it('rejects request bodies over the size limit', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(60 * 1024) });
    expect(res.status).toBe(413);
  });

  it('allows CORS only for the configured frontend', async () => {
    const allowed = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:5173');
    const blocked = await request(app).options('/api/auth/login').set('Origin', 'https://evil.example');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects requests whose token is missing the Bearer scheme', async () => {
    const res = await request(app).get('/api/events').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });
});
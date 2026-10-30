import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { sendEmail, sendEmailInBackground } from '../src/services/email.js';
import { hashPassword } from '../src/utils/security.js';
import { authHeader, authUserQuery, mockQueries, USER } from './helpers.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));
vi.mock('../src/services/email.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendEmail: vi.fn(),
  sendEmailInBackground: vi.fn(),
}));

const app = createApp();
const validSignup = { name: 'Asha', email: 'Asha@Example.com', password: 'secret123', confirmPassword: 'secret123' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/signup', () => {
  it('creates the account, lowercases the email, returns a token and sends a welcome email', async () => {
    mockQueries([['INSERT INTO users', (params) => [{ ...USER, email: params[1] }]]]);

    const res = await request(app).post('/api/auth/signup').send(validSignup);

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: USER.id, name: 'Asha', email: 'asha@example.com' });
    expect(res.body.user).not.toHaveProperty('password_hash');
    const [, params] = query.mock.calls[0];
    expect(params[2]).not.toBe('secret123'); // stored hashed
    expect(sendEmailInBackground).toHaveBeenCalledWith(expect.objectContaining({ to: 'asha@example.com' }));
  });

  it('rejects mismatched passwords', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...validSignup, confirmPassword: 'different1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Passwords do not match');
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['short', 'Password must be at least 8 characters'],
    ['onlyletters', 'Password must contain a number'],
    ['12345678', 'Password must contain a letter'],
  ])('rejects weak password %s', async (password, message) => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...validSignup, password, confirmPassword: password });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
  });

  it('returns 409 when the email is already registered', async () => {
    mockQueries([['INSERT INTO users', () => []]]);
    const res = await request(app).post('/api/auth/signup').send(validSignup);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    const passwordHash = await hashPassword('secret123');
    mockQueries([
      [
        'FROM users WHERE email = $1',
        ([email]) => (email === USER.email ? [{ ...USER, password_hash: passwordHash }] : []),
      ],
    ]);
  });

  it('signs in with the right password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ASHA@example.com', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER.email);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email: USER.email, password: 'nope12345' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'secret123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('rejects tokens issued before a password change', async () => {
    mockQueries([authUserQuery({ ...USER, token_version: 1 })]);
    const res = await request(app).get('/api/auth/me').set(authHeader());
    expect(res.status).toBe(401);
  });

  it('returns the current user', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).get('/api/auth/me').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: USER.id, name: USER.name, email: USER.email });
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('does not reveal whether an email is registered', async () => {
    mockQueries([['FROM users WHERE email = $1', () => []]]);
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('emails a code when the account exists', async () => {
    mockQueries([
      ['FROM users WHERE email = $1', () => [{ id: USER.id, email: USER.email }]],
      ['UPDATE email_otps', () => ({ rowCount: 0 })],
      ['INSERT INTO email_otps', () => ({ rowCount: 1 })],
    ]);
    const res = await request(app).post('/api/auth/forgot-password').send({ email: USER.email });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: USER.email, subject: expect.stringMatching(/\d{6}/) }),
    );
  });
});

describe('general hardening', () => {
  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });
});

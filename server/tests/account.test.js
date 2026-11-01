import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { sendEmail, sendEmailInBackground } from '../src/services/email.js';
import { hashOtp, hashPassword } from '../src/utils/security.js';
import { authHeader, authUserQuery, mockQueries, USER } from './helpers.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));
vi.mock('../src/services/email.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendEmail: vi.fn(),
  sendEmailInBackground: vi.fn(),
}));

const app = createApp();
let passwordHash;

// Must come before authUserQuery: both SQL strings contain "FROM users WHERE id = $1".
const passwordQuery = () => ['SELECT password_hash FROM users', () => [{ password_hash: passwordHash }]];
const otpRow = (payload = null) => ({ id: 'otp1', code_hash: hashOtp('123456'), payload, attempts: 0 });

beforeAll(async () => {
  passwordHash = await hashPassword('secret123');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/account/profile', () => {
  it('updates the name', async () => {
    mockQueries([authUserQuery(), ['UPDATE users SET name', ([name]) => [{ ...USER, name }]]]);
    const res = await request(app).patch('/api/account/profile').set(authHeader()).send({ name: '  Asha Rao ' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Asha Rao');
  });

  it('rejects an empty name', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).patch('/api/account/profile').set(authHeader()).send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('requires sign-in', async () => {
    const res = await request(app).patch('/api/account/profile').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('change email', () => {
  const issueOtpQueries = [
    ['UPDATE email_otps SET consumed_at = now() WHERE user_id', () => ({ rowCount: 0 })],
    ['INSERT INTO email_otps', () => ({ rowCount: 1 })],
  ];

  it('sends the verification code to the CURRENT email address', async () => {
    mockQueries([passwordQuery(), authUserQuery(), ['SELECT 1 FROM users WHERE email', () => []], ...issueOtpQueries]);

    const res = await request(app)
      .post('/api/account/email/request')
      .set(authHeader())
      .send({ newEmail: 'NEW@example.com', currentPassword: 'secret123' });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: USER.email }));
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO email_otps'));
    expect(insert[1][1]).toBe('change_email');
    expect(insert[1][3]).toEqual({ newEmail: 'new@example.com' });
  });

  it('rejects a wrong current password', async () => {
    mockQueries([passwordQuery(), authUserQuery(), ['SELECT 1 FROM users WHERE email', () => []]]);
    const res = await request(app)
      .post('/api/account/email/request')
      .set(authHeader())
      .send({ newEmail: 'new@example.com', currentPassword: 'wrongpass1' });
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rejects the email the account already uses', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app)
      .post('/api/account/email/request')
      .set(authHeader())
      .send({ newEmail: USER.email, currentPassword: 'secret123' });
    expect(res.status).toBe(400);
  });

  it('rejects an email that belongs to another account', async () => {
    mockQueries([passwordQuery(), authUserQuery(), ['SELECT 1 FROM users WHERE email', () => [{ '?column?': 1 }]]]);
    const res = await request(app)
      .post('/api/account/email/request')
      .set(authHeader())
      .send({ newEmail: 'taken@example.com', currentPassword: 'secret123' });
    expect(res.status).toBe(409);
  });

  it('changes the email with a valid code and notifies both addresses', async () => {
    mockQueries([
      authUserQuery(),
      ['SELECT id, code_hash', () => [otpRow({ newEmail: 'new@example.com' })]],
      ['SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', () => [{ id: 'otp1' }]],
      ['UPDATE users SET email', ([newEmail]) => [{ ...USER, email: newEmail }]],
    ]);

    const res = await request(app).post('/api/account/email/confirm').set(authHeader()).send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.token).toEqual(expect.any(String));
    const notified = sendEmailInBackground.mock.calls.map(([message]) => message.to);
    expect(notified).toEqual(expect.arrayContaining([USER.email, 'new@example.com']));
  });

  it('rejects a malformed code before touching the database', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app).post('/api/account/email/confirm').set(authHeader()).send({ code: '12ab' });
    expect(res.status).toBe(400);
    expect(query.mock.calls.some(([sql]) => sql.includes('email_otps'))).toBe(false);
  });
});

describe('change password', () => {
  it('requires the current password before sending a code', async () => {
    mockQueries([passwordQuery(), authUserQuery()]);
    const res = await request(app)
      .post('/api/account/password/request')
      .set(authHeader())
      .send({ currentPassword: 'wrongpass1' });
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('emails a code when the current password is right', async () => {
    mockQueries([
      passwordQuery(),
      authUserQuery(),
      ['UPDATE email_otps SET consumed_at = now() WHERE user_id', () => ({ rowCount: 0 })],
      ['INSERT INTO email_otps', () => ({ rowCount: 1 })],
    ]);
    const res = await request(app)
      .post('/api/account/password/request')
      .set(authHeader())
      .send({ currentPassword: 'secret123' });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: USER.email }));
  });

  it('rejects mismatched new passwords', async () => {
    mockQueries([authUserQuery()]);
    const res = await request(app)
      .post('/api/account/password/confirm')
      .set(authHeader())
      .send({ code: '123456', newPassword: 'newpass123', confirmPassword: 'newpass124' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Passwords do not match');
  });

  it('changes the password, signs out other devices and returns a fresh token', async () => {
    mockQueries([
      authUserQuery(),
      ['SELECT id, code_hash', () => [otpRow()]],
      ['SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', () => [{ id: 'otp1' }]],
      ['UPDATE users SET password_hash', () => [{ ...USER, token_version: 1 }]],
    ]);

    const res = await request(app)
      .post('/api/account/password/confirm')
      .set(authHeader())
      .send({ code: '123456', newPassword: 'newpass123', confirmPassword: 'newpass123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    const [sql, params] = query.mock.calls.find(([s]) => s.includes('UPDATE users SET password_hash'));
    expect(sql).toContain('token_version = token_version + 1');
    expect(params[0]).not.toBe('newpass123'); // stored hashed, never in plain text
  });
});

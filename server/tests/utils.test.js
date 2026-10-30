import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db/pool.js';
import { hasRole } from '../src/services/eventAccess.js';
import { consumeOtp } from '../src/services/otp.js';
import { camelize } from '../src/utils/rows.js';
import { escapeHtml, generateEventCode, generateOtp, hashOtp, safeEqual } from '../src/utils/security.js';
import { effectiveEventStatus, effectiveTaskStatus } from '../src/utils/status.js';
import { mockQueries, USER } from './helpers.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('security helpers', () => {
  it('generates unambiguous 8-character event codes', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateEventCode()));
    expect(codes.size).toBe(500);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('generates 6-digit OTPs', () => {
    for (let i = 0; i < 100; i += 1) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it('hashes OTPs deterministically without exposing them', () => {
    expect(hashOtp('123456')).toBe(hashOtp('123456'));
    expect(hashOtp('123456')).not.toContain('123456');
    expect(safeEqual(hashOtp('1'), hashOtp('2'))).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('escapes HTML for emails', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});

describe('status rules', () => {
  const today = '2026-10-30';

  it('marks overdue unfinished tasks as delayed', () => {
    expect(effectiveTaskStatus({ status: 'in_progress', dueDate: '2026-10-29' }, today)).toBe('delayed');
    expect(effectiveTaskStatus({ status: 'not_started', dueDate: '2026-10-29' }, today)).toBe('delayed');
  });

  it('never marks completed or not-yet-due tasks as delayed', () => {
    expect(effectiveTaskStatus({ status: 'completed', dueDate: '2026-10-01' }, today)).toBe('completed');
    expect(effectiveTaskStatus({ status: 'in_progress', dueDate: today }, today)).toBe('in_progress');
    expect(effectiveTaskStatus({ status: 'not_started', dueDate: null }, today)).toBe('not_started');
  });

  it('applies the same rule to events', () => {
    expect(effectiveEventStatus({ status: 'in_progress', endDate: '2026-10-01' }, today)).toBe('delayed');
    expect(effectiveEventStatus({ status: 'finished', endDate: '2026-10-01' }, today)).toBe('finished');
  });
});

describe('roles', () => {
  it('ranks head > editor > viewer', () => {
    expect(hasRole('head', 'editor')).toBe(true);
    expect(hasRole('editor', 'editor')).toBe(true);
    expect(hasRole('viewer', 'editor')).toBe(false);
    expect(hasRole(undefined, 'viewer')).toBe(false);
  });
});

describe('camelize', () => {
  it('converts snake_case keys', () => {
    expect(camelize({ due_date: '2026-01-01', ai_generated: true, id: 1 })).toEqual({
      dueDate: '2026-01-01',
      aiGenerated: true,
      id: 1,
    });
  });
});

describe('consumeOtp', () => {
  const otpRow = (overrides = {}) => ({ id: 'otp1', code_hash: hashOtp('123456'), payload: { newEmail: 'n@e.com' }, attempts: 0, ...overrides });

  it('returns the payload and consumes a correct code', async () => {
    mockQueries([
      ['SELECT id, code_hash', () => [otpRow()]],
      ['SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', () => [{ id: 'otp1' }]],
    ]);
    await expect(consumeOtp(USER.id, 'change_email', '123456')).resolves.toEqual({ newEmail: 'n@e.com' });
  });

  it('counts a wrong guess and rejects it', async () => {
    mockQueries([
      ['SELECT id, code_hash', () => [otpRow()]],
      ['SET attempts = attempts + 1', () => ({ rowCount: 1 })],
    ]);
    await expect(consumeOtp(USER.id, 'change_email', '000000')).rejects.toMatchObject({ status: 400 });
    expect(query.mock.calls.some(([sql]) => sql.includes('attempts + 1'))).toBe(true);
  });

  it('locks the code after too many attempts, even if correct', async () => {
    mockQueries([['SELECT id, code_hash', () => [otpRow({ attempts: 5 })]]]);
    await expect(consumeOtp(USER.id, 'change_email', '123456')).rejects.toMatchObject({ status: 400 });
  });

  it('rejects when the code was already used concurrently', async () => {
    mockQueries([
      ['SELECT id, code_hash', () => [otpRow()]],
      ['SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', () => []],
    ]);
    await expect(consumeOtp(USER.id, 'change_email', '123456')).rejects.toMatchObject({ status: 400 });
  });
});

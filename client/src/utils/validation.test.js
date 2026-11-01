import { describe, expect, it } from 'vitest';
import { isValid, validateConfirm, validateEmail, validatePassword } from './validation.js';

describe('validateEmail', () => {
  it.each([
    ['', 'Email is required'],
    ['   ', 'Email is required'],
    ['asha', 'Enter a valid email address'],
    ['asha@', 'Enter a valid email address'],
    ['asha@example', 'Enter a valid email address'],
    ['asha @example.com', 'Enter a valid email address'],
  ])('rejects %j', (value, message) => {
    expect(validateEmail(value)).toBe(message);
  });

  it('accepts a normal address, ignoring surrounding spaces', () => {
    expect(validateEmail('  asha.rao+events@example.co.in ')).toBe('');
  });
});

describe('validatePassword', () => {
  it.each([
    ['', 'Password is required'],
    ['abc12', 'Password must be at least 8 characters'],
    ['abcdefgh', 'Password must contain a letter and a number'],
    ['12345678', 'Password must contain a letter and a number'],
    [`a1${'x'.repeat(71)}`, 'Password must be at most 72 characters'],
  ])('rejects %j', (value, message) => {
    expect(validatePassword(value)).toBe(message);
  });

  it('accepts a password with letters and numbers', () => {
    expect(validatePassword('secret123')).toBe('');
  });
});

describe('validateConfirm', () => {
  it('asks for the re-entered password', () => {
    expect(validateConfirm('secret123', '')).toBe('Please re-enter your password');
  });

  it('detects a mismatch', () => {
    expect(validateConfirm('secret123', 'secret124')).toBe('Passwords do not match');
  });

  it('passes when both match', () => {
    expect(validateConfirm('secret123', 'secret123')).toBe('');
  });
});

describe('isValid', () => {
  it('is true only when every message is empty', () => {
    expect(isValid({ email: '', password: '' })).toBe(true);
    expect(isValid({ email: '', password: 'Password is required' })).toBe(false);
    expect(isValid({})).toBe(true);
  });
});

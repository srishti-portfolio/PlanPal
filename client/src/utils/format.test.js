import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatMoney, formatRange } from './format.js';

describe('formatDate', () => {
  it('shows a dash for missing or invalid dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('keeps calendar dates on the same day in every timezone', () => {
    // 'YYYY-MM-DD' is parsed as local midnight, so it never shifts to the previous day.
    const formatted = formatDate('2026-12-05');
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/\b5\b/);
  });

  it('also formats full timestamps', () => {
    expect(formatDate('2026-03-15T10:00:00Z')).toContain('2026');
  });
});

describe('formatRange', () => {
  it('explains when no dates are set', () => {
    expect(formatRange(null, null)).toBe('Dates not set');
  });

  it('shows a single date for one-day events', () => {
    expect(formatRange('2026-12-05', '2026-12-05')).toBe(formatDate('2026-12-05'));
    expect(formatRange('2026-12-05', null)).toBe(formatDate('2026-12-05'));
  });

  it('joins a start and end date with a dash', () => {
    expect(formatRange('2026-12-05', '2026-12-07')).toBe(`${formatDate('2026-12-05')} – ${formatDate('2026-12-07')}`);
  });
});

describe('formatMoney', () => {
  it('shows a dash when there is no budget', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('rounds to whole units with grouping', () => {
    expect(formatMoney(1234.6).replace(/\D/g, '')).toBe('1235');
    expect(formatMoney(0)).toBe('0');
  });
});

describe('formatDateTime', () => {
  it('returns an empty string for invalid input', () => {
    expect(formatDateTime('nope')).toBe('');
  });

  it('formats a timestamp', () => {
    expect(formatDateTime('2026-10-30T10:15:00Z')).not.toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { effectiveEventStatus, effectiveTaskStatus, groupTasksByColumn, localToday, upcomingEvents } from './status.js';

const today = '2026-10-30';

describe('task status', () => {
  it('shows overdue unfinished tasks as delayed', () => {
    expect(effectiveTaskStatus({ status: 'in_progress', dueDate: '2026-10-29' }, today)).toBe('delayed');
    expect(effectiveTaskStatus({ status: 'completed', dueDate: '2026-10-29' }, today)).toBe('completed');
    expect(effectiveTaskStatus({ status: 'not_started', dueDate: '2026-10-30' }, today)).toBe('not_started');
  });

  it('groups tasks into the four board columns', () => {
    const groups = groupTasksByColumn(
      [
        { id: 1, status: 'not_started', dueDate: '2026-11-01' },
        { id: 2, status: 'in_progress', dueDate: null },
        { id: 3, status: 'completed', dueDate: '2026-10-01' },
        { id: 4, status: 'in_progress', dueDate: '2026-10-01' },
      ],
      today,
    );
    expect(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((t) => t.id)]))).toEqual({
      not_started: [1],
      in_progress: [2],
      completed: [3],
      delayed: [4],
    });
  });
});

describe('events', () => {
  it('marks an event delayed once its end date passes without being finished', () => {
    expect(effectiveEventStatus({ status: 'in_progress', endDate: '2026-10-01' }, today)).toBe('delayed');
    expect(effectiveEventStatus({ status: 'finished', endDate: '2026-10-01' }, today)).toBe('finished');
  });

  it('lists upcoming events soonest first, excluding finished and past ones', () => {
    const result = upcomingEvents(
      [
        { id: 'later', status: 'not_started', startDate: '2026-12-01', endDate: '2026-12-02' },
        { id: 'past', status: 'in_progress', startDate: '2026-09-01', endDate: '2026-09-02' },
        { id: 'done', status: 'finished', startDate: '2026-11-01', endDate: '2026-11-02' },
        { id: 'undated', status: 'not_started', startDate: null, endDate: null },
        { id: 'soon', status: 'not_started', startDate: '2026-11-05', endDate: '2026-11-05' },
      ],
      today,
    );
    expect(result.map((e) => e.id)).toEqual(['soon', 'later', 'undated']);
  });

  it('formats the local date as YYYY-MM-DD', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

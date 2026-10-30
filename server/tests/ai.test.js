import { describe, expect, it, vi } from 'vitest';
import { buildEventContext, normalizeSuggestions, setAiClientForTesting, suggestTasks } from '../src/services/ai.js';

const bundle = {
  event: {
    name: 'Riya turns 30',
    eventType: 'Birthday',
    startDate: '2026-12-05',
    endDate: '2026-12-05',
    budget: 50000,
    status: 'not_started',
  },
  importantDates: [{ date: '2026-11-20', title: 'RSVP deadline' }],
  tasks: [
    { title: 'Book venue', status: 'completed', startDate: '2026-10-01', dueDate: '2026-10-10' },
    { title: 'Order cake', status: 'not_started', startDate: null, dueDate: '2026-10-20' },
  ],
};

describe('buildEventContext', () => {
  it('summarises the event, dates and computed task statuses inside delimiters', () => {
    const text = buildEventContext(bundle, '2026-10-30');
    expect(text.startsWith('<event_context>')).toBe(true);
    expect(text).toContain('Type: Birthday');
    expect(text).toContain('Budget: 50000');
    expect(text).toContain('2026-11-20: RSVP deadline');
    expect(text).toContain('[completed] Book venue');
    expect(text).toContain('[delayed] Order cake');
  });
});

describe('normalizeSuggestions', () => {
  const opts = { today: '2026-10-30', endDate: '2026-12-05' };

  it('drops malformed items and clamps dates into [today, end date]', () => {
    const result = normalizeSuggestions(
      [
        { title: 'Send invites', description: 'Digital invites', startDate: '2026-10-01', dueDate: '2027-01-01' },
        { description: 'missing title' },
        'not even an object',
        { title: 'Hire DJ', description: '', startDate: '2026-11-20', dueDate: '2026-11-10' },
        { title: 'Bad dates', description: '', startDate: 'tomorrow', dueDate: '2026-11-01' },
      ],
      opts,
    );
    expect(result).toEqual([
      { title: 'Send invites', description: 'Digital invites', startDate: '2026-10-30', dueDate: '2026-12-05' },
      { title: 'Hire DJ', description: '', startDate: '2026-11-10', dueDate: '2026-11-10' },
      { title: 'Bad dates', description: '', startDate: null, dueDate: '2026-11-01' },
    ]);
  });

  it('returns an empty list for non-array output', () => {
    expect(normalizeSuggestions({ tasks: [] }, opts)).toEqual([]);
  });

  it('caps the number of suggestions', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `Task ${i}`, description: '' }));
    expect(normalizeSuggestions(many, opts)).toHaveLength(12);
  });
});

describe('suggestTasks', () => {
  it('requests structured JSON from Gemini and normalises it', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify([{ title: 'Choose theme', description: 'Pick a theme', startDate: '2026-11-01', dueDate: '2026-11-05' }]),
    });
    setAiClientForTesting({ models: { generateContent } });

    const result = await suggestTasks(bundle, '2026-10-30');

    expect(result).toEqual([
      { title: 'Choose theme', description: 'Pick a theme', startDate: '2026-11-01', dueDate: '2026-11-05' },
    ]);
    const request = generateContent.mock.calls[0][0];
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.contents).toContain('- Book venue'); // existing tasks are excluded
  });

  it('reports invalid JSON as a 502', async () => {
    setAiClientForTesting({ models: { generateContent: vi.fn().mockResolvedValue({ text: 'not json' }) } });
    await expect(suggestTasks(bundle, '2026-10-30')).rejects.toMatchObject({ status: 502 });
  });
});

import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { joinLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { requireEventRole } from '../services/eventAccess.js';
import { getEvent, getImportantDates, getMembers, getTasks } from '../services/eventData.js';
import { camelize, camelizeAll } from '../utils/rows.js';
import * as s from '../utils/schemas.js';
import { generateEventCode } from '../utils/security.js';
import { EVENT_STATUSES } from '../utils/status.js';
import tasksRouter from './tasks.js';

const router = Router();
router.use(requireAuth);

const eventParams = z.object({ eventId: s.uuid });

// ---------- List / create / join ----------

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT e.id, e.name, e.event_type, e.start_date, e.end_date, e.status, e.created_at,
            m.role, m.joined_at,
            CASE WHEN m.role = 'head' THEN e.code END AS code,
            (SELECT COUNT(*)::int FROM event_members em WHERE em.event_id = e.id) AS member_count
     FROM event_members m
     JOIN events e ON e.id = m.event_id
     WHERE m.user_id = $1
     ORDER BY e.start_date NULLS LAST, e.created_at DESC`,
    [req.user.id],
  );
  res.json({ events: camelizeAll(rows) });
});

const createSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(120, 'Event name is too long'),
});

router.post('/', validate({ body: createSchema }), async (req, res) => {
  // Codes are random; on the rare unique-constraint clash just try a new one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const event = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO events (code, name, created_by) VALUES ($1, $2, $3)
           RETURNING id, code, name, event_type, description, start_date, end_date, budget, status, created_at`,
          [generateEventCode(), req.valid.body.name, req.user.id],
        );
        await client.query("INSERT INTO event_members (event_id, user_id, role) VALUES ($1, $2, 'head')", [
          rows[0].id,
          req.user.id,
        ]);
        return rows[0];
      });
      return res.status(201).json({ event: camelize(event), role: 'head' });
    } catch (err) {
      if (err.code !== '23505' || err.constraint !== 'events_code_key') throw err;
    }
  }
  throw new HttpError(503, 'Could not generate a unique event code. Please try again.');
});

const joinSchema = z.object({
  code: z
    .string({ required_error: 'Event code is required' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,12}$/, 'Event codes are 8 letters/numbers'),
});

router.post('/join', joinLimiter, validate({ body: joinSchema }), async (req, res) => {
  const { rows } = await query('SELECT id, name FROM events WHERE code = $1', [req.valid.body.code]);
  const event = rows[0];
  if (!event) throw new HttpError(404, 'No event found with that code. Check it and try again.');

  const inserted = await query(
    `INSERT INTO event_members (event_id, user_id, role) VALUES ($1, $2, 'viewer')
     ON CONFLICT (event_id, user_id) DO NOTHING`,
    [event.id, req.user.id],
  );
  res.status(inserted.rowCount ? 201 : 200).json({
    event: { id: event.id, name: event.name },
    alreadyMember: inserted.rowCount === 0,
  });
});

// ---------- Single event ----------

router.get('/:eventId', validate({ params: eventParams }), requireEventRole('viewer'), async (req, res) => {
  const { eventId } = req.valid.params;
  const [event, importantDates, tasks, members] = await Promise.all([
    getEvent(eventId),
    getImportantDates(eventId),
    getTasks(eventId),
    getMembers(eventId),
  ]);
  // Only the head sees the join code: they decide who gets in.
  if (req.eventRole !== 'head') delete event.code;
  // Only the head needs members' emails for managing access.
  const visibleMembers =
    req.eventRole === 'head' ? members : members.map(({ email: _email, ...member }) => member);
  res.json({ event, role: req.eventRole, importantDates, tasks, members: visibleMembers });
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Event name is required').max(120).optional(),
    eventType: s.optionalText(60),
    description: s.optionalText(2000),
    startDate: s.isoDate.nullish(),
    endDate: s.isoDate.nullish(),
    budget: z.number().nonnegative('Budget cannot be negative').max(1e12).nullish(),
    status: z.enum(EVENT_STATUSES).optional(),
  })
  .partial()
  .superRefine(s.dateRangeCheck('startDate', 'endDate', 'End date must be on or after the start date'));

const UPDATE_COLUMNS = {
  name: 'name',
  eventType: 'event_type',
  description: 'description',
  startDate: 'start_date',
  endDate: 'end_date',
  budget: 'budget',
  status: 'status',
};

router.patch(
  '/:eventId',
  validate({ params: eventParams, body: updateSchema }),
  requireEventRole('editor'),
  async (req, res) => {
    const body = req.valid.body;
    if (body.status !== undefined && req.eventRole !== 'head') {
      throw new HttpError(403, 'Only the event head can change the event status');
    }

    // Build "SET col = $n" only from whitelisted keys that were actually sent.
    const entries = Object.entries(UPDATE_COLUMNS).filter(([key]) => req.body[key] !== undefined);
    if (entries.length === 0) throw new HttpError(400, 'Nothing to update');
    const sets = entries.map(([, column], i) => `${column} = $${i + 2}`);
    const values = entries.map(([key]) => body[key] ?? null);

    const { rows } = await query(
      `UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id = $1
       RETURNING id, name, event_type, description, start_date, end_date, budget, status, created_at, updated_at`,
      [req.valid.params.eventId, ...values],
    );
    // If only one date was sent, the events_dates_order constraint still guards the pair.
    res.json({ event: camelize(rows[0]) });
  },
);

router.delete('/:eventId', validate({ params: eventParams }), requireEventRole('head'), async (req, res) => {
  await query('DELETE FROM events WHERE id = $1', [req.valid.params.eventId]);
  res.status(204).end();
});

router.post('/:eventId/leave', validate({ params: eventParams }), requireEventRole('viewer'), async (req, res) => {
  if (req.eventRole === 'head') {
    throw new HttpError(400, 'The event head cannot leave. Delete the event instead.');
  }
  await query('DELETE FROM event_members WHERE event_id = $1 AND user_id = $2', [
    req.valid.params.eventId,
    req.user.id,
  ]);
  res.status(204).end();
});

// ---------- Members (head only) ----------

const memberParams = z.object({ eventId: s.uuid, userId: s.uuid });

function assertNotSelf(req) {
  if (req.valid.params.userId === req.user.id) {
    throw new HttpError(400, 'You cannot change your own access as the event head');
  }
}

router.patch(
  '/:eventId/members/:userId',
  validate({ params: memberParams, body: z.object({ role: z.enum(['editor', 'viewer']) }) }),
  requireEventRole('head'),
  async (req, res) => {
    assertNotSelf(req);
    const { rows } = await query(
      `UPDATE event_members SET role = $3 WHERE event_id = $1 AND user_id = $2 AND role <> 'head'
       RETURNING user_id, role`,
      [req.valid.params.eventId, req.valid.params.userId, req.valid.body.role],
    );
    if (!rows[0]) throw new HttpError(404, 'Member not found');
    res.json({ member: camelize(rows[0]) });
  },
);

router.delete(
  '/:eventId/members/:userId',
  validate({ params: memberParams }),
  requireEventRole('head'),
  async (req, res) => {
    assertNotSelf(req);
    const result = await query(
      "DELETE FROM event_members WHERE event_id = $1 AND user_id = $2 AND role <> 'head'",
      [req.valid.params.eventId, req.valid.params.userId],
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Member not found');
    res.status(204).end();
  },
);

// ---------- Important dates ----------

const dateBody = z.object({
  date: s.isoDate,
  title: z.string().trim().min(1, 'Describe what happens on this date').max(200),
});

router.post(
  '/:eventId/dates',
  validate({ params: eventParams, body: dateBody }),
  requireEventRole('editor'),
  async (req, res) => {
    const { rows } = await query(
      'INSERT INTO important_dates (event_id, date, title) VALUES ($1, $2, $3) RETURNING id, date, title',
      [req.valid.params.eventId, req.valid.body.date, req.valid.body.title],
    );
    res.status(201).json({ importantDate: camelize(rows[0]) });
  },
);

router.delete(
  '/:eventId/dates/:dateId',
  validate({ params: z.object({ eventId: s.uuid, dateId: s.uuid }) }),
  requireEventRole('editor'),
  async (req, res) => {
    const result = await query('DELETE FROM important_dates WHERE id = $1 AND event_id = $2', [
      req.valid.params.dateId,
      req.valid.params.eventId,
    ]);
    if (result.rowCount === 0) throw new HttpError(404, 'Date not found');
    res.status(204).end();
  },
);

router.use('/:eventId/tasks', tasksRouter);

export default router;

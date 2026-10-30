import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { aiLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { suggestTasks } from '../services/ai.js';
import { requireEventRole } from '../services/eventAccess.js';
import { getEventBundle, getTasks, TASK_COLUMNS } from '../services/eventData.js';
import { camelize, camelizeAll } from '../utils/rows.js';
import * as s from '../utils/schemas.js';
import { TASK_STATUSES } from '../utils/status.js';

// Mounted at /api/events/:eventId/tasks (auth already applied by the parent router).
const router = Router({ mergeParams: true });

const eventParams = z.object({ eventId: s.uuid });
const taskParams = z.object({ eventId: s.uuid, taskId: s.uuid });

const taskFields = {
  title: z.string().trim().min(1, 'Task title is required').max(160, 'Task title is too long'),
  description: s.optionalText(2000),
  startDate: s.isoDate.nullish(),
  dueDate: s.isoDate.nullish(),
  status: z.enum(TASK_STATUSES),
};
const datesCheck = s.dateRangeCheck('startDate', 'dueDate', 'Due date must be on or after the start date');

const createTaskSchema = z
  .object({ ...taskFields, status: taskFields.status.default('not_started'), aiGenerated: z.boolean().default(false) })
  .superRefine(datesCheck);

router.get('/', validate({ params: eventParams }), requireEventRole('viewer'), async (req, res) => {
  res.json({ tasks: await getTasks(req.valid.params.eventId) });
});

const INSERT_TASK = `INSERT INTO tasks (event_id, title, description, start_date, due_date, status, ai_generated, created_by)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${TASK_COLUMNS}`;

const insertParams = (eventId, userId, t) => [
  eventId,
  t.title,
  t.description,
  t.startDate ?? null,
  t.dueDate ?? null,
  t.status,
  t.aiGenerated,
  userId,
];

router.post(
  '/',
  validate({ params: eventParams, body: createTaskSchema }),
  requireEventRole('editor'),
  async (req, res) => {
    const { rows } = await query(INSERT_TASK, insertParams(req.valid.params.eventId, req.user.id, req.valid.body));
    res.status(201).json({ task: camelize(rows[0]) });
  },
);

/** Add several tasks at once (e.g. the AI suggestions the user ticked) in one transaction. */
router.post(
  '/bulk',
  validate({ params: eventParams, body: z.object({ tasks: z.array(createTaskSchema).min(1).max(30) }) }),
  requireEventRole('editor'),
  async (req, res) => {
    const created = await withTransaction(async (client) => {
      const results = [];
      for (const task of req.valid.body.tasks) {
        const { rows } = await client.query(INSERT_TASK, insertParams(req.valid.params.eventId, req.user.id, task));
        results.push(rows[0]);
      }
      return results;
    });
    res.status(201).json({ tasks: camelizeAll(created) });
  },
);

router.post(
  '/suggestions',
  validate({ params: eventParams }),
  requireEventRole('editor'),
  aiLimiter,
  async (req, res) => {
    const bundle = await getEventBundle(req.valid.params.eventId);
    res.json({ suggestions: await suggestTasks(bundle) });
  },
);

const updateTaskSchema = z.object(taskFields).partial().superRefine(datesCheck);
const TASK_UPDATE_COLUMNS = {
  title: 'title',
  description: 'description',
  startDate: 'start_date',
  dueDate: 'due_date',
  status: 'status',
};

router.patch(
  '/:taskId',
  validate({ params: taskParams, body: updateTaskSchema }),
  requireEventRole('editor'),
  async (req, res) => {
    const entries = Object.entries(TASK_UPDATE_COLUMNS).filter(([key]) => req.body[key] !== undefined);
    if (entries.length === 0) throw new HttpError(400, 'Nothing to update');
    const sets = entries.map(([, column], i) => `${column} = $${i + 3}`);
    const values = entries.map(([key]) => req.valid.body[key] ?? null);

    const { rows } = await query(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 AND event_id = $2 RETURNING ${TASK_COLUMNS}`,
      [req.valid.params.taskId, req.valid.params.eventId, ...values],
    );
    if (!rows[0]) throw new HttpError(404, 'Task not found');
    res.json({ task: camelize(rows[0]) });
  },
);

router.delete(
  '/:taskId',
  validate({ params: taskParams }),
  requireEventRole('editor'),
  async (req, res) => {
    const result = await query('DELETE FROM tasks WHERE id = $1 AND event_id = $2', [
      req.valid.params.taskId,
      req.valid.params.eventId,
    ]);
    if (result.rowCount === 0) throw new HttpError(404, 'Task not found');
    res.status(204).end();
  },
);

export default router;

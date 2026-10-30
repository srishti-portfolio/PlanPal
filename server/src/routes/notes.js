import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { assertEventRole } from '../services/eventAccess.js';
import { camelize, camelizeAll } from '../utils/rows.js';
import * as s from '../utils/schemas.js';

const router = Router();
router.use(requireAuth);

const noteParams = z.object({ noteId: s.uuid });
const content = z.string().trim().min(1, 'Write something before saving').max(5000, 'Note is too long');

const NOTE_SELECT = `SELECT n.id, n.content, n.event_id, e.name AS event_name, n.created_at, n.updated_at
  FROM notes n LEFT JOIN events e ON e.id = n.event_id`;

async function getOwnNote(noteId, userId) {
  const { rows } = await query(`${NOTE_SELECT} WHERE n.id = $1 AND n.user_id = $2`, [noteId, userId]);
  if (!rows[0]) throw new HttpError(404, 'Note not found');
  return camelize(rows[0]);
}

router.get('/', validate({ query: z.object({ eventId: s.uuid.optional() }) }), async (req, res) => {
  const { eventId } = req.valid.query;
  const { rows } = await query(
    `${NOTE_SELECT} WHERE n.user_id = $1 AND ($2::uuid IS NULL OR n.event_id = $2)
     ORDER BY n.updated_at DESC LIMIT 200`,
    [req.user.id, eventId ?? null],
  );
  res.json({ notes: camelizeAll(rows) });
});

router.post('/', validate({ body: z.object({ content, eventId: s.uuid.nullish() }) }), async (req, res) => {
  const eventId = req.valid.body.eventId ?? null;
  if (eventId) await assertEventRole(eventId, req.user.id, 'viewer');
  const { rows } = await query('INSERT INTO notes (user_id, event_id, content) VALUES ($1, $2, $3) RETURNING id', [
    req.user.id,
    eventId,
    req.valid.body.content,
  ]);
  res.status(201).json({ note: await getOwnNote(rows[0].id, req.user.id) });
});

router.patch(
  '/:noteId',
  validate({
    params: noteParams,
    body: z.object({ content: content.optional(), eventId: s.uuid.nullable().optional() }),
  }),
  async (req, res) => {
    const note = await getOwnNote(req.valid.params.noteId, req.user.id);
    const { content: newContent, eventId } = req.valid.body;
    if (eventId) await assertEventRole(eventId, req.user.id, 'viewer');

    await query(
      `UPDATE notes SET
         content = COALESCE($2, content),
         event_id = CASE WHEN $3 THEN $4::uuid ELSE event_id END,
         updated_at = now()
       WHERE id = $1`,
      [note.id, newContent ?? null, eventId !== undefined, eventId ?? null],
    );
    res.json({ note: await getOwnNote(note.id, req.user.id) });
  },
);

router.delete('/:noteId', validate({ params: noteParams }), async (req, res) => {
  const result = await query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [
    req.valid.params.noteId,
    req.user.id,
  ]);
  if (result.rowCount === 0) throw new HttpError(404, 'Note not found');
  res.status(204).end();
});

export default router;

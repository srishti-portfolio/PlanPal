import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { aiLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { buildEventContext, generateChatReply } from '../services/ai.js';
import { assertEventRole, getRole } from '../services/eventAccess.js';
import { getEventBundle } from '../services/eventData.js';
import { camelize, camelizeAll } from '../utils/rows.js';
import * as s from '../utils/schemas.js';

const router = Router();
router.use(requireAuth);

/** How many previous messages are sent to Gemini; keeps latency and token cost bounded. */
const HISTORY_LIMIT = 20;

const chatParams = z.object({ chatId: s.uuid });

const CHAT_SELECT = `SELECT c.id, c.title, c.event_id, e.name AS event_name, c.created_at, c.updated_at
  FROM chats c LEFT JOIN events e ON e.id = c.event_id`;

/** Load a chat owned by the caller, or 404. Chats are private to each account. */
async function getOwnChat(chatId, userId) {
  const { rows } = await query(`${CHAT_SELECT} WHERE c.id = $1 AND c.user_id = $2`, [chatId, userId]);
  if (!rows[0]) throw new HttpError(404, 'Chat not found');
  return camelize(rows[0]);
}

router.get(
  '/',
  validate({ query: z.object({ eventId: s.uuid.optional() }) }),
  async (req, res) => {
    const { eventId } = req.valid.query;
    const { rows } = await query(
      `${CHAT_SELECT} WHERE c.user_id = $1 AND ($2::uuid IS NULL OR c.event_id = $2)
       ORDER BY c.updated_at DESC LIMIT 100`,
      [req.user.id, eventId ?? null],
    );
    res.json({ chats: camelizeAll(rows) });
  },
);

router.post('/', validate({ body: z.object({ eventId: s.uuid.nullish() }) }), async (req, res) => {
  const eventId = req.valid.body.eventId ?? null;
  if (eventId) await assertEventRole(eventId, req.user.id, 'viewer');
  const { rows } = await query('INSERT INTO chats (user_id, event_id) VALUES ($1, $2) RETURNING id', [
    req.user.id,
    eventId,
  ]);
  res.status(201).json({ chat: await getOwnChat(rows[0].id, req.user.id) });
});

router.get('/:chatId', validate({ params: chatParams }), async (req, res) => {
  const chat = await getOwnChat(req.valid.params.chatId, req.user.id);
  const { rows } = await query(
    'SELECT id, role, content, created_at FROM chat_messages WHERE chat_id = $1 ORDER BY created_at, id',
    [chat.id],
  );
  res.json({ chat, messages: camelizeAll(rows) });
});

/** Link a chat to an event, unlink it (eventId: null) or rename it. */
router.patch(
  '/:chatId',
  validate({
    params: chatParams,
    body: z.object({
      eventId: s.uuid.nullable().optional(),
      title: z.string().trim().min(1).max(120).optional(),
    }),
  }),
  async (req, res) => {
    const chat = await getOwnChat(req.valid.params.chatId, req.user.id);
    const { eventId, title } = req.valid.body;
    if (eventId) await assertEventRole(eventId, req.user.id, 'viewer');

    await query(
      `UPDATE chats SET
         event_id = CASE WHEN $2 THEN $3::uuid ELSE event_id END,
         title = COALESCE($4, title),
         updated_at = now()
       WHERE id = $1`,
      [chat.id, eventId !== undefined, eventId ?? null, title ?? null],
    );
    res.json({ chat: await getOwnChat(chat.id, req.user.id) });
  },
);

router.delete('/:chatId', validate({ params: chatParams }), async (req, res) => {
  const result = await query('DELETE FROM chats WHERE id = $1 AND user_id = $2', [
    req.valid.params.chatId,
    req.user.id,
  ]);
  if (result.rowCount === 0) throw new HttpError(404, 'Chat not found');
  res.status(204).end();
});

const messageBody = z.object({
  content: z.string().trim().min(1, 'Type a message first').max(4000, 'Message is too long (max 4000 characters)'),
});

router.post(
  '/:chatId/messages',
  validate({ params: chatParams, body: messageBody }),
  aiLimiter,
  async (req, res) => {
    const chat = await getOwnChat(req.valid.params.chatId, req.user.id);
    const { content } = req.valid.body;

    // History, membership and event details are independent, so fetch them in one parallel round trip.
    const [historyResult, role, bundle] = await Promise.all([
      query(
        `SELECT role, content FROM (
           SELECT role, content, created_at, id FROM chat_messages WHERE chat_id = $1
           ORDER BY created_at DESC, id DESC LIMIT $2
         ) recent ORDER BY created_at, id`,
        [chat.id, HISTORY_LIMIT],
      ),
      chat.eventId ? getRole(chat.eventId, req.user.id) : null,
      chat.eventId ? getEventBundle(chat.eventId) : null,
    ]);
    // Only include event details if the user still belongs to that event.
    const eventContext = role && bundle ? buildEventContext(bundle) : undefined;

    const reply = await generateChatReply({ history: historyResult.rows, message: content, eventContext });

    // Persist both turns only after the model answered, so failed calls leave no orphan messages.
    // One atomic statement saves both messages and bumps the chat, instead of a 5-query transaction.
    const { rows } = await query(
      `WITH saved AS (
         INSERT INTO chat_messages (chat_id, role, content, created_at)
         VALUES ($1, 'user', $2, clock_timestamp()),
                ($1, 'model', $3, clock_timestamp() + interval '1 millisecond')
         RETURNING id, role, content, created_at
       ), touched AS (
         UPDATE chats SET updated_at = now(),
           title = CASE WHEN title = 'New chat' THEN $4 ELSE title END
         WHERE id = $1 RETURNING title, updated_at
       )
       SELECT saved.*, touched.title AS chat_title, touched.updated_at AS chat_updated_at
       FROM saved CROSS JOIN touched ORDER BY saved.created_at`,
      [chat.id, content, reply, content.length > 60 ? `${content.slice(0, 57)}...` : content],
    );

    const messages = rows.map(({ id, role: messageRole, content: text, created_at: createdAt }) => ({
      id,
      role: messageRole,
      content: text,
      createdAt,
    }));
    res.status(201).json({
      messages,
      chat: { ...chat, title: rows[0].chat_title, updatedAt: rows[0].chat_updated_at },
    });
  },
);

export default router;

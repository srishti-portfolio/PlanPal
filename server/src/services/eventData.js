import { query } from '../db/pool.js';
import { camelize, camelizeAll } from '../utils/rows.js';

export const EVENT_COLUMNS = `e.id, e.name, e.event_type, e.description, e.start_date, e.end_date,
  e.budget, e.status, e.created_by, e.created_at, e.updated_at`;

export const TASK_COLUMNS = `id, event_id, title, description, start_date, due_date, status,
  ai_generated, created_by, created_at, updated_at`;

export async function getEvent(eventId) {
  const { rows } = await query(`SELECT ${EVENT_COLUMNS}, e.code FROM events e WHERE e.id = $1`, [eventId]);
  return camelize(rows[0]);
}

export async function getImportantDates(eventId) {
  const { rows } = await query(
    'SELECT id, date, title FROM important_dates WHERE event_id = $1 ORDER BY date, created_at',
    [eventId],
  );
  return camelizeAll(rows);
}

export async function getTasks(eventId) {
  const { rows } = await query(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE event_id = $1
     ORDER BY due_date NULLS LAST, created_at`,
    [eventId],
  );
  return camelizeAll(rows);
}

export async function getMembers(eventId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, m.role, m.joined_at
     FROM event_members m JOIN users u ON u.id = m.user_id
     WHERE m.event_id = $1
     ORDER BY CASE m.role WHEN 'head' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, m.joined_at`,
    [eventId],
  );
  return camelizeAll(rows);
}

/** Event plus its dates and tasks — everything the AI needs for context. Queries run in parallel. */
export async function getEventBundle(eventId) {
  const [event, importantDates, tasks] = await Promise.all([
    getEvent(eventId),
    getImportantDates(eventId),
    getTasks(eventId),
  ]);
  return event ? { event, importantDates, tasks } : null;
}

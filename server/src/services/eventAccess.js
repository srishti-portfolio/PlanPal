import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

/**
 * Roles inside an event:
 *  - head:   created the event; full control incl. members and event status
 *  - editor: can edit details, important dates and tasks
 *  - viewer: can see everything but change nothing ("just present")
 */
export const ROLE_RANK = Object.freeze({ viewer: 1, editor: 2, head: 3 });

export function hasRole(role, minRole) {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];
}

export async function getRole(eventId, userId) {
  const { rows } = await query('SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2', [
    eventId,
    userId,
  ]);
  return rows[0]?.role ?? null;
}

/**
 * Throw unless the user is a member with at least `minRole`.
 * Non-members get 404 rather than 403 so event ids cannot be probed.
 */
export async function assertEventRole(eventId, userId, minRole = 'viewer') {
  const role = await getRole(eventId, userId);
  if (!role) throw new HttpError(404, 'Event not found');
  if (!hasRole(role, minRole)) {
    throw new HttpError(403, minRole === 'head' ? 'Only the event head can do this' : 'You have view-only access to this event');
  }
  return role;
}

/** Route middleware: checks `req.params.eventId` and stores the caller's role on `req.eventRole`. */
export const requireEventRole = (minRole) => async (req, _res, next) => {
  req.eventRole = await assertEventRole(req.valid.params.eventId, req.user.id, minRole);
  next();
};

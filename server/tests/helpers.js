import { query, withTransaction } from '../src/db/pool.js';
import { signToken } from '../src/middleware/auth.js';

export const USER = { id: '11111111-1111-4111-8111-111111111111', name: 'Asha', email: 'asha@example.com', token_version: 0 };
export const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
export const EVENT_ID = '33333333-3333-4333-8333-333333333333';
export const CHAT_ID = '44444444-4444-4444-8444-444444444444';

export const authHeader = (user = USER) => ({ Authorization: `Bearer ${signToken(user)}` });

/**
 * Route mocked `query` calls by matching a substring of the SQL.
 * Handlers receive the params and return `{ rows, rowCount }` (or just rows).
 * Unknown SQL fails the test loudly so missing mocks are obvious.
 */
export function mockQueries(handlers) {
  const impl = async (sql, params) => {
    const match = handlers.find(([pattern]) => sql.includes(pattern));
    if (!match) throw new Error(`Unexpected query in test:\n${sql}`);
    const result = await match[1](params, sql);
    return Array.isArray(result) ? { rows: result, rowCount: result.length } : { rows: [], rowCount: 0, ...result };
  };
  query.mockImplementation(impl);
  withTransaction.mockImplementation((work) => work({ query: impl }));
}

/** Handler for the lookup done by requireAuth. */
export const authUserQuery = (user = USER) => ['FROM users WHERE id = $1', () => [user]];

/** Handler for the event membership lookup. */
export const roleQuery = (role) => ['SELECT role FROM event_members', () => (role ? [{ role }] : [])];

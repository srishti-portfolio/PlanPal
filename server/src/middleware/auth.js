import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from './errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, tv: user.token_version ?? 0 }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN,
  });
}

/**
 * Require a valid `Authorization: Bearer <jwt>` header.
 * The token version is checked against the database so that changing the
 * password immediately signs out every other session.
 */
export async function requireAuth(req, _res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Please sign in to continue');
  }

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }

  const { rows } = await query('SELECT id, name, email, token_version FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user || user.token_version !== payload.tv) {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }

  req.user = { id: user.id, name: user.name, email: user.email };
  next();
}

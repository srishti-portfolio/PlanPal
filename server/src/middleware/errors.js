import { config } from '../config.js';

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// Postgres error codes we can translate into friendly client errors.
const PG_ERRORS = {
  23505: [409, 'That record already exists'],
  23503: [400, 'A referenced record does not exist'],
  23514: [400, 'Some values are out of the allowed range'],
  '22P02': [400, 'Malformed identifier'],
  22007: [400, 'Invalid date'],
  22008: [400, 'Invalid date'],
};

// Express recognises error handlers by their 4-argument signature.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  if (err?.code === '23514' && err.constraint?.endsWith('_dates_order')) {
    return res.status(400).json({ error: 'The end date must be on or after the start date' });
  }
  const pgError = PG_ERRORS[err?.code];
  if (pgError) {
    return res.status(pgError[0]).json({ error: pgError[1] });
  }

  if (!config.isTest) console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

import { HttpError } from './errors.js';

/**
 * Validate `req.body`, `req.params` and/or `req.query` against zod schemas.
 * Parsed (and coerced) values are exposed on `req.valid.{body,params,query}`.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const [part, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new HttpError(400, details[0]?.message ?? 'Invalid request', details));
    }
    req.valid[part] = result.data;
  }
  return next();
};

const toCamel = (key) => key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());

/** Convert a snake_case database row into the camelCase shape the API returns. */
export function camelize(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value]));
}

export const camelizeAll = (rows) => rows.map(camelize);

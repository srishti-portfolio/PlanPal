const dateFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** Format 'YYYY-MM-DD' (a calendar date with no timezone) or an ISO timestamp. */
export function formatDate(value) {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormatter.format(date);
}

export function formatRange(start, end) {
  if (!start && !end) return 'Dates not set';
  if (start === end || !end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatMoney(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
}

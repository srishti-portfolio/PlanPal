export const TASK_COLUMNS = [
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'delayed', label: 'Delayed' },
];

export const TASK_STATUS_OPTIONS = TASK_COLUMNS.filter((c) => c.id !== 'delayed');

export const EVENT_STATUS_OPTIONS = [
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'finished', label: 'Finished' },
];

export const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  finished: 'Finished',
  delayed: 'Delayed',
};

export const ROLE_LABELS = { head: 'Event head', editor: 'Can edit', viewer: 'View only' };

/** Local calendar date as 'YYYY-MM-DD' (uses the user's timezone, unlike toISOString). */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Tasks not completed by their due date are automatically shown as delayed. */
export function effectiveTaskStatus(task, today = localToday()) {
  if (task.status !== 'completed' && task.dueDate && task.dueDate < today) return 'delayed';
  return task.status;
}

/** Events not marked finished by their end date are automatically shown as delayed. */
export function effectiveEventStatus(event, today = localToday()) {
  if (event.status !== 'finished' && event.endDate && event.endDate < today) return 'delayed';
  return event.status;
}

/** Bucket tasks into the four board columns. */
export function groupTasksByColumn(tasks, today = localToday()) {
  const groups = Object.fromEntries(TASK_COLUMNS.map((c) => [c.id, []]));
  for (const task of tasks) groups[effectiveTaskStatus(task, today)].push(task);
  return groups;
}

/** Upcoming = not finished and not already over. Sorted soonest first. */
export function upcomingEvents(events, today = localToday()) {
  return events
    .filter((e) => e.status !== 'finished' && (!e.endDate || e.endDate >= today))
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));
}

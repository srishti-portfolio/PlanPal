export const TASK_STATUSES = ['not_started', 'in_progress', 'completed'];
export const EVENT_STATUSES = ['not_started', 'in_progress', 'finished'];

/** Today's date as 'YYYY-MM-DD' (UTC). */
export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** A task that is not completed and whose due date has passed is shown as delayed. */
export function effectiveTaskStatus(task, today = todayIso()) {
  if (task.status !== 'completed' && task.dueDate && task.dueDate < today) return 'delayed';
  return task.status;
}

/** An event that is not finished and whose end date has passed is shown as delayed. */
export function effectiveEventStatus(event, today = todayIso()) {
  if (event.status !== 'finished' && event.endDate && event.endDate < today) return 'delayed';
  return event.status;
}

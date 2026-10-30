import { useMemo } from 'react';
import { api } from '../api/client.js';

/**
 * Task CRUD for one event. `setTasks` is a React state setter for the task array.
 * Status changes are applied optimistically and rolled back if the server rejects them.
 */
export function useTaskActions(eventId, setTasks, onError) {
  return useMemo(() => {
    const base = `/events/${eventId}/tasks`;
    const replace = (task) => setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));

    return {
      async add(values) {
        const { task } = await api(base, { method: 'POST', body: values });
        setTasks((list) => [...list, task]);
      },
      addMany(tasks) {
        setTasks((list) => [...list, ...tasks]);
      },
      async update(task, values) {
        const { task: saved } = await api(`${base}/${task.id}`, { method: 'PATCH', body: values });
        replace(saved);
      },
      async changeStatus(task, status) {
        replace({ ...task, status });
        try {
          const { task: saved } = await api(`${base}/${task.id}`, { method: 'PATCH', body: { status } });
          replace(saved);
        } catch (err) {
          replace(task);
          onError?.(err.message);
        }
      },
      async remove(task) {
        if (!window.confirm(`Delete the task "${task.title}"?`)) return;
        try {
          await api(`${base}/${task.id}`, { method: 'DELETE' });
          setTasks((list) => list.filter((t) => t.id !== task.id));
        } catch (err) {
          onError?.(err.message);
        }
      },
    };
  }, [eventId, setTasks, onError]);
}

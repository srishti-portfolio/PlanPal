import { useMemo, useState } from 'react';
import { formatRange } from '../../utils/format.js';
import { groupTasksByColumn, TASK_COLUMNS, TASK_STATUS_OPTIONS } from '../../utils/status.js';
import { TaskForm } from './TaskForm.jsx';

function TaskCard({ task, column, canEdit, onStatusChange, onUpdate, onDelete, maxDate }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="task-card">
        <TaskForm
          initial={task}
          submitLabel="Save task"
          maxDate={maxDate}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await onUpdate(task, values);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`task-card ${column === 'delayed' ? 'task-delayed' : ''}`}
      draggable={canEdit}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
    >
      <p className="task-title">
        {task.title}
        {task.aiGenerated && (
          <span className="tag" title="Suggested by AI">
            AI
          </span>
        )}
      </p>
      {task.description && <p className="task-desc">{task.description}</p>}
      <p className="task-dates">
        {formatRange(task.startDate, task.dueDate)}
        {column === 'delayed' && <span className="delayed-note"> · past due date</span>}
      </p>
      {canEdit && (
        <div className="task-actions">
          <label className="sr-only" htmlFor={`status-${task.id}`}>
            Status of {task.title}
          </label>
          <select id={`status-${task.id}`} value={task.status} onChange={(e) => onStatusChange(task, e.target.value)}>
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${task.title}`}>
            Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => onDelete(task)} aria-label={`Delete ${task.title}`}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Jira-style board. Status changes via the select (keyboard/screen-reader friendly)
 * or by dragging a card to another column. "Delayed" is computed, so it is not a drop target.
 */
export function KanbanBoard({ tasks, canEdit, onStatusChange, onUpdate, onDelete, maxDate }) {
  const groups = useMemo(() => groupTasksByColumn(tasks), [tasks]);
  const [dragOver, setDragOver] = useState(null);

  function handleDrop(e, columnId) {
    e.preventDefault();
    setDragOver(null);
    const task = tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
    if (task && task.status !== columnId) onStatusChange(task, columnId);
  }

  return (
    <div className="kanban" role="region" aria-label="Task board">
      {TASK_COLUMNS.map((column) => {
        const droppable = canEdit && column.id !== 'delayed';
        return (
          <section
            key={column.id}
            className={`kanban-col col-${column.id} ${dragOver === column.id ? 'drag-over' : ''}`}
            aria-labelledby={`col-${column.id}`}
            onDragOver={droppable ? (e) => { e.preventDefault(); setDragOver(column.id); } : undefined}
            onDragLeave={droppable ? () => setDragOver(null) : undefined}
            onDrop={droppable ? (e) => handleDrop(e, column.id) : undefined}
          >
            <h3 id={`col-${column.id}`} className="kanban-title">
              {column.label} <span className="count">{groups[column.id].length}</span>
            </h3>
            {groups[column.id].length === 0 ? (
              <p className="muted small kanban-empty">No tasks</p>
            ) : (
              <ul className="task-list">
                {groups[column.id].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    column={column.id}
                    canEdit={canEdit}
                    maxDate={maxDate}
                    onStatusChange={onStatusChange}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

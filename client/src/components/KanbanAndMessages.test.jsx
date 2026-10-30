import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from './events/KanbanBoard.jsx';
import { MessageContent } from './MessageContent.jsx';

const tasks = [
  { id: 'a', title: 'Book venue', status: 'completed', dueDate: '2020-01-01' },
  { id: 'b', title: 'Send invites', status: 'in_progress', dueDate: '2099-01-01' },
  { id: 'c', title: 'Order cake', status: 'not_started', dueDate: '2020-01-01' },
];

describe('KanbanBoard', () => {
  it('shows four columns and puts overdue tasks under Delayed', () => {
    render(<KanbanBoard tasks={tasks} canEdit={false} />);
    const column = (name) => screen.getByRole('heading', { name: new RegExp(`^${name}`) }).closest('section');

    expect(within(column('Not started')).queryByText('Order cake')).not.toBeInTheDocument();
    expect(within(column('Delayed')).getByText('Order cake')).toBeInTheDocument();
    expect(within(column('In progress')).getByText('Send invites')).toBeInTheDocument();
    expect(within(column('Completed')).getByText('Book venue')).toBeInTheDocument();
  });

  it('hides edit controls for view-only members', () => {
    render(<KanbanBoard tasks={tasks} canEdit={false} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('lets editors change status with an accessible select', async () => {
    const onStatusChange = vi.fn();
    const user = userEvent.setup();
    render(<KanbanBoard tasks={tasks} canEdit onStatusChange={onStatusChange} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Status of Send invites'), 'completed');
    expect(onStatusChange).toHaveBeenCalledWith(tasks[1], 'completed');
  });
});

describe('MessageContent', () => {
  it('renders lists and bold text', () => {
    render(<MessageContent text={'## Budget\n- **Venue**: 40%\n- Food: 30%\n\n1. Book\n2. Pay'} />);
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByText('Venue').tagName).toBe('STRONG');
  });

  it('never renders model output as HTML', () => {
    const { container } = render(<MessageContent text={'<img src=x onerror="alert(1)">'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
  });
});

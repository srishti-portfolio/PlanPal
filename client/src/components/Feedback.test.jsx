import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './Field.jsx';
import { Alert, EmptyState, Loading, RoleBadge, StatusBadge } from './Feedback.jsx';

describe('Alert', () => {
  it('announces errors immediately to screen readers', () => {
    render(<Alert>Something went wrong</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('announces success politely', () => {
    render(<Alert type="success">Saved!</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved!');
  });

  it('renders nothing when there is no message', () => {
    const { container } = render(<Alert>{''}</Alert>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Loading and EmptyState', () => {
  it('Loading exposes its label as a status', () => {
    render(<Loading label="Loading event…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading event…');
  });

  it('EmptyState shows the title and extra content', () => {
    render(
      <EmptyState title="No events yet">
        <p>Create one to get started.</p>
      </EmptyState>,
    );
    expect(screen.getByText('No events yet')).toBeInTheDocument();
    expect(screen.getByText('Create one to get started.')).toBeInTheDocument();
  });
});

describe('badges', () => {
  it.each([
    ['not_started', 'Not started'],
    ['in_progress', 'In progress'],
    ['completed', 'Completed'],
    ['finished', 'Finished'],
    ['delayed', 'Delayed'],
  ])('StatusBadge shows a readable label for %s', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveClass(`badge-${status}`);
  });

  it.each([
    ['head', 'Event head'],
    ['editor', 'Can edit'],
    ['viewer', 'View only'],
  ])('RoleBadge shows a readable label for %s', (role, label) => {
    render(<RoleBadge role={role} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('links the label, hint and error to the input', () => {
    render(<Field label="Event code" hint="Ask the event head." error="Code is required" />);
    const input = screen.getByLabelText('Event code');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Ask the event head. Code is required');
  });

  it('is not marked invalid without an error', () => {
    render(<Field label="Name" />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
  });

  it('can render a textarea', () => {
    render(<Field as="textarea" label="Description" />);
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
  });
});
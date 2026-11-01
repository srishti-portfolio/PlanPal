import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client.js';
import Home from './Home.jsx';

vi.mock('../api/client.js', () => ({ api: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { name: 'Asha Rao' } }) }));

const events = [
  { id: 'e1', name: 'Riya turns 30', eventType: 'Birthday', startDate: '2099-12-05', endDate: '2099-12-05', status: 'not_started', role: 'head' },
  { id: 'e2', name: 'Old reunion', eventType: 'Reunion', startDate: '2000-01-01', endDate: '2000-01-02', status: 'in_progress', role: 'viewer' },
  { id: 'e3', name: 'Done wedding', eventType: 'Wedding', startDate: '2099-01-01', endDate: '2099-01-02', status: 'finished', role: 'editor' },
];
vi.mock('../hooks/useApi.js', () => ({
  useApi: () => ({ data: { events }, error: null, loading: false }),
}));

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events/:eventId" element={<p>Event page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(api).mockReset();
});

describe('Home page', () => {
  it('greets the user by first name', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hi Asha');
  });

  it('offers create and join actions', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /Create event/ })).toHaveAttribute('href', '/events/new');
    expect(screen.getByRole('button', { name: 'Join event' })).toBeInTheDocument();
  });

  it('lists only upcoming events that are not finished', () => {
    renderHome();
    expect(screen.getByText('Riya turns 30')).toBeInTheDocument();
    expect(screen.queryByText('Old reunion')).not.toBeInTheDocument();
    expect(screen.queryByText('Done wedding')).not.toBeInTheDocument();
  });

  it('links each upcoming event to its page', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /Riya turns 30/ })).toHaveAttribute('href', '/events/e1');
  });

  it('validates the join code before calling the server', async () => {
    const user = renderHome();
    await user.type(screen.getByLabelText('Event code'), 'ab!');
    await user.click(screen.getByRole('button', { name: 'Join event' }));
    expect(screen.getByText(/Event codes are 8 letters\/numbers/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('joins with a cleaned-up code and opens the event', async () => {
    vi.mocked(api).mockResolvedValue({ event: { id: 'e9', name: 'Block party' } });
    const user = renderHome();
    await user.type(screen.getByLabelText('Event code'), 'k7pm 2qxa');
    await user.click(screen.getByRole('button', { name: 'Join event' }));
    expect(api).toHaveBeenCalledWith('/events/join', { method: 'POST', body: { code: 'K7PM2QXA' } });
    expect(await screen.findByText('Event page')).toBeInTheDocument();
  });

  it('shows the server error for an unknown code', async () => {
    vi.mocked(api).mockImplementation(async () => {
      throw new Error('No event found with that code.');
    });
    const user = renderHome();
    await user.type(screen.getByLabelText('Event code'), 'ZZZZ9999');
    await user.click(screen.getByRole('button', { name: 'Join event' }));
    expect(await screen.findByText('No event found with that code.')).toBeInTheDocument();
  });
});
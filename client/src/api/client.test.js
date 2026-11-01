import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onUnauthorized, tokenStore } from './client.js';

const fetchMock = vi.fn();
const jsonResponse = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  tokenStore.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  onUnauthorized(() => {});
});

describe('api()', () => {
  it('calls the /api route and returns the JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { events: [] }));
    await expect(api('/events')).resolves.toEqual({ events: [] });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/events$/);
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
  });

  it('sends JSON bodies with the right content type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { event: { id: '1' } }));
    await api('/events', { method: 'POST', body: { name: 'Party' } });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ name: 'Party' });
  });

  it('attaches the saved token as a Bearer header', async () => {
    tokenStore.set('abc.def.ghi');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api('/auth/me');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc.def.ghi');
  });

  it('sends no Authorization header when signed out', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api('/auth/login', { method: 'POST', body: {} });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('returns null for 204 No Content', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    await expect(api('/notes/1', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('throws an ApiError with the server message and status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'That record already exists', details: [{ field: 'email' }] }));
    const error = await api('/auth/signup', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('That record already exists');
    expect(error.status).toBe(409);
    expect(error.details).toEqual([{ field: 'email' }]);
  });

  it('shows a friendly message when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await api('/events').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/Cannot reach the server/);
  });

  it('lets aborted requests through unchanged', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abort);
    await expect(api('/events')).rejects.toBe(abort);
  });

  it('signs the user out when a signed-in request gets 401', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    tokenStore.set('expired.token');
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Your session has expired.' }));
    await expect(api('/events')).rejects.toThrow('Your session has expired.');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not sign out on 401 when there was no token (e.g. wrong password)', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Incorrect email or password' }));
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toThrow('Incorrect email or password');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('tokenStore', () => {
  it('saves, reads and clears the token', () => {
    tokenStore.set('t1');
    expect(tokenStore.get()).toBe('t1');
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });

  it('does not crash when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(tokenStore.get()).toBeNull();
    spy.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, request, setUnauthorizedHandler } from '../src/api/apiClient';
import { login } from '../src/api/authApi';
import { listAdded } from '../src/api/triggersApi';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UNAUTHORIZED_BODY = { error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
const INVALID_CREDENTIALS_BODY = {
  error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
};

describe('apiClient 401 handling', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    handler = vi.fn();
    setUnauthorizedHandler(handler);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(() => {});
  });

  it('does not run the unauthorised handler for a 401 from /auth/login', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, INVALID_CREDENTIALS_BODY));

    await expect(login('alice@example.com', 'wrong-pass1')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the unauthorised handler for a 401 on a protected call', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, UNAUTHORIZED_BODY));

    await expect(listAdded()).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not run the handler for a 401 from /auth/me', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, UNAUTHORIZED_BODY));

    await expect(request('GET', '/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('apiClient requests', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes /api, sends the JSON body and same-origin credentials, and no Authorization header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { triggers: [] }));

    await request('POST', '/triggers/added', { triggerId: 't1' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/triggers/added');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ triggerId: 't1' }));
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('resolves to undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request('DELETE', '/playbooks/p1')).resolves.toBeUndefined();
  });

  it('maps a non-JSON error body to INTERNAL', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(request('GET', '/actions')).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL',
      message: 'Unexpected error',
    });
  });

  it('maps a network failure to NETWORK', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('GET', '/actions')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
      message: 'Cannot reach the server',
    });
  });
});

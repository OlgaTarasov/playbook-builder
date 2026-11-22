import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../src/api/apiClient';
import * as authApi from '../src/api/authApi';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { TEST_USER } from './helpers/renderWithProviders';

vi.mock('../src/api/authApi', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
}));

function Probe() {
  const auth = useAuth();
  return (
    <>
      <p>{`${auth.status}:${auth.user?.email ?? 'none'}`}</p>
      <button type="button" onClick={() => void auth.logout()}>
        Sign out
      </button>
    </>
  );
}

function renderProbe() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AuthProvider session restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts loading, then becomes authenticated when /auth/me succeeds', async () => {
    vi.mocked(authApi.me).mockResolvedValue(TEST_USER);
    renderProbe();

    expect(screen.getByText('loading:none')).toBeInTheDocument();
    expect(await screen.findByText('authenticated:alice@example.com')).toBeInTheDocument();
    expect(authApi.me).toHaveBeenCalledTimes(1);
  });

  it('becomes anonymous when /auth/me returns 401', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
    renderProbe();

    expect(await screen.findByText('anonymous:none')).toBeInTheDocument();
  });

  it('logout calls the API and clears the user', async () => {
    vi.mocked(authApi.me).mockResolvedValue(TEST_USER);
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderProbe();

    await screen.findByText('authenticated:alice@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByText('anonymous:none')).toBeInTheDocument());
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });

  it('still signs out locally when the logout request fails', async () => {
    vi.mocked(authApi.me).mockResolvedValue(TEST_USER);
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError(0, 'NETWORK', 'Cannot reach the server'));
    const user = userEvent.setup();
    renderProbe();

    await screen.findByText('authenticated:alice@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByText('anonymous:none')).toBeInTheDocument());
  });
});

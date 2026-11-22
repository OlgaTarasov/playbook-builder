import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/apiClient';
import * as authApi from '../src/api/authApi';
import { LoginPage } from '../src/pages/LoginPage';
import { renderWithProviders, TEST_USER } from './helpers/renderWithProviders';

vi.mock('../src/api/authApi', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
}));

const POLICY_HINT = 'At least 8 characters, with a letter and a digit.';

function renderLogin(options: Parameters<typeof renderWithProviders>[1] = { user: null }) {
  return renderWithProviders(<LoginPage />, options);
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends no request when the fields are empty', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('shows a field error for an invalid email and sends no request', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('shows the generic banner for wrong credentials', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-pass1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(authApi.login).toHaveBeenCalledWith('alice@example.com', 'wrong-pass1');
  });

  it('masks the password input', () => {
    renderLogin();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('shows the password policy hint in register mode', async () => {
    const user = userEvent.setup();
    renderLogin();

    expect(screen.queryByText(POLICY_HINT)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.getByText(POLICY_HINT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Login' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('checks the password policy in register mode and sends no request when it fails', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in flight', async () => {
    vi.mocked(authApi.login).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    const submit = screen.getByRole('button', { name: 'Log in' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    expect(authApi.login).toHaveBeenCalledTimes(1);
  });

  it('logs in with the trimmed email', async () => {
    vi.mocked(authApi.login).mockResolvedValue(TEST_USER);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), '  alice@example.com ');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(authApi.login).toHaveBeenCalledWith('alice@example.com', 'secret123'),
    );
  });

  it('shows the session-expired message passed in router state', () => {
    renderLogin({ user: null, state: { message: 'Session expired' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired');
  });
});

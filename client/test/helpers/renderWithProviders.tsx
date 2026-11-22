import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/auth/AuthContext';
import type { UserDto } from '../../src/api/types';

export const TEST_USER: UserDto = {
  id: 'user-1',
  email: 'alice@example.com',
};

interface RenderOptions {
  /** Signed-in user, or null for a signed-out render. Skips the /auth/me check. */
  user?: UserDto | null;
  /** Initial path in the memory router. */
  route?: string;
  /** Router location state, for example { message: 'Session expired' }. */
  state?: unknown;
}

/** Wraps the UI in a MemoryRouter and AuthProvider, starting in the given auth state. */
export function renderWithProviders(
  ui: ReactElement,
  { user = TEST_USER, route = '/', state }: RenderOptions = {},
): RenderResult {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: route, state }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider initialUser={user}>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}

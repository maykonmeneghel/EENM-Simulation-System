import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthBackend, AuthUser } from '../application/authStore';
import { AuthStore } from '../application/authStore';
import { setLocale } from '../i18n/locale';
import { AuthGate } from './AuthGate';

const bob: AuthUser = { uid: 'u2', email: 'bob@example.com', displayName: null };

function setup(access: 'allowed' | 'forbidden' = 'allowed') {
  let listener: ((u: AuthUser | null) => void) | null = null;
  const backend: AuthBackend = {
    onUserChanged: (l) => ((listener = l), () => undefined),
    signIn: vi.fn(async () => listener?.(bob)),
    signOut: vi.fn(async () => listener?.(null)),
    idToken: async () => 'token',
  };
  const store = new AuthStore(backend, async () => access);
  render(
    <AuthGate store={store}>
      {(account) => (
        <div>
          simulator for {account.email}
          <button type="button" onClick={account.signOut}>
            out
          </button>
        </div>
      )}
    </AuthGate>,
  );
  act(() => listener?.(null));
  return { backend, user: userEvent.setup() };
}

afterEach(() => act(() => setLocale('pt-BR')));

describe('AuthGate', () => {
  it('shows the sign-in screen first, then the simulator for an allowed account', async () => {
    const { backend, user } = setup();
    expect(screen.queryByText(/simulator for/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(backend.signIn).toHaveBeenCalled();
    expect(await screen.findByText('simulator for bob@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'out' }));
    expect(await screen.findByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
  });

  it('speaks English when chosen', async () => {
    setup();
    act(() => setLocale('en'));
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('tells a refused account that it has no access and lets it sign out', async () => {
    const { backend, user } = setup('forbidden');
    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta não tem acesso a este simulador.');
    expect(screen.queryByText(/simulator for/)).toBeNull();
    act(() => setLocale('en'));
    expect(screen.getByRole('alert')).toHaveTextContent('Your account does not have access to this simulator.');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(backend.signOut).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });
});

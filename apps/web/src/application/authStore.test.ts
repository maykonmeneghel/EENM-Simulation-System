import { describe, expect, it, vi } from 'vitest';
import type { AuthBackend, AuthUser } from './authStore';
import { AuthStore } from './authStore';

const alice: AuthUser = { uid: 'u1', email: 'alice@example.com', displayName: 'Alice' };

function fakeBackend() {
  let listener: ((u: AuthUser | null) => void) | null = null;
  const backend: AuthBackend & { emit(u: AuthUser | null): void } = {
    onUserChanged: (l) => ((listener = l), () => (listener = null)),
    signIn: vi.fn(async () => listener?.(alice)),
    signOut: vi.fn(async () => listener?.(null)),
    idToken: vi.fn(async (force: boolean) => (force ? 'fresh' : 'token')),
    emit: (u) => listener?.(u),
  };
  return backend;
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('AuthStore', () => {
  it('goes loading → signed out → signed in, and gives the token only while signed in', async () => {
    const backend = fakeBackend();
    const store = new AuthStore(backend);
    expect(store.getState().status).toBe('loading');
    backend.emit(null);
    expect(store.getState().status).toBe('signedOut');
    expect(await store.token()).toBeNull();
    await store.signIn();
    await settle();
    expect(store.getState()).toMatchObject({ status: 'signedIn', user: alice });
    expect(await store.token(true)).toBe('fresh');
  });

  it('asks the API about the account after sign-in and shows a refused one as forbidden', async () => {
    const backend = fakeBackend();
    const check = vi.fn(async () => 'forbidden' as const);
    const store = new AuthStore(backend, check);
    backend.emit(alice);
    expect(store.getState().status).toBe('checking');
    await settle();
    expect(check).toHaveBeenCalledWith('token');
    expect(store.getState().status).toBe('forbidden');
    await store.signOut();
    expect(store.getState().status).toBe('signedOut');
  });

  it('lets the user in when the check cannot reach the API, and marks a later 403 as forbidden', async () => {
    const backend = fakeBackend();
    const store = new AuthStore(backend, async () => 'unknown');
    backend.emit(alice);
    await settle();
    expect(store.getState().status).toBe('signedIn');
    store.onForbidden();
    expect(store.getState().status).toBe('forbidden');
  });

  it('a 401 that survived a refresh signs out', async () => {
    const backend = fakeBackend();
    const store = new AuthStore(backend);
    backend.emit(alice);
    store.onUnauthorized();
    await settle();
    expect(backend.signOut).toHaveBeenCalled();
    expect(store.getState().status).toBe('signedOut');
  });

  it('ignores a closed popup and reports other sign-in failures', async () => {
    const backend = fakeBackend();
    const store = new AuthStore(backend);
    backend.emit(null);
    backend.signIn = vi.fn(async () => Promise.reject({ code: 'auth/popup-closed-by-user' }));
    await store.signIn();
    expect(store.getState().error).toBeNull();
    backend.signIn = vi.fn(async () => Promise.reject({ code: 'auth/network-request-failed' }));
    await store.signIn();
    expect(store.getState().error).toContain('auth/network-request-failed');
  });
});

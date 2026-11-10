import type { TokenSource } from '../infrastructure/apiClient';
import { tr } from '../i18n/locale';

/** The signed-in account, as the UI shows it (the uid identifies it to the API; the e-mail is only displayed). */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** The account's photo (Google profile picture), if any. */
  photoURL?: string | null;
}

/** The identity provider (Firebase in the app, a fake in tests). */
export interface AuthBackend {
  /** Calls `listener` with the current user (or null) now or soon, then on every sign-in / sign-out. */
  onUserChanged(listener: (user: AuthUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** The current user's ID token (the SDK refreshes it before it expires; `forceRefresh` gets a new one). */
  idToken(forceRefresh: boolean): Promise<string | null>;
}

/** Asks the API whether this account may use the simulator: 'allowed', 'forbidden' (403) or 'unknown' (offline…). */
export type AccessCheck = (token: string) => Promise<'allowed' | 'forbidden' | 'unknown'>;

export type AuthStatus = 'loading' | 'signedOut' | 'checking' | 'signedIn' | 'forbidden';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** The last sign-in failure, in the current language. */
  error: string | null;
}

/** Popup closed or replaced by the user: not an error worth showing. */
const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

/**
 * Sign-in state for the optional login (framework-agnostic; React binds with useSyncExternalStore). It is the API
 * client's token source: the simulation calls carry the ID token, a 403 marks the account as not allowed and a 401
 * that survives a token refresh signs the user out.
 */
export class AuthStore implements TokenSource {
  private state: AuthState = { status: 'loading', user: null, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly backend: AuthBackend;
  private readonly checkAccess: AccessCheck | null;

  constructor(backend: AuthBackend, checkAccess: AccessCheck | null = null) {
    this.backend = backend;
    this.checkAccess = checkAccess;
    backend.onUserChanged((user) => void this.userChanged(user));
  }

  getState = (): AuthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async signIn(): Promise<void> {
    this.set({ ...this.state, error: null });
    try {
      await this.backend.signIn();
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && CANCELLED.has(code)) return;
      this.set({
        ...this.state,
        error: tr({
          'pt-BR': `Não foi possível entrar${typeof code === 'string' ? ` (${code})` : ''}. Tente de novo.`,
          en: `Could not sign in${typeof code === 'string' ? ` (${code})` : ''}. Please try again.`,
        }),
      });
    }
  }

  async signOut(): Promise<void> {
    await this.backend.signOut();
  }

  async token(forceRefresh = false): Promise<string | null> {
    return this.state.user ? this.backend.idToken(forceRefresh) : null;
  }

  onForbidden(): void {
    if (this.state.user) this.set({ ...this.state, status: 'forbidden' });
  }

  onUnauthorized(): void {
    void this.signOut();
  }

  private async userChanged(user: AuthUser | null): Promise<void> {
    if (!user) {
      this.set({ status: 'signedOut', user: null, error: this.state.error });
      return;
    }
    if (!this.checkAccess) {
      this.set({ status: 'signedIn', user, error: null });
      return;
    }
    this.set({ status: 'checking', user, error: null });
    const token = await this.backend.idToken(false).catch(() => null);
    const access = token ? await this.checkAccess(token).catch(() => 'unknown' as const) : 'unknown';
    if (this.state.user?.uid !== user.uid) return; // signed out or switched meanwhile
    // 'unknown' (API unreachable): let the user in; a simulation would still be refused by the server
    this.set({ status: access === 'forbidden' ? 'forbidden' : 'signedIn', user, error: null });
  }

  private set(next: AuthState): void {
    this.state = next;
    for (const l of this.listeners) l();
  }
}

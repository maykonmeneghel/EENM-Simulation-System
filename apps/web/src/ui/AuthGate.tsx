import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { AuthStore } from '../application/authStore';
import type { Locale } from '../i18n/locale';
import { APP_NAME, setLocale, tr } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';
import { SegmentedControl } from './SegmentedControl';

/** The signed-in account as the toolbar shows it. */
export interface Account {
  /** E-mail (or name) of the account, shown next to the sign-out button. */
  label: string;
  signOut(): void;
}

const LANGUAGES = [
  { value: 'pt-BR' as const, label: 'PT' },
  { value: 'en' as const, label: 'EN' },
];

/**
 * With sign-in configured (docs/deployment.md), the simulator is shown only to a signed-in account the server
 * allows; before that, a sign-in screen ("Entrar com Google"), and for an account the server refuses (403), a clear
 * message with a way to sign out. Without sign-in configured this component is not used at all.
 */
export function AuthGate({ store, children }: { store: AuthStore; children: (account: Account) => ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const locale = useLocale();
  useEffect(() => {
    document.title = tr(APP_NAME);
    document.documentElement.lang = locale;
  }, [locale]);
  const signOut = () => void store.signOut();
  const label = state.user?.email ?? state.user?.displayName ?? '';

  if (state.status === 'signedIn' && state.user) return <>{children({ label, signOut })}</>;

  return (
    <main className="auth-screen">
      <div className="card auth-card">
        <div className="auth-language">
          <SegmentedControl<Locale>
            label={tr({ 'pt-BR': 'Idioma', en: 'Language' })}
            mode="radio"
            size="small"
            options={LANGUAGES}
            titles={(l) => (l === 'en' ? 'English' : 'Português (Brasil)')}
            value={locale}
            onChange={setLocale}
          />
        </div>
        <h1>{tr(APP_NAME)}</h1>
        {state.status === 'loading' || state.status === 'checking' ? (
          <p role="status">{tr({ 'pt-BR': 'Verificando o acesso…', en: 'Checking access…' })}</p>
        ) : state.status === 'forbidden' ? (
          <>
            <p role="alert" className="auth-denied">
              {tr({
                'pt-BR': 'Sua conta não tem acesso a este simulador.',
                en: 'Your account does not have access to this simulator.',
              })}
            </p>
            {label ? <p className="auth-account">{label}</p> : null}
            <button type="button" className="btn" onClick={signOut}>
              {tr({ 'pt-BR': 'Sair', en: 'Sign out' })}
            </button>
          </>
        ) : (
          <>
            <p>
              {tr({
                'pt-BR': 'Entre com sua conta Google para usar o simulador.',
                en: 'Sign in with your Google account to use the simulator.',
              })}
            </p>
            <button type="button" className="btn btn--primary" onClick={() => void store.signIn()}>
              {tr({ 'pt-BR': 'Entrar com Google', en: 'Sign in with Google' })}
            </button>
            {state.error ? (
              <p role="alert" className="field-error auth-error">
                {state.error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import type { Locale } from '../i18n/locale';
import { setLocale, tr } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';
import type { Account } from './AuthGate';
import { initials } from './initials';
import { SegmentedControl } from './SegmentedControl';

const LANGUAGE_OPTIONS = [
  { value: 'pt-BR' as const, label: 'PT' },
  { value: 'en' as const, label: 'EN' },
];

/** The account's photo, or its initials when there is none or it fails to load. */
function Avatar({ account, size }: { account: Account; size: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (account.photoUrl && !failed) {
    return (
      <img
        className="avatar"
        src={account.photoUrl}
        alt=""
        width={size}
        height={size}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="avatar avatar--initials" style={style} aria-hidden="true">
      {initials(account.name || account.email || '')}
    </span>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="6.4" />
      <path d="M1.8 8h12.4M8 1.6c1.9 1.8 2.8 4 2.8 6.4S9.9 12.6 8 14.4M8 1.6C6.1 3.4 5.2 5.6 5.2 8s.9 4.6 2.8 6.4" />
    </svg>
  );
}

/**
 * Top-right corner of the toolbar: the signed-in account (photo and name) with a menu holding the language and
 * "Sair"; without sign-in configured, a globe button with the language only.
 */
export function AccountMenu({ account }: { account?: Account }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const buttonLabel = account
    ? tr({ 'pt-BR': `Conta: ${account.name || account.email}`, en: `Account: ${account.name || account.email}` })
    : tr({ 'pt-BR': 'Idioma', en: 'Language' });

  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        className={account ? 'account-button' : 'toolbar-icon'}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {account ? (
          <>
            <Avatar account={account} size={26} />
            <span className="account-button-name">{account.name || account.email}</span>
          </>
        ) : (
          <GlobeIcon />
        )}
      </button>
      {open ? (
        <div id={menuId} className="account-popover card" role="dialog" aria-label={buttonLabel}>
          {account ? (
            <div className="account-identity">
              <Avatar account={account} size={44} />
              <div className="account-identity-text">
                {account.name ? <strong>{account.name}</strong> : null}
                {account.email ? <span className="account-email">{account.email}</span> : null}
              </div>
            </div>
          ) : null}
          <div className="account-row">
            <span className="account-row-label">{tr({ 'pt-BR': 'Idioma', en: 'Language' })}</span>
            <SegmentedControl<Locale>
              label={tr({ 'pt-BR': 'Idioma', en: 'Language' })}
              mode="radio"
              size="small"
              options={LANGUAGE_OPTIONS}
              titles={(l) => (l === 'en' ? 'English' : 'Português (Brasil)')}
              value={locale}
              onChange={setLocale}
            />
          </div>
          {account ? (
            <button type="button" className="btn account-signout" onClick={account.signOut}>
              {tr({ 'pt-BR': 'Sair', en: 'Sign out' })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

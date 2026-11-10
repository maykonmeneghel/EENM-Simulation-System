import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocale, setLocale } from '../i18n/locale';
import { AccountMenu } from './AccountMenu';
import { initials } from './initials';

describe('initials', () => {
  it('takes the first and last word, or the e-mail name', () => {
    expect(initials('Maykon Christian Meneghel')).toBe('MM');
    expect(initials('ana.souza@example.com')).toBe('AS');
    expect(initials('bob@example.com')).toBe('B');
    expect(initials('')).toBe('?');
  });
});

describe('AccountMenu', () => {
  afterEach(() => setLocale('pt-BR'));

  it('shows the account name with its photo and opens a menu with the e-mail, the language and Sair', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn();
    render(<AccountMenu account={{ name: 'Ana Souza', email: 'ana@example.com', photoUrl: 'https://example.com/a.png', signOut }} />);
    const button = screen.getByRole('button', { name: 'Conta: Ana Souza' });
    expect(button).toHaveTextContent('Ana Souza');
    expect(button.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.queryByText('ana@example.com')).toBeNull(); // the e-mail is not on the toolbar

    await user.click(button);
    const menu = screen.getByRole('dialog', { name: 'Conta: Ana Souza' });
    expect(within(menu).getByText('ana@example.com')).toBeInTheDocument();
    await user.click(within(menu).getByRole('radio', { name: 'EN' }));
    expect(getLocale()).toBe('en');
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('uses initials when there is no photo or it fails to load', async () => {
    render(<AccountMenu account={{ name: 'Ana Souza', email: 'ana@example.com', photoUrl: null, signOut: () => {} }} />);
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('without sign-in it is a language button, and Escape closes the menu', async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: 'Idioma' }));
    expect(screen.getByRole('radiogroup', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('radiogroup', { name: 'Idioma' })).toBeNull();
  });
});

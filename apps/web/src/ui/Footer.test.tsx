import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n/locale';
import { Footer } from './Footer';

describe('Footer', () => {
  afterEach(() => setLocale('pt-BR'));
  it('credits the author with a link to his portfolio, in each language', () => {
    const { unmount } = render(<Footer />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Desenvolvido por Maykon Meneghel');
    expect(screen.getByRole('link', { name: 'Maykon Meneghel' })).toHaveAttribute('href', 'https://maykon.meneghel.me');
    unmount();
    setLocale('en');
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Built by Maykon Meneghel');
  });
});

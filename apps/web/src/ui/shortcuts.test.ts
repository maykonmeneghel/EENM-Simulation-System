import { describe, expect, it } from 'vitest';
import { isMacPlatform, matchShortcut, shortcutLabel } from './shortcuts';

const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('shortcuts', () => {
  it('⌘ on Mac', () => {
    expect(matchShortcut(k('Enter', { metaKey: true }), true)).toBe('simulate');
    expect(matchShortcut(k('.', { metaKey: true }), true)).toBe('stop');
    expect(matchShortcut(k('2', { metaKey: true }), true)).toBe('view-2');
    expect(matchShortcut(k('Enter', { ctrlKey: true }), true)).toBeNull();
  });

  it('Ctrl elsewhere', () => {
    expect(matchShortcut(k('Enter', { ctrlKey: true }), false)).toBe('simulate');
    expect(matchShortcut(k('3', { ctrlKey: true }), false)).toBe('view-3');
    expect(matchShortcut(k('Enter', { metaKey: true }), false)).toBeNull();
  });

  it('ignores plain keys and Alt combos', () => {
    expect(matchShortcut(k('1'), true)).toBeNull();
    expect(matchShortcut(k('1', { metaKey: true, altKey: true }), true)).toBeNull();
  });

  it('labels and platform detection', () => {
    expect(shortcutLabel('simulate', true)).toBe('⌘↩');
    expect(shortcutLabel('stop', false)).toBe('Ctrl+.');
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32', userAgent: 'Windows' })).toBe(false);
  });
});

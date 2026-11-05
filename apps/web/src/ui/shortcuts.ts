/** Keyboard shortcuts: ⌘ on macOS, Ctrl elsewhere. */
export type ShortcutAction = 'simulate' | 'stop' | 'view-1' | 'view-2' | 'view-3' | 'view-4';

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = globalThis.navigator): boolean {
  const p = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/i.test(p);
}

export function matchShortcut(e: KeyLike, mac: boolean): ShortcutAction | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod || e.altKey) return null;
  switch (e.key) {
    case 'Enter':
      return 'simulate';
    case '.':
      return e.shiftKey ? null : 'stop';
    case '1':
      return 'view-1';
    case '2':
      return 'view-2';
    case '3':
      return 'view-3';
    case '4':
      return 'view-4';
    default:
      return null;
  }
}

/** Human label of a shortcut for tooltips (e.g. "⌘↩" or "Ctrl+Enter"). */
export function shortcutLabel(action: ShortcutAction, mac: boolean): string {
  const key = { simulate: mac ? '↩' : 'Enter', stop: '.', 'view-1': '1', 'view-2': '2', 'view-3': '3', 'view-4': '4' }[action];
  return mac ? `⌘${key}` : `Ctrl+${key}`;
}

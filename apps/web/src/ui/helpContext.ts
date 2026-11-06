import { createContext } from 'react';
import type { ReactNode } from 'react';

/** Shows a help text in the right sidebar (the inspector); provided by the app window. */
export type ShowHelp = (label: string, content: ReactNode) => void;

export const HelpContext = createContext<ShowHelp | null>(null);

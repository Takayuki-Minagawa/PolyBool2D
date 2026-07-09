export type Theme = 'light' | 'dark';
export type Language = 'ja' | 'en';

const THEME_KEY = 'pb2d.theme';
const LANGUAGE_KEY = 'pb2d.lang';

export function readTheme(): Theme {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_KEY) : null;
  if (stored === 'light' || stored === 'dark') return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function writeTheme(theme: Theme): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme);
}

export function applyDocumentTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function readLanguage(): Language {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_KEY) : null;
  if (stored === 'ja' || stored === 'en') return stored;
  return 'ja';
}

export function writeLanguage(language: Language): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_KEY, language);
}

export function applyDocumentLanguage(language: Language): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', language);
  }
}

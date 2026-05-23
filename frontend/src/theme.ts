export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'huquq_theme';
const EVENT_NAME = 'huquq-theme-change';

export function getThemeMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'auto') return v;
  return 'dark';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'auto') {
    const hour = new Date().getHours();
    return hour >= 6 && hour < 18 ? 'light' : 'dark';
  }
  return mode;
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: mode }));
}

let initialized = false;

export function initTheme() {
  if (initialized) return;
  initialized = true;

  applyTheme(getThemeMode());

  // Re-apply once a minute for auto mode (time-based switch)
  setInterval(() => {
    if (getThemeMode() === 'auto') applyTheme('auto');
  }, 60 * 1000);

  // Cross-tab sync
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) applyTheme(getThemeMode());
  });
}

export const THEME_EVENT = EVENT_NAME;

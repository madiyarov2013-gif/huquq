// Backend-first AI store.
//
// Source of truth is the Express server (`/api/ai/*`), which persists settings
// and API keys to `backend/data/*.json`. Every admin — on any browser, on any
// device — sees the same data. localStorage is still used as a *cache* so the
// admin panel can render instantly on first paint and so the UI keeps working
// briefly if the backend hiccups; cache is refreshed in the background from
// the server and overwrites whatever was sitting locally.

import { apiUrl } from './config';

export interface AiKey {
  _id: string;
  name: string;
  provider: 'gemini' | 'openai';
  dailyLimit: number;
  used: number;
  usedDate: string;
  active: boolean;
  createdAt: string;
  keyMasked: string;
}

export interface AiSettings {
  systemPrompt: string;
  greeting: string;
  enabled: boolean;
  defaultProvider: 'gemini' | 'openai';
  defaultModel: string;
}

export interface AiStats {
  keysTotal: number;
  keysActive: number;
  usedToday: number;
  dailyLimit: number;
  date: string;
}

const SETTINGS_CACHE = 'huquq_ai_settings_v1';
const KEYS_CACHE = 'huquq_ai_keys_v1';
const STATS_CACHE = 'huquq_ai_stats_v1';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  systemPrompt:
    "Sen O'zbekiston huquqiy yordamchisissan. Foydalanuvchilarga O'zbekiston Konstitutsiyasi, qonunlari, huquqiy tizimi, bola huquqlari konvensiyasi va boshqa huquqiy mavzular bo'yicha yordam berasan. Javoblaringni o'zbek tilida, tushunarli va aniq qilib yoz. Agar savol huquqqa tegishli bo'lmasa ham, do'stona javob ber.",
  greeting:
    "Assalomu alaykum! Men sizning huquqiy yordamchingizman. Menga istalgan savolingizni bering — huquq, qonunlar, konvensiyalar bo'yicha yordam beraman.",
  enabled: true,
  defaultProvider: 'gemini',
  defaultModel: 'gemini-1.5-flash'
};

const DEFAULT_STATS: AiStats = {
  keysTotal: 0,
  keysActive: 0,
  usedToday: 0,
  dailyLimit: 0,
  date: new Date().toISOString().slice(0, 10)
};

// --- cache helpers ---------------------------------------------------------

const readCache = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeCache = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
};

const notifyAiChange = (): void => {
  try {
    window.dispatchEvent(new Event('huquq-ai-change'));
  } catch {
    /* SSR */
  }
};

// --- synchronous reads from cache (used for first paint) -------------------

export const getAiSettings = (): AiSettings => ({
  ...DEFAULT_AI_SETTINGS,
  ...readCache(SETTINGS_CACHE, {} as Partial<AiSettings>)
});

export const getAiKeys = (): AiKey[] => readCache(KEYS_CACHE, [] as AiKey[]);

export const getAiStats = (): AiStats => ({
  ...DEFAULT_STATS,
  ...readCache(STATS_CACHE, {} as Partial<AiStats>)
});

// --- async backend syncs ---------------------------------------------------

export const refreshAiSettings = async (): Promise<AiSettings> => {
  try {
    const r = await fetch(apiUrl('/api/ai/settings'));
    const d = await r.json();
    if (d.success && d.data) {
      const merged = { ...DEFAULT_AI_SETTINGS, ...d.data };
      writeCache(SETTINGS_CACHE, merged);
      notifyAiChange();
      return merged;
    }
  } catch {
    /* backend unreachable — fall back to cache */
  }
  return getAiSettings();
};

export const refreshAiKeys = async (): Promise<AiKey[]> => {
  try {
    const r = await fetch(apiUrl('/api/ai/keys'));
    const d = await r.json();
    if (d.success && Array.isArray(d.data)) {
      writeCache(KEYS_CACHE, d.data);
      notifyAiChange();
      return d.data;
    }
  } catch {
    /* backend unreachable */
  }
  return getAiKeys();
};

export const refreshAiStats = async (): Promise<AiStats> => {
  try {
    const r = await fetch(apiUrl('/api/ai/stats'));
    const d = await r.json();
    if (d.success && d.data) {
      writeCache(STATS_CACHE, d.data);
      notifyAiChange();
      return d.data;
    }
  } catch {
    /* backend unreachable */
  }
  return getAiStats();
};

export const refreshAll = async (): Promise<void> => {
  await Promise.all([refreshAiSettings(), refreshAiKeys(), refreshAiStats()]);
};

// --- async mutations (backend-first; cache refreshed on success) -----------

const backendError = (d: { error?: string } | null) =>
  new Error(d?.error || "Backend bilan bog'lanib bo'lmadi. Backend papkasida 'npm start' bilan ishga tushiring.");

export const saveAiSettings = async (s: AiSettings): Promise<AiSettings> => {
  const r = await fetch(apiUrl('/api/ai/settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s)
  }).catch(() => null);
  if (!r) throw backendError(null);
  const d = await r.json().catch(() => null);
  if (!d?.success) throw backendError(d);
  const merged = { ...DEFAULT_AI_SETTINGS, ...d.data };
  writeCache(SETTINGS_CACHE, merged);
  notifyAiChange();
  return merged;
};

export const createAiKey = async (input: {
  name: string;
  apiKey: string;
  provider?: 'gemini' | 'openai';
  dailyLimit?: number;
  active?: boolean;
}): Promise<AiKey> => {
  const r = await fetch(apiUrl('/api/ai/keys'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name.trim(),
      apiKey: input.apiKey.trim(),
      provider: input.provider || 'gemini',
      dailyLimit: input.dailyLimit ?? 1500,
      active: input.active !== false
    })
  }).catch(() => null);
  if (!r) throw backendError(null);
  const d = await r.json().catch(() => null);
  if (!d?.success) throw backendError(d);
  await Promise.all([refreshAiKeys(), refreshAiStats()]);
  // Auto-enable AI when the first/any key is added.
  const cur = getAiSettings();
  if (!cur.enabled) {
    await saveAiSettings({ ...cur, enabled: true });
  }
  return d.data;
};

export const updateAiKey = async (
  id: string,
  patch: Partial<Pick<AiKey, 'name' | 'provider' | 'dailyLimit' | 'active'>>
): Promise<AiKey> => {
  const r = await fetch(apiUrl(`/api/ai/keys/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }).catch(() => null);
  if (!r) throw backendError(null);
  const d = await r.json().catch(() => null);
  if (!d?.success) throw backendError(d);
  await Promise.all([refreshAiKeys(), refreshAiStats()]);
  return d.data;
};

export const deleteAiKey = async (id: string): Promise<boolean> => {
  const r = await fetch(apiUrl(`/api/ai/keys/${id}`), { method: 'DELETE' }).catch(() => null);
  if (!r) throw backendError(null);
  const d = await r.json().catch(() => null);
  if (!d?.success) throw backendError(d);
  await Promise.all([refreshAiKeys(), refreshAiStats()]);
  return true;
};

// Verify an *already-saved* key by id (server has the full apiKey).
export const testSavedAiKey = async (id: string): Promise<{ reply: string; model: string }> => {
  const r = await fetch(apiUrl(`/api/ai/keys/${id}/test`), { method: 'POST' }).catch(() => null);
  if (!r) throw backendError(null);
  const d = await r.json().catch(() => null);
  if (!d?.success) throw backendError(d);
  return { reply: d.reply || '', model: d.model || '' };
};

// Verify a *not-yet-saved* key (passed inline). Used by the "Test" button in
// the new-key modal.
export const testInlineAiKey = async (
  apiKey: string,
  provider: 'gemini' | 'openai' = 'gemini',
  model?: string
): Promise<{ reply: string; model: string }> => {
  const r = await fetch(apiUrl('/api/ai/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, provider, model })
  }).catch(() => null);
  if (!r) throw backendError(null);
  const d = await r.json().catch(() => null);
  if (!d?.success) throw backendError(d);
  return { reply: d.reply || '', model: d.model || '' };
};

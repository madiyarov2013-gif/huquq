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

// Distinguishes the failure modes so the UI can tell the admin what to fix:
//   1. fetch threw → no response (CORS / DNS / offline).
//   2. server responded with JSON {success:false,error} → surface that
//      message verbatim (e.g. "MONGO_URI env var is not set").
//   3. server responded with HTML at 200 → Vercel's SPA fallback caught
//      /api/* because the serverless function isn't deployed. Means Vercel
//      Root Directory is wrong or deploy is still building.
//   4. server responded with non-2xx and no JSON body → include status.
const backendError = (d: { error?: string } | null, status?: number, body?: string): Error => {
  if (d?.error) return new Error(d.error);
  const looksLikeHtml = !!body && (body.trim().startsWith('<') || body.includes('<!doctype'));
  if (looksLikeHtml) {
    return new Error(
      "Vercel /api/* o'rniga HTML qaytardi — serverless function deploy qilinmagan. " +
      "Vercel Dashboard → Settings → General → Root Directory bo'sh ('./') ekanini va " +
      "eng yangi commit deploy bo'lganini tekshiring (Deployments tab)."
    );
  }
  if (typeof status === 'number') {
    return new Error(`Backend xato (${status}). Vercel Function Logs'ni tekshiring.`);
  }
  return new Error(
    "Backend bilan bog'lanib bo'lmadi (tarmoq xatosi). Vercel deployment URL'i to'g'ri " +
    "ekanini va Internet ulanishingizni tekshiring."
  );
};

// Shared mutation/refresh helper. Reads response body once, tries JSON parse,
// and on failure throws backendError with full context (status + raw body)
// so HTML-at-200 (SPA fallback) is correctly identified.
const apiCall = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let r: Response | null = null;
  try { r = await fetch(url, init); } catch { throw backendError(null); }
  const body = await r.text();
  let d: { success?: boolean; data?: T; error?: string } | null = null;
  try { d = JSON.parse(body); } catch { /* not JSON */ }
  if (!d?.success) throw backendError(d, r.status, body);
  return d.data as T;
};

// Same as apiCall but returns the full parsed JSON (some endpoints have
// extra top-level fields like `reply` and `model`).
const apiCallRaw = async <T extends { success?: boolean }>(url: string, init?: RequestInit): Promise<T> => {
  let r: Response | null = null;
  try { r = await fetch(url, init); } catch { throw backendError(null); }
  const body = await r.text();
  let d: T | null = null;
  try { d = JSON.parse(body) as T; } catch { /* not JSON */ }
  if (!d?.success) throw backendError(d as { error?: string } | null, r.status, body);
  return d;
};

// Diagnostic: hit /api/health and return the report (or throw on network).
// Used by the admin "Backendni tekshirish" button.
export interface BackendHealth {
  success: boolean;
  functionReachable: boolean;
  mongoUriPresent: boolean;
  mongoConnected: boolean;
  mongoError: string | null;
  hint?: string;
  node?: string;
  runtime?: string;
}
export const checkBackendHealth = async (): Promise<BackendHealth> => {
  try {
    const r = await fetch(apiUrl('/api/health'));
    const text = await r.text();
    let d: BackendHealth | null = null;
    try { d = JSON.parse(text) as BackendHealth; } catch { /* not JSON */ }
    if (d) return d;

    // Got a non-JSON response. Most common case: status 200 with HTML body,
    // meaning Vercel's SPA fallback intercepted /api/health because the
    // serverless function wasn't deployed (or the rewrites are wrong).
    const looksLikeHtml = text.trim().startsWith('<') || text.includes('<!doctype html');
    return {
      success: false,
      functionReachable: false,
      mongoUriPresent: false,
      mongoConnected: false,
      mongoError: looksLikeHtml
        ? `Server /api/health o'rniga HTML qaytardi (HTTP ${r.status}). Serverless function deploy qilinmagan.`
        : `HTTP ${r.status} — javob JSON emas.`,
      hint: looksLikeHtml
        ? "Vercel'da yangi commit'ni deploy qilib bo'lganini kuting (~1 daqiqa), keyin Project Settings → General → Root Directory bo'sh ('./') ekanini tekshiring. /api/[...path].js endi repo root'ida."
        : undefined
    };
  } catch (err) {
    return {
      success: false,
      functionReachable: false,
      mongoUriPresent: false,
      mongoConnected: false,
      mongoError: (err as Error).message || "Tarmoq xatosi",
      hint: "Serverless function /api/health topilmadi. Vercel Project Settings → General → Root Directory bo'sh ('./') ekanini va deploy tugaganini tekshiring."
    };
  }
};

export const saveAiSettings = async (s: AiSettings): Promise<AiSettings> => {
  const data = await apiCall<AiSettings>(apiUrl('/api/ai/settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s)
  });
  const merged = { ...DEFAULT_AI_SETTINGS, ...data };
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
  const data = await apiCall<AiKey>(apiUrl('/api/ai/keys'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name.trim(),
      apiKey: input.apiKey.trim(),
      provider: input.provider || 'gemini',
      dailyLimit: input.dailyLimit ?? 1500,
      active: input.active !== false
    })
  });
  await Promise.all([refreshAiKeys(), refreshAiStats()]);
  // Auto-enable AI when the first/any key is added.
  const cur = getAiSettings();
  if (!cur.enabled) {
    await saveAiSettings({ ...cur, enabled: true });
  }
  return data;
};

export const updateAiKey = async (
  id: string,
  patch: Partial<Pick<AiKey, 'name' | 'provider' | 'dailyLimit' | 'active'>>
): Promise<AiKey> => {
  const data = await apiCall<AiKey>(apiUrl(`/api/ai/keys/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  await Promise.all([refreshAiKeys(), refreshAiStats()]);
  return data;
};

export const deleteAiKey = async (id: string): Promise<boolean> => {
  await apiCall<unknown>(apiUrl(`/api/ai/keys/${id}`), { method: 'DELETE' });
  await Promise.all([refreshAiKeys(), refreshAiStats()]);
  return true;
};

// Verify an *already-saved* key by id (server has the full apiKey).
export const testSavedAiKey = async (id: string): Promise<{ reply: string; model: string }> => {
  const d = await apiCallRaw<{ success: boolean; reply?: string; model?: string }>(
    apiUrl(`/api/ai/keys/${id}/test`), { method: 'POST' }
  );
  return { reply: d.reply || '', model: d.model || '' };
};

// Verify a *not-yet-saved* key (passed inline). Used by the "Test" button in
// the new-key modal.
export const testInlineAiKey = async (
  apiKey: string,
  provider: 'gemini' | 'openai' = 'gemini',
  model?: string
): Promise<{ reply: string; model: string }> => {
  const d = await apiCallRaw<{ success: boolean; reply?: string; model?: string }>(
    apiUrl('/api/ai/test'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, provider, model })
    }
  );
  return { reply: d.reply || '', model: d.model || '' };
};

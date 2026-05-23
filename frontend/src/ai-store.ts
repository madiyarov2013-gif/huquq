// Client-side AI key + settings store (localStorage based).
// Used when the backend isn't reachable (e.g. when frontend is deployed on
// HTTPS Vercel but backend is only on localhost).

export interface AiKey {
  _id: string;
  name: string;
  apiKey: string; // full key, kept only in this browser
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

const KEYS_KEY = 'huquq_ai_keys_v1';
const SETTINGS_KEY = 'huquq_ai_settings_v1';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  systemPrompt:
    "Sen O'zbekiston huquqiy yordamchisissan. Foydalanuvchilarga O'zbekiston Konstitutsiyasi, qonunlari, huquqiy tizimi, bola huquqlari konvensiyasi va boshqa huquqiy mavzular bo'yicha yordam berasan. Javoblaringni o'zbek tilida, tushunarli va aniq qilib yoz. Agar savol huquqqa tegishli bo'lmasa ham, do'stona javob ber.",
  greeting:
    "Assalomu alaykum! Men sizning huquqiy yordamchingizman. Menga istalgan savolingizni bering — huquq, qonunlar, konvensiyalar bo'yicha yordam beraman.",
  enabled: true,
  defaultProvider: 'gemini',
  defaultModel: 'gemini-1.5-flash'
};

const today = (): string => new Date().toISOString().slice(0, 10);
const newId = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const mask = (k: string): string =>
  k && k.length > 8 ? k.slice(0, 4) + '...' + k.slice(-4) : '***';

export const getAiSettings = (): AiSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
};

export const setAiSettings = (s: AiSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
};

const readKeys = (): AiKey[] => {
  try {
    const raw = localStorage.getItem(KEYS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const writeKeys = (arr: AiKey[]): void => {
  localStorage.setItem(KEYS_KEY, JSON.stringify(arr));
};

// Refresh per-day counters: reset `used` if the date rolled over.
const rolloverKeys = (keys: AiKey[]): AiKey[] => {
  const td = today();
  let changed = false;
  const next = keys.map(k => {
    if (k.usedDate !== td) {
      changed = true;
      return { ...k, used: 0, usedDate: td };
    }
    return k;
  });
  if (changed) writeKeys(next);
  return next;
};

// Public: list keys with masked apiKey (no full key exposed in UI).
export const getAiKeys = (): AiKey[] =>
  rolloverKeys(readKeys()).map(k => ({ ...k, keyMasked: mask(k.apiKey) }));

export const findAiKeyFull = (id: string): AiKey | null =>
  readKeys().find(k => k._id === id) || null;

export const createAiKey = (input: {
  name: string;
  apiKey: string;
  provider?: 'gemini' | 'openai';
  dailyLimit?: number;
  active?: boolean;
}): AiKey => {
  const k: AiKey = {
    _id: newId(),
    name: input.name.trim(),
    apiKey: input.apiKey.trim(),
    provider: input.provider || 'gemini',
    dailyLimit: input.dailyLimit ?? 1500,
    used: 0,
    usedDate: today(),
    active: input.active !== false,
    createdAt: new Date().toISOString(),
    keyMasked: mask(input.apiKey.trim())
  };
  const arr = readKeys();
  arr.push(k);
  writeKeys(arr);
  return k;
};

export const updateAiKey = (id: string, patch: Partial<AiKey>): AiKey | null => {
  const arr = readKeys();
  const idx = arr.findIndex(k => k._id === id);
  if (idx < 0) return null;
  arr[idx] = { ...arr[idx], ...patch };
  writeKeys(arr);
  return arr[idx];
};

export const deleteAiKey = (id: string): boolean => {
  const arr = readKeys();
  const next = arr.filter(k => k._id !== id);
  if (next.length === arr.length) return false;
  writeKeys(next);
  return true;
};

// Pick the active key with the most remaining budget.
export const pickActiveKey = (): AiKey | null => {
  const keys = rolloverKeys(readKeys()).filter(k => k.active && k.used < k.dailyLimit);
  if (keys.length === 0) return null;
  keys.sort((a, b) => b.dailyLimit - b.used - (a.dailyLimit - a.used));
  return keys[0];
};

export const recordKeyUsage = (id: string): void => {
  const arr = readKeys();
  const idx = arr.findIndex(k => k._id === id);
  if (idx < 0) return;
  const td = today();
  arr[idx] = {
    ...arr[idx],
    used: (arr[idx].usedDate === td ? arr[idx].used : 0) + 1,
    usedDate: td
  };
  writeKeys(arr);
};

export const getAiStats = (): AiStats => {
  const td = today();
  const keys = readKeys();
  let usedToday = 0;
  let dailyLimit = 0;
  let keysActive = 0;
  for (const k of keys) {
    usedToday += k.usedDate === td ? k.used : 0;
    dailyLimit += k.dailyLimit;
    if (k.active) keysActive += 1;
  }
  return { keysTotal: keys.length, keysActive, usedToday, dailyLimit, date: td };
};

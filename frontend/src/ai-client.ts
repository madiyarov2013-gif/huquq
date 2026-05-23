// Direct browser → Gemini API caller. Works without any backend.
// Gemini's REST API supports CORS and an `?key=` query param, so this can
// be called from a deployed static frontend.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const GEMINI_MODEL_FALLBACKS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-pro',
  'gemini-2.0-flash-exp'
];

export const listGeminiModels = async (apiKey: string): Promise<string[]> => {
  const r = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  const models: string[] = (data.models || [])
    .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m: any) => (m.name || '').replace(/^models\//, ''))
    .filter(Boolean);
  // Sort: flash first (cheaper/faster), then 'latest', exp at the end
  models.sort((a: string, b: string) => {
    const score = (n: string) => (n.includes('flash') ? 0 : 1) + (n.includes('exp') ? 1 : 0);
    return score(a) - score(b);
  });
  return models;
};

const generateOnce = async (
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> => {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join('\n') || '';
  if (!text) throw new Error('Bo\'sh javob');
  return text;
};

export interface GeminiResult {
  reply: string;
  model: string;
  availableModels: string[];
}

export const generateGemini = async (
  apiKey: string,
  preferredModel: string | undefined,
  prompt: string
): Promise<GeminiResult> => {
  // Discover what's available for this key — auth/quota errors will surface here.
  let live: string[] = [];
  try {
    live = await listGeminiModels(apiKey);
  } catch (err: any) {
    const msg = err.message || String(err);
    if (
      msg.includes('API_KEY_INVALID') ||
      msg.includes('API key not valid') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('429')
    ) {
      throw err;
    }
    // listing failed but key may still work — keep going with fallbacks
  }

  const candidates = [preferredModel, ...live, ...GEMINI_MODEL_FALLBACKS]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i) as string[];

  let lastErr: Error | null = null;
  for (const m of candidates) {
    try {
      const reply = await generateOnce(apiKey, m, prompt);
      return { reply, model: m, availableModels: live };
    } catch (err: any) {
      lastErr = err;
      const msg = err.message || String(err);
      if (
        msg.includes('API_KEY_INVALID') ||
        msg.includes('API key not valid') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('429')
      ) {
        throw err;
      }
    }
  }
  const list = live.length ? ` Mavjud modellar: ${live.slice(0, 5).join(', ')}.` : '';
  throw new Error((lastErr?.message || 'Model topilmadi') + list);
};

export const friendlyError = (err: unknown): string => {
  const raw = (err as any)?.message || String(err);
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return 'Internetga ulanish mavjud emas yoki bloklangan.';
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
    return "API kalit noto'g'ri (API_KEY_INVALID). Google AI Studio (https://aistudio.google.com/app/apikey) sahifasidan kalitni qaytadan oling va to'liq nusxalang. Yangi kalit 1-2 daqiqada faollashadi.";
  }
  if (raw.includes('PERMISSION_DENIED')) {
    return 'Ruxsat rad etildi. Loyihada Gemini API yoqilganligini tekshiring.';
  }
  if (raw.includes('429')) {
    return "So'rovlar limiti vaqtinchalik tugagan. Bir necha daqiqadan keyin urinib ko'ring.";
  }
  if (raw.toLowerCase().includes('not found') && raw.toLowerCase().includes('model')) {
    return 'Model topilmadi. ' + raw;
  }
  return raw;
};

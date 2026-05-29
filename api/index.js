// Vercel serverless function — handles all /api/* routes for production.
// Local dev still uses backend/server.js on port 5000.
// Data is stored in MongoDB (set MONGO_URI env var in Vercel Project Settings).

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---------- Mongoose connection (cached across invocations) ----------
let cached = global.__huquqMongo;
if (!cached) cached = global.__huquqMongo = { conn: null, promise: null };

const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (!cached.promise) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI env var is not set');
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 5
    }).then(m => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
};

// ---------- Schemas ----------
const bookSchema = new mongoose.Schema({
  grade: { type: Number, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  color: { type: String, required: true },
  code: { type: String, required: true },
  pages: { type: [String], default: [] }
});
const Book = mongoose.models.Book || mongoose.model('Book', bookSchema);

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: Number, required: true },
  explanation: { type: String, default: '' }
});
const testSchema = new mongoose.Schema({
  grade: { type: Number, required: true },
  title: { type: String, required: true },
  questions: { type: [questionSchema], default: [] }
});
const Test = mongoose.models.Test || mongoose.model('Test', testSchema);

const aiKeySchema = new mongoose.Schema({
  name: { type: String, required: true },
  apiKey: { type: String, required: true },
  provider: { type: String, default: 'gemini' },
  dailyLimit: { type: Number, default: 1500 },
  used: { type: Number, default: 0 },
  usedDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const AiKey = mongoose.models.AiKey || mongoose.model('AiKey', aiKeySchema);

// Singleton document keyed by _singleton: 'main'
const aiSettingsSchema = new mongoose.Schema({
  _singleton: { type: String, default: 'main', unique: true },
  systemPrompt: String,
  greeting: String,
  enabled: { type: Boolean, default: true },
  defaultProvider: { type: String, default: 'gemini' },
  defaultModel: { type: String, default: 'gemini-1.5-flash' }
});
const AiSettings = mongoose.models.AiSettings || mongoose.model('AiSettings', aiSettingsSchema);

const subscriptionSchema = new mongoose.Schema({
  userLogin: { type: String, required: true },
  userName: { type: String, default: '' },
  tier: { type: String, required: true },
  duration: { type: String, required: true },
  amount: { type: Number, required: true },
  paidAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: { type: String, default: 'active' },
  cardLast4: { type: String, default: '' }
});
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);

// ---------- Defaults & helpers ----------
const DEFAULT_AI_SETTINGS = {
  systemPrompt: "Sen O'zbekiston huquqiy yordamchisissan. Foydalanuvchilarga O'zbekiston Konstitutsiyasi, qonunlari, huquqiy tizimi, bola huquqlari konvensiyasi va boshqa huquqiy mavzular bo'yicha yordam berasan. Javoblaringni o'zbek tilida, tushunarli va aniq qilib yoz. Agar savol huquqqa tegishli bo'lmasa ham, do'stona javob ber.",
  greeting: "Assalomu alaykum! Men sizning huquqiy yordamchingizman. Menga istalgan savolingizni bering — huquq, qonunlar, konvensiyalar bo'yicha yordam beraman.",
  enabled: true,
  defaultProvider: 'gemini',
  defaultModel: 'gemini-1.5-flash'
};

const today = () => new Date().toISOString().slice(0, 10);

const getAiSettings = async () => {
  let doc = await AiSettings.findOne({ _singleton: 'main' });
  if (!doc) doc = await AiSettings.create({ _singleton: 'main', ...DEFAULT_AI_SETTINGS });
  return {
    systemPrompt: doc.systemPrompt || DEFAULT_AI_SETTINGS.systemPrompt,
    greeting: doc.greeting || DEFAULT_AI_SETTINGS.greeting,
    enabled: doc.enabled !== false,
    defaultProvider: doc.defaultProvider || 'gemini',
    defaultModel: doc.defaultModel || 'gemini-1.5-flash'
  };
};

const setAiSettings = async (patch) =>
  AiSettings.findOneAndUpdate({ _singleton: 'main' }, { $set: patch }, { upsert: true, new: true });

const sanitizeKey = (k) => {
  const full = k.apiKey || '';
  return {
    _id: String(k._id),
    name: k.name,
    provider: k.provider,
    dailyLimit: k.dailyLimit,
    used: k.used,
    usedDate: k.usedDate,
    active: k.active,
    createdAt: k.createdAt,
    keyMasked: full.length > 8 ? full.slice(0, 4) + '...' + full.slice(-4) : '***'
  };
};

const pickNextActiveKey = async () => {
  const td = today();
  await AiKey.updateMany({ usedDate: { $ne: td } }, { $set: { used: 0, usedDate: td } });
  const keys = await AiKey.find({ active: true });
  const available = keys.filter(k => k.used < k.dailyLimit);
  if (available.length === 0) return null;
  available.sort((a, b) => (b.dailyLimit - b.used) - (a.dailyLimit - a.used));
  return available[0];
};

// ---------- Gemini helpers (same fallback chain as backend/server.js) ----------
const GEMINI_MODEL_FALLBACKS = [
  'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash-8b',
  'gemini-1.5-pro', 'gemini-1.5-pro-latest', 'gemini-pro', 'gemini-2.0-flash-exp'
];

const listGeminiModels = async (apiKey) => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => (m.name || '').replace(/^models\//, ''))
    .filter(Boolean);
  models.sort((a, b) => {
    const score = (n) => (n.includes('flash') ? 0 : 1) + (n.includes('exp') ? 1 : 0);
    return score(a) - score(b);
  });
  return models;
};

const tryGeminiGenerate = async (apiKey, preferredModel, prompt) => {
  let liveModels = [];
  try { liveModels = await listGeminiModels(apiKey); }
  catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('PERMISSION_DENIED') || msg.includes('429')) throw err;
  }
  const candidates = [preferredModel, ...liveModels, ...GEMINI_MODEL_FALLBACKS].filter(Boolean);
  const seen = new Set();
  let lastErr = null;
  for (const name of candidates) {
    if (seen.has(name)) continue;
    seen.add(name);
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const m = genAI.getGenerativeModel({ model: name });
      const result = await m.generateContent(prompt);
      return { reply: result.response.text(), model: name };
    } catch (err) {
      lastErr = err;
      const msg = err.message || String(err);
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('PERMISSION_DENIED') || msg.includes('429')) throw err;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('Hech qanday model ishlamadi');
};

// ---------- Express ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Status + health intentionally bypass the DB middleware so admins can
// verify the serverless function itself is reachable even when MongoDB is
// unreachable (missing MONGO_URI, Atlas IP whitelist, etc).
app.get('/api/status', (_req, res) => res.json({ success: true, message: 'Huquq API (Vercel) is running' }));

app.get('/api/health', async (_req, res) => {
  const report = {
    success: true,
    functionReachable: true,
    mongoUriPresent: Boolean(process.env.MONGO_URI),
    mongoConnected: false,
    mongoError: null,
    node: process.version,
    runtime: 'vercel-serverless'
  };
  if (!report.mongoUriPresent) {
    report.success = false;
    report.mongoError = "MONGO_URI env var Vercel Project Settings → Environment Variables ichida yo'q.";
    return res.json(report);
  }
  try {
    await connectDB();
    report.mongoConnected = mongoose.connection.readyState === 1;
    if (!report.mongoConnected) {
      report.success = false;
      report.mongoError = "Mongoose ulanish holati: " + mongoose.connection.readyState;
    }
  } catch (err) {
    report.success = false;
    report.mongoError = err.message || String(err);
    // Provide a hint for the most common cause (Atlas IP whitelist)
    if (/whitelist|IP|not allowed|ENOTFOUND|ETIMEDOUT|timed out/i.test(report.mongoError)) {
      report.hint = "MongoDB Atlas → Network Access → Add IP Address → '0.0.0.0/0' (Allow access from anywhere) ni qo'shing. Vercel dinamik IP ishlatadi.";
    } else if (/auth|password|credentials/i.test(report.mongoError)) {
      report.hint = "MONGO_URI ichidagi username/password noto'g'ri. Atlas → Database Access dan tekshiring.";
    }
  }
  res.json(report);
});

// Ensure DB is up for every other request.
// Exception: /api/ai/chat can fall back to a GEMINI_API_KEY env var when the DB
// is unreachable, so it manages its own (optional) DB connection internally.
app.use(async (req, res, next) => {
  if (req.path === '/api/ai/chat') return next();
  try { await connectDB(); next(); }
  catch (err) {
    console.error('Mongo connect failed:', err.message);
    res.status(500).json({ success: false, error: "Ma'lumotlar bazasiga ulanib bo'lmadi: " + err.message });
  }
});

// ---- Stats (dashboard) ----
app.get('/api/stats', async (_req, res) => {
  try {
    const [booksCount, testsCount, tests] = await Promise.all([
      Book.countDocuments(), Test.countDocuments(), Test.find({}, 'questions')
    ]);
    const totalQuestions = tests.reduce((s, t) => s + (t.questions?.length || 0), 0);
    res.json({ success: true, data: { books: booksCount, tests: testsCount, questions: totalQuestions } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- Books ----
app.get('/api/books', async (_req, res) => {
  try { res.json({ success: true, data: await Book.find({}) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/classes/:grade/books', async (req, res) => {
  try { res.json({ success: true, data: await Book.find({ grade: Number(req.params.grade) }) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/books', async (req, res) => {
  try {
    const { grade, title, subtitle, color, code, pages } = req.body;
    const b = await Book.create({ grade, title, subtitle, color, code, pages });
    res.json({ success: true, data: b });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.put('/api/books/:id', async (req, res) => {
  try {
    const { grade, title, subtitle, color, code, pages } = req.body;
    const b = await Book.findByIdAndUpdate(req.params.id, { grade, title, subtitle, color, code, pages }, { new: true });
    if (!b) return res.status(404).json({ success: false, error: 'Kitob topilmadi' });
    res.json({ success: true, data: b });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/books/:id', async (req, res) => {
  try {
    const b = await Book.findByIdAndDelete(req.params.id);
    if (!b) return res.status(404).json({ success: false, error: 'Kitob topilmadi' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- Tests ----
app.get('/api/tests', async (_req, res) => {
  try { res.json({ success: true, data: await Test.find({}) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/classes/:grade/tests', async (req, res) => {
  try { res.json({ success: true, data: await Test.find({ grade: Number(req.params.grade) }) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/tests', async (req, res) => {
  try {
    const { grade, title, questions } = req.body;
    const t = await Test.create({ grade, title, questions });
    res.json({ success: true, data: t });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.put('/api/tests/:id', async (req, res) => {
  try {
    const { grade, title, questions } = req.body;
    const t = await Test.findByIdAndUpdate(req.params.id, { grade, title, questions }, { new: true });
    if (!t) return res.status(404).json({ success: false, error: 'Test topilmadi' });
    res.json({ success: true, data: t });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/tests/:id', async (req, res) => {
  try {
    const t = await Test.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: 'Test topilmadi' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- Subscriptions ----
const refreshSubStatuses = async () => {
  const now = new Date();
  await Subscription.updateMany({ status: 'active', expiresAt: { $lt: now } }, { $set: { status: 'expired' } });
};
app.get('/api/subscriptions', async (_req, res) => {
  try {
    await refreshSubStatuses();
    const list = await Subscription.find({}).sort({ paidAt: -1 });
    res.json({ success: true, data: list });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/subscriptions/stats', async (_req, res) => {
  try {
    await refreshSubStatuses();
    const all = await Subscription.find({});
    const active = all.filter(s => s.status === 'active');
    const proCount = all.filter(s => s.tier === 'pro').length;
    const maxCount = all.filter(s => s.tier === 'max').length;
    const proActive = active.filter(s => s.tier === 'pro').length;
    const maxActive = active.filter(s => s.tier === 'max').length;
    const totalRevenue = all.reduce((s, x) => s + (x.amount || 0), 0);
    const now = new Date();
    const monthlyRevenue = all
      .filter(s => { const d = new Date(s.paidAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
      .reduce((s, x) => s + (x.amount || 0), 0);
    const uniqueUsers = new Set(all.map(s => s.userLogin)).size;
    res.json({ success: true, data: { total: all.length, activeCount: active.length, uniqueUsers, proCount, maxCount, proActive, maxActive, totalRevenue, monthlyRevenue } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/subscriptions', async (req, res) => {
  try {
    const { userLogin, userName, tier, duration, amount, expiresAt, cardLast4 } = req.body;
    if (!userLogin || !tier || !duration || amount === undefined || !expiresAt)
      return res.status(400).json({ success: false, error: "Ma'lumotlar to'liq emas" });
    await Subscription.updateMany({ userLogin, status: 'active' }, { $set: { status: 'cancelled' } });
    const sub = await Subscription.create({
      userLogin, userName: userName || '', tier, duration, amount,
      expiresAt: new Date(expiresAt), cardLast4: cardLast4 || ''
    });
    res.json({ success: true, data: sub });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/subscriptions/:id', async (req, res) => {
  try {
    const s = await Subscription.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ success: false, error: 'Obuna topilmadi' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- AI: settings ----
app.get('/api/ai/settings', async (_req, res) => {
  try { res.json({ success: true, data: await getAiSettings() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.put('/api/ai/settings', async (req, res) => {
  try {
    const { systemPrompt, greeting, enabled, defaultProvider, defaultModel } = req.body;
    const patch = {};
    if (systemPrompt !== undefined) patch.systemPrompt = systemPrompt;
    if (greeting !== undefined) patch.greeting = greeting;
    if (enabled !== undefined) patch.enabled = enabled;
    if (defaultProvider !== undefined) patch.defaultProvider = defaultProvider;
    if (defaultModel !== undefined) patch.defaultModel = defaultModel;
    await setAiSettings(patch);
    res.json({ success: true, data: await getAiSettings() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- AI: keys CRUD ----
app.get('/api/ai/keys', async (_req, res) => {
  try {
    const keys = await AiKey.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: keys.map(sanitizeKey) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/ai/keys', async (req, res) => {
  try {
    const { name, apiKey, provider, dailyLimit, active } = req.body;
    if (!name || !apiKey) return res.status(400).json({ success: false, error: 'Nom va API kalit majburiy' });
    const created = await AiKey.create({
      name: String(name).trim(),
      apiKey: String(apiKey).trim(),
      provider: provider || 'gemini',
      dailyLimit: dailyLimit ?? 1500,
      usedDate: today(),
      active: active !== false
    });
    res.json({ success: true, data: sanitizeKey(created) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.put('/api/ai/keys/:id', async (req, res) => {
  try {
    const { name, apiKey, provider, dailyLimit, active } = req.body;
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (apiKey !== undefined && apiKey !== '') patch.apiKey = apiKey;
    if (provider !== undefined) patch.provider = provider;
    if (dailyLimit !== undefined) patch.dailyLimit = dailyLimit;
    if (active !== undefined) patch.active = active;
    const updated = await AiKey.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!updated) return res.status(404).json({ success: false, error: 'Kalit topilmadi' });
    res.json({ success: true, data: sanitizeKey(updated) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/ai/keys/:id', async (req, res) => {
  try {
    const d = await AiKey.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ success: false, error: 'Kalit topilmadi' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- AI: stats ----
app.get('/api/ai/stats', async (_req, res) => {
  try {
    const td = today();
    const keys = await AiKey.find({});
    let totalUsed = 0, totalLimit = 0, activeCount = 0;
    for (const k of keys) {
      totalUsed += k.usedDate === td ? k.used : 0;
      totalLimit += k.dailyLimit;
      if (k.active) activeCount += 1;
    }
    res.json({ success: true, data: { keysTotal: keys.length, keysActive: activeCount, usedToday: totalUsed, dailyLimit: totalLimit, date: td } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- AI: test saved key by id ----
app.post('/api/ai/keys/:id/test', async (req, res) => {
  try {
    const k = await AiKey.findById(req.params.id);
    if (!k) return res.status(404).json({ success: false, error: 'Kalit topilmadi' });
    const settings = await getAiSettings();
    const provider = k.provider || settings.defaultProvider || 'gemini';
    const model = settings.defaultModel || (provider === 'openai' ? 'gpt-3.5-turbo' : 'gemini-1.5-flash');
    if (provider === 'gemini') {
      const { reply, model: workingModel } = await tryGeminiGenerate(k.apiKey, model, "Salom, bu test. Bir so'z bilan javob ber.");
      if (settings.defaultModel !== workingModel) await setAiSettings({ defaultModel: workingModel });
      return res.json({ success: true, reply: (reply || '').slice(0, 200), model: workingModel });
    }
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${k.apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'salom' }], max_tokens: 20 })
      });
      const data = await r.json();
      if (data.choices && data.choices[0]) return res.json({ success: true, reply: data.choices[0].message.content });
      return res.status(400).json({ success: false, error: data.error?.message || 'OpenAI xatosi' });
    }
    return res.status(400).json({ success: false, error: `Provider "${provider}" qo'llab-quvvatlanmaydi` });
  } catch (err) {
    let msg = err.message || 'Noma\'lum xato';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) msg = "Kalit noto'g'ri yoki faollashtirilmagan.";
    else if (msg.includes('429')) msg = 'Limit vaqtincha tugagan.';
    res.status(400).json({ success: false, error: msg });
  }
});

// ---- AI: list models for a candidate key ----
app.post('/api/ai/list-models', async (req, res) => {
  const apiKey = (req.body?.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ success: false, error: 'API kalit kiritilmadi' });
  try { res.json({ success: true, models: await listGeminiModels(apiKey) }); }
  catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---- AI: test inline key (not yet saved) ----
app.post('/api/ai/test', async (req, res) => {
  let { apiKey, provider, model } = req.body || {};
  if (!apiKey || typeof apiKey !== 'string') return res.status(400).json({ success: false, error: 'API kalit kiritilmadi' });
  apiKey = apiKey.trim();
  const usedProvider = (provider || 'gemini').toLowerCase();
  try {
    if (usedProvider === 'gemini') {
      if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
        return res.status(400).json({ success: false, error: "Kalit shakli noto'g'ri. Gemini kaliti 'AIza' bilan boshlanadi." });
      }
      const { reply, model: workingModel } = await tryGeminiGenerate(apiKey, model, "Salom, bu test. Bir so'z bilan javob ber.");
      const settings = await getAiSettings();
      if (settings.defaultModel !== workingModel) await setAiSettings({ defaultModel: workingModel });
      return res.json({ success: true, reply: (reply || '').slice(0, 200), model: workingModel });
    }
    if (usedProvider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'salom' }], max_tokens: 20 })
      });
      const data = await r.json();
      if (data.choices && data.choices[0]) return res.json({ success: true, reply: data.choices[0].message.content });
      return res.status(400).json({ success: false, error: data.error?.message || "OpenAI bilan bog'lanib bo'lmadi" });
    }
    return res.status(400).json({ success: false, error: `"${usedProvider}" provider qo'llab-quvvatlanmaydi (gemini/openai)` });
  } catch (err) {
    const raw = err.message || String(err);
    let msg = raw;
    if (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) msg = "API kalit noto'g'ri (API_KEY_INVALID). Sabablari: 1) yangi kalit, 1-2 daqiqa kuting; 2) bo'sh joy; 3) region cheklovi; 4) Gemini API yoqilmagan. Asl: " + raw;
    else if (raw.includes('PERMISSION_DENIED')) msg = 'Ruxsat rad etildi (PERMISSION_DENIED). Loyihada Gemini API yoqilganiga ishonch hosil qiling.';
    else if (raw.includes('429')) msg = "So'rovlar limiti vaqtincha tugagan (429). Bir necha daqiqadan keyin urinib ko'ring.";
    res.status(400).json({ success: false, error: msg });
  }
});

// ---- AI: chat (the actual user-facing endpoint) ----
// Prefers DB-managed keys/settings, but falls back to a GEMINI_API_KEY env var
// when the DB is unreachable or has no usable key — so chat still works with a
// single Vercel env var even before MongoDB is configured.
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ success: false, error: 'Xabar kiritilmadi' });

  let settings = { ...DEFAULT_AI_SETTINGS };
  let apiKey = null, provider = 'gemini', dbOk = false;
  let keyId = null, keyUsed = 0, keyUsedDate = null;

  try {
    await connectDB();
    dbOk = true;
    settings = await getAiSettings();
    const keyDoc = await pickNextActiveKey();
    if (keyDoc) {
      apiKey = keyDoc.apiKey;
      provider = keyDoc.provider || settings.defaultProvider || 'gemini';
      keyId = keyDoc._id; keyUsed = keyDoc.used; keyUsedDate = keyDoc.usedDate;
    }
  } catch (e) {
    console.error('chat: DB unavailable, trying env key:', e.message);
  }

  if (!settings.enabled) return res.status(503).json({ success: false, error: "AI hozircha o'chirilgan. Administrator yoqishini kuting." });

  // Fallback to env-var key when the DB has no usable key (or is down).
  if (!apiKey) {
    const envKey = (process.env.GEMINI_API_KEY || '').trim();
    if (envKey) { apiKey = envKey; provider = 'gemini'; }
  }
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: dbOk
        ? 'Faol API kalit topilmadi yoki kunlik limit tugagan.'
        : "API kalit topilmadi. Vercelda GEMINI_API_KEY env o'zgaruvchisini qo'shing yoki MONGO_URI sozlab admin paneldan kalit qo'shing."
    });
  }

  try {
    let reply;
    if (provider === 'gemini') {
      const { reply: r, model: workingModel } = await tryGeminiGenerate(
        apiKey,
        settings.defaultModel || 'gemini-1.5-flash',
        `${settings.systemPrompt}\n\nFoydalanuvchi: ${message}`
      );
      reply = r;
      if (dbOk && settings.defaultModel !== workingModel) {
        try { await setAiSettings({ defaultModel: workingModel }); } catch { /* ignore */ }
      }
    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: settings.defaultModel || 'gpt-3.5-turbo',
          messages: [{ role: 'system', content: settings.systemPrompt }, { role: 'user', content: message }],
          max_tokens: 1000
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0]) reply = data.choices[0].message.content;
      else throw new Error(data.error?.message || 'OpenAI xatosi');
    } else {
      return res.status(400).json({ success: false, error: `"${provider}" provider qo'llab-quvvatlanmaydi` });
    }
    // Increment usage only for DB-managed keys.
    if (dbOk && keyId) {
      const td = today();
      const newUsed = (keyUsedDate === td ? keyUsed : 0) + 1;
      try { await AiKey.findByIdAndUpdate(keyId, { used: newUsed, usedDate: td }); } catch { /* ignore */ }
    }
    res.json({ success: true, reply });
  } catch (err) {
    let userMessage = "AI bilan bog'lanishda xatolik yuz berdi";
    const m = err.message || '';
    if (m.includes('429')) userMessage = 'API limit tugagan. Iltimos, biroz kutib qayta urinib ko\'ring.';
    else if (m.includes('API_KEY_INVALID')) userMessage = 'API kalit noto\'g\'ri. Administrator kalitni almashtirishi kerak.';
    else if (m.toLowerCase().includes('quota')) userMessage = 'Kunlik limit tugagan. Boshqa kalit qo\'shilishi yoki ertaga urinish kerak.';
    res.status(500).json({ success: false, error: userMessage });
  }
});

module.exports = app;

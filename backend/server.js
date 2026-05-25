const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB ulanish (ixtiyoriy — bo'lmasa AI/obunalar JSON faylga yoziladi)
mongoose.set('bufferCommands', false); // so we fail fast if Mongo is unreachable
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/huquq_db', {
    serverSelectionTimeoutMS: 3000
  })
  .then(() => console.log('MongoDB bazasiga ulanish muvaffaqiyatli!'))
  .catch((err) => console.warn('MongoDB ulanish topilmadi (JSON fallback ishlatiladi):', err.message));

// ===== JSON FALE FALLBACK =====
// AI kalit, sozlama va obunalar uchun mahalliy JSON store.
// MongoDB ishlamayotgan bo'lsa ham AI funksiyalari ishlaydi.
const DATA_DIR = path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ }

const readStore = (file, fallback) => {
  const p = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn(`Storage read failed (${file}):`, e.message);
    return fallback;
  }
};
const writeStore = (file, data) => {
  try {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Storage write failed (${file}):`, e.message);
  }
};
const newId = () => crypto.randomBytes(12).toString('hex');


// Middleware
app.use(cors());
app.use(express.json());

// Mongoose Schema va Model
const bookSchema = new mongoose.Schema({
  grade: { type: Number, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  color: { type: String, required: true },
  code: { type: String, required: true },
  pages: { type: [String], default: [] }
});

const Book = mongoose.model('Book', bookSchema);

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: Number, required: true }, // index of correct option
  explanation: { type: String, default: "" }
});

const testSchema = new mongoose.Schema({
  grade: { type: Number, required: true },
  title: { type: String, required: true },
  questions: { type: [questionSchema], default: [] }
});

const Test = mongoose.model('Test', testSchema);

// ===== AI: file-based store (MongoDB-free) =====
const DEFAULT_AI_SETTINGS = {
  systemPrompt: "Sen O'zbekiston huquqiy yordamchisissan. Foydalanuvchilarga O'zbekiston Konstitutsiyasi, qonunlari, huquqiy tizimi, bola huquqlari konvensiyasi va boshqa huquqiy mavzular bo'yicha yordam berasan. Javoblaringni o'zbek tilida, tushunarli va aniq qilib yoz. Agar savol huquqqa tegishli bo'lmasa ham, do'stona javob ber.",
  greeting: "Assalomu alaykum! Men sizning huquqiy yordamchingizman. Menga istalgan savolingizni bering — huquq, qonunlar, konvensiyalar bo'yicha yordam beraman.",
  enabled: true,
  defaultProvider: 'gemini',
  defaultModel: 'gemini-1.5-flash'
};

const getAiKeys = () => readStore('ai-keys.json', []);
const setAiKeys = (arr) => writeStore('ai-keys.json', arr);
const getAiSettings = () => ({ ...DEFAULT_AI_SETTINGS, ...readStore('ai-settings.json', {}) });
const setAiSettings = (s) => writeStore('ai-settings.json', s);
const getSubscriptions = () => readStore('subscriptions.json', []);
const setSubscriptions = (arr) => writeStore('subscriptions.json', arr);

const ensureAiSettings = async () => {
  try {
    if (!fs.existsSync(path.join(DATA_DIR, 'ai-settings.json'))) {
      setAiSettings(DEFAULT_AI_SETTINGS);
      console.log("Default AI sozlamalari yaratildi (data/ai-settings.json).");
      return;
    }
  } catch (err) {
    console.error("AI sozlamalarini boshlashda xatolik:", err);
  }
};

const today = () => new Date().toISOString().slice(0, 10);

const pickNextActiveKey = () => {
  const td = today();
  const keys = getAiKeys();
  let dirty = false;
  // Auto-reset used counter at midnight
  for (const k of keys) {
    if (k.usedDate !== td) {
      k.used = 0;
      k.usedDate = td;
      dirty = true;
    }
  }
  if (dirty) setAiKeys(keys);
  const available = keys.filter(k => k.active && k.used < k.dailyLimit);
  if (available.length === 0) return null;
  available.sort((a, b) => (b.dailyLimit - b.used) - (a.dailyLimit - a.used));
  return available[0];
};

const findAiKey = (id) => getAiKeys().find(k => k._id === id);
const updateAiKey = (id, patch) => {
  const keys = getAiKeys();
  const idx = keys.findIndex(k => k._id === id);
  if (idx < 0) return null;
  keys[idx] = { ...keys[idx], ...patch };
  setAiKeys(keys);
  return keys[idx];
};
const deleteAiKey = (id) => {
  const keys = getAiKeys();
  const next = keys.filter(k => k._id !== id);
  if (next.length === keys.length) return false;
  setAiKeys(next);
  return true;
};

// Wait briefly for MongoDB connection so seeds only run when DB is reachable
const isMongoConnected = () => mongoose.connection.readyState === 1;

// Boshlang'ich ma'lumotlarni kiritish (Seed) — skipped silently if MongoDB is down
const seedBooks = async () => {
  if (!isMongoConnected()) return;
  try {
    const count = await Book.countDocuments();
    if (count === 0) {
      const initialBooks = [
        { grade: 11, title: "Konstitutsiya", subtitle: "va huquqiy asoslar", color: "#1e3a8a", code: "KONSTITUTSIYASI" },
        { grade: 11, title: "Fuqarolik huquqi", subtitle: "", color: "#14532d", code: "FUQAROLIK HUQUQI" },
        { grade: 11, title: "Jinoyat huquqi", subtitle: "", color: "#713f12", code: "JINOYAT HUQUQI" },
        { grade: 11, title: "Ma'muriy huquq", subtitle: "", color: "#1e3a8a", code: "MA'MURIY HUQUQ" },
        { grade: 11, title: "Mehnat huquqi", subtitle: "", color: "#713f12", code: "MEHNAT HUQUQI" },
        { grade: 11, title: "Xalqaro huquq", subtitle: "", color: "#14532d", code: "XALQARO HUQUQ" },
      ];
      await Book.insertMany(initialBooks);
      console.log("Boshlang'ich kitoblar ma'lumotlar bazasiga qo'shildi!");
    }
  } catch (err) {
    console.error("Ma'lumotlarni kiritishda xatolik:", err);
  }
};

const seedTests = async () => {
  if (!isMongoConnected()) return;
  try {
    const count = await Test.countDocuments();
    if (count === 0) {
      const initialTests = [
        {
          grade: 11,
          title: "Konstitutsiya testlari",
          questions: [
            {
              questionText: "O'zbekiston Respublikasi Konstitutsiyasining 1-moddasiga ko'ra, O'zbekiston qanday davlat?",
              options: [
                "Suveren, demokratik, huquqiy, ijtimoiy va dunyoviy davlat",
                "Monarxiya shaklidagi unitar davlat",
                "Suveren, sotsialistik, dunyoviy davlat",
                "Federativ shakldagi demokratik davlat"
              ],
              correctAnswer: 0,
              explanation: "Konstitutsiyaning 1-moddasida: 'O‘zbekiston — boshqaruvning respublika shakliga ega bo‘lgan suveren, demokratik, huquqiy, ijtimoiy va dunyoviy davlat' deb belgilangan."
            },
            {
              questionText: "O'zbekiston Respublikasida davlat hokimiyatining birdan-bir manbai kim?",
              options: [
                "Oliy Majlis va deputatlar",
                "O'zbekiston Respublikasi Prezidenti",
                "O'zbekiston xalqi",
                "Vazirlar Mahkamasi"
              ],
              correctAnswer: 2,
              explanation: "Konstitutsiyaning 7-moddasida: 'Xalq davlat hokimiyatining birdan-bir manbaidir' deb belgilangan."
            },
            {
              questionText: "O'zbekiston Respublikasining davlat tili qaysi til?",
              options: [
                "Rus tili",
                "O'zbek tili",
                "Ingliz tili",
                "Qoraqalpoq tili"
              ],
              correctAnswer: 1,
              explanation: "Konstitutsiyaning 4-moddasiga muvofiq, O'zbekiston Respublikasining davlat tili o'zbek tilidir."
            },
            {
              questionText: "Konstitutsiyaga binoan, O'zbekiston Respublikasining poytaxti qaysi shahar?",
              options: [
                "Samarqand shahri",
                "Buxoro shahri",
                "Toshkent shahri",
                "Namangan shahri"
              ],
              correctAnswer: 2,
              explanation: "Konstitutsiyaning 6-moddasiga binoan O'zbekiston Respublikasining poytaxti - Toshkent shahri."
            },
            {
              questionText: "Jamiyat va davlat hayotining eng muhim masalalari qanday hal etiladi?",
              options: [
                "Faqat sudlar tomonidan",
                "Xalq muhokamasiga taqdim etiladi va referendumga qo'yiladi",
                "Prezident farmonlari orqali hal qilinadi",
                "Hokimlar qarorlari asosida hal etiladi"
              ],
              correctAnswer: 1,
              explanation: "Konstitutsiyaning 9-moddasida jamiyat va davlat hayotining eng muhim masalalari xalq muhokamasiga taqdim etilishi, referendumga qo'yilishi belgilangan."
            }
          ]
        },
        {
          grade: 11,
          title: "Mehnat huquqi testlari",
          questions: [
            {
              questionText: "Mehnat kodeksiga ko'ra, xodimning haftalik ish vaqti muddati necha soatdan oshmasligi kerak?",
              options: [
                "36 soatdan",
                "40 soatdan",
                "48 soatdan",
                "45 soatdan"
              ],
              correctAnswer: 1,
              explanation: "Mehnat kodeksiga muvofiq normal haftalik ish vaqti muddati 40 soatdan oshmasligi lozim."
            },
            {
              questionText: "Mehnat shartnomasi tuzishga odatda necha yoshdan yo'l qo'yiladi?",
              options: [
                "16 yoshdan",
                "18 yoshdan",
                "15 yoshdan",
                "14 yoshdan"
              ],
              correctAnswer: 0,
              explanation: "Mehnat shartnomasi tuzishga 16 yoshdan yo'l qo'yiladi (istisno hollarda 15 yoshdan)."
            },
            {
              questionText: "Xodimga yillik asosiy mehnat ta'tilining muddati kamida necha ish kuni qilib belgilanishi shart?",
              options: [
                "15 ish kuni",
                "18 ish kuni",
                "21 ish kuni",
                "24 ish kuni"
              ],
              correctAnswer: 3,
              explanation: "Yangi Mehnat kodeksiga binoan xodimlarga beriladigan yillik asosiy mehnat ta'tilining eng kam muddati 24 ish kunini tashkil etadi."
            }
          ]
        }
      ];
      await Test.insertMany(initialTests);
      console.log("Boshlang'ich testlar ma'lumotlar bazasiga qo'shildi!");
    }
  } catch (err) {
    console.error("Testlarni seed qilishda xatolik:", err);
  }
};

// Run seeds after MongoDB connects (or skip if it never does)
mongoose.connection.once('connected', () => {
  seedBooks();
  seedTests();
});
ensureAiSettings();

// Routes
app.get('/api/classes/:grade/books', async (req, res) => {
  try {
    const grade = Number(req.params.grade);
    const books = await Book.find({ grade: grade });
    res.json({ success: true, data: books });
  } catch (error) {
    console.error("Kitoblarni olishda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ success: true, message: "Huquq API is running" });
});

// Diagnostic — mirrors the Vercel /api/health endpoint so the admin
// "Backendni tekshirish" button works the same way in local dev.
app.get('/api/health', async (_req, res) => {
  const state = mongoose.connection.readyState; // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  res.json({
    success: true,
    functionReachable: true,
    mongoUriPresent: Boolean(process.env.MONGO_URI),
    mongoConnected: state === 1,
    mongoState: state,
    mongoError: state === 1 ? null : "MongoDB ulanmagan — JSON fallback ishlatilmoqda (local dev).",
    node: process.version,
    runtime: 'local-express'
  });
});

// ===== DASHBOARD STATS =====
app.get('/api/stats', async (req, res) => {
  try {
    const booksCount = await Book.countDocuments();
    const testsCount = await Test.countDocuments();
    const tests = await Test.find({}, 'questions');
    let totalQuestions = 0;
    tests.forEach(t => {
      totalQuestions += t.questions.length;
    });

    res.json({
      success: true,
      data: {
        books: booksCount,
        tests: testsCount,
        questions: totalQuestions
      }
    });
  } catch (error) {
    console.error("Statistika olishda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== BOOKS CRUD =====
app.get('/api/books', async (req, res) => {
  try {
    const books = await Book.find({});
    res.json({ success: true, data: books });
  } catch (error) {
    console.error("Kitoblarni olishda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.post('/api/books', async (req, res) => {
  try {
    const { grade, title, subtitle, color, code, pages } = req.body;
    const newBook = new Book({ grade, title, subtitle, color, code, pages });
    await newBook.save();
    res.json({ success: true, data: newBook });
  } catch (error) {
    console.error("Kitob saqlashda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.put('/api/books/:id', async (req, res) => {
  try {
    const { grade, title, subtitle, color, code, pages } = req.body;
    const updatedBook = await Book.findByIdAndUpdate(
      req.params.id,
      { grade, title, subtitle, color, code, pages },
      { new: true }
    );
    if (!updatedBook) {
      return res.status(404).json({ success: false, error: "Kitob topilmadi" });
    }
    res.json({ success: true, data: updatedBook });
  } catch (error) {
    console.error("Kitob tahrirlashda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.delete('/api/books/:id', async (req, res) => {
  try {
    const deletedBook = await Book.findByIdAndDelete(req.params.id);
    if (!deletedBook) {
      return res.status(404).json({ success: false, error: "Kitob topilmadi" });
    }
    res.json({ success: true, message: "Kitob muvaffaqiyatli o'chirildi" });
  } catch (error) {
    console.error("Kitob o'chirishda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== TESTS CRUD =====
app.get('/api/tests', async (req, res) => {
  try {
    const tests = await Test.find({});
    res.json({ success: true, data: tests });
  } catch (error) {
    console.error("Testlarni olishda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.get('/api/classes/:grade/tests', async (req, res) => {
  try {
    const grade = Number(req.params.grade);
    const tests = await Test.find({ grade: grade });
    res.json({ success: true, data: tests });
  } catch (error) {
    console.error("Sinf testlarini olishda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.post('/api/tests', async (req, res) => {
  try {
    const { grade, title, questions } = req.body;
    const newTest = new Test({ grade, title, questions });
    await newTest.save();
    res.json({ success: true, data: newTest });
  } catch (error) {
    console.error("Test saqlashda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.put('/api/tests/:id', async (req, res) => {
  try {
    const { grade, title, questions } = req.body;
    const updatedTest = await Test.findByIdAndUpdate(
      req.params.id,
      { grade, title, questions },
      { new: true }
    );
    if (!updatedTest) {
      return res.status(404).json({ success: false, error: "Test topilmadi" });
    }
    res.json({ success: true, data: updatedTest });
  } catch (error) {
    console.error("Test tahrirlashda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.delete('/api/tests/:id', async (req, res) => {
  try {
    const deletedTest = await Test.findByIdAndDelete(req.params.id);
    if (!deletedTest) {
      return res.status(404).json({ success: false, error: "Test topilmadi" });
    }
    res.json({ success: true, message: "Test muvaffaqiyatli o'chirildi" });
  } catch (error) {
    console.error("Test o'chirishda xatolik:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== SUBSCRIPTIONS (file-based) =====
const refreshSubscriptionStatuses = () => {
  const now = Date.now();
  const list = getSubscriptions();
  let dirty = false;
  for (const s of list) {
    if (s.status === 'active' && new Date(s.expiresAt).getTime() < now) {
      s.status = 'expired';
      dirty = true;
    }
  }
  if (dirty) setSubscriptions(list);
  return list;
};

app.get('/api/subscriptions', (_req, res) => {
  try {
    const list = refreshSubscriptionStatuses().slice().sort((a, b) =>
      new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
    );
    res.json({ success: true, data: list });
  } catch (err) {
    console.error("Obunalarni olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.get('/api/subscriptions/stats', (_req, res) => {
  try {
    const all = refreshSubscriptionStatuses();
    const active = all.filter(s => s.status === 'active');
    const proCount = all.filter(s => s.tier === 'pro').length;
    const maxCount = all.filter(s => s.tier === 'max').length;
    const proActive = active.filter(s => s.tier === 'pro').length;
    const maxActive = active.filter(s => s.tier === 'max').length;
    const totalRevenue = all.reduce((s, x) => s + (x.amount || 0), 0);
    const monthlyRevenue = all
      .filter(s => {
        const d = new Date(s.paidAt);
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, x) => s + (x.amount || 0), 0);
    const uniqueUsers = new Set(all.map(s => s.userLogin)).size;
    res.json({
      success: true,
      data: { total: all.length, activeCount: active.length, uniqueUsers, proCount, maxCount, proActive, maxActive, totalRevenue, monthlyRevenue }
    });
  } catch (err) {
    console.error("Obuna statistikasini olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.post('/api/subscriptions', (req, res) => {
  try {
    const { userLogin, userName, tier, duration, amount, expiresAt, cardLast4 } = req.body;
    if (!userLogin || !tier || !duration || amount === undefined || !expiresAt) {
      return res.status(400).json({ success: false, error: "Ma'lumotlar to'liq emas" });
    }
    const list = getSubscriptions();
    // Cancel previous active subs of this user
    for (const s of list) {
      if (s.userLogin === userLogin && s.status === 'active') s.status = 'cancelled';
    }
    const sub = {
      _id: newId(),
      userLogin, userName: userName || '', tier, duration, amount,
      paidAt: new Date().toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      status: 'active',
      cardLast4: cardLast4 || ''
    };
    list.push(sub);
    setSubscriptions(list);
    res.json({ success: true, data: sub });
  } catch (err) {
    console.error("Obuna saqlashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.delete('/api/subscriptions/:id', (req, res) => {
  try {
    const list = getSubscriptions();
    const next = list.filter(s => s._id !== req.params.id);
    if (next.length === list.length) return res.status(404).json({ success: false, error: "Obuna topilmadi" });
    setSubscriptions(next);
    res.json({ success: true });
  } catch (err) {
    console.error("Obuna o'chirishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== AI: SETTINGS =====
app.get('/api/ai/settings', (_req, res) => {
  try {
    res.json({ success: true, data: getAiSettings() });
  } catch (err) {
    console.error("AI sozlamalarini olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.put('/api/ai/settings', (req, res) => {
  try {
    const { systemPrompt, greeting, enabled, defaultProvider, defaultModel } = req.body;
    const s = getAiSettings();
    if (systemPrompt !== undefined) s.systemPrompt = systemPrompt;
    if (greeting !== undefined) s.greeting = greeting;
    if (enabled !== undefined) s.enabled = enabled;
    if (defaultProvider !== undefined) s.defaultProvider = defaultProvider;
    if (defaultModel !== undefined) s.defaultModel = defaultModel;
    setAiSettings(s);
    res.json({ success: true, data: s });
  } catch (err) {
    console.error("AI sozlamalarini yangilashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== AI: KEYS CRUD (file-based) =====
const sanitizeKey = (k) => {
  const full = k.apiKey || '';
  return {
    _id: k._id,
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

app.get('/api/ai/keys', (_req, res) => {
  try {
    const keys = getAiKeys().slice().sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ success: true, data: keys.map(sanitizeKey) });
  } catch (err) {
    console.error("AI kalitlarini olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.post('/api/ai/keys', (req, res) => {
  try {
    const { name, apiKey, provider, dailyLimit, active } = req.body;
    if (!name || !apiKey) {
      return res.status(400).json({ success: false, error: "Nom va API kalit majburiy" });
    }
    const cleanKey = String(apiKey).trim();
    const created = {
      _id: newId(),
      name: String(name).trim(),
      apiKey: cleanKey,
      provider: provider || 'gemini',
      dailyLimit: dailyLimit ?? 1500,
      used: 0,
      usedDate: today(),
      active: active !== false,
      createdAt: new Date().toISOString()
    };
    const keys = getAiKeys();
    keys.push(created);
    setAiKeys(keys);
    res.json({ success: true, data: sanitizeKey(created) });
  } catch (err) {
    console.error("AI kalit saqlashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.put('/api/ai/keys/:id', (req, res) => {
  try {
    const { name, apiKey, provider, dailyLimit, active } = req.body;
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (apiKey !== undefined && apiKey !== '') patch.apiKey = apiKey;
    if (provider !== undefined) patch.provider = provider;
    if (dailyLimit !== undefined) patch.dailyLimit = dailyLimit;
    if (active !== undefined) patch.active = active;
    const updated = updateAiKey(req.params.id, patch);
    if (!updated) return res.status(404).json({ success: false, error: "Kalit topilmadi" });
    res.json({ success: true, data: sanitizeKey(updated) });
  } catch (err) {
    console.error("AI kalitni yangilashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// Test a saved key by id
app.post('/api/ai/keys/:id/test', async (req, res) => {
  try {
    const k = findAiKey(req.params.id);
    if (!k) return res.status(404).json({ success: false, error: "Kalit topilmadi" });
    const settings = getAiSettings();
    const provider = k.provider || settings.defaultProvider || 'gemini';
    const model = settings.defaultModel || (provider === 'openai' ? 'gpt-3.5-turbo' : 'gemini-1.5-flash');
    if (provider === 'gemini') {
      const { reply, model: workingModel } = await tryGeminiGenerate(k.apiKey, model, 'Salom, bu test. Bir so\'z bilan javob ber.');
      if (settings.defaultModel !== workingModel) {
        settings.defaultModel = workingModel;
        setAiSettings(settings);
      }
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
      return res.status(400).json({ success: false, error: data.error?.message || "OpenAI xatosi" });
    }
    return res.status(400).json({ success: false, error: `Provider "${provider}" qo'llab-quvvatlanmaydi` });
  } catch (err) {
    let msg = err.message || 'Noma\'lum xato';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) msg = "Kalit noto'g'ri yoki faollashtirilmagan.";
    else if (msg.includes('429')) msg = "Limit vaqtincha tugagan.";
    return res.status(400).json({ success: false, error: msg });
  }
});

app.delete('/api/ai/keys/:id', (req, res) => {
  try {
    if (!deleteAiKey(req.params.id)) return res.status(404).json({ success: false, error: "Kalit topilmadi" });
    res.json({ success: true });
  } catch (err) {
    console.error("AI kalitni o'chirishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== AI: STATS =====
app.get('/api/ai/stats', (_req, res) => {
  try {
    const td = today();
    const keys = getAiKeys();
    let totalUsed = 0;
    let totalLimit = 0;
    let activeCount = 0;
    for (const k of keys) {
      const usedToday = k.usedDate === td ? k.used : 0;
      totalUsed += usedToday;
      totalLimit += k.dailyLimit;
      if (k.active) activeCount += 1;
    }
    res.json({
      success: true,
      data: { keysTotal: keys.length, keysActive: activeCount, usedToday: totalUsed, dailyLimit: totalLimit, date: td }
    });
  } catch (err) {
    console.error("AI statistikasini olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== AI CHAT ENDPOINT =====
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: "Xabar kiritilmadi" });
  }

  const settings = getAiSettings();

  if (!settings.enabled) {
    return res.status(503).json({ success: false, error: "AI hozircha o'chirilgan. Administrator yoqishini kuting." });
  }

  const keyDoc = pickNextActiveKey();
  if (!keyDoc) {
    return res.status(503).json({ success: false, error: "Faol API kalit topilmadi yoki kunlik limit tugagan. Administratorga murojaat qiling." });
  }

  const apiKey = keyDoc.apiKey;
  const provider = keyDoc.provider || settings.defaultProvider || 'gemini';
  const systemPrompt = settings.systemPrompt;

  try {
    let reply;

    if (provider === 'gemini') {
      const { reply: r, model: workingModel } = await tryGeminiGenerate(
        apiKey,
        settings.defaultModel || 'gemini-1.5-flash',
        `${systemPrompt}\n\nFoydalanuvchi: ${message}`
      );
      reply = r;
      if (settings.defaultModel !== workingModel) {
        settings.defaultModel = workingModel;
        setAiSettings(settings);
      }

    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: settings.defaultModel || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_tokens: 1000
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0]) {
        reply = data.choices[0].message.content;
      } else {
        throw new Error(data.error?.message || "OpenAI xatosi");
      }

    } else {
      return res.status(400).json({ success: false, error: `"${provider}" provider hozircha qo'llab-quvvatlanmaydi` });
    }

    // Increment usage counter
    const newUsed = (keyDoc.usedDate === today() ? keyDoc.used : 0) + 1;
    updateAiKey(keyDoc._id, { used: newUsed, usedDate: today() });

    return res.json({ success: true, reply });

  } catch (err) {
    console.error('AI Error:', err.message);

    let userMessage = "AI bilan bog'lanishda xatolik yuz berdi";
    if (err.message && err.message.includes('429')) {
      userMessage = "API limit tugagan. Iltimos, biroz kutib qayta urinib ko'ring.";
    } else if (err.message && err.message.includes('API_KEY_INVALID')) {
      userMessage = "API kalit noto'g'ri. Administrator kalitni almashtirishi kerak.";
    } else if (err.message && err.message.includes('quota')) {
      userMessage = "Kunlik limit tugagan. Boshqa kalit qo'shilishi yoki ertaga urinish kerak.";
    }

    return res.status(500).json({ success: false, error: userMessage });
  }
});

// ===== AI: TEST CONNECTION (admin only) =====
// Verifies an API key by sending a tiny ping prompt — useful right after adding a new key.
// Common Gemini model names — try them in order until one succeeds.
// Google deprecates/renames models periodically, so we fall back through known good ones.
const GEMINI_MODEL_FALLBACKS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-pro',
  'gemini-2.0-flash-exp'
];

// Fetch models actually available for this API key, via REST.
// Returns a sorted list of generateContent-capable model IDs (short form, no "models/" prefix).
const listGeminiModels = async (apiKey) => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  const data = await r.json();
  if (!r.ok) {
    const msg = data.error?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => (m.name || '').replace(/^models\//, ''))
    .filter(Boolean);
  // Prefer common, cheaper "flash" models first
  models.sort((a, b) => {
    const score = (n) => (n.includes('flash') ? 0 : 1) + (n.includes('latest') ? 0 : 0.1) + (n.includes('exp') ? 1 : 0);
    return score(a) - score(b);
  });
  return models;
};

const tryGeminiGenerate = async (apiKey, preferredModel, prompt) => {
  // Build candidate list: preferred → live list from Google → static fallbacks.
  let liveModels = [];
  try {
    liveModels = await listGeminiModels(apiKey);
  } catch (err) {
    // Auth / quota errors should surface immediately
    const msg = err.message || String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('PERMISSION_DENIED') || msg.includes('429')) {
      throw err;
    }
    // Otherwise keep going with static fallbacks
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
      return { reply: result.response.text(), model: name, available: liveModels };
    } catch (err) {
      const msg = err.message || String(err);
      lastErr = err;
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('PERMISSION_DENIED') || msg.includes('429')) {
        throw err;
      }
    }
  }
  if (lastErr) {
    const liveList = liveModels.length ? ` Mavjud modellar: ${liveModels.slice(0, 5).join(', ')}.` : '';
    const wrapped = new Error((lastErr.message || 'Model topilmadi.') + liveList);
    throw wrapped;
  }
  throw new Error('Hech qanday model ishlamadi');
};

// List the Gemini models the supplied key has access to. Helps admin pick the right one.
app.post('/api/ai/list-models', async (req, res) => {
  const apiKey = (req.body?.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ success: false, error: "API kalit kiritilmadi" });
  try {
    const models = await listGeminiModels(apiKey);
    res.json({ success: true, models });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || String(err) });
  }
});

app.post('/api/ai/test', async (req, res) => {
  let { apiKey, provider, model } = req.body;
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ success: false, error: "API kalit kiritilmadi" });
  }
  apiKey = apiKey.trim(); // strip whitespace that often sneaks in on paste
  const usedProvider = (provider || 'gemini').toLowerCase();
  try {
    if (usedProvider === 'gemini') {
      if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
        return res.status(400).json({
          success: false,
          error: "Kalit shakli noto'g'ri ko'rinadi. Gemini kaliti 'AIza' bilan boshlanadi va ~39 belgi. Google AI Studio (https://aistudio.google.com/app/apikey) sahifasidan to'liq nusxalang."
        });
      }
      const { reply, model: workingModel } = await tryGeminiGenerate(apiKey, model, 'Salom, bu test. Bir so\'z bilan javob ber.');
      // Auto-update settings to remember the working model
      const settings = getAiSettings();
      if (settings.defaultModel !== workingModel) {
        settings.defaultModel = workingModel;
        setAiSettings(settings);
      }
      return res.json({ success: true, reply: (reply || '').slice(0, 200), model: workingModel });
    }
    if (usedProvider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'salom' }],
          max_tokens: 20
        })
      });
      const data = await r.json();
      if (data.choices && data.choices[0]) {
        return res.json({ success: true, reply: data.choices[0].message.content });
      }
      return res.status(400).json({ success: false, error: data.error?.message || "OpenAI bilan bog'lanib bo'lmadi" });
    }
    return res.status(400).json({ success: false, error: `"${usedProvider}" provider qo'llab-quvvatlanmaydi (gemini/openai)` });
  } catch (err) {
    const raw = err.message || String(err);
    let msg = raw;
    if (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
      msg = "API kalit noto'g'ri (API_KEY_INVALID). Sabablari: 1) kalit yangi yaratilgan, 1-2 daqiqa kuting; 2) bo'sh joy/kesilgan belgilar; 3) Google AI Studio'da region cheklovi; 4) loyiha uchun Gemini API yoqilmagan. Asl xato: " + raw;
    } else if (raw.includes('PERMISSION_DENIED')) {
      msg = "Ruxsat rad etildi (PERMISSION_DENIED). Loyihada Gemini API yoqilganiga ishonch hosil qiling.";
    } else if (raw.includes('429')) {
      msg = "So'rovlar limiti vaqtincha tugagan (429). Bir necha daqiqadan keyin urinib ko'ring.";
    } else if (raw.toLowerCase().includes('not found') && raw.toLowerCase().includes('model')) {
      msg = "Model topilmadi. " + raw;
    }
    return res.status(400).json({ success: false, error: msg });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

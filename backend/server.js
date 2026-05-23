const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Ulanish
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/huquq_db')
  .then(() => console.log('MongoDB bazasiga ulanish muvaffaqiyatli!'))
  .catch((err) => console.error('MongoDB ulanishda xatolik:', err));


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

// ===== AI: schemas =====
const aiKeySchema = new mongoose.Schema({
  name: { type: String, required: true },
  apiKey: { type: String, required: true },
  provider: { type: String, default: 'gemini' }, // 'gemini' | 'openai' | 'claude'
  dailyLimit: { type: Number, default: 1500 },
  used: { type: Number, default: 0 },
  usedDate: { type: String, default: '' }, // YYYY-MM-DD; auto-reset on new day
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const AiKey = mongoose.model('AiKey', aiKeySchema);

const aiSettingsSchema = new mongoose.Schema({
  systemPrompt: {
    type: String,
    default: "Sen O'zbekiston huquqiy yordamchisissan. Foydalanuvchilarga O'zbekiston Konstitutsiyasi, qonunlari, huquqiy tizimi, bola huquqlari konvensiyasi va boshqa huquqiy mavzular bo'yicha yordam berasan. Javoblaringni o'zbek tilida, tushunarli va aniq qilib yoz. Agar savol huquqqa tegishli bo'lmasa ham, do'stona javob ber."
  },
  greeting: {
    type: String,
    default: "Assalomu alaykum! Men sizning huquqiy yordamchingizman. Menga istalgan savolingizni bering — huquq, qonunlar, konvensiyalar bo'yicha yordam beraman."
  },
  enabled: { type: Boolean, default: true },
  defaultProvider: { type: String, default: 'gemini' },
  defaultModel: { type: String, default: 'gemini-2.0-flash-lite' }
});

const AiSettings = mongoose.model('AiSettings', aiSettingsSchema);

// ===== Subscriptions (to'lov ro'yxati) =====
const subscriptionSchema = new mongoose.Schema({
  userLogin: { type: String, required: true },
  userName: { type: String, default: '' },
  tier: { type: String, enum: ['pro', 'max'], required: true },
  duration: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
  amount: { type: Number, required: true },
  paidAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  cardLast4: { type: String, default: '' }
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);

const ensureAiSettings = async () => {
  try {
    const existing = await AiSettings.findOne({});
    if (!existing) {
      await new AiSettings({}).save();
      console.log("Default AI sozlamalari yaratildi.");
    }
  } catch (err) {
    console.error("AI sozlamalarini boshlashda xatolik:", err);
  }
};

const today = () => new Date().toISOString().slice(0, 10);

const pickNextActiveKey = async () => {
  const td = today();
  const keys = await AiKey.find({ active: true });
  // Auto-reset used counter at midnight
  for (const k of keys) {
    if (k.usedDate !== td) {
      k.used = 0;
      k.usedDate = td;
      await k.save();
    }
  }
  const available = keys.filter(k => k.used < k.dailyLimit);
  if (available.length === 0) return null;
  // Pick the one with the most remaining budget
  available.sort((a, b) => (b.dailyLimit - b.used) - (a.dailyLimit - a.used));
  return available[0];
};

// Boshlang'ich ma'lumotlarni kiritish (Seed)
const seedBooks = async () => {
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

seedBooks();
seedTests();
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

// ===== SUBSCRIPTIONS =====
// Auto-mark expired subscriptions on every read
const refreshSubscriptionStatuses = async () => {
  const now = new Date();
  await Subscription.updateMany(
    { status: 'active', expiresAt: { $lt: now } },
    { $set: { status: 'expired' } }
  );
};

app.get('/api/subscriptions', async (_req, res) => {
  try {
    await refreshSubscriptionStatuses();
    const list = await Subscription.find({}).sort({ paidAt: -1 });
    res.json({ success: true, data: list });
  } catch (err) {
    console.error("Obunalarni olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.get('/api/subscriptions/stats', async (_req, res) => {
  try {
    await refreshSubscriptionStatuses();
    const all = await Subscription.find({});
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
    // Distinct users
    const uniqueUsers = new Set(all.map(s => s.userLogin)).size;

    res.json({
      success: true,
      data: {
        total: all.length,
        activeCount: active.length,
        uniqueUsers,
        proCount,
        maxCount,
        proActive,
        maxActive,
        totalRevenue,
        monthlyRevenue
      }
    });
  } catch (err) {
    console.error("Obuna statistikasini olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.post('/api/subscriptions', async (req, res) => {
  try {
    const { userLogin, userName, tier, duration, amount, expiresAt, cardLast4 } = req.body;
    if (!userLogin || !tier || !duration || amount === undefined || !expiresAt) {
      return res.status(400).json({ success: false, error: "Ma'lumotlar to'liq emas" });
    }
    // Mark previous active subs of this user as cancelled (new one supersedes)
    await Subscription.updateMany(
      { userLogin, status: 'active' },
      { $set: { status: 'cancelled' } }
    );
    const sub = await new Subscription({
      userLogin,
      userName: userName || '',
      tier,
      duration,
      amount,
      expiresAt: new Date(expiresAt),
      cardLast4: cardLast4 || ''
    }).save();
    res.json({ success: true, data: sub });
  } catch (err) {
    console.error("Obuna saqlashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.delete('/api/subscriptions/:id', async (req, res) => {
  try {
    const removed = await Subscription.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ success: false, error: "Obuna topilmadi" });
    res.json({ success: true });
  } catch (err) {
    console.error("Obuna o'chirishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== AI: SETTINGS =====
app.get('/api/ai/settings', async (_req, res) => {
  try {
    let settings = await AiSettings.findOne({});
    if (!settings) settings = await new AiSettings({}).save();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("AI sozlamalarini olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.put('/api/ai/settings', async (req, res) => {
  try {
    const { systemPrompt, greeting, enabled, defaultProvider, defaultModel } = req.body;
    let settings = await AiSettings.findOne({});
    if (!settings) settings = new AiSettings({});
    if (systemPrompt !== undefined) settings.systemPrompt = systemPrompt;
    if (greeting !== undefined) settings.greeting = greeting;
    if (enabled !== undefined) settings.enabled = enabled;
    if (defaultProvider !== undefined) settings.defaultProvider = defaultProvider;
    if (defaultModel !== undefined) settings.defaultModel = defaultModel;
    await settings.save();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("AI sozlamalarini yangilashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== AI: KEYS CRUD =====
const sanitizeKey = (k) => {
  const obj = k.toObject ? k.toObject() : k;
  const full = obj.apiKey || '';
  return {
    _id: obj._id,
    name: obj.name,
    provider: obj.provider,
    dailyLimit: obj.dailyLimit,
    used: obj.used,
    usedDate: obj.usedDate,
    active: obj.active,
    createdAt: obj.createdAt,
    keyMasked: full.length > 8 ? full.slice(0, 4) + '...' + full.slice(-4) : '***'
  };
};

app.get('/api/ai/keys', async (_req, res) => {
  try {
    const keys = await AiKey.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: keys.map(sanitizeKey) });
  } catch (err) {
    console.error("AI kalitlarini olishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.post('/api/ai/keys', async (req, res) => {
  try {
    const { name, apiKey, provider, dailyLimit, active } = req.body;
    if (!name || !apiKey) {
      return res.status(400).json({ success: false, error: "Nom va API kalit majburiy" });
    }
    const created = await new AiKey({
      name,
      apiKey,
      provider: provider || 'gemini',
      dailyLimit: dailyLimit ?? 1500,
      active: active !== false,
      usedDate: today()
    }).save();
    res.json({ success: true, data: sanitizeKey(created) });
  } catch (err) {
    console.error("AI kalit saqlashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.put('/api/ai/keys/:id', async (req, res) => {
  try {
    const { name, apiKey, provider, dailyLimit, active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (apiKey !== undefined && apiKey !== '') update.apiKey = apiKey;
    if (provider !== undefined) update.provider = provider;
    if (dailyLimit !== undefined) update.dailyLimit = dailyLimit;
    if (active !== undefined) update.active = active;
    const updated = await AiKey.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ success: false, error: "Kalit topilmadi" });
    res.json({ success: true, data: sanitizeKey(updated) });
  } catch (err) {
    console.error("AI kalitni yangilashda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

app.delete('/api/ai/keys/:id', async (req, res) => {
  try {
    const removed = await AiKey.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ success: false, error: "Kalit topilmadi" });
    res.json({ success: true });
  } catch (err) {
    console.error("AI kalitni o'chirishda xatolik:", err);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

// ===== AI: STATS =====
app.get('/api/ai/stats', async (_req, res) => {
  try {
    const td = today();
    const keys = await AiKey.find({});
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
      data: {
        keysTotal: keys.length,
        keysActive: activeCount,
        usedToday: totalUsed,
        dailyLimit: totalLimit,
        date: td
      }
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

  let settings = await AiSettings.findOne({});
  if (!settings) settings = await new AiSettings({}).save();

  if (!settings.enabled) {
    return res.status(503).json({ success: false, error: "AI hozircha o'chirilgan. Administrator yoqishini kuting." });
  }

  const keyDoc = await pickNextActiveKey();
  if (!keyDoc) {
    return res.status(503).json({ success: false, error: "Faol API kalit topilmadi yoki kunlik limit tugagan. Administratorga murojaat qiling." });
  }

  const apiKey = keyDoc.apiKey;
  const provider = keyDoc.provider || settings.defaultProvider || 'gemini';
  const systemPrompt = settings.systemPrompt;

  try {
    let reply;

    if (provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: settings.defaultModel || 'gemini-2.0-flash-lite' });
      const result = await model.generateContent(`${systemPrompt}\n\nFoydalanuvchi: ${message}`);
      reply = result.response.text();

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
    keyDoc.used = (keyDoc.usedDate === today() ? keyDoc.used : 0) + 1;
    keyDoc.usedDate = today();
    await keyDoc.save();

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

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

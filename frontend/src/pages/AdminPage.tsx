import React, { useState, useEffect } from 'react';
import { apiUrl } from '../config';
import * as aiStore from '../ai-store';
import * as paymentsStore from '../payments-store';
import * as usersStore from '../users-store';
import {
  ShieldCheck, Lock, LayoutDashboard, BookOpen,
  Plus, Edit, Trash2, Save, X, PlusCircle, HelpCircle,
  BookOpenCheck, BookMarked, Bot, KeyRound, Power,
  Wallet, Users, TrendingUp, Calendar
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface Question {
  questionText: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface Test {
  _id?: string;
  grade: number;
  title: string;
  questions: Question[];
}

interface Book {
  _id?: string;
  grade: number;
  title: string;
  subtitle: string;
  color: string;
  code: string;
  pages: string[];
}

interface AiKey {
  _id: string;
  name: string;
  provider: string;
  dailyLimit: number;
  used: number;
  usedDate: string;
  active: boolean;
  keyMasked: string;
}

interface AiSettings {
  systemPrompt: string;
  greeting: string;
  enabled: boolean;
  defaultProvider: string;
  defaultModel: string;
}

interface Subscription {
  _id: string;
  userLogin: string;
  userName: string;
  tier: 'pro' | 'max';
  duration: 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  paidAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'cancelled';
  cardLast4: string;
}

interface SubscriptionStats {
  total: number;
  activeCount: number;
  uniqueUsers: number;
  proCount: number;
  maxCount: number;
  proActive: number;
  maxActive: number;
  totalRevenue: number;
  monthlyRevenue: number;
}

const formatPrice = (n: number) => n.toLocaleString('uz-UZ').replace(/,/g, ' ') + " so'm";
const formatDate = (s: string) => new Date(s).toLocaleDateString('uz-UZ');
const DURATION_LABELS: Record<string, string> = { monthly: '1 oy', quarterly: '3 oy', yearly: '1 yil' };

const PRESET_COLORS = [
  { name: 'Ko\'k (Dark)', hex: '#1e3a8a' },
  { name: 'Yashil (Dark)', hex: '#14532d' },
  { name: 'Jigarrang (Dark)', hex: '#713f12' },
  { name: 'To\'q Sariq', hex: '#ea580c' },
  { name: 'Siyohrang', hex: '#6b21a8' },
  { name: 'Ko\'k (Base)', hex: '#4338ca' }
];

const VALID_TABS = ['dashboard', 'books', 'tests', 'ai', 'payments'] as const;
type AdminTab = typeof VALID_TABS[number];

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('huquq_admin_authed') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Navigation — synced with ?tab= URL param
  const tabParam = searchParams.get('tab');
  const activeTab: AdminTab = (VALID_TABS as readonly string[]).includes(tabParam || '')
    ? (tabParam as AdminTab)
    : 'dashboard';

  const setActiveTab = (tab: AdminTab) => {
    if (tab === 'dashboard') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tab);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Stats State
  const [stats, setStats] = useState({ books: 0, tests: 0, questions: 0 });

  // Data Lists
  const [books, setBooks] = useState<Book[]>([]);
  const [tests, setTests] = useState<Test[]>([]);

  // AI State
  const [aiKeys, setAiKeys] = useState<AiKey[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    systemPrompt: '',
    greeting: '',
    enabled: true,
    defaultProvider: 'gemini',
    defaultModel: 'gemini-2.0-flash-lite'
  });
  const [aiStats, setAiStats] = useState({ keysTotal: 0, keysActive: 0, usedToday: 0, dailyLimit: 0 });
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [newAiKey, setNewAiKey] = useState({ name: '', apiKey: '', provider: 'gemini', dailyLimit: 1500 });

  // Subscriptions State
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subStats, setSubStats] = useState<SubscriptionStats>({
    total: 0, activeCount: 0, uniqueUsers: 0,
    proCount: 0, maxCount: 0, proActive: 0, maxActive: 0,
    totalRevenue: 0, monthlyRevenue: 0
  });
  const [subFilter, setSubFilter] = useState<'all' | 'active' | 'pro' | 'max'>('all');

  // Modals & Editors
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [isNewBook, setIsNewBook] = useState(false);
  const [isNewTest, setIsNewTest] = useState(false);

  // Book Pages management
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(-1);
  const [pageEditorContent, setPageEditorContent] = useState<string>('');

  // Messages
  const [notification, setNotification] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Fetch initial data
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchBooks();
      fetchTests();
      fetchAiSettings();
      fetchAiKeys();
      fetchAiStats();
      fetchSubscriptions();
      fetchSubStats();
    }
  }, [isAuthenticated]);

  // Live-refresh AI data so admin always sees the server-side state — e.g.
  // when this tab regains focus after another admin made changes elsewhere,
  // or when the user navigates back to /admin after editing AI settings.
  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () => {
      fetchAiSettings();
      fetchAiKeys();
      fetchAiStats();
    };
    window.addEventListener('huquq-ai-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('huquq-ai-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [isAuthenticated]);

  // Live-refresh payments when a user completes a purchase (same-tab event),
  // when another tab writes to localStorage (Chrome multi-tab), or when the
  // admin tab regains focus after switching back from the user tab.
  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () => { fetchSubscriptions(); };
    window.addEventListener('huquq-payments-change', refresh);
    window.addEventListener('huquq-payment-change', refresh);
    // huquq-users-change fires when a new user is registered / login
    // upserts — that's when trial-tier counts change.
    window.addEventListener('huquq-users-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('huquq-payments-change', refresh);
      window.removeEventListener('huquq-payment-change', refresh);
      window.removeEventListener('huquq-users-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [isAuthenticated]);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(apiUrl('/api/stats'));
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Stats loading failed', err);
    }
  };

  const fetchBooks = async () => {
    try {
      const res = await fetch(apiUrl('/api/books'));
      const data = await res.json();
      if (data.success) {
        setBooks(data.data);
      }
    } catch (err) {
      console.error('Books loading failed', err);
    }
  };

  const fetchTests = async () => {
    try {
      const res = await fetch(apiUrl('/api/tests'));
      const data = await res.json();
      if (data.success) {
        setTests(data.data);
      }
    } catch (err) {
      console.error('Tests loading failed', err);
    }
  };

  // ===== AI handlers (backend-first via /api/ai/*; localStorage cache) =====
  // Sync from backend so any admin on any browser/device sees the same data
  // (the user explicitly asked for this — see commit message).
  const fetchAiSettings = async () => {
    const s = await aiStore.refreshAiSettings();
    setAiSettings(s as unknown as AiSettings);
  };
  const fetchAiKeys = async () => {
    const keys = await aiStore.refreshAiKeys();
    setAiKeys(keys as unknown as AiKey[]);
  };
  const fetchAiStats = async () => {
    setAiStats(await aiStore.refreshAiStats());
  };

  const handleSaveAiSettings = async () => {
    try {
      const saved = await aiStore.saveAiSettings(aiSettings as unknown as aiStore.AiSettings);
      setAiSettings(saved as unknown as AiSettings);
      showNotification("AI sozlamalari saqlandi");
    } catch (err) {
      showNotification((err as Error).message || "Saqlanmadi", 'error');
    }
  };

  const handleCreateAiKey = async () => {
    if (!newAiKey.name.trim() || !newAiKey.apiKey.trim()) {
      showNotification("Nom va kalitni to'ldiring", 'error');
      return;
    }
    try {
      await aiStore.createAiKey({
        name: newAiKey.name,
        apiKey: newAiKey.apiKey,
        provider: newAiKey.provider as 'gemini' | 'openai',
        dailyLimit: newAiKey.dailyLimit
      });
      setNewAiKey({ name: '', apiKey: '', provider: 'gemini', dailyLimit: 1500 });
      setShowAddKeyModal(false);
      await Promise.all([fetchAiKeys(), fetchAiStats(), fetchAiSettings()]);
      showNotification("Yangi kalit qo'shildi");
    } catch (err) {
      showNotification((err as Error).message || "Kalit qo'shilmadi", 'error');
    }
  };

  const handleToggleAiKey = async (k: AiKey) => {
    try {
      await aiStore.updateAiKey(k._id, { active: !k.active });
      await Promise.all([fetchAiKeys(), fetchAiStats()]);
    } catch (err) {
      showNotification((err as Error).message || "Yangilanmadi", 'error');
    }
  };

  const handleUpdateAiKeyLimit = async (id: string, dailyLimit: number) => {
    try {
      await aiStore.updateAiKey(id, { dailyLimit });
      await Promise.all([fetchAiKeys(), fetchAiStats()]);
    } catch (err) {
      showNotification((err as Error).message || "Yangilanmadi", 'error');
    }
  };

  // ===== Subscription handlers =====
  const fetchSubscriptions = async () => {
    // Merge backend + localStorage so admin sees payments even when backend
    // isn't running (Vercel deploy, dev forgot to start Express, etc).
    const merged = await paymentsStore.fetchAllPayments();
    setSubscriptions(merged as unknown as Subscription[]);

    // Also include free-trial users (those granted 30-day Pro via the
    // launch promo) so the Pro/Max counts on the dashboard reflect the
    // *real* number of users with an active subscription, not just those
    // who paid money. Synthetic records are tagged 'trial' so they show
    // up clearly in the list and don't inflate the revenue numbers.
    const users = await usersStore.fetchAllUsers();
    const paidLogins = new Set(
      merged.map(p => (p.userLogin || '').toLowerCase()).filter(Boolean)
    );
    const now = Date.now();
    const trialRecords: paymentsStore.Subscription[] = users
      .filter(u =>
        u.paidTier &&
        u.paidUntil &&
        new Date(u.paidUntil).getTime() > now &&
        !paidLogins.has(u.login.toLowerCase())
      )
      .map(u => ({
        _id: 'trial_' + u.login.toLowerCase(),
        userLogin: u.login,
        userName: [u.firstName, u.lastName].filter(Boolean).join(' ').trim(),
        tier: (u.paidTier as 'pro' | 'max'),
        duration: 'monthly' as const,
        amount: 0,
        paidAt: u.createdAt,
        expiresAt: u.paidUntil as string,
        status: 'active' as const,
        cardLast4: '',
        _source: 'local' as const
      }));

    const combined = [...merged, ...trialRecords];
    // Recompute stats from the combined list — Pro/Max trial users are now
    // counted, but `totalRevenue`/`monthlyRevenue` stay at 0 for trials.
    setSubStats(paymentsStore.computeStats(combined) as unknown as SubscriptionStats);
    setSubscriptions(combined as unknown as Subscription[]);
  };

  const fetchSubStats = async () => {
    // Kept as a no-op alias — stats are recomputed inside fetchSubscriptions.
    // Backend's /api/subscriptions/stats endpoint is still polled for parity
    // when reachable, but the merged-source view is authoritative.
  };

  const handleDeleteSubscription = async (id: string) => {
    if (!window.confirm("Haqiqatan ham ushbu to'lov yozuvini o'chirmoqchimisiz?")) return;
    // Local-only records (clientId starts with "loc_") can be deleted right
    // here without a round-trip. Backend records still try the API delete.
    const isLocal = typeof id === 'string' && id.startsWith('loc_');
    if (isLocal) {
      paymentsStore.deleteLocalPayment(id);
      fetchSubscriptions();
      showNotification("Yozuv o'chirildi");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/subscriptions/${id}`), { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        fetchSubscriptions();
        showNotification("Yozuv o'chirildi");
      } else {
        showNotification(data.error || "O'chirilmadi", 'error');
      }
    } catch (err) {
      // Backend unreachable — try the local store anyway (covers the case
      // where the record lives only locally despite not having a loc_ prefix).
      if (paymentsStore.deleteLocalPayment(id)) {
        fetchSubscriptions();
        showNotification("Yozuv o'chirildi (lokal)");
      } else {
        showNotification("Backend ishlamayapti. Backend papkasida 'npm start' bilan ishga tushiring (port 5000).", 'error');
      }
    }
  };

  const handleDeleteAiKey = async (id: string) => {
    if (!window.confirm("Haqiqatan ham ushbu kalitni o'chirmoqchimisiz?")) return;
    try {
      await aiStore.deleteAiKey(id);
      await Promise.all([fetchAiKeys(), fetchAiStats()]);
      showNotification("Kalit o'chirildi");
    } catch (err) {
      showNotification((err as Error).message || "O'chirilmadi", 'error');
    }
  };

  const handleTestAiKey = async (id: string) => {
    showNotification("Kalit tekshirilmoqda...");
    try {
      const { reply, model } = await aiStore.testSavedAiKey(id);
      // Backend may have auto-updated default model — pull fresh settings.
      await fetchAiSettings();
      showNotification(`Kalit ishlayapti (${model}) — javob: "${(reply || '').slice(0, 80)}"`);
    } catch (err) {
      showNotification((err as Error).message || "Kalit ishlamadi", 'error');
    }
  };

  const handleTestNewKey = async () => {
    if (!newAiKey.apiKey.trim()) {
      showNotification("Avval API kalitni kiriting", 'error');
      return;
    }
    showNotification("Kalit tekshirilmoqda...");
    try {
      const { reply, model } = await aiStore.testInlineAiKey(
        newAiKey.apiKey.trim(),
        newAiKey.provider as 'gemini' | 'openai',
        aiSettings.defaultModel
      );
      await fetchAiSettings();
      showNotification(`Kalit to'g'ri (${model}) — javob: "${(reply || '').slice(0, 80)}"`);
    } catch (err) {
      showNotification((err as Error).message || "Kalit ishlamadi", 'error');
    }
  };

  // Auth Handling
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'admin123') {
      setIsAuthenticated(true);
      localStorage.setItem('huquq_user_profile', JSON.stringify({
        firstName: 'Administrator',
        lastName: 'Tizim',
        login: 'admin',
        password: 'admin123'
      }));
      localStorage.setItem('huquq_user_logged_in', 'true');
      localStorage.setItem('huquq_admin_authed', 'true');
      window.dispatchEvent(new Event('huquq-auth-change'));
      setAuthError('');
      showNotification('Xush kelibsiz, Admin!');
    } else {
      setAuthError('Noto\'g\'ri parol! Qayta urinib ko\'ring.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('huquq_admin_authed');
    localStorage.removeItem('huquq_user_logged_in');
    localStorage.removeItem('huquq_user_profile');
    // Do not touch huquq_user_avatar — that's the regular user's avatar.
    // Admin's avatar is stored under huquq_admin_avatar and persists across sessions.
    window.dispatchEvent(new Event('huquq-auth-change'));
    navigate('/');
  };

  // BOOK OPERATIONS
  const handleCreateBookClick = () => {
    setEditingBook({
      grade: 11,
      title: '',
      subtitle: '',
      color: '#1e3a8a',
      code: '',
      pages: []
    });
    setIsNewBook(true);
    setSelectedPageIndex(-1);
    setPageEditorContent('');
  };

  const handleEditBookClick = (book: Book) => {
    setEditingBook({ ...book });
    setIsNewBook(false);
    setSelectedPageIndex(-1);
    setPageEditorContent('');
  };

  const handleSaveBook = async () => {
    if (!editingBook) return;
    if (!editingBook.title || !editingBook.code) {
      showNotification('Sarlavha va Kod maydonlarini to\'ldiring', 'error');
      return;
    }

    try {
      const url = isNewBook 
        ? apiUrl('/api/books') 
        : apiUrl(`/api/books/${editingBook._id}`);
      const method = isNewBook ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingBook)
      });
      const data = await res.json();

      if (data.success) {
        showNotification(isNewBook ? 'Yangi darslik muvaffaqiyatli qo\'shildi!' : 'Darslik muvaffaqiyatli yangilandi!');
        setEditingBook(null);
        fetchBooks();
        fetchStats();
      } else {
        showNotification(data.error || 'Amal bajarilmadi', 'error');
      }
    } catch (err) {
      showNotification("Backend ishlamayapti. Backend papkasida 'npm start' bilan ishga tushiring (port 5000).", 'error');
    }
  };

  const handleDeleteBook = async (id?: string) => {
    if (!id || !window.confirm('Haqiqatan ham ushbu darslikni o\'chirmoqchimisiz?')) return;

    try {
      const res = await fetch(apiUrl(`/api/books/${id}`), {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        showNotification('Darslik o\'chirildi');
        fetchBooks();
        fetchStats();
      } else {
        showNotification(data.error || 'O\'chirish amalga oshmadi', 'error');
      }
    } catch (err) {
      showNotification("Backend ishlamayapti. Backend papkasida 'npm start' bilan ishga tushiring (port 5000).", 'error');
    }
  };

  // BOOK PAGES ACTIONS
  const handleAddPage = () => {
    if (!editingBook) return;
    const newPages = [...editingBook.pages, `
<div class="constitution-chapter" style="text-align: center; font-size: 1.3rem; margin-bottom: 15px;">Yangi Bo'lim</div>
<div class="constitution-article">
  <span class="article-number">1-modda.</span> Modda matnini bu yerga yozing...
</div>
`];
    setEditingBook({ ...editingBook, pages: newPages });
    setSelectedPageIndex(newPages.length - 1);
    setPageEditorContent(newPages[newPages.length - 1]);
  };

  const handlePageSelect = (index: number) => {
    if (!editingBook) return;
    setSelectedPageIndex(index);
    setPageEditorContent(editingBook.pages[index] || '');
  };

  const handlePageContentSave = () => {
    if (!editingBook || selectedPageIndex === -1) return;
    const updatedPages = [...editingBook.pages];
    updatedPages[selectedPageIndex] = pageEditorContent;
    setEditingBook({ ...editingBook, pages: updatedPages });
    showNotification('Sahifa tarkibi xotiraga olindi (Kitobni saqlashni unutmang)');
  };

  const handleDeletePage = (index: number) => {
    if (!editingBook || !window.confirm('Sahifani o\'chirmoqchimisiz?')) return;
    const updatedPages = editingBook.pages.filter((_, i) => i !== index);
    setEditingBook({ ...editingBook, pages: updatedPages });
    setSelectedPageIndex(-1);
    setPageEditorContent('');
    showNotification('Sahifa olib tashlandi');
  };

  // TEST OPERATIONS
  const handleCreateTestClick = () => {
    setEditingTest({
      grade: 11,
      title: '',
      questions: []
    });
    setIsNewTest(true);
  };

  const handleEditTestClick = (test: Test) => {
    setEditingTest({ ...test });
    setIsNewTest(false);
  };

  const handleSaveTest = async () => {
    if (!editingTest) return;
    
    // Trim title
    const titleTrimmed = editingTest.title.trim();
    if (!titleTrimmed) {
      showNotification('Test sarlavhasini kiriting', 'error');
      return;
    }

    // Validate questions count
    if (!editingTest.questions || editingTest.questions.length === 0) {
      showNotification('Kamida bitta savol qo\'shing', 'error');
      return;
    }

    // Validate each question
    for (let i = 0; i < editingTest.questions.length; i++) {
      const q = editingTest.questions[i];
      if (!q.questionText || !q.questionText.trim()) {
        showNotification(`${i + 1}-savol matnini kiriting`, 'error');
        return;
      }
      
      if (!q.options || q.options.length !== 4) {
        showNotification(`${i + 1}-savolda variantlar soni 4 ta bo'lishi kerak`, 'error');
        return;
      }

      for (let oIdx = 0; oIdx < 4; oIdx++) {
        if (!q.options[oIdx] || !q.options[oIdx].trim()) {
          const optLetter = String.fromCharCode(65 + oIdx);
          showNotification(`${i + 1}-savolning ${optLetter}-variantini kiriting`, 'error');
          return;
        }
      }

      if (q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer > 3) {
        showNotification(`${i + 1}-savolning to'g'ri javobini ko'rsating`, 'error');
        return;
      }
    }

    // Prepare cleaned data
    const cleanedQuestions = editingTest.questions.map(q => ({
      questionText: q.questionText.trim(),
      options: q.options.map(opt => opt.trim()),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ? q.explanation.trim() : ''
    }));

    const cleanedTestData = {
      ...editingTest,
      title: titleTrimmed,
      questions: cleanedQuestions
    };

    try {
      const url = isNewTest 
        ? apiUrl('/api/tests') 
        : apiUrl(`/api/tests/${editingTest._id}`);
      const method = isNewTest ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedTestData)
      });
      const data = await res.json();

      if (data.success) {
        showNotification(isNewTest ? 'Yangi test muvaffaqiyatli qo\'shildi!' : 'Test muvaffaqiyatli yangilandi!');
        setEditingTest(null);
        fetchTests();
        fetchStats();
      } else {
        showNotification(data.error || 'Amal bajarilmadi', 'error');
      }
    } catch (err) {
      showNotification("Backend ishlamayapti. Backend papkasida 'npm start' bilan ishga tushiring (port 5000).", 'error');
    }
  };

  const handleDeleteTest = async (id?: string) => {
    if (!id || !window.confirm('Haqiqatan ham ushbu testni o\'chirmoqchimisiz?')) return;

    try {
      const res = await fetch(apiUrl(`/api/tests/${id}`), {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        showNotification('Test o\'chirildi');
        fetchTests();
        fetchStats();
      } else {
        showNotification(data.error || 'O\'chirish amalga oshmadi', 'error');
      }
    } catch (err) {
      showNotification("Backend ishlamayapti. Backend papkasida 'npm start' bilan ishga tushiring (port 5000).", 'error');
    }
  };

  // QUESTION ACTIONS
  const handleAddQuestion = () => {
    if (!editingTest) return;
    const newQuestions = [...editingTest.questions, {
      questionText: 'Yangi savol matni',
      options: ['A variant', 'B variant', 'C variant', 'D variant'],
      correctAnswer: 0,
      explanation: 'Tushuntirish matni'
    }];
    setEditingTest({ ...editingTest, questions: newQuestions });
  };

  const handleUpdateQuestion = (qIndex: number, field: keyof Question, value: any) => {
    if (!editingTest) return;
    const updatedQs = [...editingTest.questions];
    updatedQs[qIndex] = { ...updatedQs[qIndex], [field]: value };
    setEditingTest({ ...editingTest, questions: updatedQs });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    if (!editingTest) return;
    const updatedQs = [...editingTest.questions];
    const updatedOpts = [...updatedQs[qIndex].options];
    updatedOpts[optIndex] = value;
    updatedQs[qIndex] = { ...updatedQs[qIndex], options: updatedOpts };
    setEditingTest({ ...editingTest, questions: updatedQs });
  };

  const handleDeleteQuestion = (qIndex: number) => {
    if (!editingTest) return;
    const updatedQs = editingTest.questions.filter((_, i) => i !== qIndex);
    setEditingTest({ ...editingTest, questions: updatedQs });
  };


  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', animation: 'fadeIn 0.3s ease-in-out' }}>
        <div style={{ 
          background: 'var(--bg-card)', 
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border-color)', 
          borderRadius: '24px', 
          padding: '40px', 
          width: '100%', 
          maxWidth: '450px',
          boxShadow: 'var(--shadow-lg)',
          textAlign: 'center',
          position: 'relative'
        }}>
          <div style={{ 
            width: '72px', height: '72px', borderRadius: '50%', 
            backgroundColor: 'var(--primary-light)', color: 'var(--primary-base)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            margin: '0 auto 24px auto' 
          }}>
            <ShieldCheck size={40} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '8px' }}>Tizim boshqaruvi</h2>
          <p style={{ color: 'var(--text-gray)', fontSize: '15px', marginBottom: '32px' }}>Tizimga kirish uchun maxfiy parolni kiriting</p>

          <form onSubmit={handleLogin}>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                <Lock size={18} />
              </div>
              <input 
                type="password" 
                placeholder="Parolni kiriting..."
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                style={{ 
                  width: '100%', padding: '16px 16px 16px 44px', 
                  borderRadius: '12px', border: '1px solid #cbd5e1', 
                  fontSize: '15px', outline: 'none', transition: 'all 0.2s', 
                  boxSizing: 'border-box' 
                }}
              />
            </div>
            {authError && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', margin: '-10px 0 15px 0', textAlign: 'left', fontWeight: '500' }}>
                ⚠️ {authError}
              </p>
            )}

            <button 
              type="submit" 
              style={{ 
                width: '100%', padding: '16px', backgroundColor: 'var(--primary-base)', 
                color: '#fff', border: 'none', borderRadius: '12px', 
                fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', fontSize: '15px',
                boxShadow: '0 8px 15px rgba(79, 70, 229, 0.2)' 
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#312e81'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-base)'}
            >
              Kirish
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-in-out', padding: '20px' }}>
      
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          backgroundColor: notification.type === 'success' ? 'var(--success)' : 'var(--danger)',
          color: '#fff', padding: '14px 24px', borderRadius: '12px',
          boxShadow: '0 10px 20px rgba(0,0,0,0.1)', fontWeight: '600',
          animation: 'slideUp 0.3s ease-in-out', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          {notification.type === 'success' ? '✅' : '❌'} {notification.text}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 5px 0', fontSize: '28px', color: '#1e293b' }}>Boshqaruv Bo'limi</h1>
          <p className="page-subtitle" style={{ margin: 0, color: '#64748b', fontSize: '15px' }}>Darsliklar va testlar ro'yxatini tahrirlash</p>
        </div>
        <button 
          onClick={handleLogout}
          style={{ padding: '10px 20px', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-gray)', fontWeight: '600', fontSize: '14px' }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Profildan chiqish
        </button>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', marginBottom: '30px' }}>
        <button 
          onClick={() => { setActiveTab('dashboard'); setEditingBook(null); setEditingTest(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px',
            backgroundColor: activeTab === 'dashboard' ? 'var(--primary-light)' : 'transparent',
            color: activeTab === 'dashboard' ? 'var(--primary-base)' : 'var(--text-gray)',
            fontWeight: '600', transition: 'all 0.2s'
          }}
        >
          <LayoutDashboard size={18} /> Dashboard
        </button>
        <button 
          onClick={() => { setActiveTab('books'); setEditingBook(null); setEditingTest(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px',
            backgroundColor: activeTab === 'books' ? 'var(--primary-light)' : 'transparent',
            color: activeTab === 'books' ? 'var(--primary-base)' : 'var(--text-gray)',
            fontWeight: '600', transition: 'all 0.2s'
          }}
        >
          <BookOpen size={18} /> Darsliklar
        </button>
        <button
          onClick={() => { setActiveTab('ai'); setEditingBook(null); setEditingTest(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px',
            backgroundColor: activeTab === 'ai' ? 'var(--primary-light)' : 'transparent',
            color: activeTab === 'ai' ? 'var(--primary-base)' : 'var(--text-gray)',
            fontWeight: '600', transition: 'all 0.2s'
          }}
        >
          <Bot size={18} /> AI sozlamalari
        </button>
        <button
          onClick={() => { setActiveTab('payments'); setEditingBook(null); setEditingTest(null); fetchSubscriptions(); fetchSubStats(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px',
            backgroundColor: activeTab === 'payments' ? 'var(--primary-light)' : 'transparent',
            color: activeTab === 'payments' ? 'var(--primary-base)' : 'var(--text-gray)',
            fontWeight: '600', transition: 'all 0.2s'
          }}
        >
          <Wallet size={18} /> To'lovlar
        </button>
      </div>

      {/* ======================================================== */}
      {/* 1. DASHBOARD TAB */}
      {/* ======================================================== */}
      {activeTab === 'dashboard' && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '40px' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '30px', display: 'flex', alignItems: 'center', gap: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '16px', backgroundColor: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookMarked size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '28px', color: '#0f172a', fontWeight: '800', margin: '0 0 4px 0' }}>{stats.books}</h3>
                <p style={{ color: '#64748b', margin: 0, fontSize: '14px', fontWeight: '500' }}>Jami darsliklar</p>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '30px', display: 'flex', alignItems: 'center', gap: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '16px', backgroundColor: '#fdf4ff', color: '#c026d3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpenCheck size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '28px', color: '#0f172a', fontWeight: '800', margin: '0 0 4px 0' }}>{stats.tests}</h3>
                <p style={{ color: '#64748b', margin: 0, fontSize: '14px', fontWeight: '500' }}>Jami test to'plamlari</p>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '30px', display: 'flex', alignItems: 'center', gap: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '16px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HelpCircle size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '28px', color: '#0f172a', fontWeight: '800', margin: '0 0 4px 0' }}>{stats.questions}</h3>
                <p style={{ color: '#64748b', margin: 0, fontSize: '14px', fontWeight: '500' }}>Jami test savollari</p>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '20px', border: '1px solid var(--border-color)', padding: '30px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>Tizim haqida ko'rsatmalar</h3>
            <div style={{ color: 'var(--text-gray)', lineHeight: '1.7', fontSize: '15px' }}>
              <p style={{ marginBottom: '15px' }}>
                👋 Ushbu ma'murchilik paneliga xush kelibsiz! Panel orqali siz dastur ma'lumotlar bazasini (MongoDB) bevosita boshqarishingiz mumkin:
              </p>
              <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li><b>Darsliklar:</b> Yangi darsliklar yarating, ularning muqova ranglarini sozlang va HTML sahifalar yozing. Har bir sahifa darslik o'quvchi tomonidan to'g'ridan-to'g'ri rendering qilinadi.</li>
                <li><b>Testlar:</b> Har bir sinf uchun test bloklari tuzing. Ularga yangi savollar, variantlar va javoblarni tushuntirib beruvchi ilova matnlarini yozing.</li>
                <li><b>Integratsiya:</b> Bazaga qo'shilgan har qanday darslik yoki test "Sinflar" va "Testlar" sahifalarida avtomatik ravishda statik ma'lumotlar o'rnida aks eta boshlaydi.</li>
              </ul>
            </div>
          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* 2. BOOKS TAB */}
      {/* ======================================================== */}
      {activeTab === 'books' && !editingBook && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Darsliklar ro'yxati ({books.length} ta)</h3>
            <button 
              onClick={handleCreateBookClick}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--primary-base)', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px' }}
            >
              <Plus size={16} /> Yangi darslik
            </button>
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: '#f8fafc', color: 'var(--text-gray)', fontWeight: '600' }}>
                  <th style={{ padding: '16px 24px' }}>Kod & Muqova</th>
                  <th style={{ padding: '16px 24px' }}>Sarlavha</th>
                  <th style={{ padding: '16px 24px' }}>Sinf</th>
                  <th style={{ padding: '16px 24px' }}>Sahifalar</th>
                  <th style={{ padding: '16px 24px', textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {books.map(book => (
                  <tr key={book._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="table-row-hover">
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '44px', borderRadius: '4px', backgroundColor: book.color, color: '#fff', fontSize: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textTransform: 'uppercase' }}>
                          {book.code}
                        </div>
                        <span style={{ fontWeight: '600', color: 'var(--text-dark)' }}>{book.code}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: '#1e293b' }}>{book.title}</div>
                        {book.subtitle && <div style={{ fontSize: '13px', color: 'var(--text-gray)' }}>{book.subtitle}</div>}
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', fontWeight: '500' }}>{book.grade}-sinf</td>
                    <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--primary-base)' }}>{book.pages.length} ta varaq</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => handleEditBookClick(book)}
                          style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', color: 'var(--text-gray)' }}
                          title="Tahrirlash"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteBook(book._id)}
                          style={{ padding: '8px', border: '1px solid #fee2e2', borderRadius: '6px', color: 'var(--danger)' }}
                          title="O'chirish"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {books.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px', fontStyle: 'italic', textAlign: 'center', color: 'var(--text-gray)' }}>
                      Ma'lumotlar bazasida darsliklar mavjud emas. Yangi darslik qo'shing.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Darslik Tahrirlovchi Oyna */}
      {activeTab === 'books' && editingBook && (
        <div style={{ animation: 'fadeIn 0.2s', backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '30px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', marginBottom: '25px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
              {isNewBook ? 'Yangi darslik qo\'shish' : 'Darslikni tahrirlash'}
            </h3>
            <button onClick={() => setEditingBook(null)} style={{ color: 'var(--text-gray)' }}><X size={20} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px', alignItems: 'start' }}>
            
            {/* Form parametrlari */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Sinf</label>
                <select 
                  value={editingBook.grade}
                  onChange={e => setEditingBook({ ...editingBook, grade: Number(e.target.value) })}
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', outline: 'none' }}
                >
                  {[6, 7, 8, 9, 10, 11].map(g => <option key={g} value={g}>{g}-sinf</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Kitob Kodi (Muqovada yoziladigan qisqa nom)</label>
                <input 
                  type="text"
                  placeholder="Masalan: KONSTITUTSIYASI"
                  value={editingBook.code}
                  onChange={e => setEditingBook({ ...editingBook, code: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Darslik Nomi</label>
                <input 
                  type="text"
                  placeholder="Masalan: O'zbekiston Respublikasi Konstitutsiyasi"
                  value={editingBook.title}
                  onChange={e => setEditingBook({ ...editingBook, title: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Subtitle (Qo'shimcha izoh)</label>
                <input 
                  type="text"
                  placeholder="Masalan: darslik qo'llanma"
                  value={editingBook.subtitle}
                  onChange={e => setEditingBook({ ...editingBook, subtitle: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Muqova rangi</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                  {PRESET_COLORS.map(c => (
                    <button 
                      key={c.hex}
                      type="button"
                      onClick={() => setEditingBook({ ...editingBook, color: c.hex })}
                      style={{ 
                        padding: '10px 5px', fontSize: '12px', fontWeight: '600', color: '#fff', 
                        backgroundColor: c.hex, borderRadius: '6px', 
                        border: editingBook.color === c.hex ? '3px solid #facc15' : '1px solid transparent'
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <input 
                  type="color" 
                  value={editingBook.color}
                  onChange={e => setEditingBook({ ...editingBook, color: e.target.value })}
                  style={{ width: '100%', height: '40px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px', display: 'flex', gap: '10px' }}>
                <button 
                  onClick={handleSaveBook}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: 'var(--primary-base)', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '15px' }}
                >
                  <Save size={18} /> Kitobni saqlash
                </button>
                <button 
                  onClick={() => setEditingBook(null)}
                  style={{ flex: 1, padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', color: 'var(--text-gray)', fontWeight: '600', fontSize: '15px' }}
                >
                  Bekor qilish
                </button>
              </div>
            </div>

            {/* Sahifalar (Pages) Muharriri */}
            <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '30px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '500px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  Kitob Sahifalari ({editingBook.pages.length} ta)
                </h4>
                <button 
                  onClick={handleAddPage}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: '1px dashed var(--primary-base)', color: 'var(--primary-base)', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}
                >
                  <PlusCircle size={14} /> Sahifa qo'shish
                </button>
              </div>

              {/* Sahifalar ro'yxati (Badge-lar ko'rinishida) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {editingBook.pages.map((_, pIdx) => (
                  <div key={pIdx} style={{ display: 'flex', alignItems: 'center', borderRadius: '6px', border: selectedPageIndex === pIdx ? '1px solid var(--primary-base)' : '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <button 
                      type="button"
                      onClick={() => handlePageSelect(pIdx)}
                      style={{ 
                        padding: '6px 12px', fontSize: '13px', fontWeight: '600',
                        backgroundColor: selectedPageIndex === pIdx ? 'var(--primary-light)' : '#f8fafc',
                        color: selectedPageIndex === pIdx ? 'var(--primary-base)' : 'var(--text-gray)'
                      }}
                    >
                      {pIdx + 1}-sahifa
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDeletePage(pIdx)}
                      style={{ padding: '6px 8px', backgroundColor: '#fee2e2', color: 'var(--danger)', fontSize: '11px' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {editingBook.pages.length === 0 && (
                  <p style={{ color: 'var(--text-gray)', fontSize: '14px', fontStyle: 'italic' }}>
                    Ushbu darslikka hali sahifalar qo'shilmagan. Sahifa qo'shish tugmasini bosing.
                  </p>
                )}
              </div>

              {/* Sahifa tarkibini tahrirlash formasi */}
              {selectedPageIndex !== -1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)' }}>
                      📝 {selectedPageIndex + 1}-sahifa HTML Tarkibini kiriting:
                    </span>
                    <button 
                      onClick={handlePageContentSave}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#10b981', color: '#fff', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}
                    >
                      <Save size={14} /> Sahifani yangilash
                    </button>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-gray)', display: 'flex', gap: '15px', backgroundColor: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <span>💡 <b>Qulaylik uchun sinflardan foydalaning:</b></span>
                    <span><code>.constitution-chapter</code> (Boblar uchun)</span>
                    <span><code>.constitution-article</code> (Moddalar uchun)</span>
                    <span><code>.constitution-text</code> (Normal matn)</span>
                  </div>

                  <textarea 
                    rows={15}
                    value={pageEditorContent}
                    onChange={e => setPageEditorContent(e.target.value)}
                    placeholder="HTML kod yoki matn yozing..."
                    style={{ 
                      width: '100%', padding: '15px', border: '1px solid #cbd5e1', 
                      borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace', 
                      outline: 'none', resize: 'vertical', boxSizing: 'border-box' 
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* 3. TESTS TAB */}
      {/* ======================================================== */}
      {activeTab === 'tests' && !editingTest && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Mavjud test to'plamlari ({tests.length} ta)</h3>
            <button 
              onClick={handleCreateTestClick}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--primary-base)', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px' }}
            >
              <Plus size={16} /> Yangi test
            </button>
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: '#f8fafc', color: 'var(--text-gray)', fontWeight: '600' }}>
                  <th style={{ padding: '16px 24px' }}>Test Nomi</th>
                  <th style={{ padding: '16px 24px' }}>Sinf</th>
                  <th style={{ padding: '16px 24px' }}>Savollar Soni</th>
                  <th style={{ padding: '16px 24px', textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {tests.map(test => (
                  <tr key={test._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '16px 24px', fontWeight: '600', color: '#1e293b' }}>{test.title}</td>
                    <td style={{ padding: '16px 24px', fontWeight: '500' }}>{test.grade}-sinf</td>
                    <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--primary-base)' }}>{test.questions.length} ta savol</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => handleEditTestClick(test)}
                          style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', color: 'var(--text-gray)' }}
                          title="Tahrirlash"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteTest(test._id)}
                          style={{ padding: '8px', border: '1px solid #fee2e2', borderRadius: '6px', color: 'var(--danger)' }}
                          title="O'chirish"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tests.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '40px', fontStyle: 'italic', textAlign: 'center', color: 'var(--text-gray)' }}>
                      Ma'lumotlar bazasida testlar topilmadi. Yangi test to'plamini qo'shing.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Test tahrirlovchi ekran */}
      {activeTab === 'tests' && editingTest && (
        <div style={{ animation: 'fadeIn 0.2s', backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '30px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', marginBottom: '25px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
              {isNewTest ? 'Yangi test qo\'shish' : 'Test to\'plamini tahrirlash'}
            </h3>
            <button onClick={() => setEditingTest(null)} style={{ color: 'var(--text-gray)' }}><X size={20} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px', alignItems: 'start' }}>
            
            {/* Test Parametrlari */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Sinf</label>
                <select 
                  value={editingTest.grade}
                  onChange={e => setEditingTest({ ...editingTest, grade: Number(e.target.value) })}
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', outline: 'none' }}
                >
                  {[6, 7, 8, 9, 10, 11].map(g => <option key={g} value={g}>{g}-sinf</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Test Sarlavhasi (Mavzu nomi)</label>
                <input 
                  type="text"
                  placeholder="Masalan: Konstitutsiya Asosiy Prinsiplari"
                  value={editingTest.title}
                  onChange={e => setEditingTest({ ...editingTest, title: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px', display: 'flex', gap: '10px' }}>
                <button 
                  onClick={handleSaveTest}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: 'var(--primary-base)', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '15px' }}
                >
                  <Save size={18} /> Testni saqlash
                </button>
                <button 
                  onClick={() => setEditingTest(null)}
                  style={{ flex: 1, padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', color: 'var(--text-gray)', fontWeight: '600', fontSize: '15px' }}
                >
                  Bekor qilish
                </button>
              </div>
            </div>

            {/* Savollar ro'yxatini boshqarish */}
            <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  Savollar Ro'yxati ({editingTest.questions.length} ta)
                </h4>
                <button 
                  onClick={handleAddQuestion}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: '1px dashed var(--primary-base)', color: 'var(--primary-base)', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}
                >
                  <PlusCircle size={14} /> Savol qo'shish
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '10px' }}>
                {editingTest.questions.map((q, qIdx) => (
                  <div key={qIdx} style={{ padding: '20px', border: '1px solid #cbd5e1', borderRadius: '12px', backgroundColor: '#f8fafc', position: 'relative' }}>
                    
                    <button 
                      onClick={() => handleDeleteQuestion(qIdx)}
                      style={{ position: 'absolute', top: '15px', right: '15px', color: 'var(--danger)', padding: '4px' }}
                      title="Savolni o'chirish"
                    >
                      <Trash2 size={16} />
                    </button>

                    <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '12px' }}>
                      Savol #{qIdx + 1}
                    </h5>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Savol matni</label>
                        <input 
                          type="text"
                          value={q.questionText}
                          onChange={e => handleUpdateQuestion(qIdx, 'questionText', e.target.value)}
                          style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>

                      {/* Variantlar */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                              {String.fromCharCode(65 + oIdx)}-variant
                            </label>
                            <input 
                              type="text"
                              value={opt}
                              onChange={e => handleUpdateOption(qIdx, oIdx, e.target.value)}
                              style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        {/* To'g'ri javob */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>To'g'ri javob</label>
                          <select 
                            value={q.correctAnswer}
                            onChange={e => handleUpdateQuestion(qIdx, 'correctAnswer', Number(e.target.value))}
                            style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                          >
                            {q.options.map((_, oIdx) => (
                              <option key={oIdx} value={oIdx}>{String.fromCharCode(65 + oIdx)}-variant</option>
                            ))}
                          </select>
                        </div>

                        {/* Izoh / Tushuntirish */}
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Javob tushuntirilishi (Tushuntirish)</label>
                          <input 
                            type="text"
                            placeholder="Qonun moddasiga havola..."
                            value={q.explanation}
                            onChange={e => handleUpdateQuestion(qIdx, 'explanation', e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
                {editingTest.questions.length === 0 && (
                  <p style={{ fontStyle: 'italic', color: 'var(--text-gray)', fontSize: '14px', textAlign: 'center', padding: '30px 0' }}>
                    Hech qanday savol qo'shilmagan. Savol qo'shish tugmasini bosing.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. AI TAB */}
      {/* ======================================================== */}
      {activeTab === 'ai' && (
        <div style={{ animation: 'fadeIn 0.3s', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* AI Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', backgroundColor: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={24} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{aiStats.keysTotal}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Jami API kalitlar</div>
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Power size={24} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{aiStats.keysActive}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Faol kalitlar</div>
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', backgroundColor: '#fef3c7', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={24} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{aiStats.usedToday} / {aiStats.dailyLimit}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Bugungi so'rovlar</div>
              </div>
            </div>
          </div>

          {/* AI Settings */}
          <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>AI sozlamalari</h3>
              <button
                onClick={handleSaveAiSettings}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: 'var(--primary-base)', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px' }}
              >
                <Save size={16} /> Sozlamalarni saqlash
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer', backgroundColor: aiSettings.enabled ? '#ecfdf5' : '#f8fafc' }}>
                <input
                  type="checkbox"
                  checked={aiSettings.enabled}
                  onChange={e => setAiSettings({ ...aiSettings, enabled: e.target.checked })}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontWeight: '600', color: aiSettings.enabled ? '#10b981' : '#64748b' }}>
                  {aiSettings.enabled ? 'AI yoqilgan' : 'AI o\'chirilgan'}
                </span>
              </label>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Standart provayder</label>
                <select
                  value={aiSettings.defaultProvider}
                  onChange={e => setAiSettings({ ...aiSettings, defaultProvider: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Standart model</label>
                <input
                  type="text"
                  value={aiSettings.defaultModel}
                  onChange={e => setAiSettings({ ...aiSettings, defaultModel: e.target.value })}
                  placeholder="gemini-2.0-flash-lite"
                  style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Tizim ko'rsatmasi (system prompt)</label>
              <textarea
                rows={5}
                value={aiSettings.systemPrompt}
                onChange={e => setAiSettings({ ...aiSettings, systemPrompt: e.target.value })}
                placeholder="AI uchun ko'rsatma..."
                style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Salomlashish xabari</label>
              <textarea
                rows={2}
                value={aiSettings.greeting}
                onChange={e => setAiSettings({ ...aiSettings, greeting: e.target.value })}
                placeholder="Foydalanuvchi chatni ochganida ko'rinadigan xabar..."
                style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* AI Keys */}
          <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>API kalitlar ({aiKeys.length} ta)</h3>
              <button
                onClick={() => setShowAddKeyModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: 'var(--primary-base)', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px' }}
              >
                <Plus size={16} /> Yangi kalit
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {aiKeys.map(k => {
                const usagePct = k.dailyLimit > 0 ? Math.min(100, Math.round((k.used / k.dailyLimit) * 100)) : 0;
                return (
                  <div key={k._id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', backgroundColor: k.active ? '#fff' : '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{k.name}</span>
                        <span style={{
                          padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                          backgroundColor: k.active ? '#dcfce7' : '#fee2e2',
                          color: k.active ? '#15803d' : '#b91c1c'
                        }}>
                          {k.active ? 'FAOL' : 'O\'CHIQ'}
                        </span>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>{k.provider}</span>
                        <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{k.keyMasked}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleTestAiKey(k._id)}
                          style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#4f46e5', backgroundColor: '#eef2ff' }}
                          title="Kalitni tekshirish"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => handleToggleAiKey(k)}
                          style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: k.active ? '#b91c1c' : '#15803d' }}
                        >
                          {k.active ? "O'chirish" : "Yoqish"}
                        </button>
                        <button
                          onClick={() => handleDeleteAiKey(k._id)}
                          style={{ padding: '8px', border: '1px solid #fee2e2', borderRadius: '8px', color: 'var(--danger)' }}
                          title="O'chirish"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: '8px', backgroundColor: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${usagePct}%`, height: '100%', backgroundColor: usagePct >= 90 ? '#ef4444' : usagePct >= 70 ? '#f59e0b' : '#10b981' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569' }}>
                        <span>{k.used} / </span>
                        <input
                          type="number"
                          value={k.dailyLimit}
                          onChange={e => {
                            const v = Number(e.target.value);
                            setAiKeys(prev => prev.map(x => x._id === k._id ? { ...x, dailyLimit: v } : x));
                          }}
                          onBlur={e => handleUpdateAiKeyLimit(k._id, Number(e.target.value))}
                          style={{ width: '90px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <span style={{ color: '#94a3b8' }}>so'rov / kun</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {aiKeys.length === 0 && (
                <p style={{ fontStyle: 'italic', color: 'var(--text-gray)', fontSize: '14px', textAlign: 'center', padding: '30px 0' }}>
                  Hali API kalit qo'shilmagan. "Yangi kalit" tugmasini bosing.
                </p>
              )}
            </div>
          </div>

          {/* Add Key Modal */}
          {showAddKeyModal && (
            <div
              onClick={() => setShowAddKeyModal(false)}
              style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '480px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Yangi API kalit</h3>
                  <button onClick={() => setShowAddKeyModal(false)} style={{ color: '#64748b' }}><X size={20} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Nomi</label>
                    <input
                      type="text"
                      value={newAiKey.name}
                      onChange={e => setNewAiKey({ ...newAiKey, name: e.target.value })}
                      placeholder="Masalan: Asosiy Gemini"
                      style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>API kalit</label>
                    <input
                      type="text"
                      value={newAiKey.apiKey}
                      onChange={e => setNewAiKey({ ...newAiKey, apiKey: e.target.value })}
                      placeholder="AIzaSy... yoki sk-..."
                      style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Provayder</label>
                      <select
                        value={newAiKey.provider}
                        onChange={e => setNewAiKey({ ...newAiKey, provider: e.target.value })}
                        style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Kunlik limit</label>
                      <input
                        type="number"
                        value={newAiKey.dailyLimit}
                        onChange={e => setNewAiKey({ ...newAiKey, dailyLimit: Number(e.target.value) })}
                        style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button
                    onClick={() => setShowAddKeyModal(false)}
                    style={{ flex: 1, padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', fontWeight: '600', fontSize: '14px' }}
                  >
                    Bekor qilish
                  </button>
                  <button
                    onClick={handleTestNewKey}
                    style={{ flex: 1, padding: '12px', backgroundColor: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '8px', fontWeight: 600, fontSize: '14px' }}
                  >
                    Test
                  </button>
                  <button
                    onClick={handleCreateAiKey}
                    style={{ flex: 1, padding: '12px', backgroundColor: 'var(--primary-base)', color: '#fff', borderRadius: '8px', fontWeight: '600', fontSize: '14px' }}
                  >
                    Saqlash
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. PAYMENTS TAB */}
      {/* ======================================================== */}
      {activeTab === 'payments' && (
        <div style={{ animation: 'fadeIn 0.3s', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Stats cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', backgroundColor: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={24} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{subStats.total}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Jami to'lovlar</div>
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={24} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{subStats.uniqueUsers}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Obunachilar (unik)</div>
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', backgroundColor: '#fef3c7', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Power size={24} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{subStats.activeCount}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Faol obunalar</div>
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', backgroundColor: '#fdf4ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{formatPrice(subStats.totalRevenue)}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Umumiy daromad</div>
              </div>
            </div>
          </div>

          {/* Tier breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', borderRadius: '20px', padding: '24px', color: '#fff', boxShadow: '0 12px 24px rgba(79, 70, 229, 0.2)' }}>
              <div style={{ fontSize: '13px', opacity: 0.85, letterSpacing: '1px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>PRO tarif</div>
              <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '4px' }}>{subStats.proCount}</div>
              <div style={{ fontSize: '13px', opacity: 0.9 }}>jami • {subStats.proActive} ta faol</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', borderRadius: '20px', padding: '24px', color: '#fff', boxShadow: '0 12px 24px rgba(245, 158, 11, 0.2)' }}>
              <div style={{ fontSize: '13px', opacity: 0.85, letterSpacing: '1px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>MAX tarif</div>
              <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '4px' }}>{subStats.maxCount}</div>
              <div style={{ fontSize: '13px', opacity: 0.9 }}>jami • {subStats.maxActive} ta faol</div>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '13px', color: '#64748b', letterSpacing: '1px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} /> Shu oygi daromad
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{formatPrice(subStats.monthlyRevenue)}</div>
            </div>
          </div>

          {/* Filter + list */}
          <div style={{ backgroundColor: '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>To'lovlar ro'yxati ({subscriptions.length} ta)</h3>
              <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                {([
                  { id: 'all', label: 'Barchasi' },
                  { id: 'active', label: 'Faol' },
                  { id: 'pro', label: 'Pro' },
                  { id: 'max', label: 'Max' }
                ] as const).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSubFilter(f.id)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none',
                      backgroundColor: subFilter === f.id ? '#fff' : 'transparent',
                      color: subFilter === f.id ? '#4f46e5' : '#64748b',
                      fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                      boxShadow: subFilter === f.id ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: '#f8fafc', color: 'var(--text-gray)', fontWeight: 600 }}>
                    <th style={{ padding: '14px 16px' }}>Foydalanuvchi</th>
                    <th style={{ padding: '14px 16px' }}>Tarif</th>
                    <th style={{ padding: '14px 16px' }}>Davomiylik</th>
                    <th style={{ padding: '14px 16px' }}>Summa</th>
                    <th style={{ padding: '14px 16px' }}>To'langan sana</th>
                    <th style={{ padding: '14px 16px' }}>Tugash sanasi</th>
                    <th style={{ padding: '14px 16px' }}>Karta</th>
                    <th style={{ padding: '14px 16px' }}>Holat</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions
                    .filter(s => {
                      if (subFilter === 'all') return true;
                      if (subFilter === 'active') return s.status === 'active';
                      return s.tier === subFilter;
                    })
                    .map(s => {
                      const tierColor = s.tier === 'max' ? '#f59e0b' : '#4f46e5';
                      const tierBg = s.tier === 'max' ? '#fef3c7' : '#eef2ff';
                      const statusColor = s.status === 'active' ? '#15803d' : s.status === 'expired' ? '#b91c1c' : '#64748b';
                      const statusBg = s.status === 'active' ? '#dcfce7' : s.status === 'expired' ? '#fee2e2' : '#f1f5f9';
                      const statusLabel = s.status === 'active' ? 'Faol' : s.status === 'expired' ? 'Muddati tugagan' : 'Bekor qilingan';
                      return (
                        <tr key={s._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{s.userName || s.userLogin}</div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>@{s.userLogin}</div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              padding: '4px 10px', borderRadius: '999px', fontSize: '12px',
                              fontWeight: 700, backgroundColor: tierBg, color: tierColor, textTransform: 'uppercase'
                            }}>
                              {s.tier}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', color: '#475569' }}>{DURATION_LABELS[s.duration] || s.duration}</td>
                          <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>{formatPrice(s.amount)}</td>
                          <td style={{ padding: '14px 16px', color: '#475569' }}>{formatDate(s.paidAt)}</td>
                          <td style={{ padding: '14px 16px', color: '#475569' }}>{formatDate(s.expiresAt)}</td>
                          <td style={{ padding: '14px 16px', color: '#64748b', fontFamily: 'monospace' }}>
                            {s.cardLast4 ? `•••• ${s.cardLast4}` : '—'}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                              backgroundColor: statusBg, color: statusColor
                            }}>
                              {statusLabel}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeleteSubscription(s._id)}
                              style={{ padding: '8px', border: '1px solid #fee2e2', borderRadius: '6px', color: 'var(--danger)', backgroundColor: '#fff' }}
                              title="O'chirish"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {subscriptions.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-gray)', fontStyle: 'italic' }}>
                        Hozircha to'lovlar mavjud emas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPage;

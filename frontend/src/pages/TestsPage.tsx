import { useState, useEffect, useMemo } from 'react';
import { apiUrl } from '../config';
import {
  ClipboardList,
  Check, ArrowRight, ArrowLeft, RefreshCw, AlertCircle, Timer, CheckCircle2,
  Filter, Sparkles, GraduationCap, TrendingUp, X
} from 'lucide-react';

const AVAILABLE_GRADES = [6, 7, 8, 9, 10, 11];

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

interface QuizResult {
  id: string;
  title: string;
  grade: number;
  score: number;
  total: number;
  date: string;
  answers: Record<number, number>;
  questions: Question[];
}

// Each quiz pulls exactly 20 questions, drawn from the visible pool.
const QUIZ_LENGTH = 20;

// Days since unix epoch (local midnight) — used as the daily window index.
const daysSinceEpoch = (): number => {
  const d = new Date();
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / (1000 * 60 * 60 * 24));
};

// Simple mulberry32 PRNG — good enough for daily shuffle, fully deterministic per seed.
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const seededShuffle = <T,>(arr: T[], seed: number): T[] => {
  const rng = makeRng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Hash selected grades into a stable salt (so different grade combos rotate differently)
const gradesSalt = (grades: number[]): number => {
  return grades.slice().sort((a, b) => a - b).reduce((acc, g) => acc * 31 + g, 7);
};

const msUntilNextLocalMidnight = (): number => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
};

// ──────────────────────────────────────────────────────────────────────────
// TEST BAZASI — MAVZULAR BO'YICHA
//
// Har bir test = bitta MAVZU. `title` maydoni mavzu nomi sifatida ishlatiladi
// (foydalanuvchi sinf tanlagach, shu sinfdagi mavzularni tanlaydi).
//
// Yangi testlar shu yerga (yoki Admin panel orqali) qo'shiladi.
// Format namunasi:
//
//   '11': [
//     {
//       title: "Konstitutsiya",        // ← MAVZU nomi
//       grade: 11,
//       questions: [
//         { questionText: "...", options: ["A","B","C","D"], correctAnswer: 0, explanation: "..." },
//       ]
//     },
//   ],
// ──────────────────────────────────────────────────────────────────────────
const STATIC_FALLBACK_TESTS: Record<string, Test[]> = {
  // Hozircha bo'sh — testlar tez orada qo'shiladi.
};

// A test's title doubles as its "mavzu" (topic). Normalise it for grouping/selection.
const topicOf = (t: Test): string => {
  const title = (t.title || '').trim();
  return title.length > 0 ? title : 'Umumiy';
};

const formatHM = (ms: number): string => {
  if (ms <= 0) return '0s 0d';
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} s ${m} d`;
};

const TestsPage = () => {
  const [refreshIn, setRefreshIn] = useState<number>(() => msUntilNextLocalMidnight());

  // Tick the "next refresh" label every minute and roll over at midnight
  useEffect(() => {
    const id = window.setInterval(() => {
      setRefreshIn(msUntilNextLocalMidnight());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const [selectedGrades, setSelectedGrades] = useState<number[]>(() => {
    const saved = localStorage.getItem('huquq_selected_grades');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number')) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [11];
  });
  // Selected topics (mavzular). Empty => nothing shown until the user picks (or "Hammasi").
  const [selectedTopics, setSelectedTopics] = useState<string[]>(() => {
    const saved = localStorage.getItem('huquq_selected_topics');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });
  const [allTests, setAllTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Active Quiz State
  const [activeTest, setActiveTest] = useState<Test | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [quizFinished, setQuizFinished] = useState<boolean>(false);
  const [showAnalysis, setShowAnalysis] = useState<boolean>(false);

  // Mistakes history
  const [historyResults, setHistoryResults] = useState<QuizResult[]>([]);
  const [viewingResult, setViewingResult] = useState<QuizResult | null>(null);

  // Full-screen topic picker window
  const [topicModalOpen, setTopicModalOpen] = useState<boolean>(false);

  // Persist grade selection
  useEffect(() => {
    localStorage.setItem('huquq_selected_grades', JSON.stringify(selectedGrades));
  }, [selectedGrades]);

  // Fetch all tests once on mount (DB + static fallbacks)
  useEffect(() => {
    const fetchTests = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/tests'));
        const data = await res.json();
        const dbTests: Test[] = data.success && data.data ? data.data : [];
        const staticAll: Test[] = Object.values(STATIC_FALLBACK_TESTS).flat();
        const combined: Test[] = [...dbTests];
        staticAll.forEach(st => {
          const dup = dbTests.some(dt => dt.grade === st.grade && dt.title.toLowerCase().trim() === st.title.toLowerCase().trim());
          if (!dup) combined.push(st);
        });
        setAllTests(combined);
      } catch (err) {
        console.error("Testlarni yuklashda xatolik:", err);
        setAllTests(Object.values(STATIC_FALLBACK_TESTS).flat());
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
  }, []);

  // Persist topic selection
  useEffect(() => {
    localStorage.setItem('huquq_selected_topics', JSON.stringify(selectedTopics));
  }, [selectedTopics]);

  // Distinct topics (mavzular) available within the currently selected grades
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    allTests.forEach(t => {
      if (selectedGrades.includes(t.grade)) set.add(topicOf(t));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'uz'));
  }, [allTests, selectedGrades]);

  // Keep topic selection valid: drop topics no longer available; when nothing
  // valid remains but topics exist, default to "Hammasi" (all selected).
  const availableTopicsKey = availableTopics.join('|');
  useEffect(() => {
    // Skip while tests are still loading (no topics yet) — don't wipe a saved selection.
    if (availableTopics.length === 0) return;
    setSelectedTopics(prev => {
      const valid = prev.filter(t => availableTopics.includes(t));
      if (valid.length === 0) return [...availableTopics];
      if (valid.length === prev.length) return prev;
      return valid;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTopicsKey]);

  const visibleTests = useMemo(() => {
    return allTests.filter(t => selectedGrades.includes(t.grade) && selectedTopics.includes(topicOf(t)));
  }, [allTests, selectedGrades, selectedTopics]);

  const toggleGrade = (g: number) => {
    setSelectedGrades(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g].sort((a, b) => a - b)
    );
  };

  const selectAllGrades = () => setSelectedGrades([...AVAILABLE_GRADES]);
  const clearGrades = () => setSelectedGrades([]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(x => x !== topic) : [...prev, topic]
    );
  };

  const selectAllTopics = () => setSelectedTopics([...availableTopics]);
  const clearTopics = () => setSelectedTopics([]);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('huquq_test_results');
    if (saved) {
      try {
        setHistoryResults(JSON.parse(saved));
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  // Timer Effect
  useEffect(() => {
    if (!activeTest || quizFinished) return;

    if (timeLeft <= 0) {
      handleFinishQuiz();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, activeTest, quizFinished]);

  const handleStartQuiz = (clickedTest: Test) => {
    // 1) Build the pool of questions for the selected grades.
    // 2) Stable-shuffle it once per grade selection (consistent ordering across days).
    // 3) Each day take a rolling window of 20, advancing the start by 20 every 24 h.
    // This way, today's 20 are disjoint from yesterday's 20 whenever the pool has 40+ questions.
    const pool: Question[] = visibleTests.flatMap(t => t.questions);
    const ordered = seededShuffle(pool, gradesSalt(selectedGrades));
    let sampled: Question[] = [];
    if (ordered.length > 0) {
      const offset = (daysSinceEpoch() * QUIZ_LENGTH) % ordered.length;
      const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];
      sampled = rotated.slice(0, Math.min(QUIZ_LENGTH, ordered.length));
    }

    const quiz: Test = {
      title: clickedTest.title,
      grade: clickedTest.grade,
      questions: sampled.length > 0 ? sampled : clickedTest.questions
    };

    setActiveTest(quiz);
    setCurrentQIndex(0);
    setSelectedAnswers({});
    // 1 minute per question
    setTimeLeft(quiz.questions.length * 60);
    setQuizFinished(false);
    setShowAnalysis(false);
  };

  const handleOptionSelect = (optionIdx: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQIndex]: optionIdx
    }));
  };

  const handleNextQuestion = () => {
    if (!activeTest) return;
    if (currentQIndex < activeTest.questions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQIndex > 0) {
      setCurrentQIndex(prev => prev - 1);
    }
  };

  const handleFinishQuiz = () => {
    if (!activeTest) return;
    
    // Calculate score
    let score = 0;
    activeTest.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctAnswer) {
        score += 1;
      }
    });

    const newResult: QuizResult = {
      id: Math.random().toString(36).substr(2, 9),
      title: activeTest.title,
      grade: activeTest.grade,
      score,
      total: activeTest.questions.length,
      date: new Date().toLocaleDateString('uz-UZ') + ' ' + new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
      answers: selectedAnswers,
      questions: activeTest.questions
    };

    const updatedHistory = [newResult, ...historyResults];
    setHistoryResults(updatedHistory);
    localStorage.setItem('huquq_test_results', JSON.stringify(updatedHistory));

    setQuizFinished(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. QUIZ RUNNING UI
  if (activeTest && !quizFinished) {
    const currentQuestion = activeTest.questions[currentQIndex];

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        overflowY: 'auto',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '24px 20px', boxSizing: 'border-box' }}>

        {/* Header: title and timer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', backgroundColor: '#fff', padding: '20px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{activeTest.title}</h3>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>{activeTest.grade}-sinf darsligi asosida</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: timeLeft < 60 ? '#fef2f2' : '#f0fdf4', color: timeLeft < 60 ? '#ef4444' : '#16a34a', borderRadius: '12px', fontWeight: '700', border: timeLeft < 60 ? '1px solid #fee2e2' : '1px solid #dcfce7' }}>
            <Timer size={18} />
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>

        {/* Question navigator */}
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '18px',
          padding: '16px 20px',
          marginBottom: '16px',
          boxShadow: '0 4px 15px -4px rgba(0,0,0,0.06)',
          overflowX: 'auto'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 'min-content' }}>
            {activeTest.questions.map((_, idx) => {
              const isCurrent = idx === currentQIndex;
              const isAnswered = selectedAnswers[idx] !== undefined;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentQIndex(idx)}
                  title={`${idx + 1}-savolga o'tish`}
                  style={{
                    flexShrink: 0,
                    width: '40px', height: '40px',
                    borderRadius: '50%',
                    border: isCurrent
                      ? '2px solid #f59e0b'
                      : isAnswered ? '1.5px solid #818cf8' : '1.5px solid #cbd5e1',
                    background: isCurrent
                      ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                      : isAnswered ? '#eef2ff' : '#fff',
                    color: isCurrent ? '#fff' : isAnswered ? '#4f46e5' : '#64748b',
                    fontWeight: 700, fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isCurrent ? '0 8px 18px rgba(251, 191, 36, 0.4)' : 'none',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress summary */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
            <span>Savol: {currentQIndex + 1} / {activeTest.questions.length}</span>
            <span>Bajarildi: {Math.round((Object.keys(selectedAnswers).length / activeTest.questions.length) * 100)}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${((currentQIndex + 1) / activeTest.questions.length) * 100}%`, height: '100%', backgroundColor: 'var(--primary-base)', borderRadius: '999px', transition: 'width 0.3s ease' }}></div>
          </div>
        </div>

        {/* Question card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '36px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.03)', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '30px', lineHeight: '1.6' }}>
            {currentQuestion.questionText}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {currentQuestion.options.map((opt, idx) => {
              const isSelected = selectedAnswers[currentQIndex] === idx;
              const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionSelect(idx)}
                  className={`quiz-option-btn ${isSelected ? 'selected' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    width: '100%',
                    padding: '18px 24px',
                    textAlign: 'left',
                    borderRadius: '16px',
                    border: isSelected ? '2px solid var(--primary-base)' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? 'var(--primary-light)' : '#f8fafc',
                    color: isSelected ? 'var(--primary-base)' : '#334155',
                    fontSize: '15px',
                    fontWeight: isSelected ? '600' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? 'var(--primary-base)' : '#e2e8f0',
                    color: isSelected ? '#fff' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '14px',
                    flexShrink: 0
                  }}>
                    {optionLetter}
                  </div>
                  <span style={{ flexGrow: 1 }}>{opt}</span>
                  {isSelected && <CheckCircle2 size={20} color="var(--primary-base)" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handlePrevQuestion}
            disabled={currentQIndex === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 24px',
              backgroundColor: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              color: currentQIndex === 0 ? '#94a3b8' : '#475569',
              fontWeight: '600',
              cursor: currentQIndex === 0 ? 'not-allowed' : 'pointer',
              fontSize: '15px'
            }}
          >
            <ArrowLeft size={18} /> Oldingi
          </button>

          {currentQIndex === activeTest.questions.length - 1 ? (
            <button
              onClick={handleFinishQuiz}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '15px',
                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
              }}
            >
              Yakunlash <Check size={18} />
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                backgroundColor: 'var(--primary-base)',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '15px',
                boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)'
              }}
            >
              Keyingi <ArrowRight size={18} />
            </button>
          )}
        </div>
        </div>
      </div>
    );
  }

  // 2. QUIZ FINISHED RESULTS SCREEN
  if (quizFinished && activeTest) {
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    activeTest.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === undefined) unansweredCount += 1;
      else if (selectedAnswers[idx] === q.correctAnswer) correctCount += 1;
      else wrongCount += 1;
    });
    const totalQ = activeTest.questions.length;
    const percent = Math.round((correctCount / totalQ) * 100);

    // Circle math for the SVG progress ring
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    // ----- Detailed mistakes analysis view (separate screen) -----
    if (showAnalysis) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          overflowY: 'auto',
          animation: 'fadeIn 0.3s ease-in-out'
        }}>
          <div style={{ width: '100%', maxWidth: '900px', margin: '40px auto', padding: '24px 20px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Savollar tahlili va tushuntirishlar</h2>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
                  Natijangiz: <b>{percent}%</b> • To'g'ri: {correctCount} • Noto'g'ri: {wrongCount} • Javobsiz: {unansweredCount}
                </p>
              </div>
              <button
                onClick={() => setShowAnalysis(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '12px 22px', backgroundColor: '#fff', color: '#475569',
                  border: '1px solid #cbd5e1', borderRadius: '12px', fontWeight: 700, cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <ArrowLeft size={16} /> Orqaga
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {activeTest.questions.map((q, idx) => {
                const userAnswer = selectedAnswers[idx];
                const isCorrect = userAnswer === q.correctAnswer;
                return (
                  <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', border: isCorrect ? '1px solid #dcfce7' : '1px solid #fee2e2', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ padding: '4px 10px', borderRadius: '8px', backgroundColor: isCorrect ? '#e6fcf5' : '#fff0f6', color: isCorrect ? '#0ca678' : '#f03e3e', fontWeight: 700, fontSize: '13px', marginTop: '2px' }}>
                        {isCorrect ? "To'g'ri" : (userAnswer === undefined ? "Javobsiz" : "Noto'g'ri")}
                      </div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b', lineHeight: 1.5 }}>
                        {idx + 1}. {q.questionText}
                      </h4>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '16px', paddingLeft: '10px' }}>
                      {q.options.map((opt, oIdx) => {
                        let border = '1px solid #e2e8f0';
                        let bg = '#f8fafc';
                        let color = '#475569';
                        let label = '';
                        if (oIdx === q.correctAnswer) {
                          border = '1.5px solid #10b981';
                          bg = '#ecfdf5';
                          color = '#065f46';
                          label = " (To'g'ri javob)";
                        } else if (oIdx === userAnswer && !isCorrect) {
                          border = '1.5px solid #ef4444';
                          bg = '#fef2f2';
                          color = '#991b1b';
                          label = ' (Sizning javobingiz)';
                        }
                        return (
                          <div key={oIdx} style={{ padding: '12px 16px', borderRadius: '10px', border, backgroundColor: bg, color, fontSize: '14px', fontWeight: (oIdx === q.correctAnswer || oIdx === userAnswer) ? 600 : 450 }}>
                            {String.fromCharCode(65 + oIdx)}) {opt}{label}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <div style={{ display: 'flex', gap: '10px', backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a', fontSize: '14px', lineHeight: 1.6 }}>
                        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <b style={{ display: 'block', marginBottom: '4px' }}>Tushuntirish:</b>
                          {q.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '30px', textAlign: 'center' }}>
              <button
                onClick={() => setShowAnalysis(false)}
                style={{
                  padding: '14px 28px', backgroundColor: 'var(--primary-base)', color: '#fff',
                  border: 'none', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '15px'
                }}
              >
                Natijaga qaytish
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        overflowY: 'auto',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{ width: '100%', maxWidth: '620px', margin: '40px auto', padding: '24px 20px', boxSizing: 'border-box' }}>

          {/* Compact result card */}
          <div style={{
            textAlign: 'center', color: '#0f172a',
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '24px',
            padding: '36px 28px',
            boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.08)'
          }}>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#f59e0b', marginBottom: '28px', letterSpacing: '0.5px' }}>
              🎉 Test yakunlandi!
            </h2>

            {/* Circular percent */}
            <div style={{ width: '180px', height: '180px', margin: '0 auto 28px', position: 'relative' }}>
              <svg viewBox="0 0 160 160" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r={radius} stroke="#e2e8f0" strokeWidth="8" fill="none" />
                <circle
                  cx="80" cy="80" r={radius}
                  stroke="#f59e0b" strokeWidth="8" fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px', fontWeight: 800, color: '#0f172a' }}>
                {percent}%
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', backgroundColor: '#ecfdf5', borderRadius: '14px', border: '1px solid #d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ color: '#10b981', fontSize: '20px', fontWeight: 700 }}>✓</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>To'g'ri:</span>
                <b style={{ fontSize: '18px' }}>{correctCount}</b>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderRadius: '14px', border: '1px solid #fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ color: '#ef4444', fontSize: '20px', fontWeight: 700 }}>✕</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>Noto'g'ri:</span>
                <b style={{ fontSize: '18px' }}>{wrongCount}</b>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#faf5ff', borderRadius: '14px', border: '1px solid #f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ fontSize: '18px' }}>🟣</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>Javobsiz:</span>
                <b style={{ fontSize: '18px' }}>{unansweredCount}</b>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#eef2ff', borderRadius: '14px', border: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#0f172a' }}>
                <span style={{ fontSize: '18px' }}>📊</span>
                <span style={{ color: '#475569', fontSize: '14.5px' }}>Jami:</span>
                <b style={{ fontSize: '18px' }}>{totalQ}</b>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                onClick={() => setShowAnalysis(true)}
                style={{
                  padding: '14px 16px',
                  background: '#fff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '14px',
                  fontWeight: 700, fontSize: '14.5px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                📝 Xatolarni ko'rish
              </button>
              <button
                onClick={() => {
                  setActiveTest(null);
                  setQuizFinished(false);
                }}
                style={{
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '14px',
                  fontWeight: 700, fontSize: '14.5px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(79, 70, 229, 0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                🏠 Bosh sahifa
              </button>
            </div>

            <button
              onClick={() => handleStartQuiz(activeTest)}
              style={{
                marginTop: '14px',
                padding: '12px 20px',
                background: 'transparent',
                color: '#64748b',
                border: '1px dashed #cbd5e1',
                borderRadius: '12px',
                fontWeight: 600, fontSize: '13.5px',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '8px'
              }}
            >
              <RefreshCw size={14} /> Qayta topshirish
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. DETAILED PAST RESULT VIEWER
  if (viewingResult) {
    return (
      <div style={{ animation: 'fadeIn 0.3s ease-in-out', width: '100%', maxWidth: '850px', margin: '20px auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Natija Tahlili</h2>
            <span style={{ fontSize: '14px', color: '#64748b' }}>{viewingResult.title} • {viewingResult.date}</span>
          </div>
          <button
            onClick={() => setViewingResult(null)}
            style={{ padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}
          >
            Orqaga qaytish
          </button>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '20px 30px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', gap: '30px', alignItems: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            backgroundColor: (viewingResult.score / viewingResult.total) >= 0.6 ? '#dcfce7' : '#fee2e2',
            color: (viewingResult.score / viewingResult.total) >= 0.6 ? '#16a34a' : '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '20px'
          }}>
            {Math.round((viewingResult.score / viewingResult.total) * 100)}%
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#0f172a' }}>To'g'ri javoblar ko'rsatkichi</h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
              Jami savollar: {viewingResult.total} ta • To'g'ri: {viewingResult.score} ta • Xato: {viewingResult.total - viewingResult.score} ta
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {viewingResult.questions.map((q, idx) => {
            const userAnswer = viewingResult.answers[idx];
            const isCorrect = userAnswer === q.correctAnswer;

            return (
              <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', border: isCorrect ? '1px solid #dcfce7' : '1px solid #fee2e2', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    backgroundColor: isCorrect ? '#e6fcf5' : '#fff0f6',
                    color: isCorrect ? '#0ca678' : '#f03e3e',
                    fontWeight: '700',
                    fontSize: '13px',
                    marginTop: '2px'
                  }}>
                    {isCorrect ? "To'g'ri" : "Noto'g'ri"}
                  </div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b', lineHeight: '1.5' }}>
                    {idx + 1}. {q.questionText}
                  </h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '16px', paddingLeft: '10px' }}>
                  {q.options.map((opt, oIdx) => {
                    let border = '1px solid #e2e8f0';
                    let bg = '#f8fafc';
                    let color = '#475569';
                    let label = '';

                    if (oIdx === q.correctAnswer) {
                      border = '1.5px solid #10b981';
                      bg = '#ecfdf5';
                      color = '#065f46';
                      label = ' (To\'g\'ri javob)';
                    } else if (oIdx === userAnswer && !isCorrect) {
                      border = '1.5px solid #ef4444';
                      bg = '#fef2f2';
                      color = '#991b1b';
                      label = ' (Sizning javobingiz)';
                    }

                    return (
                      <div 
                        key={oIdx}
                        style={{ 
                          padding: '12px 16px', borderRadius: '10px', border, backgroundColor: bg, color,
                          fontSize: '14px', fontWeight: (oIdx === q.correctAnswer || oIdx === userAnswer) ? '600' : '450'
                        }}
                      >
                        {String.fromCharCode(65 + oIdx)}) {opt} {label}
                      </div>
                    );
                  })}
                </div>

                {q.explanation && (
                  <div style={{ display: 'flex', gap: '10px', backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a', fontSize: '14px', lineHeight: '1.6' }}>
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <b style={{ display: 'block', marginBottom: '4px' }}>Tushuntirish:</b>
                      {q.explanation}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. MAIN DASHBOARD UI
  const totalQuestions = visibleTests.reduce((s, t) => s + t.questions.length, 0);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-in-out', width: '100%', margin: '0 auto', padding: '20px' }}>

      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)',
        borderRadius: '28px',
        padding: '36px 40px',
        color: '#fff',
        marginBottom: '28px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '220px', height: '220px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-80px', left: '40%', width: '180px', height: '180px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px', position: 'relative' }}>
          <Sparkles size={26} />
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', opacity: 0.9 }}>
            Testlar markazi
          </span>
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 800, margin: '0 0 10px 0', lineHeight: 1.2, position: 'relative' }}>
          Bir nechta sinfni birga tanlang
        </h1>
        <p style={{ fontSize: '15.5px', opacity: 0.92, maxWidth: '620px', margin: 0, lineHeight: 1.6, position: 'relative' }}>
          Avval sinf(lar)ni belgilang, so'ng pastdan kerakli mavzularni tanlang — tanlangan mavzular savollaridan test tuziladi.
        </p>

        <div style={{ display: 'flex', gap: '14px', marginTop: '24px', flexWrap: 'wrap', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
            <GraduationCap size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedGrades.length} sinf tanlangan</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
            <ClipboardList size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{visibleTests.length} ta test</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
            <TrendingUp size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{totalQuestions} ta savol</span>
          </div>
          <div
            title="Savollar har kuni soat 00:00 da yangilanadi"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(251, 191, 36, 0.22)', border: '1px solid rgba(251, 191, 36, 0.4)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
          >
            <Timer size={16} />
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Yangi savollar: {formatHM(refreshIn)}</span>
          </div>
        </div>
      </div>

      {/* Filter card: grade chips + search */}
      <div style={{ marginBottom: '32px', backgroundColor: '#fff', padding: '24px 26px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Filter size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Sinflarni tanlang</h3>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8' }}>Bir yoki bir nechta sinfni belgilang</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={selectAllGrades}
              style={{ padding: '8px 14px', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            >
              Hammasi
            </button>
            <button
              onClick={clearGrades}
              disabled={selectedGrades.length === 0}
              style={{ padding: '8px 14px', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', color: selectedGrades.length === 0 ? '#cbd5e1' : '#ef4444', fontWeight: 600, fontSize: '13px', cursor: selectedGrades.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              Tozalash
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {AVAILABLE_GRADES.map(g => {
            const selected = selectedGrades.includes(g);
            const count = allTests.filter(t => t.grade === g).length;
            return (
              <button
                key={g}
                onClick={() => toggleGrade(g)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 18px', borderRadius: '999px',
                  border: selected ? '2px solid #4f46e5' : '1.5px solid #e2e8f0',
                  background: selected ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#fff',
                  color: selected ? '#fff' : '#475569',
                  fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  boxShadow: selected ? '0 6px 14px rgba(79, 70, 229, 0.25)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                {selected && <Check size={14} />}
                <span>{g}-sinf</span>
                <span style={{ fontSize: '11.5px', opacity: selected ? 0.9 : 0.6, fontWeight: 600 }}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Mavzu (topic) tag — opens the full-screen topic picker */}
        {selectedGrades.length > 0 && availableTopics.length > 0 && (
          <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '20px' }}>
            <button
              onClick={() => setTopicModalOpen(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px',
                padding: '16px 20px', borderRadius: '16px', cursor: 'pointer',
                border: '1.5px solid #e9d5ff',
                background: 'linear-gradient(135deg, #faf5ff 0%, #fdf2f8 100%)',
                textAlign: 'left', transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0, background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardList size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Mavzularni tanlash</div>
                  <div style={{ fontSize: '12.5px', color: '#7c3aed', fontWeight: 600 }}>
                    {selectedTopics.length} / {availableTopics.length} mavzu tanlangan — ochish uchun bosing
                  </div>
                </div>
              </div>
              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)', color: '#fff', fontWeight: 700, fontSize: '13.5px', boxShadow: '0 6px 14px rgba(124, 58, 237, 0.25)' }}>
                Ochish <ArrowRight size={16} />
              </span>
            </button>

            {/* Selected topics preview chips */}
            {selectedTopics.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                {selectedTopics.map(topic => (
                  <span
                    key={topic}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '999px',
                      background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                      color: '#fff', fontSize: '13px', fontWeight: 700,
                      boxShadow: '0 4px 10px rgba(124, 58, 237, 0.2)'
                    }}
                  >
                    <Check size={13} /> {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Section title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: '0 0 5px 0', fontSize: '20px', color: '#1e293b', fontWeight: 800 }}>
            {selectedGrades.length === 0
              ? "Sinflar tanlanmagan"
              : selectedGrades.length === 1
                ? `${selectedGrades[0]}-sinf testlari`
                : `${selectedGrades.length} sinf testlari`}
          </h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            {visibleTests.length} ta test • {totalQuestions} ta savol
          </p>
        </div>
      </div>

      {loading ? (
        <div className="tests-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '50px' }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', border: '1px solid #e2e8f0', opacity: 0.8 }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#f1f5f9', animation: 'pulse 1.5s infinite' }}></div>
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ height: '18px', width: '70%', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
                  <div style={{ height: '12px', width: '40%', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
                </div>
              </div>
              <div style={{ height: '44px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '12px' }}></div>
            </div>
          ))}
        </div>
      ) : selectedGrades.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '24px', border: '1px dashed #cbd5e1', marginBottom: '50px' }}>
          <Filter size={40} style={{ color: '#94a3b8', marginBottom: '16px' }} />
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#475569' }}>Hech qaysi sinf tanlanmagan</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
            Yuqoridagi chiplardan kamida bitta sinfni belgilang yoki "Hammasi"ni bosing.
          </p>
        </div>
      ) : availableTopics.length > 0 && selectedTopics.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '24px', border: '1px dashed #cbd5e1', marginBottom: '50px' }}>
          <ClipboardList size={40} style={{ color: '#94a3b8', marginBottom: '16px' }} />
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#475569' }}>Mavzu tanlanmagan</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
            Yuqoridagi mavzulardan kamida bittasini belgilang yoki "Hammasi"ni bosing.
          </p>
        </div>
      ) : visibleTests.length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '24px', border: '1px dashed #cbd5e1', marginBottom: '50px' }}>
          <ClipboardList size={40} style={{ color: '#94a3b8', marginBottom: '16px' }} />
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#475569' }}>Testlar topilmadi</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
            Tanlangan sinflarda hozircha testlar mavjud emas yoki qidiruv mos kelmadi.
          </p>
        </div>
      ) : (() => {
        const poolSize = visibleTests.reduce((s, t) => s + t.questions.length, 0);
        const qCount = Math.min(QUIZ_LENGTH, poolSize);
        const approxTime = qCount;
        const firstTest = visibleTests[0];
        return (
          <div
            style={{
              backgroundColor: '#fff', borderRadius: '24px', padding: '36px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 30px -8px rgba(0,0,0,0.08)',
              marginBottom: '50px', position: 'relative', overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)' }} />

            {/* Selected grade chips at top */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
              {selectedGrades.map(g => (
                <span
                  key={g}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px', borderRadius: '999px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)'
                  }}
                >
                  <GraduationCap size={14} /> {g}-sinf
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px', flexWrap: 'wrap' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '20px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 12px 24px rgba(79, 70, 229, 0.3)', flexShrink: 0
              }}>
                <Sparkles size={32} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', color: '#0f172a', fontWeight: 800 }}>
                  Tasodifiy {QUIZ_LENGTH} savoldan iborat test
                </h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: '14.5px', lineHeight: 1.5 }}>
                  Tanlangan sinflar savollar bazasidan tasodifiy {qCount} ta savol tushadi.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '28px' }}>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Savollar</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{qCount}</div>
              </div>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vaqt</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{approxTime} min</div>
              </div>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sinflar</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{selectedGrades.length}</div>
              </div>
              <div style={{ padding: '14px 18px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Baza</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{poolSize}</div>
              </div>
            </div>

            <button
              onClick={() => handleStartQuiz(firstTest)}
              disabled={qCount === 0}
              style={{
                width: '100%', padding: '18px',
                background: qCount > 0 ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#cbd5e1',
                color: '#fff', border: 'none', borderRadius: '14px',
                fontWeight: 800, cursor: qCount > 0 ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s', fontSize: '16px',
                boxShadow: qCount > 0 ? '0 10px 20px rgba(79, 70, 229, 0.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
              }}
            >
              {qCount > 0 ? (
                <>
                  Testni boshlash <ArrowRight size={18} />
                </>
              ) : (
                "Hozircha savollar yo'q"
              )}
            </button>
          </div>
        );
      })()}

      {/* FULL-SCREEN TOPIC PICKER WINDOW */}
      {topicModalOpen && availableTopics.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          overflowY: 'auto', animation: 'fadeIn 0.25s ease-in-out'
        }}>
          <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '24px 20px', boxSizing: 'border-box' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px', backgroundColor: '#fff', padding: '20px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardList size={22} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>Mavzularni tanlang</h3>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{selectedTopics.length} / {availableTopics.length} mavzu tanlangan</span>
                </div>
              </div>
              <button
                onClick={() => setTopicModalOpen(false)}
                title="Yopish"
                style={{ flexShrink: 0, width: '42px', height: '42px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Hammasi / Tozalash */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={selectAllTopics}
                style={{ flex: 1, padding: '14px', border: '1.5px solid #c4b5fd', backgroundColor: '#faf5ff', borderRadius: '14px', color: '#6d28d9', fontWeight: 700, fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Check size={18} /> Hammasi
              </button>
              <button
                onClick={clearTopics}
                disabled={selectedTopics.length === 0}
                style={{ flex: 1, padding: '14px', border: '1.5px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', color: selectedTopics.length === 0 ? '#cbd5e1' : '#ef4444', fontWeight: 700, fontSize: '15px', cursor: selectedTopics.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                Tozalash
              </button>
            </div>

            {/* Topic list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {availableTopics.map(topic => {
                const selected = selectedTopics.includes(topic);
                const qCount = allTests
                  .filter(t => selectedGrades.includes(t.grade) && topicOf(t) === topic)
                  .reduce((s, t) => s + t.questions.length, 0);
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
                      padding: '18px 22px', textAlign: 'left', borderRadius: '16px',
                      border: selected ? '2px solid #7c3aed' : '1.5px solid #e2e8f0',
                      background: selected ? 'linear-gradient(135deg, #faf5ff 0%, #fdf2f8 100%)' : '#fff',
                      cursor: 'pointer', transition: 'all 0.2s', boxSizing: 'border-box'
                    }}
                  >
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: selected ? 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)' : '#f1f5f9',
                      color: selected ? '#fff' : 'transparent', border: selected ? 'none' : '1.5px solid #cbd5e1'
                    }}>
                      <Check size={16} />
                    </div>
                    <span style={{ flexGrow: 1, fontSize: '16px', fontWeight: 700, color: selected ? '#6d28d9' : '#334155' }}>{topic}</span>
                    <span style={{ flexShrink: 0, fontSize: '13px', fontWeight: 700, color: selected ? '#7c3aed' : '#94a3b8' }}>{qCount} ta savol</span>
                  </button>
                );
              })}
            </div>

            {/* Confirm */}
            <button
              onClick={() => setTopicModalOpen(false)}
              style={{
                width: '100%', padding: '18px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                color: '#fff', border: 'none', borderRadius: '14px',
                fontWeight: 800, fontSize: '16px', cursor: 'pointer',
                boxShadow: '0 10px 20px rgba(124, 58, 237, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
              }}
            >
              <Check size={18} /> Tasdiqlash ({selectedTopics.length} ta mavzu)
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .quiz-option-btn:hover {
          background-color: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-1px);
        }
        .quiz-option-btn.selected:hover {
          background-color: var(--primary-light) !important;
          border-color: var(--primary-base) !important;
        }
        .mistake-card-hover:hover {
          border-color: #cbd5e1 !important;
          box-shadow: 0 8px 20px rgba(0,0,0,0.04) !important;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
};

export default TestsPage;

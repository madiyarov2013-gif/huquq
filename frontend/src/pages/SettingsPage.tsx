import React, { useEffect, useState } from 'react';
import { Sun, Moon, Sparkles, Check } from 'lucide-react';
import { getThemeMode, setThemeMode, resolveTheme, THEME_EVENT } from '../theme';
import type { ThemeMode } from '../theme';

interface ThemeOption {
  id: ThemeMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  gradient: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Kunduzgi',
    description: 'Doim oq mavzu',
    icon: <Sun size={26} />,
    accent: '#f59e0b',
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
  },
  {
    id: 'dark',
    label: 'Tungi',
    description: 'Doim qora mavzu',
    icon: <Moon size={26} />,
    accent: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)'
  },
  {
    id: 'auto',
    label: 'Avto',
    description: '06:00–18:00 — kunduzgi, qolgan vaqt — tungi',
    icon: <Sparkles size={26} />,
    accent: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
  }
];

const SettingsPage = () => {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());
  const [resolved, setResolved] = useState(() => resolveTheme(getThemeMode()));

  useEffect(() => {
    const sync = () => {
      const m = getThemeMode();
      setMode(m);
      setResolved(resolveTheme(m));
    };
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener('storage', sync);
    // Re-check every minute so the auto-mode indicator stays accurate
    const id = window.setInterval(sync, 60 * 1000);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener('storage', sync);
      clearInterval(id);
    };
  }, []);

  const handlePick = (m: ThemeMode) => {
    setThemeMode(m);
    setMode(m);
    setResolved(resolveTheme(m));
  };

  return (
    <div style={{ padding: '20px', animation: 'fadeIn 0.3s ease-in-out' }}>
      <h1 className="page-title" style={{ margin: 0 }}>Sozlamalar</h1>
      <p className="page-subtitle" style={{ marginTop: '6px' }}>Ilova ko'rinishi va boshqa parametrlarni shaxsiylashtiring.</p>

      <div style={{ marginTop: '28px', maxWidth: '880px' }}>
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)' }}>Mavzu</h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--text-gray)', fontSize: '13.5px' }}>
                Kunduzgi, tungi yoki vaqtga qarab avtomatik almashadigan rejimni tanlang.
              </p>
            </div>
            <span style={{
              padding: '6px 14px', borderRadius: '999px',
              backgroundColor: resolved === 'dark' ? 'rgba(99, 102, 241, 0.18)' : '#fef3c7',
              color: resolved === 'dark' ? '#a5b4fc' : '#b45309',
              fontWeight: 700, fontSize: '12px', letterSpacing: '0.5px',
              display: 'inline-flex', alignItems: 'center', gap: '6px'
            }}>
              {resolved === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              {resolved === 'dark' ? 'TUNGI' : 'KUNDUZGI'} REJIM FAOL
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {THEME_OPTIONS.map(opt => {
              const selected = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handlePick(opt.id)}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    padding: '22px 20px',
                    border: selected ? `2px solid ${opt.accent}` : '1.5px solid var(--border-color)',
                    borderRadius: '16px',
                    background: selected ? `${opt.accent}10` : 'var(--bg-card)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: selected ? `0 10px 24px ${opt.accent}33` : 'none',
                    fontFamily: 'inherit'
                  }}
                >
                  {selected && (
                    <div style={{
                      position: 'absolute', top: '14px', right: '14px',
                      width: '26px', height: '26px', borderRadius: '50%',
                      background: opt.gradient, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 4px 10px ${opt.accent}55`
                    }}>
                      <Check size={14} />
                    </div>
                  )}
                  <div style={{
                    width: '54px', height: '54px', borderRadius: '14px',
                    background: opt.gradient, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '14px',
                    boxShadow: `0 8px 18px ${opt.accent}33`
                  }}>
                    {opt.icon}
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '4px' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-gray)', lineHeight: 1.5 }}>
                    {opt.description}
                  </div>
                </button>
              );
            })}
          </div>

          {mode === 'auto' && (
            <div style={{
              marginTop: '20px',
              padding: '14px 18px',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '12px',
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <Sparkles size={18} color="#10b981" />
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-gray)', lineHeight: 1.5 }}>
                Avto rejim faol. Soat <b style={{ color: 'var(--text-dark)' }}>06:00 — 18:00</b> oralig'ida kunduzgi,
                qolgan vaqt tungi mavzu yoqiladi. Hozir: <b style={{ color: 'var(--text-dark)' }}>{resolved === 'dark' ? 'tungi' : 'kunduzgi'}</b>.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default SettingsPage;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordPayment, cancelLocalPayment } from '../payments-store';
import { Check, CreditCard, Lock, Shield, Sparkles, Crown, Bot, Calendar, X, Zap, Rocket } from 'lucide-react';

type TierId = 'pro' | 'max';
type DurationId = 'monthly' | 'quarterly' | 'yearly';

interface Tier {
  id: TierId;
  name: string;
  tagline: string;
  color: string;
  gradient: string;
  icon: React.ReactNode;
  features: string[];
  prices: Record<DurationId, number>;
}

interface Duration {
  id: DurationId;
  name: string;
  months: number;
  badge?: string;
}

const TIERS: Tier[] = [
  {
    id: 'pro',
    name: 'Pro',
    tagline: "Asosiy AI yordamchi va robot",
    color: '#4f46e5',
    gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    icon: <Zap size={28} />,
    features: [
      'AI yordamchi bilan cheksiz suhbat',
      "Robot yordamchini ekranda ko'rish",
      "Konstitutsiya va qonunlar bo'yicha javoblar",
      "Standart javob tezligi"
    ],
    prices: { monthly: 29000, quarterly: 75000, yearly: 249000 }
  },
  {
    id: 'max',
    name: 'Max',
    tagline: "Eng tezkor va kengaytirilgan imkoniyatlar",
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    icon: <Rocket size={28} />,
    features: [
      'Pro tarifning barcha imkoniyatlari',
      "Ustuvor (priority) javob tezligi",
      "Kengaytirilgan AI model (yuqori sifat)",
      "Test natijalari uchun shaxsiy tavsiyalar",
      "Yangi qonunlar va o'zgarishlar tahlili"
    ],
    prices: { monthly: 59000, quarterly: 150000, yearly: 499000 }
  }
];

const DURATIONS: Duration[] = [
  { id: 'monthly', name: '1 oy', months: 1 },
  { id: 'quarterly', name: '3 oy', months: 3, badge: '14% tejash' },
  { id: 'yearly', name: '1 yil', months: 12, badge: '30% tejash' }
];

const formatPrice = (n: number) => n.toLocaleString('uz-UZ').replace(/,/g, ' ') + " so'm";

const formatCardNumber = (s: string) =>
  s.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

const formatExpiry = (s: string) => {
  const v = s.replace(/\D/g, '').slice(0, 4);
  if (v.length < 3) return v;
  return v.slice(0, 2) + '/' + v.slice(2);
};

const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [isPaid, setIsPaid] = useState<boolean>(() => localStorage.getItem('huquq_user_paid') === 'true');
  const [paidUntil, setPaidUntil] = useState<string | null>(() => localStorage.getItem('huquq_user_paid_until'));
  const [activeTierId, setActiveTierId] = useState<TierId | null>(() => {
    const t = localStorage.getItem('huquq_user_tier');
    return t === 'pro' || t === 'max' ? t : null;
  });

  const [selectedTier, setSelectedTier] = useState<TierId>('pro');
  const [selectedDuration, setSelectedDuration] = useState<DurationId>('quarterly');
  const [showCardForm, setShowCardForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cardData, setCardData] = useState({
    number: '',
    expiry: '',
    cvv: '',
    holder: ''
  });

  useEffect(() => {
    const sync = () => {
      setIsPaid(localStorage.getItem('huquq_user_paid') === 'true');
      setPaidUntil(localStorage.getItem('huquq_user_paid_until'));
      const t = localStorage.getItem('huquq_user_tier');
      setActiveTierId(t === 'pro' || t === 'max' ? t : null);
    };
    window.addEventListener('huquq-payment-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('huquq-payment-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const handlePayClick = () => {
    setShowCardForm(true);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNumber = cardData.number.replace(/\s/g, '');
    if (cleanNumber.length !== 16) {
      setError("Karta raqami 16 ta raqamdan iborat bo'lishi kerak");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardData.expiry)) {
      setError("Amal qilish muddatini MM/YY shaklida kiriting");
      return;
    }
    if (cardData.cvv.length !== 3) {
      setError("CVV 3 ta raqamdan iborat bo'lishi kerak");
      return;
    }
    if (!cardData.holder.trim()) {
      setError("Karta egasining ismini kiriting");
      return;
    }

    setProcessing(true);
    setTimeout(async () => {
      const duration = DURATIONS.find(d => d.id === selectedDuration)!;
      const tier = TIERS.find(t => t.id === selectedTier)!;
      const amount = tier.prices[selectedDuration];
      const until = new Date();
      until.setMonth(until.getMonth() + duration.months);

      // Read current user profile for the subscription record
      let userLogin = 'anonymous';
      let userName = '';
      try {
        const savedProfile = localStorage.getItem('huquq_user_profile');
        if (savedProfile) {
          const p = JSON.parse(savedProfile);
          userLogin = p.login || 'anonymous';
          userName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
        }
      } catch (e) {
        console.error(e);
      }

      const cardLast4 = cardData.number.replace(/\D/g, '').slice(-4);

      // Persist subscription — always saves locally (admin can see it even
      // without a backend) and best-effort POSTs to backend if available.
      try {
        await recordPayment({
          userLogin,
          userName,
          tier: selectedTier,
          duration: selectedDuration,
          amount,
          expiresAt: until.toISOString(),
          cardLast4
        });
      } catch (e) {
        console.error('Payment save failed:', e);
      }

      localStorage.setItem('huquq_user_paid', 'true');
      localStorage.setItem('huquq_user_paid_until', until.toISOString());
      localStorage.setItem('huquq_user_tier', selectedTier);
      window.dispatchEvent(new Event('huquq-payment-change'));
      setIsPaid(true);
      setPaidUntil(until.toISOString());
      setActiveTierId(selectedTier);
      setProcessing(false);
      setSuccess(true);
      setTimeout(() => {
        navigate('/ai-assistant');
      }, 2200);
    }, 1500);
  };

  const handleCancelSubscription = () => {
    if (!window.confirm("Premium obunani bekor qilmoqchimisiz? AI yordamchi qulflanadi.")) return;
    let userLogin = 'anonymous';
    try {
      const savedProfile = localStorage.getItem('huquq_user_profile');
      if (savedProfile) userLogin = JSON.parse(savedProfile).login || 'anonymous';
    } catch { /* ignore */ }
    cancelLocalPayment(userLogin);
    localStorage.removeItem('huquq_user_paid');
    localStorage.removeItem('huquq_user_paid_until');
    localStorage.removeItem('huquq_user_tier');
    window.dispatchEvent(new Event('huquq-payment-change'));
    setIsPaid(false);
    setPaidUntil(null);
    setActiveTierId(null);
  };

  // ===== Already paid view =====
  if (isPaid && !success) {
    const untilDate = paidUntil ? new Date(paidUntil) : null;
    const daysLeft = untilDate ? Math.max(0, Math.ceil((untilDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
    const activeTier = TIERS.find(t => t.id === activeTierId) || TIERS[0];

    return (
      <div style={{ padding: '20px', animation: 'fadeIn 0.3s ease-in-out' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{
            background: activeTier.gradient,
            borderRadius: '24px',
            padding: '40px',
            color: '#fff',
            boxShadow: `0 20px 40px ${activeTier.color}33`,
            marginBottom: '30px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px auto'
            }}>
              <Crown size={44} />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', marginBottom: '12px' }}>
              {activeTier.icon} {activeTier.name.toUpperCase()} TARIF
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 8px 0' }}>Obuna faol</h1>
            <p style={{ fontSize: '15px', opacity: 0.9, margin: '0 0 20px 0' }}>
              AI yordamchi va robot yordamchi sizga to'liq ochilgan.
            </p>
            {untilDate && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                backgroundColor: 'rgba(255,255,255,0.15)', padding: '10px 20px',
                borderRadius: '12px', fontWeight: '600', fontSize: '14px'
              }}>
                <Calendar size={18} />
                {untilDate.toLocaleDateString('uz-UZ')} gacha • {daysLeft} kun qoldi
              </div>
            )}
          </div>

          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '28px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Sizga ochilgan imkoniyatlar:</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              {activeTier.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#475569', fontSize: '14px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={14} />
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/ai-assistant')}
              style={{ padding: '14px 28px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <Bot size={18} /> AI yordamchiga o'tish
            </button>
            <button
              onClick={handleCancelSubscription}
              style={{ padding: '14px 22px', backgroundColor: '#fff', color: '#ef4444', border: '1px solid #fee2e2', borderRadius: '12px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
            >
              Obunani bekor qilish
            </button>
          </div>
        </div>
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    );
  }

  // ===== Success view =====
  if (success) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', animation: 'fadeIn 0.4s ease-in-out' }}>
          <div style={{
            width: '96px', height: '96px', borderRadius: '50%',
            backgroundColor: '#dcfce7', color: '#16a34a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px auto'
          }}>
            <Check size={56} />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>To'lov muvaffaqiyatli!</h1>
          <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '24px' }}>
            Premium obuna faollashtirildi. AI yordamchi va robot sizga ochildi. AI sahifasiga yo'naltirilmoqdasiz...
          </p>
        </div>
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
      </div>
    );
  }

  // ===== Payment view =====
  const currentTier = TIERS.find(t => t.id === selectedTier)!;
  const currentDuration = DURATIONS.find(d => d.id === selectedDuration)!;
  const currentPrice = currentTier.prices[selectedDuration];

  return (
    <div style={{ padding: '20px', animation: 'fadeIn 0.3s ease-in-out' }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)',
          borderRadius: '28px',
          padding: '40px',
          color: '#fff',
          marginBottom: '30px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', top: '-40px', right: '-40px',
            width: '200px', height: '200px',
            backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            <Sparkles size={28} />
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.9 }}>
              Premium ulanish
            </span>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 12px 0', lineHeight: 1.2 }}>
            AI yordamchi va robotni ulang
          </h1>
          <p style={{ fontSize: '16px', opacity: 0.92, maxWidth: '560px', margin: 0, lineHeight: 1.6 }}>
            Pro yoki Max tarifni tanlang — sun'iy intellekt yordamchi va sahifaning
            pastki burchagidagi robot sizga ochiladi.
          </p>
        </div>

        {/* Tier cards (Pro / Max) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          {TIERS.map(tier => {
            const selected = selectedTier === tier.id;
            return (
              <div
                key={tier.id}
                onClick={() => setSelectedTier(tier.id)}
                style={{
                  background: selected ? tier.gradient : '#fff',
                  color: selected ? '#fff' : '#0f172a',
                  border: selected ? `2px solid ${tier.color}` : '1px solid #e2e8f0',
                  borderRadius: '24px',
                  padding: '28px',
                  cursor: 'pointer',
                  transition: 'all 0.25s',
                  boxShadow: selected ? `0 16px 32px ${tier.color}33` : '0 2px 6px rgba(0,0,0,0.04)',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{
                    width: '52px', height: '52px', borderRadius: '14px',
                    backgroundColor: selected ? 'rgba(255,255,255,0.2)' : `${tier.color}1A`,
                    color: selected ? '#fff' : tier.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {tier.icon}
                  </div>
                  {tier.id === 'max' && (
                    <span style={{
                      padding: '4px 12px', borderRadius: '999px', fontSize: '10px', fontWeight: 800, letterSpacing: '1px',
                      backgroundColor: selected ? 'rgba(255,255,255,0.25)' : '#fff7ed',
                      color: selected ? '#fff' : '#ea580c',
                      border: selected ? 'none' : '1px solid #fed7aa'
                    }}>
                      ENG TANLOQLI
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 6px 0' }}>{tier.name}</h2>
                <p style={{ fontSize: '14px', opacity: selected ? 0.92 : 0.7, margin: '0 0 20px 0' }}>{tier.tagline}</p>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '32px', fontWeight: 800 }}>{formatPrice(tier.prices[selectedDuration])}</span>
                  </div>
                  <div style={{ fontSize: '13px', opacity: selected ? 0.85 : 0.6 }}>
                    {currentDuration.months === 1 ? 'oyiga' : `${currentDuration.months} oy uchun`}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {tier.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px' }}>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        backgroundColor: selected ? 'rgba(255,255,255,0.25)' : '#dcfce7',
                        color: selected ? '#fff' : '#15803d',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <Check size={12} />
                      </div>
                      <span style={{ opacity: selected ? 0.95 : 0.85 }}>{f}</span>
                    </div>
                  ))}
                </div>

                <div style={{
                  marginTop: '20px', padding: '10px 14px',
                  backgroundColor: selected ? 'rgba(255,255,255,0.15)' : '#f8fafc',
                  borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                  textAlign: 'center'
                }}>
                  {selected ? "✓ Tanlangan" : "Tanlash uchun bosing"}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px', alignItems: 'start' }}>

          {/* Left — duration */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '24px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>Davomiylikni tanlang</h3>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              Uzoq muddatli to'lov bo'yicha sezilarli chegirma bor.
            </p>

            <div style={{ display: 'grid', gap: '12px' }}>
              {DURATIONS.map(duration => {
                const selected = selectedDuration === duration.id;
                const price = currentTier.prices[duration.id];
                return (
                  <label
                    key={duration.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '18px 22px', borderRadius: '14px',
                      border: selected ? `2px solid ${currentTier.color}` : '1px solid #e2e8f0',
                      backgroundColor: selected ? `${currentTier.color}10` : '#fff',
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <input
                        type="radio"
                        name="duration"
                        checked={selected}
                        onChange={() => setSelectedDuration(duration.id)}
                        style={{ width: '18px', height: '18px', accentColor: currentTier.color }}
                      />
                      <div>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '16px' }}>{duration.name}</span>
                        {duration.badge && (
                          <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 600, marginTop: '2px' }}>
                            {duration.badge}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{formatPrice(price)}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {duration.months === 1 ? 'oyiga' : `${duration.months} oy uchun`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Right — summary + pay */}
          <div style={{
            backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px',
            padding: '24px', position: 'sticky', top: '20px'
          }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Buyurtma xulosasi</h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#64748b', fontSize: '14px' }}>Tarif</span>
              <span style={{ fontWeight: 600, color: currentTier.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {currentTier.name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px dashed #e2e8f0' }}>
              <span style={{ color: '#64748b', fontSize: '14px' }}>Davomiyligi</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{currentDuration.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '18px 0', marginBottom: '16px' }}>
              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '15px' }}>Jami</span>
              <span style={{ fontWeight: 800, color: currentTier.color, fontSize: '20px' }}>{formatPrice(currentPrice)}</span>
            </div>

            {!showCardForm ? (
              <button
                onClick={handlePayClick}
                style={{
                  width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)'
                }}
              >
                <CreditCard size={18} /> To'lov qilish
              </button>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Karta raqami</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="8600 1234 5678 9012"
                    value={cardData.number}
                    onChange={e => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '1px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Amal qilish</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="MM/YY"
                      value={cardData.expiry}
                      onChange={e => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>CVV</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="•••"
                      maxLength={3}
                      value={cardData.cvv}
                      onChange={e => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '4px', textAlign: 'center' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Karta egasi</label>
                  <input
                    type="text"
                    placeholder="ISM FAMILIYA"
                    value={cardData.holder}
                    onChange={e => setCardData({ ...cardData, holder: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {error && (
                  <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <X size={16} /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={processing}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                    background: processing ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff', fontWeight: 700, fontSize: '15px',
                    cursor: processing ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                    marginTop: '6px'
                  }}
                >
                  {processing ? (
                    <>
                      <div className="spinner" /> Tekshirilmoqda...
                    </>
                  ) : (
                    <>
                      <Lock size={16} /> {formatPrice(currentPrice)} to'lash
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowCardForm(false); setError(null); }}
                  disabled={processing}
                  style={{ padding: '10px', backgroundColor: 'transparent', color: '#64748b', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Orqaga qaytish
                </button>
              </form>
            )}

            <div style={{ marginTop: '20px', padding: '14px', backgroundColor: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={18} color="#64748b" />
              <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                Karta ma'lumotlaringiz xavfsiz, SSL shifrlash bilan himoyalanadi.
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default PaymentPage;

import { Bell, Menu, User, Gift, X, Check, Copy, CreditCard, Lock } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as notificationsStore from '../notifications-store';

interface HeaderProps {
  onMenuClick?: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem('huquq_admin_authed') === 'true';
  });

  // Notifications
  const [notifs, setNotifs] = useState<notificationsStore.Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => notificationsStore.getReadIds());
  const [claimedIds, setClaimedIds] = useState<Set<string>>(() => notificationsStore.getClaimedIds());
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Bell pulses briefly when a new notification arrives so it catches the
  // user's eye even if the dropdown is closed.
  const [bellPulse, setBellPulse] = useState(false);
  // Tracks which IDs we've already "alerted" about (per session) so the same
  // notification doesn't keep firing the toast on every refresh tick.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef<boolean>(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifs.filter(n => !readIds.has(n._id)).length;
  // The most recent unread gift — used to render the big "you have a gift!"
  // banner so users can't miss new gifts even with the bell closed.
  const pendingGift = notifs.find(n =>
    n.type === 'gift' && !readIds.has(n._id) && !claimedIds.has(n._id)
  );
  const [bannerDismissed, setBannerDismissed] = useState<string | null>(null);
  const showBanner = !!pendingGift && pendingGift._id !== bannerDismissed;

  // Card modal — gift claims now require entering card details first.
  const [cardModalGift, setCardModalGift] = useState<notificationsStore.Notification | null>(null);
  const [cardForm, setCardForm] = useState({ number: '', expiry: '', cvv: '', holder: '' });
  const [cardError, setCardError] = useState<string | null>(null);


  useEffect(() => {
    const loadUser = () => {
      const isLoggedIn = localStorage.getItem('huquq_user_logged_in') === 'true';
      const adminAuthed = localStorage.getItem('huquq_admin_authed') === 'true';
      setIsAdmin(adminAuthed);
      if (isLoggedIn) {
        const saved = localStorage.getItem('huquq_user_profile');
        if (saved) {
          try {
            const profile = JSON.parse(saved);
            setUserName(profile.firstName || '');
          } catch (e) {
            console.error(e);
          }
        }
        const avatarKey = adminAuthed ? 'huquq_admin_avatar' : 'huquq_user_avatar';
        setAvatarUrl(localStorage.getItem(avatarKey));
        setAvatarBroken(false);
      } else {
        setUserName('');
        setAvatarUrl(null);
        setAvatarBroken(false);
      }
    };

    loadUser();

    window.addEventListener('huquq-auth-change', loadUser);
    window.addEventListener('storage', loadUser);

    return () => {
      window.removeEventListener('huquq-auth-change', loadUser);
      window.removeEventListener('storage', loadUser);
    };
  }, []);

  // Ref-stored refresh so the bell click and the "Yangilash" button can
  // force a fetch outside of the useEffect's setInterval / event loop.
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  // Load notifications, react to admin sending new ones, refresh on focus
  useEffect(() => {
    let cancelled = false;
    let lastLogin: string | null = null;
    const refresh = async () => {
      const list = await notificationsStore.fetchAllNotifications();
      if (cancelled) return;
      // Filter for this specific viewer — admins see nothing in the bell
      // (they use /announcements); users see either un-targeted notifications
      // or those addressed to their login.
      const isAdminNow = localStorage.getItem('huquq_admin_authed') === 'true';
      let login = '';
      try {
        const profile = JSON.parse(localStorage.getItem('huquq_user_profile') || '{}');
        login = (profile.login || '').trim();
      } catch { /* ignore */ }

      // Detect a login switch (admin → user, or different user). When that
      // happens we wipe the per-session "seen" set so notifications sent
      // during the previous session get an alert pulse for the new account.
      const loginKey = isAdminNow ? '__admin__' : (login || '__guest__').toLowerCase();
      if (lastLogin !== null && lastLogin !== loginKey) {
        seenIdsRef.current.clear();
        isFirstLoadRef.current = true;
      }
      lastLogin = loginKey;

      const filtered = notificationsStore.visibleForUser(list, login, isAdminNow);
      const currentReadIds = notificationsStore.getReadIds();

      // Detect notifications we've never alerted on before. Skip the first
      // load (everything is "new" then) so old notifications don't fire
      // toasts on page refresh.
      const fresh = filtered.filter(n =>
        !seenIdsRef.current.has(n._id) && !currentReadIds.has(n._id)
      );
      filtered.forEach(n => seenIdsRef.current.add(n._id));

      if (!isFirstLoadRef.current && fresh.length > 0 && !isAdminNow) {
        // Pulse the bell briefly and toast the latest item.
        setBellPulse(true);
        setTimeout(() => setBellPulse(false), 4500);
        const newest = fresh[0];
        const isGift = newest.type === 'gift';
        const prefix = isGift ? '🎁' : '🔔';
        setToast(`${prefix} ${newest.title}`);
        setTimeout(() => setToast(null), 5000);
      }
      isFirstLoadRef.current = false;

      setNotifs(filtered);
      setReadIds(currentReadIds);
      setClaimedIds(notificationsStore.getClaimedIds());
    };
    refreshRef.current = refresh;
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('huquq-notifications-change', refresh);
    window.addEventListener('huquq-auth-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    // Poll occasionally so cross-device backend updates show without focus.
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.removeEventListener('huquq-notifications-change', refresh);
      window.removeEventListener('huquq-auth-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showDropdown]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleOpenDropdown = async () => {
    const willShow = !showDropdown;
    setShowDropdown(willShow);
    if (willShow) {
      // Force a fresh fetch so the dropdown never shows stale state, even
      // if events somehow didn't reach this component instance.
      await refreshRef.current();
      // Mark whatever's now visible as read (count comes from current state).
      if (notifs.length > 0) {
        notificationsStore.markAllRead(notifs.map(n => n._id));
        setReadIds(notificationsStore.getReadIds());
      }
    }
  };

  const handleManualRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await refreshRef.current();
  };

  // Step 1: open the card modal (instead of claiming immediately) so the
  // user has to enter card details before the free gift is activated.
  const handleClaim = (n: notificationsStore.Notification) => {
    setCardError(null);
    setCardForm({ number: '', expiry: '', cvv: '', holder: '' });
    setCardModalGift(n);
    setShowDropdown(false);
  };

  // Step 2: validate the card (format-only, not a real charge) and then
  // actually apply the gift.
  const handleConfirmCard = () => {
    if (!cardModalGift) return;
    const cleanNumber = cardForm.number.replace(/\s/g, '');
    if (cleanNumber.length !== 16) {
      setCardError("Karta raqami 16 ta raqamdan iborat bo'lishi kerak");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardForm.expiry)) {
      setCardError("Amal qilish muddatini MM/YY shaklida kiriting");
      return;
    }
    if (cardForm.cvv.length !== 3) {
      setCardError("CVV 3 ta raqamdan iborat bo'lishi kerak");
      return;
    }
    if (!cardForm.holder.trim()) {
      setCardError("Karta egasining ismini kiriting");
      return;
    }
    const { expiresAt, code } = notificationsStore.claimGift(cardModalGift);
    setClaimedIds(notificationsStore.getClaimedIds());
    setCardModalGift(null);
    if (expiresAt) {
      const until = new Date(expiresAt).toLocaleDateString('uz-UZ');
      showToast(`🎁 Sovg'a faollashtirildi! Obuna ${until} gacha uzaytirildi.${code ? ' Kod: ' + code : ''}`);
    } else if (code) {
      showToast(`🎁 Promokod: ${code}`);
    }
  };

  const formatCardNumber = (s: string) =>
    s.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  const formatExpiry = (s: string) => {
    const v = s.replace(/\D/g, '').slice(0, 4);
    if (v.length < 3) return v;
    return v.slice(0, 2) + '/' + v.slice(2);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Promokod nusxalandi: ${code}`);
    } catch {
      showToast(`Promokod: ${code}`);
    }
  };

  return (
    <header className="top-header" style={isAdmin ? { background: 'rgba(30, 27, 75, 0.05)', borderBottom: '1px solid #4338ca' } : undefined}>
      <div className="header-left">
        <button className="menu-toggle" onClick={onMenuClick} aria-label="Menyu">
          <Menu size={24} />
        </button>
        <div className="welcome-text">
          {isAdmin ? (
            <>
              <h2 style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #311042 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Tizim boshqaruvchisi 🛠️
              </h2>
              <p style={{ color: '#4338ca', fontWeight: '600' }}>Tizim ma'lumotlarini boshqarish va tahrirlash paneli.</p>
            </>
          ) : (
            <>
              <h2>Xush kelibsiz{userName ? `, ${userName}` : ''}! 👋</h2>
              <p>Bilimingizni oshirishda davom eting.</p>
            </>
          )}
        </div>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {!isAdmin && (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            className={`notification-btn ${bellPulse ? 'bell-pulsing' : ''}`}
            onClick={handleOpenDropdown}
            title="Bildirishnomalar"
            style={{ cursor: 'pointer', position: 'relative' }}
          >
            <Bell size={20} />
            {/* Persistent red dot whenever there are unread notifications —
                simple, calm indicator (like a phone notification dot). */}
            {unreadCount > 0 && (
              <>
                <span className="notif-red-dot" />
                {/* Radiating sonar rings — extra noticeable when bellPulse
                    is on (i.e. a brand-new notification just arrived). */}
                <span className={`notif-ripple ${bellPulse ? 'is-strong' : ''}`} />
                <span className={`notif-ripple notif-ripple-2 ${bellPulse ? 'is-strong' : ''}`} />
              </>
            )}
          </button>

          {showDropdown && (
            <div className="notif-dropdown" style={{
              position: 'absolute', top: 'calc(100% + 12px)', right: 0,
              width: '360px', maxHeight: '480px', overflowY: 'auto',
              background: '#fff', borderRadius: '16px',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.08)',
              border: '1px solid #e2e8f0', zIndex: 1000,
              animation: 'notifDropdownIn 0.2s ease-out'
            }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Bildirishnomalar</h4>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={handleManualRefresh}
                    title="Yangilash"
                    style={{ background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', cursor: 'pointer', padding: '4px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700 }}
                  >
                    Yangilash
                  </button>
                  <button onClick={() => setShowDropdown(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              {notifs.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  <Bell size={32} style={{ opacity: 0.4, marginBottom: '10px' }} />
                  <p style={{ margin: 0 }}>Hozircha bildirishnoma yo'q.</p>
                </div>
              ) : (
                <div style={{ padding: '8px' }}>
                  {notifs.map(n => {
                    const claimed = claimedIds.has(n._id);
                    const unread = !readIds.has(n._id);
                    return (
                      <div key={n._id} className={`notif-item ${unread ? 'notif-unread' : ''}`} style={{
                        position: 'relative',
                        padding: '12px 14px', borderRadius: '12px', marginBottom: '6px',
                        background: n.type === 'gift' ? 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)' : '#f8fafc',
                        border: n.type === 'gift' ? '1px solid #fed7aa' : '1px solid #e2e8f0',
                        transition: 'all 0.2s'
                      }}>
                        {unread && (
                          <span style={{
                            position: 'absolute', top: '10px', right: '10px',
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: '#ef4444',
                            boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)'
                          }} />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          {n.type === 'gift'
                            ? <Gift size={15} color="#ea580c" />
                            : <Bell size={14} color="#4f46e5" />}
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>{n.title}</span>
                        </div>
                        <p style={{ margin: '4px 0 8px 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>{n.message}</p>

                        {n.type === 'gift' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {!claimed ? (
                              <button
                                onClick={() => handleClaim(n)}
                                style={{
                                  padding: '7px 14px', borderRadius: '10px', border: 'none',
                                  background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                                  color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                                  boxShadow: '0 4px 10px rgba(239, 68, 68, 0.3)'
                                }}
                              >
                                <Gift size={13} />
                                {n.giftDays ? `${n.giftDays} kun olish` : "Sovg'ani olish"}
                              </button>
                            ) : (
                              <span style={{
                                padding: '6px 12px', borderRadius: '999px',
                                background: '#dcfce7', color: '#15803d',
                                fontSize: '11px', fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                              }}>
                                <Check size={12} /> Olingan
                              </span>
                            )}
                            {n.giftCode && (
                              <button
                                onClick={() => copyCode(n.giftCode!)}
                                title="Nusxalash"
                                style={{
                                  padding: '6px 10px', borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                  background: '#fff', color: '#1e40af',
                                  fontFamily: 'monospace', fontSize: '11.5px', fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: '5px'
                                }}
                              >
                                <Copy size={11} /> {n.giftCode}
                              </button>
                            )}
                          </div>
                        )}

                        <div style={{ marginTop: '6px', fontSize: '10.5px', color: '#94a3b8' }}>
                          {new Date(n.createdAt).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* User avatar/profile link in header */}
        <div 
          onClick={() => navigate('/profile')}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px', 
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            transition: 'all 0.2s',
            border: '2px solid transparent'
          }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
          title="Profilga o'tish"
        >
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            backgroundColor: '#eff6ff', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
            border: '1px solid #cbd5e1'
          }}>
            {avatarUrl && !avatarBroken ? (
              <img
                src={avatarUrl}
                alt=""
                onError={() => setAvatarBroken(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <User size={20} color="#3b82f6" />
            )}
          </div>
        </div>
      </div>

      {cardModalGift && (
        <div
          onClick={() => setCardModalGift(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
            animation: 'toastIn 0.25s ease-out'
          }}
        >
          <div
            className="card-modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '20px', padding: '28px',
              width: 'min(420px, 100%)',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.45)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CreditCard size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  Karta qo'shing
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  Sovg'ani olish uchun kartani biriktiring
                </p>
              </div>
              <button
                onClick={() => setCardModalGift(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Gift summary */}
            <div style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)',
              border: '1px solid #fed7aa', borderRadius: '12px',
              padding: '12px 14px', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <Gift size={18} color="#ea580c" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#9a3412' }}>{cardModalGift.title}</div>
                {cardModalGift.giftDays && (
                  <div style={{ fontSize: '11.5px', color: '#9a3412' }}>
                    🎁 {cardModalGift.giftDays} kun {cardModalGift.giftTier?.toUpperCase() || 'PRO'}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label className="cm-label">Karta raqami</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="8600 1234 5678 9012"
                value={cardForm.number}
                onChange={e => setCardForm({ ...cardForm, number: formatCardNumber(e.target.value) })}
                className="cm-input"
                style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label className="cm-label">Amal qilish</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="MM/YY"
                  value={cardForm.expiry}
                  onChange={e => setCardForm({ ...cardForm, expiry: formatExpiry(e.target.value) })}
                  className="cm-input"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <label className="cm-label">CVV</label>
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="•••"
                  maxLength={3}
                  value={cardForm.cvv}
                  onChange={e => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  className="cm-input"
                  style={{ fontFamily: 'monospace', letterSpacing: '4px', textAlign: 'center' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label className="cm-label">Karta egasi</label>
              <input
                type="text"
                placeholder="ISM FAMILIYA"
                value={cardForm.holder}
                onChange={e => setCardForm({ ...cardForm, holder: e.target.value.toUpperCase() })}
                className="cm-input"
              />
            </div>

            {cardError && (
              <div style={{
                background: '#fef2f2', color: '#b91c1c',
                padding: '10px 14px', borderRadius: '10px',
                fontSize: '12.5px', fontWeight: 600,
                marginBottom: '12px',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <X size={14} /> {cardError}
              </div>
            )}

            <button
              onClick={handleConfirmCard}
              style={{
                width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff', fontWeight: 800, fontSize: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 10px 24px rgba(16, 185, 129, 0.35)'
              }}
            >
              <Lock size={15} /> Sovg'ani olish
            </button>

            <p style={{ margin: '12px 0 0 0', fontSize: '11.5px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
              Karta ma'lumotlari xavfsiz saqlanadi. Hozir hech qanday pul yechilmaydi.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: '#fff', padding: '14px 22px', borderRadius: '14px',
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
          fontSize: '14px', fontWeight: 600, zIndex: 10000,
          maxWidth: '90vw', textAlign: 'center',
          animation: 'toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          {toast}
        </div>
      )}

      {showBanner && pendingGift && (
        <div style={{
          position: 'fixed', top: '90px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
          color: '#fff', padding: '14px 22px', borderRadius: '16px',
          boxShadow: '0 16px 36px rgba(239, 68, 68, 0.45)',
          fontSize: '14px', fontWeight: 600, zIndex: 9998,
          maxWidth: 'min(560px, 92vw)',
          display: 'flex', alignItems: 'center', gap: '14px',
          animation: 'bannerIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          <Gift size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '2px' }}>
              🎁 Sizga sovg'a keldi!
            </div>
            <div style={{ fontSize: '13px', opacity: 0.95, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pendingGift.title}
            </div>
          </div>
          <button
            onClick={() => {
              setBannerDismissed(pendingGift._id);
              setShowDropdown(true);
              notificationsStore.markAllRead(notifs.map(n => n._id));
              setReadIds(notificationsStore.getReadIds());
            }}
            style={{
              padding: '8px 14px', borderRadius: '10px', border: 'none',
              background: 'rgba(255, 255, 255, 0.95)', color: '#b91c1c',
              fontWeight: 800, fontSize: '13px', cursor: 'pointer', flexShrink: 0
            }}
          >
            Ko'rish
          </button>
          <button
            onClick={() => setBannerDismissed(pendingGift._id)}
            title="Yashirish"
            style={{
              padding: '6px', borderRadius: '8px', border: 'none',
              background: 'transparent', color: '#fff', cursor: 'pointer', opacity: 0.85
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes notifDropdownIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes bannerIn {
          from { opacity: 0; transform: translate(-50%, -30px) scale(0.9); }
          to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        .cm-label {
          display: block;
          font-size: 11.5px;
          font-weight: 700;
          color: #475569;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .cm-input {
          width: 100%;
          padding: 11px 14px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #0f172a;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .cm-input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
        html[data-theme="dark"] .card-modal {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.6) !important;
          color: #f1f5f9 !important;
        }
        html[data-theme="dark"] .card-modal h3 { color: #f1f5f9 !important; }
        html[data-theme="dark"] .cm-label { color: #cbd5e1 !important; }
        html[data-theme="dark"] .cm-input {
          background: #0f172a !important;
          color: #f1f5f9 !important;
          border-color: rgba(71, 85, 105, 0.7) !important;
        }
        html[data-theme="dark"] .cm-input::placeholder { color: #64748b !important; }
        @keyframes bellShake {
          0%, 100% { transform: rotate(0deg); }
          15%      { transform: rotate(-14deg); }
          30%      { transform: rotate(12deg); }
          45%      { transform: rotate(-10deg); }
          60%      { transform: rotate(8deg); }
          75%      { transform: rotate(-4deg); }
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 2px 6px rgba(239, 68, 68, 0.45); }
          50%      { transform: scale(1.25); box-shadow: 0 4px 14px rgba(239, 68, 68, 0.8), 0 0 0 6px rgba(239, 68, 68, 0.2); }
        }
        @keyframes notifDotPulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50%      { transform: scale(1.2); opacity: 1; }
        }
        @keyframes notifRipple {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        /* Small persistent red dot on the bell whenever there are unread items */
        .notif-red-dot {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #fca5a5, #ef4444 60%, #b91c1c);
          border: 2px solid #fff;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.85), 0 0 0 2px rgba(239, 68, 68, 0.25);
          animation: notifDotPulse 1.4s ease-in-out infinite;
          pointer-events: none;
          z-index: 3;
        }
        /* Sonar-style ring radiating outward from the bell when a new
           notification just arrived (bellPulse on) */
        .notif-ripple {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 36px;
          height: 36px;
          margin-top: -18px;
          margin-left: -18px;
          border-radius: 50%;
          border: 2px solid rgba(239, 68, 68, 0.55);
          opacity: 0;
          pointer-events: none;
          z-index: 1;
          animation: notifRipple 1.6s ease-out infinite;
        }
        .notif-ripple-2 {
          animation-delay: 0.8s;
        }
        .notif-ripple.is-strong {
          border-color: rgba(239, 68, 68, 0.9);
          border-width: 3px;
        }
        .notification-btn.bell-pulsing {
          animation: bellShake 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97) 0s 4;
          transform-origin: 50% 8px;
        }
        .bell-badge-pulse {
          animation: badgePulse 1s ease-in-out infinite;
        }
        html[data-theme="dark"] .notif-dropdown {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
          color: #f1f5f9 !important;
        }
        html[data-theme="dark"] .notif-dropdown h4 { color: #f1f5f9 !important; }
        html[data-theme="dark"] .notif-dropdown > div:first-child {
          background: #1e293b !important;
          border-color: rgba(51, 65, 85, 0.5) !important;
        }
        html[data-theme="dark"] .notif-item {
          background: #0f172a !important;
          border-color: rgba(71, 85, 105, 0.4) !important;
        }
        html[data-theme="dark"] .notif-item p { color: #cbd5e1 !important; }
        html[data-theme="dark"] .notif-item span[style*="color: rgb(15"] { color: #f1f5f9 !important; }
      `}</style>
    </header>
  );
};

export default Header;

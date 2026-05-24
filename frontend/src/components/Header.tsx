import { Bell, Menu, User, Gift, X, Check, Copy } from 'lucide-react';
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
    refresh();
    window.addEventListener('huquq-notifications-change', refresh);
    window.addEventListener('huquq-auth-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    // Poll occasionally so cross-device backend updates show without focus.
    // 8s is short enough that "send → arrive" feels close to instant in
    // local testing without burning the device.
    const id = setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      window.removeEventListener('huquq-notifications-change', refresh);
      window.removeEventListener('huquq-auth-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
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

  const handleOpenDropdown = () => {
    const willShow = !showDropdown;
    setShowDropdown(willShow);
    if (willShow && notifs.length > 0) {
      notificationsStore.markAllRead(notifs.map(n => n._id));
      setReadIds(notificationsStore.getReadIds());
    }
  };

  const handleClaim = (n: notificationsStore.Notification) => {
    const { expiresAt, code } = notificationsStore.claimGift(n);
    setClaimedIds(notificationsStore.getClaimedIds());
    if (expiresAt) {
      const until = new Date(expiresAt).toLocaleDateString('uz-UZ');
      showToast(`🎁 Sovg'a faollashtirildi! Obuna ${until} gacha uzaytirildi.${code ? ' Kod: ' + code : ''}`);
    } else if (code) {
      showToast(`🎁 Promokod: ${code}`);
    }
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
            style={{ cursor: 'pointer' }}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className={bellPulse ? 'bell-badge-pulse' : ''} style={{
                position: 'absolute', top: '6px', right: '6px',
                minWidth: '18px', height: '18px', padding: '0 5px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff', fontSize: '10px', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.45)',
                border: '2px solid var(--bg-card, #fff)'
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
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
                <button onClick={() => setShowDropdown(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                  <X size={16} />
                </button>
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

      <style>{`
        @keyframes notifDropdownIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
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

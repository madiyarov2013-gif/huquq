import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Gift, Send, Trash2, Users, UserPlus, Search } from 'lucide-react';
import * as notificationsStore from '../notifications-store';
import * as usersStore from '../users-store';

const AnnouncementsPage: React.FC = () => {
  const [notifs, setNotifs] = useState<notificationsStore.Notification[]>([]);
  const [users, setUsers] = useState<usersStore.AppUser[]>([]);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [audience, setAudience] = useState<'all' | 'selected'>('all');
  const [selectedLogins, setSelectedLogins] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [draft, setDraft] = useState<{
    title: string;
    message: string;
    type: 'info' | 'gift';
    giftDays: number;
    giftTier: 'pro' | 'max';
    giftCode: string;
    giftPercent: number;
  }>({
    title: '',
    message: '',
    type: 'info',
    giftDays: 0,
    giftTier: 'pro',
    giftCode: '',
    giftPercent: 0
  });

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.login.toLowerCase().includes(q) ||
      (u.firstName + ' ' + u.lastName).toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const toggleLogin = (login: string) => {
    setSelectedLogins(prev => {
      const next = new Set(prev);
      const key = login.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedLogins(prev => {
      const next = new Set(prev);
      filteredUsers.forEach(u => next.add(u.login.toLowerCase()));
      return next;
    });
  };

  const clearSelection = () => setSelectedLogins(new Set());

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = async () => {
    const [n, u] = await Promise.all([
      notificationsStore.fetchAllNotifications(),
      usersStore.fetchAllUsers()
    ]);
    setNotifs(n);
    setUsers(u);
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('huquq-notifications-change', onChange);
    window.addEventListener('huquq-users-change', onChange);
    window.addEventListener('storage', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      window.removeEventListener('huquq-notifications-change', onChange);
      window.removeEventListener('huquq-users-change', onChange);
      window.removeEventListener('storage', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, []);

  const handleSend = async () => {
    if (!draft.title.trim() || !draft.message.trim()) {
      showToast("Sarlavha va xabarni to'ldiring", 'error');
      return;
    }
    if (draft.type === 'gift' && !draft.giftDays && !draft.giftCode.trim()) {
      showToast("Sovg'a uchun kun yoki promokod kiriting", 'error');
      return;
    }
    if (audience === 'selected' && selectedLogins.size === 0) {
      showToast("Hech bo'lmaganda bitta foydalanuvchini tanlang", 'error');
      return;
    }
    const targets = audience === 'selected' ? Array.from(selectedLogins) : undefined;
    await notificationsStore.createNotification({
      title: draft.title,
      message: draft.message,
      type: draft.type,
      giftDays: draft.type === 'gift' ? draft.giftDays : undefined,
      giftTier: draft.type === 'gift' ? draft.giftTier : undefined,
      giftCode: draft.type === 'gift' ? draft.giftCode : undefined,
      giftPercent: draft.type === 'gift' ? draft.giftPercent : undefined,
      targetUsers: targets,
      createdBy: 'admin'
    });
    setDraft({ title: '', message: '', type: 'info', giftDays: 0, giftTier: 'pro', giftCode: '', giftPercent: 0 });
    clearSelection();
    setAudience('all');
    await refresh();
    showToast(
      targets
        ? `Bildirishnoma ${targets.length} ta foydalanuvchiga yuborildi`
        : "Bildirishnoma barcha foydalanuvchilarga yuborildi"
    );
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bildirishnomani o'chirmoqchimisiz?")) return;
    const isLocal = id.startsWith('ntf_');
    if (isLocal) {
      notificationsStore.deleteLocalNotification(id);
    } else {
      try {
        await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      } catch {
        notificationsStore.deleteLocalNotification(id);
      }
    }
    await refresh();
    showToast("O'chirildi");
  };

  return (
    <div style={{ padding: '20px', animation: 'fadeIn 0.3s ease-in-out' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Hero header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)',
          borderRadius: '24px', padding: '32px',
          color: '#fff', marginBottom: '24px',
          position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', top: '-30px', right: '-30px',
            width: '160px', height: '160px',
            backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <Send size={26} />
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.9 }}>
              E'lon va sovg'alar
            </span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 8px 0' }}>
            Foydalanuvchilarga e'lon yuborish
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.92, margin: 0, lineHeight: 1.5 }}>
            Oddiy xabar yoki sovg'a (bepul kun + promokod) yuboring — barcha
            foydalanuvchilarga qo'ng'iroq orqali yetib boradi.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px', alignItems: 'start' }}>

          {/* Composer */}
          <div className="announce-card" style={{
            backgroundColor: '#fff', border: '1px solid #e2e8f0',
            borderRadius: '20px', padding: '24px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Yangi e'lon</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Hammasi qo'ng'iroq orqali ko'rinadi.</p>
              </div>
            </div>

            <label className="announce-label">Sarlavha</label>
            <input
              className="announce-input"
              value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="Yangi yangilik..."
            />

            <label className="announce-label">Xabar matni</label>
            <textarea
              className="announce-input"
              value={draft.message}
              onChange={e => setDraft({ ...draft, message: e.target.value })}
              placeholder="Bildirishnoma tafsilotlari..."
              rows={4}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />

            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', marginBottom: '14px' }}>
              <button
                onClick={() => setDraft({ ...draft, type: 'info' })}
                style={{
                  flex: 1, padding: '11px', borderRadius: '10px',
                  border: draft.type === 'info' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                  background: draft.type === 'info' ? '#eef2ff' : '#fff',
                  color: draft.type === 'info' ? '#4f46e5' : '#475569',
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Bell size={14} /> Oddiy e'lon
              </button>
              <button
                onClick={() => setDraft({ ...draft, type: 'gift' })}
                style={{
                  flex: 1, padding: '11px', borderRadius: '10px',
                  border: draft.type === 'gift' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                  background: draft.type === 'gift' ? '#fff7ed' : '#fff',
                  color: draft.type === 'gift' ? '#ea580c' : '#475569',
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Gift size={14} /> Sovg'a (padarka)
              </button>
            </div>

            {draft.type === 'gift' && (
              <div className="gift-block">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label className="gift-label">Bepul kunlar</label>
                    <input
                      type="number"
                      min={0}
                      value={draft.giftDays || ''}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '') {
                          setDraft({ ...draft, giftDays: 0 });
                          return;
                        }
                        const n = parseInt(v, 10);
                        setDraft({ ...draft, giftDays: Number.isFinite(n) ? Math.max(0, n) : 0 });
                      }}
                      placeholder="0"
                      className="gift-input"
                    />
                  </div>
                  <div>
                    <label className="gift-label">Tarif</label>
                    <div className="tier-toggle">
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, giftTier: 'pro' })}
                        className={`tier-chip tier-chip-pro ${draft.giftTier === 'pro' ? 'active' : ''}`}
                      >
                        Pro
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, giftTier: 'max' })}
                        className={`tier-chip tier-chip-max ${draft.giftTier === 'max' ? 'active' : ''}`}
                      >
                        Max
                      </button>
                    </div>
                  </div>
                </div>
                <label className="gift-label">Promokod (ixtiyoriy)</label>
                <input
                  value={draft.giftCode}
                  onChange={e => setDraft({ ...draft, giftCode: e.target.value })}
                  placeholder="PREMIUM50"
                  className="gift-input"
                  style={{ fontFamily: 'monospace' }}
                />

                {draft.giftCode.trim() && (
                  <div className="discount-block">
                    <label className="gift-label" style={{ marginTop: 0 }}>Chegirma foizi</label>
                    <div className="discount-chips">
                      {[10, 20, 30, 50, 70].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDraft({ ...draft, giftPercent: p })}
                          className={`discount-chip ${draft.giftPercent === p ? 'active' : ''}`}
                        >
                          {p}%
                        </button>
                      ))}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.giftPercent || ''}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '') { setDraft({ ...draft, giftPercent: 0 }); return; }
                          const n = parseInt(v, 10);
                          setDraft({ ...draft, giftPercent: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0 });
                        }}
                        placeholder="0"
                        className="gift-input discount-custom"
                      />
                    </div>
                    {draft.giftPercent > 0 && (
                      <p className="gift-hint" style={{ marginTop: '6px', fontWeight: 600 }}>
                        Foydalanuvchi <code style={{ background: 'rgba(234, 88, 12, 0.18)', padding: '1px 6px', borderRadius: '4px' }}>{draft.giftCode.trim()}</code> kodini kiritsa <b>{draft.giftPercent}%</b> chegirma oladi.
                      </p>
                    )}
                  </div>
                )}

                <p className="gift-hint">
                  Foydalanuvchi "Sovg'ani olish" tugmasini bossa — kun obunaga qo'shiladi va promokod ko'rsatiladi.
                </p>
              </div>
            )}

            {/* Audience selector */}
            <div style={{ marginTop: '4px', marginBottom: '14px' }}>
              <label className="announce-label">Kimga yuboriladi?</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setAudience('all')}
                  style={{
                    flex: 1, padding: '11px', borderRadius: '10px',
                    border: audience === 'all' ? '2px solid #10b981' : '1px solid #cbd5e1',
                    background: audience === 'all' ? '#ecfdf5' : '#fff',
                    color: audience === 'all' ? '#047857' : '#475569',
                    fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <Users size={14} /> Hammaga ({users.length})
                </button>
                <button
                  onClick={() => setAudience('selected')}
                  style={{
                    flex: 1, padding: '11px', borderRadius: '10px',
                    border: audience === 'selected' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                    background: audience === 'selected' ? '#eef2ff' : '#fff',
                    color: audience === 'selected' ? '#4f46e5' : '#475569',
                    fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <UserPlus size={14} /> Tanlanganlarga ({selectedLogins.size})
                </button>
              </div>
            </div>

            {audience === 'selected' && (
              <div className="audience-block">
                <div className="audience-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Foydalanuvchini qidirish..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', marginBottom: '10px' }}>
                  <button onClick={selectAllVisible} className="audience-mini-btn">
                    Hammasini belgilash
                  </button>
                  <button onClick={clearSelection} className="audience-mini-btn">
                    Tozalash
                  </button>
                </div>
                <div className="audience-list">
                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
                      {users.length === 0
                        ? "Hozircha ro'yxatdan o'tgan foydalanuvchi yo'q"
                        : "Qidiruvga mos foydalanuvchi yo'q"}
                    </div>
                  ) : (
                    filteredUsers.map(u => {
                      const checked = selectedLogins.has(u.login.toLowerCase());
                      return (
                        <label key={u._id} className={`audience-row ${checked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLogin(u.login)}
                          />
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#fff', fontWeight: 700, fontSize: '11px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {(u.firstName?.[0] || '?').toUpperCase()}{(u.lastName?.[0] || '').toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="audience-name">{u.firstName} {u.lastName}</div>
                            <div className="audience-login">@{u.login}</div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleSend}
              style={{
                width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 8px 16px rgba(79, 70, 229, 0.25)'
              }}
            >
              <Send size={16} />
              {audience === 'all' ? 'Hammaga yuborish' : `${selectedLogins.size} kishiga yuborish`}
            </button>
          </div>

          {/* List */}
          <div className="announce-card" style={{
            backgroundColor: '#fff', border: '1px solid #e2e8f0',
            borderRadius: '20px', padding: '24px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Yuborilgan e'lonlar ({notifs.length})
              </h3>
              <button
                onClick={refresh}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Yangilash
              </button>
            </div>

            {notifs.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8' }}>
                <Bell size={36} style={{ opacity: 0.4, marginBottom: '12px' }} />
                <p style={{ margin: 0, fontSize: '13.5px', fontStyle: 'italic' }}>
                  Hozircha bildirishnomalar yo'q. Chap tomondan yangisini yarating.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '640px', overflowY: 'auto' }}>
                {notifs.map(n => (
                  <div key={n._id} className="announce-item" style={{
                    border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px 16px',
                    background: n.type === 'gift' ? 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)' : '#f8fafc',
                    borderColor: n.type === 'gift' ? '#fed7aa' : '#e2e8f0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {n.type === 'gift'
                          ? <Gift size={16} color="#ea580c" />
                          : <Bell size={16} color="#4f46e5" />}
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{n.title}</span>
                        {n._source === 'local' && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>LOKAL</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(n._id)}
                        title="O'chirish"
                        style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p style={{ margin: '4px 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>{n.message}</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      {n.targetUsers && n.targetUsers.length > 0 ? (
                        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: '#eef2ff', color: '#4338ca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <UserPlus size={11} /> {n.targetUsers.length} ta foydalanuvchiga
                        </span>
                      ) : (
                        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: '#ecfdf5', color: '#047857', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={11} /> Hammaga
                        </span>
                      )}
                    </div>
                    {n.type === 'gift' && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {n.giftDays ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', background: '#fed7aa', color: '#9a3412' }}>
                            🎁 {n.giftDays} kun {n.giftTier?.toUpperCase()}
                          </span>
                        ) : null}
                        {n.giftCode ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', background: '#dbeafe', color: '#1e40af', fontFamily: 'monospace' }}>
                            {n.giftCode}{n.giftPercent ? ` · -${n.giftPercent}%` : ''}
                          </span>
                        ) : null}
                      </div>
                    )}
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                      {new Date(n.createdAt).toLocaleString('uz-UZ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error'
            ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
            : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: '#fff', padding: '14px 22px', borderRadius: '14px',
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
          fontSize: '14px', fontWeight: 600, zIndex: 10000,
          maxWidth: '90vw', textAlign: 'center',
          animation: 'toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          {toast.text}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .announce-label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
        .announce-input {
          width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #cbd5e1;
          font-size: 14px; outline: none; box-sizing: border-box; margin-bottom: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .announce-input:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12); }

        /* Gift sub-panel inside the composer */
        .gift-block {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 14px;
        }
        .gift-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #9a3412;
          margin-bottom: 4px;
        }
        .gift-input {
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #fed7aa;
          background: #fff;
          color: #0f172a;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
        }
        .gift-input:focus { border-color: #ea580c; box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.15); }
        /* Hide the native number-input spinner (the up/down arrows that
           appear on hover and look out of place on a dark theme). */
        .gift-input[type="number"]::-webkit-outer-spin-button,
        .gift-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .gift-input[type="number"] {
          -moz-appearance: textfield;
          appearance: textfield;
        }
        .gift-select { cursor: pointer; }

        /* Discount % chips next to the promo code */
        .discount-block {
          margin-top: 10px;
          padding: 10px;
          border-radius: 10px;
          background: rgba(234, 88, 12, 0.08);
          border: 1px dashed rgba(234, 88, 12, 0.4);
        }
        .discount-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .discount-chip {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1.5px solid #fed7aa;
          background: #fff;
          color: #9a3412;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .discount-chip:hover { background: #fff7ed; border-color: #fdba74; }
        .discount-chip.active {
          background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 4px 10px rgba(239, 68, 68, 0.35);
        }
        .discount-custom {
          width: 70px !important;
          padding: 6px 10px !important;
          margin-bottom: 0 !important;
          text-align: center;
          font-weight: 700;
        }

        /* Premium tier toggle — replaces the native <select> for Pro/Max */
        .tier-toggle {
          display: flex;
          gap: 6px;
          padding: 4px;
          background: #fff;
          border: 1px solid #fed7aa;
          border-radius: 10px;
        }
        .tier-chip {
          flex: 1;
          padding: 7px 10px;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.3px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }
        .tier-chip:hover:not(.active) { color: #475569; background: #f8fafc; }
        .tier-chip-pro.active {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: #fff;
          box-shadow: 0 4px 10px rgba(79, 70, 229, 0.35);
        }
        .tier-chip-max.active {
          background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
          color: #fff;
          box-shadow: 0 4px 10px rgba(239, 68, 68, 0.35);
          /* tiny crown-y shine */
          text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
        }

        .gift-hint {
          font-size: 11.5px;
          color: #9a3412;
          margin: 8px 0 0 0;
          line-height: 1.4;
        }

        @media (max-width: 900px) {
          [style*="grid-template-columns: 1fr 1.2fr"] {
            grid-template-columns: 1fr !important;
          }
        }

        /* Dark mode */
        html[data-theme="dark"] .announce-card {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .announce-card h3 { color: #f1f5f9 !important; }
        html[data-theme="dark"] .announce-label { color: #cbd5e1 !important; }
        html[data-theme="dark"] .announce-input {
          background: #0f172a !important;
          color: #f1f5f9 !important;
          border-color: rgba(71, 85, 105, 0.7) !important;
        }
        html[data-theme="dark"] .announce-input::placeholder { color: #64748b !important; }
        html[data-theme="dark"] .announce-item {
          background: #0f172a !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .announce-item span,
        html[data-theme="dark"] .announce-item p { color: #e2e8f0 !important; }

        /* Gift block — dark variant. Soft amber tint over a navy base so it
           still reads as "the gift section" without blinding the user. */
        html[data-theme="dark"] .gift-block {
          background: linear-gradient(135deg, rgba(234, 88, 12, 0.15) 0%, rgba(30, 41, 59, 0.95) 100%) !important;
          border-color: rgba(234, 88, 12, 0.45) !important;
        }
        html[data-theme="dark"] .gift-label { color: #fdba74 !important; }
        html[data-theme="dark"] .gift-input {
          background: #0f172a !important;
          color: #f1f5f9 !important;
          border-color: rgba(234, 88, 12, 0.4) !important;
        }
        html[data-theme="dark"] .gift-input::placeholder { color: #64748b !important; }
        html[data-theme="dark"] .gift-input:focus {
          border-color: #f97316 !important;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.2) !important;
        }
        /* Native <select> dropdown options need explicit dark background or
           the OS uses light by default. */
        html[data-theme="dark"] .gift-select option {
          background: #0f172a;
          color: #f1f5f9;
        }
        html[data-theme="dark"] .gift-hint { color: #fdba74 !important; }

        html[data-theme="dark"] .tier-toggle {
          background: #0f172a !important;
          border-color: rgba(234, 88, 12, 0.4) !important;
        }
        html[data-theme="dark"] .tier-chip { color: #64748b !important; }
        html[data-theme="dark"] .tier-chip:hover:not(.active) {
          background: rgba(99, 102, 241, 0.1) !important;
          color: #cbd5e1 !important;
        }
        /* Active states stay the same gradient — they pop just as well on dark. */

        html[data-theme="dark"] .discount-block {
          background: rgba(234, 88, 12, 0.12) !important;
          border-color: rgba(234, 88, 12, 0.5) !important;
        }
        html[data-theme="dark"] .discount-chip {
          background: #0f172a !important;
          border-color: rgba(234, 88, 12, 0.4) !important;
          color: #fdba74 !important;
        }
        html[data-theme="dark"] .discount-chip:hover {
          background: rgba(234, 88, 12, 0.15) !important;
          border-color: #f97316 !important;
        }

        /* ===== Audience selector ===== */
        .audience-block {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 14px;
        }
        .audience-search {
          display: flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid #cbd5e1;
          border-radius: 10px; padding: 8px 12px;
          color: #94a3b8;
        }
        .audience-search input {
          border: none; outline: none; background: transparent;
          flex: 1; font-size: 13px; color: #0f172a;
        }
        .audience-mini-btn {
          flex: 1; padding: 6px 10px; border-radius: 8px;
          border: 1px solid #cbd5e1; background: #fff;
          color: #475569; font-size: 11.5px; font-weight: 600;
          cursor: pointer;
        }
        .audience-mini-btn:hover { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
        .audience-list {
          max-height: 240px;
          overflow-y: auto;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 4px;
        }
        .audience-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .audience-row:hover { background: #f8fafc; }
        .audience-row.checked { background: #eef2ff; }
        .audience-row input[type="checkbox"] {
          width: 16px; height: 16px;
          accent-color: #4f46e5;
          cursor: pointer;
        }
        .audience-name {
          font-size: 13px; font-weight: 600; color: #0f172a;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .audience-login {
          font-size: 11.5px; color: #64748b; font-family: monospace;
        }

        html[data-theme="dark"] .audience-block {
          background: #0f172a !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .audience-search {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .audience-search input { color: #f1f5f9 !important; }
        html[data-theme="dark"] .audience-search input::placeholder { color: #64748b !important; }
        html[data-theme="dark"] .audience-mini-btn {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
          color: #cbd5e1 !important;
        }
        html[data-theme="dark"] .audience-mini-btn:hover {
          background: rgba(99, 102, 241, 0.15) !important;
          color: #a5b4fc !important;
        }
        html[data-theme="dark"] .audience-list {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .audience-row:hover { background: rgba(99, 102, 241, 0.1) !important; }
        html[data-theme="dark"] .audience-row.checked { background: rgba(99, 102, 241, 0.2) !important; }
        html[data-theme="dark"] .audience-name { color: #f1f5f9 !important; }
        html[data-theme="dark"] .audience-login { color: #94a3b8 !important; }
      `}</style>
    </div>
  );
};

export default AnnouncementsPage;

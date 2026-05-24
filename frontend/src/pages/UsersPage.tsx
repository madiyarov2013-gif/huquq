import React, { useEffect, useMemo, useState } from 'react';
import { Users as UsersIcon, Trash2, Search, Crown, User as UserIcon, Calendar, Check } from 'lucide-react';
import * as usersStore from '../users-store';
import * as paymentsStore from '../payments-store';

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const formatRelative = (iso?: string): string => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return 'hozir';
  if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + ' daq oldin';
  if (diff < day) return Math.round(diff / (60 * 60 * 1000)) + ' soat oldin';
  if (diff < 7 * day) return Math.round(diff / day) + ' kun oldin';
  return formatDate(iso);
};

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<usersStore.AppUser[]>([]);
  const [payments, setPayments] = useState<paymentsStore.Subscription[]>([]);
  const [filter, setFilter] = useState<'all' | 'paid' | 'free'>('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    const [u, p] = await Promise.all([
      usersStore.fetchAllUsers(),
      paymentsStore.fetchAllPayments()
    ]);
    setUsers(u);
    setPayments(p);
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('huquq-users-change', handler);
    window.addEventListener('huquq-payments-change', handler);
    window.addEventListener('huquq-payment-change', handler);
    window.addEventListener('storage', handler);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('huquq-users-change', handler);
      window.removeEventListener('huquq-payments-change', handler);
      window.removeEventListener('huquq-payment-change', handler);
      window.removeEventListener('storage', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  // Build a per-login payment summary so the table can show active tier &
  // expiration even if those fields weren't captured on the user record.
  const paymentByLogin = useMemo(() => {
    const map = new Map<string, paymentsStore.Subscription>();
    for (const p of payments) {
      const key = (p.userLogin || '').toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) { map.set(key, p); continue; }
      // Prefer the longest-running active subscription
      const aTime = new Date(existing.expiresAt).getTime();
      const bTime = new Date(p.expiresAt).getTime();
      if (bTime > aTime) map.set(key, p);
    }
    return map;
  }, [payments]);

  const enriched = useMemo(() => {
    return users.map(u => {
      const sub = paymentByLogin.get(u.login.toLowerCase());
      const tier = sub?.tier || u.paidTier;
      const until = sub?.expiresAt || u.paidUntil;
      const isActive = until ? new Date(until).getTime() > Date.now() && (!sub || sub.status === 'active') : false;
      return { user: u, tier, until, isActive };
    });
  }, [users, paymentByLogin]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (filter === 'paid') list = list.filter(r => r.isActive);
    if (filter === 'free') list = list.filter(r => !r.isActive);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.user.login.toLowerCase().includes(q) ||
        (r.user.firstName + ' ' + r.user.lastName).toLowerCase().includes(q)
      );
    }
    return list;
  }, [enriched, filter, search]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Foydalanuvchini ro'yxatdan o'chirmoqchimisiz?")) return;
    usersStore.deleteLocalUser(id);
    await refresh();
    showToast("Foydalanuvchi o'chirildi");
  };

  const stats = useMemo(() => {
    const total = users.length;
    const paid = enriched.filter(r => r.isActive).length;
    const newThisWeek = users.filter(u => {
      return Date.now() - new Date(u.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
    }).length;
    return { total, paid, newThisWeek };
  }, [users, enriched]);

  return (
    <div style={{ padding: '20px', animation: 'fadeIn 0.3s ease-in-out' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #0891b2 0%, #4f46e5 50%, #7c3aed 100%)',
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
            <UsersIcon size={26} />
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.9 }}>
              Foydalanuvchilar
            </span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 6px 0' }}>
            Ro'yxatdan o'tgan foydalanuvchilar
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.92, margin: 0 }}>
            Hammasi: {stats.total} · Aktiv obuna: {stats.paid} · Bu hafta yangi: {stats.newThisWeek}
          </p>
        </div>

        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="users-stat-card">
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UsersIcon size={20} />
            </div>
            <div>
              <div className="users-stat-num">{stats.total}</div>
              <div className="users-stat-label">Jami foydalanuvchi</div>
            </div>
          </div>
          <div className="users-stat-card">
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Crown size={20} />
            </div>
            <div>
              <div className="users-stat-num">{stats.paid}</div>
              <div className="users-stat-label">Aktiv obuna</div>
            </div>
          </div>
          <div className="users-stat-card">
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={20} />
            </div>
            <div>
              <div className="users-stat-num">{stats.newThisWeek}</div>
              <div className="users-stat-label">Bu hafta yangi</div>
            </div>
          </div>
        </div>

        {/* Filters + search */}
        <div className="users-table-wrapper" style={{ marginBottom: '24px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['all', 'paid', 'free'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`users-filter-btn ${filter === f ? 'active' : ''}`}
                >
                  {f === 'all' ? 'Hammasi' : f === 'paid' ? 'Obuna bilan' : 'Bepul'}
                </button>
              ))}
            </div>
            <div className="users-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Ism yoki login bo'yicha qidirish..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <UsersIcon size={36} style={{ opacity: 0.4, marginBottom: '12px' }} />
              <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic' }}>
                {users.length === 0
                  ? "Hozircha hech kim ro'yxatdan o'tmagan."
                  : "Filtrga mos foydalanuvchi topilmadi."}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Foydalanuvchi</th>
                    <th>Login</th>
                    <th>Ro'yxat sanasi</th>
                    <th>Oxirgi faollik</th>
                    <th>Obuna</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ user, tier, until, isActive }) => (
                    <tr key={user._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#fff', fontWeight: 700, fontSize: '13px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {(user.firstName?.[0] || '').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase() || <UserIcon size={16} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-dark, #0f172a)', fontSize: '14px' }}>
                              {user.firstName} {user.lastName}
                            </div>
                            {user._source === 'local' && (
                              <div style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 700 }}>LOKAL</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px', color: '#475569' }}>@{user.login}</td>
                      <td style={{ fontSize: '13px', color: '#64748b' }}>{formatDate(user.createdAt)}</td>
                      <td style={{ fontSize: '13px', color: '#64748b' }}>{formatRelative(user.lastSeenAt)}</td>
                      <td>
                        {isActive ? (
                          <span className={`users-tier-badge ${tier === 'max' ? 'tier-max' : 'tier-pro'}`}>
                            <Check size={12} /> {tier?.toUpperCase()} · {formatDate(until)} gacha
                          </span>
                        ) : (
                          <span className="users-tier-badge tier-free">Bepul</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleDelete(user._id)}
                          title="O'chirish"
                          style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: '#fff', padding: '12px 20px', borderRadius: '12px',
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
          fontSize: '14px', fontWeight: 600, zIndex: 10000,
          animation: 'toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }

        .users-stat-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }
        .users-stat-num { font-size: 22px; font-weight: 800; color: #0f172a; }
        .users-stat-label { font-size: 12.5px; color: #64748b; font-weight: 500; }

        .users-table-wrapper {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }

        .users-filter-btn {
          padding: 8px 16px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #475569;
          font-weight: 600;
          font-size: 12.5px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .users-filter-btn:hover { background: #f8fafc; }
        .users-filter-btn.active {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 4px 10px rgba(79, 70, 229, 0.25);
        }

        .users-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 14px;
          color: #94a3b8;
          min-width: 240px;
        }
        .users-search input {
          border: none;
          outline: none;
          background: transparent;
          flex: 1;
          font-size: 13px;
          color: #0f172a;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
        }
        .users-table th {
          text-align: left;
          padding: 14px 20px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .users-table td {
          padding: 14px 20px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
          color: #0f172a;
          vertical-align: middle;
        }
        .users-table tr:last-child td { border-bottom: none; }
        .users-table tr:hover td { background: #fafbff; }

        .users-tier-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }
        .tier-free { background: #f1f5f9; color: #64748b; }
        .tier-pro  { background: #dbeafe; color: #1e40af; }
        .tier-max  { background: linear-gradient(135deg, #fde68a, #fbbf24); color: #78350f; }

        /* ====== DARK MODE ====== */
        html[data-theme="dark"] .users-stat-card {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
        }
        html[data-theme="dark"] .users-stat-num { color: #f1f5f9 !important; }
        html[data-theme="dark"] .users-stat-label { color: #94a3b8 !important; }

        html[data-theme="dark"] .users-table-wrapper {
          background: #1e293b !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .users-table-wrapper > div:first-child {
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .users-filter-btn {
          background: #0f172a !important;
          color: #cbd5e1 !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .users-filter-btn:hover { background: #1e293b !important; }
        html[data-theme="dark"] .users-filter-btn.active {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important;
          color: #fff !important;
        }

        html[data-theme="dark"] .users-search {
          background: #0f172a !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
          color: #64748b !important;
        }
        html[data-theme="dark"] .users-search input { color: #f1f5f9 !important; }
        html[data-theme="dark"] .users-search input::placeholder { color: #64748b !important; }

        html[data-theme="dark"] .users-table th {
          background: #0f172a !important;
          color: #94a3b8 !important;
          border-color: rgba(71, 85, 105, 0.5) !important;
        }
        html[data-theme="dark"] .users-table td {
          color: #e2e8f0 !important;
          border-color: rgba(51, 65, 85, 0.5) !important;
        }
        html[data-theme="dark"] .users-table td div[style*="color: rgb(15"],
        html[data-theme="dark"] .users-table td div[style*="color: var(--text-dark"] {
          color: #f1f5f9 !important;
        }
        html[data-theme="dark"] .users-table tr:hover td { background: rgba(99, 102, 241, 0.08) !important; }

        html[data-theme="dark"] .tier-free { background: #334155 !important; color: #cbd5e1 !important; }
        html[data-theme="dark"] .tier-pro  { background: rgba(59, 130, 246, 0.2) !important; color: #93c5fd !important; }
        html[data-theme="dark"] .tier-max  { color: #fef3c7 !important; }

        @media (max-width: 700px) {
          .users-search { width: 100%; min-width: 0; }
        }
      `}</style>
    </div>
  );
};

export default UsersPage;

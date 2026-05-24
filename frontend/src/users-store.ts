// Users / "foydalanuvchilar" store.
// Same pattern as ai-store / payments-store / notifications-store: writes to
// localStorage so the admin sees the list even with no backend running, and
// best-effort POSTs to /api/users so cross-device delivery works as soon as
// the backend is reachable.
//
// Registration in ProfilePage upserts here so the admin "Foydalanuvchilar"
// page can list everyone who has signed up on this browser, plus anyone the
// backend has ever seen.

import { apiUrl } from './config';

export interface AppUser {
  _id: string;
  firstName: string;
  lastName: string;
  login: string;       // unique handle
  createdAt: string;   // ISO
  lastSeenAt: string;  // ISO — updated on each login
  // Optional metadata so admin can spot who's a customer at a glance.
  // These are derived from huquq_user_paid_* on the user's own device when
  // available; for cross-device parity rely on the payments store.
  paidTier?: 'pro' | 'max';
  paidUntil?: string;
  _source?: 'backend' | 'local';
}

const STORE_KEY = 'huquq_users_v1';

const newId = (): string =>
  'usr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const notify = () => {
  try {
    window.dispatchEvent(new Event('huquq-users-change'));
  } catch {
    /* SSR safety */
  }
};

const readLocal = (): AppUser[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const writeLocal = (arr: AppUser[]) => {
  localStorage.setItem(STORE_KEY, JSON.stringify(arr));
  notify();
};

// Upsert by login. Used on both registration and login so existing rows
// pick up name changes / lastSeenAt without duplicating.
export const upsertUser = (input: {
  firstName?: string;
  lastName?: string;
  login: string;
  paidTier?: 'pro' | 'max';
  paidUntil?: string;
}): AppUser => {
  const login = (input.login || '').trim();
  if (!login) {
    // Skip empty logins — anonymous shouldn't pollute the list.
    return {
      _id: newId(),
      firstName: '',
      lastName: '',
      login: '',
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
  }

  const arr = readLocal();
  const idx = arr.findIndex(u => u.login.toLowerCase() === login.toLowerCase());
  const now = new Date().toISOString();

  let user: AppUser;
  if (idx >= 0) {
    user = {
      ...arr[idx],
      firstName: input.firstName ?? arr[idx].firstName,
      lastName: input.lastName ?? arr[idx].lastName,
      lastSeenAt: now,
      paidTier: input.paidTier ?? arr[idx].paidTier,
      paidUntil: input.paidUntil ?? arr[idx].paidUntil
    };
    arr[idx] = user;
  } else {
    user = {
      _id: newId(),
      firstName: (input.firstName || '').trim(),
      lastName: (input.lastName || '').trim(),
      login,
      createdAt: now,
      lastSeenAt: now,
      paidTier: input.paidTier,
      paidUntil: input.paidUntil
    };
    arr.push(user);
  }
  writeLocal(arr);

  // Best-effort backend sync.
  try {
    fetch(apiUrl('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, clientId: user._id })
    }).catch(() => { /* ignore */ });
  } catch { /* ignore */ }

  return user;
};

export const deleteLocalUser = (id: string): boolean => {
  const arr = readLocal();
  const next = arr.filter(u => u._id !== id);
  if (next.length === arr.length) return false;
  writeLocal(next);
  return true;
};

export const getLocalUsers = (): AppUser[] =>
  readLocal().map(u => ({ ...u, _source: 'local' as const }));

export const fetchBackendUsers = async (): Promise<AppUser[]> => {
  try {
    const res = await fetch(apiUrl('/api/users'));
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.data)) return [];
    return data.data.map((u: AppUser) => ({ ...u, _source: 'backend' as const }));
  } catch {
    return [];
  }
};

// Pull additional users from sources we already track so the admin's
// "Tanlanganlarga" picker is never empty just because nobody clicked
// "Sign up" yet. Specifically:
//   - the current browser's logged-in profile (if it's not the admin),
//   - anyone who has ever appeared in a payment / subscription record.
// These are merged into the main list by login (case-insensitive).
const collectDerivedUsers = (): AppUser[] => {
  const derived: AppUser[] = [];
  const now = new Date().toISOString();

  // Always include the built-in demo user so admin can pick them in the
  // "Tanlanganlarga" picker even on a fresh browser — matches the
  // user/user123 shortcut profile.
  derived.push({
    _id: 'demo_bekzod',
    firstName: 'Bekzod',
    lastName: 'Toshmatov',
    login: 'bekzod',
    createdAt: now,
    lastSeenAt: now
  });

  // Current logged-in profile, regardless of whether the active session
  // is admin — admins may have logged in as another user earlier in the
  // same browser and we still want that profile listed.
  try {
    const raw = localStorage.getItem('huquq_user_profile');
    if (raw) {
      const p = JSON.parse(raw);
      // Skip the admin shortcut profile so admin doesn't pick themselves.
      if (p && p.login && String(p.login).toLowerCase() !== 'admin') {
        derived.push({
          _id: 'profile_' + String(p.login).toLowerCase(),
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          login: String(p.login),
          createdAt: now,
          lastSeenAt: now,
          paidTier: (localStorage.getItem('huquq_user_tier') as 'pro' | 'max') || undefined,
          paidUntil: localStorage.getItem('huquq_user_paid_until') || undefined
        });
      }
    }
  } catch { /* ignore */ }

  // Anyone who has a payment / subscription record locally.
  try {
    const raw = localStorage.getItem('huquq_payments_v1');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const s of arr) {
          if (!s?.userLogin || s.userLogin === 'anonymous') continue;
          const [firstName, ...rest] = String(s.userName || '').split(' ');
          derived.push({
            _id: 'pay_' + String(s.userLogin).toLowerCase(),
            firstName: firstName || '',
            lastName: rest.join(' '),
            login: String(s.userLogin),
            createdAt: s.paidAt || now,
            lastSeenAt: s.paidAt || now,
            paidTier: s.tier,
            paidUntil: s.expiresAt
          });
        }
      }
    }
  } catch { /* ignore */ }

  return derived;
};

// Merge backend + local + derived sources. Prefer backend rows when both
// exist (matched by login, case-insensitive — _id may differ between sources).
export const fetchAllUsers = async (): Promise<AppUser[]> => {
  const [backend, local] = await Promise.all([
    fetchBackendUsers(),
    Promise.resolve(getLocalUsers())
  ]);
  const derived = collectDerivedUsers();

  const merged: AppUser[] = [];
  const seen = new Set<string>();
  const push = (u: AppUser) => {
    const key = u.login.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(u);
  };
  backend.forEach(push);
  local.forEach(push);
  derived.forEach(push);

  return merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

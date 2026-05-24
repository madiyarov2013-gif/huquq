// Client-side payments / subscriptions store.
// Acts as a fallback (and source-of-truth in production) when the backend
// isn't reachable — e.g. when the frontend is on Vercel but the Express
// backend only runs on localhost, or when the user just hasn't started it.
//
// The contract is intentionally identical to the backend's response shape so
// AdminPage can merge backend + local records without translation.

import { apiUrl } from './config';

export interface Subscription {
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
  _source?: 'backend' | 'local';
}

export interface SubscriptionStats {
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

const STORE_KEY = 'huquq_payments_v1';

const newId = (): string =>
  'loc_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const notifyChange = (): void => {
  try {
    window.dispatchEvent(new Event('huquq-payments-change'));
  } catch {
    /* SSR safety */
  }
};

const readLocal = (): Subscription[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const writeLocal = (arr: Subscription[]): void => {
  localStorage.setItem(STORE_KEY, JSON.stringify(arr));
  notifyChange();
};

// Re-classify status if expiration date has passed.
const reconcileStatus = (s: Subscription): Subscription => {
  if (s.status === 'cancelled') return s;
  const expired = new Date(s.expiresAt).getTime() < Date.now();
  if (expired && s.status !== 'expired') {
    return { ...s, status: 'expired' };
  }
  if (!expired && s.status === 'expired') {
    return { ...s, status: 'active' };
  }
  return s;
};

export const getLocalPayments = (): Subscription[] =>
  readLocal()
    .map(reconcileStatus)
    .map(s => ({ ...s, _source: 'local' as const }));

// Persist a payment locally + best-effort sync to backend.
export const recordPayment = async (input: {
  userLogin: string;
  userName: string;
  tier: 'pro' | 'max';
  duration: 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  expiresAt: string;
  cardLast4: string;
}): Promise<Subscription> => {
  const sub: Subscription = {
    _id: newId(),
    userLogin: input.userLogin,
    userName: input.userName,
    tier: input.tier,
    duration: input.duration,
    amount: input.amount,
    paidAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    status: 'active',
    cardLast4: input.cardLast4
  };

  // Always store locally first — that's the bit the user controls and what
  // makes the record survive when the backend is unreachable.
  const arr = readLocal();
  arr.push(sub);
  writeLocal(arr);

  // Best-effort backend sync. If the backend is up we send the same record
  // (including our local _id) so the two can be deduped on read.
  try {
    await fetch(apiUrl('/api/subscriptions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userLogin: sub.userLogin,
        userName: sub.userName,
        tier: sub.tier,
        duration: sub.duration,
        amount: sub.amount,
        expiresAt: sub.expiresAt,
        cardLast4: sub.cardLast4,
        clientId: sub._id
      })
    });
  } catch {
    /* offline / no backend — local copy is enough */
  }

  return sub;
};

export const deleteLocalPayment = (id: string): boolean => {
  const arr = readLocal();
  const next = arr.filter(s => s._id !== id);
  if (next.length === arr.length) return false;
  writeLocal(next);
  return true;
};

export const cancelLocalPayment = (userLogin: string): void => {
  const arr = readLocal();
  let touched = false;
  const next = arr.map(s => {
    if (s.userLogin === userLogin && s.status === 'active') {
      touched = true;
      return { ...s, status: 'cancelled' as const };
    }
    return s;
  });
  if (touched) writeLocal(next);
};

// Compute aggregate stats over an arbitrary list (used for the local-only
// dashboard view; can also be used on the merged list).
export const computeStats = (subs: Subscription[]): SubscriptionStats => {
  const now = Date.now();
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const stats: SubscriptionStats = {
    total: subs.length,
    activeCount: 0,
    uniqueUsers: 0,
    proCount: 0, maxCount: 0,
    proActive: 0, maxActive: 0,
    totalRevenue: 0,
    monthlyRevenue: 0
  };
  const users = new Set<string>();
  for (const s of subs) {
    users.add(s.userLogin);
    const isActive = s.status === 'active' && new Date(s.expiresAt).getTime() > now;
    if (isActive) stats.activeCount += 1;
    if (s.tier === 'pro') { stats.proCount += 1; if (isActive) stats.proActive += 1; }
    if (s.tier === 'max') { stats.maxCount += 1; if (isActive) stats.maxActive += 1; }
    stats.totalRevenue += s.amount || 0;
    if (new Date(s.paidAt).getTime() >= monthAgo) {
      stats.monthlyRevenue += s.amount || 0;
    }
  }
  stats.uniqueUsers = users.size;
  return stats;
};

// Fetch backend payments (if reachable). Tagged so admin can show source.
export const fetchBackendPayments = async (): Promise<Subscription[]> => {
  try {
    const res = await fetch(apiUrl('/api/subscriptions'));
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.data)) return [];
    return data.data.map((s: Subscription) => ({ ...s, _source: 'backend' as const }));
  } catch {
    return [];
  }
};

// Merge backend + local, preferring backend record for duplicates (matched
// by _id or clientId echo).
export const fetchAllPayments = async (): Promise<Subscription[]> => {
  const [backend, local] = await Promise.all([
    fetchBackendPayments(),
    Promise.resolve(getLocalPayments())
  ]);
  const seen = new Set(backend.map(s => s._id));
  const localOnly = local.filter(s => !seen.has(s._id));
  return [...backend, ...localOnly].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
  );
};

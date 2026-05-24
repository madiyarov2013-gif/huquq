// Notifications / "qo'ng'iroqlar" store.
// Mirrors the AI/payments stores: writes to localStorage so it works on
// Vercel without a backend, and best-effort POSTs to the Express API so
// truly cross-device delivery works as soon as the backend is reachable.

import { apiUrl } from './config';

export interface Notification {
  _id: string;
  title: string;
  message: string;
  // 'info' = plain announcement. 'gift' = comes with giftDays and/or giftCode.
  type: 'info' | 'gift';
  giftDays?: number;
  giftTier?: 'pro' | 'max';
  giftCode?: string;
  // Discount percentage attached to the promo code (0-100). Applied when a
  // user types this code into the PaymentPage.
  giftPercent?: number;
  // Targeting: when empty/undefined the notification goes to everyone.
  // When set, only users whose login (case-insensitive) is in the list
  // see it in their bell dropdown.
  targetUsers?: string[];
  createdAt: string;
  createdBy?: string; // admin login if known
  _source?: 'backend' | 'local';
}

const STORE_KEY = 'huquq_notifications_v1';
// Per-login read/claim state. Keyed by notification _id so a user who has
// opened a notification doesn't keep seeing the "new" dot, while a different
// login on the same browser starts with a clean slate (admin marking
// something read shouldn't hide it from the user, and vice-versa).
const READ_KEY_PREFIX = 'huquq_notifications_read_v1::';
const CLAIMED_KEY_PREFIX = 'huquq_notifications_claimed_v1::';

const currentLoginKey = (): string => {
  try {
    const p = JSON.parse(localStorage.getItem('huquq_user_profile') || '{}');
    return ((p.login || 'guest') as string).toLowerCase();
  } catch {
    return 'guest';
  }
};

const READ_KEY = (): string => READ_KEY_PREFIX + currentLoginKey();
const CLAIMED_KEY = (): string => CLAIMED_KEY_PREFIX + currentLoginKey();

const newId = (): string =>
  'ntf_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const notify = () => {
  try {
    window.dispatchEvent(new Event('huquq-notifications-change'));
  } catch {
    /* SSR safety */
  }
};

const readLocal = (): Notification[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const writeLocal = (arr: Notification[]) => {
  localStorage.setItem(STORE_KEY, JSON.stringify(arr));
  notify();
};

const readIdSet = (key: string): Set<string> => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const writeIdSet = (key: string, set: Set<string>) => {
  localStorage.setItem(key, JSON.stringify(Array.from(set)));
  notify();
};

export const getReadIds = (): Set<string> => readIdSet(READ_KEY());
export const getClaimedIds = (): Set<string> => readIdSet(CLAIMED_KEY());

export const markRead = (id: string): void => {
  const key = READ_KEY();
  const s = readIdSet(key);
  if (s.has(id)) return;
  s.add(id);
  writeIdSet(key, s);
};

export const markAllRead = (ids: string[]): void => {
  const key = READ_KEY();
  const s = readIdSet(key);
  let touched = false;
  for (const id of ids) {
    if (!s.has(id)) { s.add(id); touched = true; }
  }
  if (touched) writeIdSet(key, s);
};

export const markClaimed = (id: string): void => {
  const key = CLAIMED_KEY();
  const s = readIdSet(key);
  if (s.has(id)) return;
  s.add(id);
  writeIdSet(key, s);
};

// Admin creates a notification — always local, best-effort backend.
export const createNotification = async (input: {
  title: string;
  message: string;
  type: 'info' | 'gift';
  giftDays?: number;
  giftTier?: 'pro' | 'max';
  giftCode?: string;
  giftPercent?: number;
  // Empty/undefined => everyone. Non-empty => only these logins.
  targetUsers?: string[];
  createdBy?: string;
}): Promise<Notification> => {
  const targets = (input.targetUsers || [])
    .map(s => s.trim())
    .filter(Boolean);
  const code = input.giftCode ? input.giftCode.trim() : undefined;
  const pct = code && input.giftPercent && input.giftPercent > 0
    ? Math.min(100, Math.max(0, Math.round(input.giftPercent)))
    : undefined;
  const n: Notification = {
    _id: newId(),
    title: input.title.trim(),
    message: input.message.trim(),
    type: input.type,
    giftDays: input.giftDays && input.giftDays > 0 ? input.giftDays : undefined,
    giftTier: input.giftTier,
    giftCode: code,
    giftPercent: pct,
    targetUsers: targets.length > 0 ? targets : undefined,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy
  };

  const arr = readLocal();
  arr.push(n);
  writeLocal(arr);

  try {
    await fetch(apiUrl('/api/notifications'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...n, clientId: n._id })
    });
  } catch {
    /* backend unreachable — local copy is enough */
  }
  return n;
};

export const deleteLocalNotification = (id: string): boolean => {
  const arr = readLocal();
  const next = arr.filter(n => n._id !== id);
  if (next.length === arr.length) return false;
  writeLocal(next);
  return true;
};

export const getLocalNotifications = (): Notification[] =>
  readLocal().map(n => ({ ...n, _source: 'local' as const }));

export const fetchBackendNotifications = async (): Promise<Notification[]> => {
  try {
    const res = await fetch(apiUrl('/api/notifications'));
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.data)) return [];
    return data.data.map((n: Notification) => ({ ...n, _source: 'backend' as const }));
  } catch {
    return [];
  }
};

// Merged read for both admin (sees all) and user (sees same — admin filter
// can be added later if needed).
export const fetchAllNotifications = async (): Promise<Notification[]> => {
  const [backend, local] = await Promise.all([
    fetchBackendNotifications(),
    Promise.resolve(getLocalNotifications())
  ]);
  const seen = new Set(backend.map(n => n._id));
  const localOnly = local.filter(n => !seen.has(n._id));
  return [...backend, ...localOnly].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

// Look up a promo code (case-insensitive) across local and backend
// notifications. Returns the matching record so PaymentPage can read
// `giftPercent` and apply the discount. If a code appears in multiple
// notifications, the most recently created one wins.
export const findPromoCode = async (code: string): Promise<Notification | null> => {
  const needle = (code || '').trim().toLowerCase();
  if (!needle) return null;
  const all = await fetchAllNotifications();
  const matches = all.filter(n =>
    n.giftCode && n.giftCode.toLowerCase() === needle && (n.giftPercent || 0) > 0
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return matches[0];
};

// Filter a list of notifications down to what the given login should see.
// Admin sees an empty list — they manage notifications via the
// "E'lon yuborish" page, not via their own bell. Non-admin users see
// notifications that are either un-targeted (everyone) or that name their
// login explicitly.
export const visibleForUser = (
  list: Notification[],
  login: string,
  isAdmin: boolean
): Notification[] => {
  if (isAdmin) return [];
  const me = (login || '').toLowerCase();
  return list.filter(n => {
    if (!n.targetUsers || n.targetUsers.length === 0) return true;
    return n.targetUsers.some(t => t.toLowerCase() === me);
  });
};

// Apply a gift to the current user's local subscription state. Returns the
// new expiration date (ISO) so callers can show a confirmation toast.
export const claimGift = (n: Notification): { expiresAt: string | null; code: string | null } => {
  let expiresAt: string | null = null;

  if (n.giftDays && n.giftDays > 0) {
    const tier = n.giftTier || (localStorage.getItem('huquq_user_tier') as 'pro' | 'max') || 'pro';
    const currentUntilRaw = localStorage.getItem('huquq_user_paid_until');
    const base = (() => {
      if (!currentUntilRaw) return new Date();
      const d = new Date(currentUntilRaw);
      // If existing subscription already expired, extend from "now" rather
      // than from the past expiration date.
      return d.getTime() > Date.now() ? d : new Date();
    })();
    base.setDate(base.getDate() + n.giftDays);
    expiresAt = base.toISOString();

    localStorage.setItem('huquq_user_paid', 'true');
    localStorage.setItem('huquq_user_paid_until', expiresAt);
    localStorage.setItem('huquq_user_tier', tier);
    window.dispatchEvent(new Event('huquq-payment-change'));
  }

  markClaimed(n._id);
  markRead(n._id);
  return { expiresAt, code: n.giftCode || null };
};

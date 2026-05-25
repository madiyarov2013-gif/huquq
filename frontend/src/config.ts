// Backend API base URL.
//
// Priority:
//   1. VITE_API_URL env var (set during build) — explicit override.
//      Examples:
//        VITE_API_URL=http://localhost:5000     → use local Express backend
//        VITE_API_URL=https://huquq-main.vercel.app → force Vercel
//   2. When running on localhost without an override, talk to the deployed
//      Vercel backend directly. This way the developer doesn't need to run
//      `npm start` in backend/ for the AI / books / payments features to
//      work. Production frontend already uses same-origin '/api/*' so no
//      change there.
//   3. Same-origin '' (relative URLs) — used when deployed.

const PROD_API_FALLBACK = 'https://huquq-main.vercel.app';

const envUrl = ((import.meta as any).env?.VITE_API_URL || '').toString().trim();

const isLocalHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE = envUrl || (isLocalHost ? PROD_API_FALLBACK : '');

export const apiUrl = (path: string): string => {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
};

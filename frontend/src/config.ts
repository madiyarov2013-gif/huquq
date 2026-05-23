// Backend API base URL.
//
// Priority:
//   1. VITE_API_URL env var (set during build) — use this when deploying.
//      Example: VITE_API_URL=https://your-backend.onrender.com
//   2. http://localhost:5000 when the page is on localhost (dev).
//   3. Same-origin '' (relative URLs) as a last-resort fallback for
//      deployments where backend is reverse-proxied behind the frontend.

const envUrl = ((import.meta as any).env?.VITE_API_URL || '').toString().trim();

const isLocalHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE = envUrl || (isLocalHost ? 'http://localhost:5000' : '');

export const apiUrl = (path: string): string => {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
};

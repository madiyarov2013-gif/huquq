import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './theme'

initTheme();

// Build marker — read with `console.log(window.__HUQUQ_BUILD__)` in devtools
// to confirm you're on the latest deploy rather than a cached one.
const BUILD_STAMP = 'build-2026-05-24-notif-fix-v2-' + Math.random().toString(36).slice(2, 8);
(window as any).__HUQUQ_BUILD__ = BUILD_STAMP;
console.log('%c[huquq] build:', 'color:#06b6d4;font-weight:bold', BUILD_STAMP);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

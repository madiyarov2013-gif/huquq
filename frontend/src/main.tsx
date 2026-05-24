import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './theme'

initTheme();

// Force users back to the login screen every time the browser is opened
// fresh. sessionStorage is cleared automatically when the user closes the
// browser/tab, so an absent marker means "new session" — we then wipe the
// `huquq_user_logged_in` flag (but keep the saved profile/avatar/etc. so
// the login form can pre-fill).
try {
  if (!sessionStorage.getItem('huquq_session_active')) {
    localStorage.setItem('huquq_user_logged_in', 'false');
    localStorage.removeItem('huquq_admin_authed');
    sessionStorage.setItem('huquq_session_active', '1');
  }
} catch {
  /* sessionStorage may be blocked in private mode; in that case we just
     leave the existing login state alone. */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

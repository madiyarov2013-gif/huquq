import React, { useState, useRef } from 'react';
import { User, Lock, Edit2, Save, X, Plus, Upload, LogOut, AtSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { upsertUser } from '../users-store';

// Launch promo: every user gets 30 days of free Pro on their FIRST login or
// registration. We track per-login that the trial was granted so cancelled
// users can't re-grant indefinitely. Returns the actual tier the user ends
// up on, so callers can write the right value to the users-store.
const TRIAL_FLAG_KEY = 'huquq_trial_granted_logins_v1';

const safeSet = (k: string, v: string): boolean => {
  try { localStorage.setItem(k, v); return true; } catch { return false; }
};

const wasTrialGrantedFor = (login: string): boolean => {
  try {
    const raw = localStorage.getItem(TRIAL_FLAG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.includes(login.toLowerCase());
  } catch { return false; }
};

const markTrialGrantedFor = (login: string): void => {
  try {
    const raw = localStorage.getItem(TRIAL_FLAG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const set = new Set(Array.isArray(arr) ? arr : []);
    set.add(login.toLowerCase());
    localStorage.setItem(TRIAL_FLAG_KEY, JSON.stringify(Array.from(set)));
  } catch { /* ignore quota */ }
};

const grantFreeTrial = (
  login: string,
  days = 30,
  tier: 'pro' | 'max' = 'pro'
): { granted: boolean; tier: 'pro' | 'max'; paidUntil: string | undefined } => {
  // 1. If the user already had a trial granted on this device, never re-grant.
  if (login && wasTrialGrantedFor(login)) {
    return {
      granted: false,
      tier: (localStorage.getItem('huquq_user_tier') as 'pro' | 'max') || tier,
      paidUntil: localStorage.getItem('huquq_user_paid_until') || undefined
    };
  }
  // 2. If there's an active subscription, preserve it as-is.
  const currentUntilRaw = localStorage.getItem('huquq_user_paid_until');
  if (currentUntilRaw) {
    const d = new Date(currentUntilRaw);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
      return {
        granted: false,
        tier: (localStorage.getItem('huquq_user_tier') as 'pro' | 'max') || tier,
        paidUntil: currentUntilRaw
      };
    }
  }
  // 3. Grant a fresh trial.
  const until = new Date();
  until.setDate(until.getDate() + days);
  const iso = until.toISOString();
  safeSet('huquq_user_paid', 'true');
  safeSet('huquq_user_paid_until', iso);
  safeSet('huquq_user_tier', tier);
  if (login) markTrialGrantedFor(login);
  try { window.dispatchEvent(new Event('huquq-payment-change')); } catch { /* SSR */ }
  return { granted: true, tier, paidUntil: iso };
};

// Wipe any per-user subscription/profile state so the NEXT account on the
// same browser starts from a clean slate. Called from handleLogout.
const clearUserSession = (): void => {
  try {
    localStorage.removeItem('huquq_admin_authed');
    localStorage.removeItem('huquq_user_profile');
    localStorage.removeItem('huquq_user_paid');
    localStorage.removeItem('huquq_user_paid_until');
    localStorage.removeItem('huquq_user_tier');
    localStorage.removeItem('huquq_user_avatar');
  } catch { /* ignore */ }
};

// === Per-role credential vault ============================================
// Keep admin and user credentials in separate slots so each can be edited
// independently and survive a logout. Without this, an admin who renames
// themselves from "admin" → "myadmin" would lock themselves out as soon as
// they log out, because the default 'admin/admin123' shortcut would still
// be checked first while the saved profile would have been overwritten by
// whichever user logs in next.
const ADMIN_CREDS_KEY = 'huquq_admin_credentials_v1';
const USER_CREDS_KEY = 'huquq_user_credentials_v1';

type Creds = { login: string; password: string; firstName?: string; lastName?: string };

const readCreds = (key: string): Creds | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && c.login && c.password ? c : null;
  } catch { return null; }
};

const writeCreds = (key: string, creds: Creds): void => {
  try { localStorage.setItem(key, JSON.stringify(creds)); } catch { /* ignore */ }
};

// Find which role (if any) the entered login/password matches. We check the
// per-role vaults first (so user-customised credentials win) and fall back
// to the factory shortcuts (admin/admin123 and user/user123) when the
// vault is empty.
const matchRole = (login: string, password: string): {
  role: 'admin' | 'user';
  profile: { firstName: string; lastName: string; login: string; password: string };
} | null => {
  const lowerLogin = login.toLowerCase();

  const adminVault = readCreds(ADMIN_CREDS_KEY);
  if (adminVault && lowerLogin === adminVault.login.toLowerCase() && password === adminVault.password) {
    return {
      role: 'admin',
      profile: {
        firstName: adminVault.firstName || 'Administrator',
        lastName: adminVault.lastName || 'Tizim',
        login: adminVault.login,
        password: adminVault.password
      }
    };
  }
  if (!adminVault && lowerLogin === 'admin' && password === 'admin123') {
    return {
      role: 'admin',
      profile: { firstName: 'Administrator', lastName: 'Tizim', login: 'admin', password: 'admin123' }
    };
  }

  const userVault = readCreds(USER_CREDS_KEY);
  if (userVault && lowerLogin === userVault.login.toLowerCase() && password === userVault.password) {
    return {
      role: 'user',
      profile: {
        firstName: userVault.firstName || 'Foydalanuvchi',
        lastName: userVault.lastName || '',
        login: userVault.login,
        password: userVault.password
      }
    };
  }
  if (!userVault && lowerLogin === 'user' && password === 'user123') {
    return {
      role: 'user',
      profile: { firstName: 'Bekzod', lastName: 'Toshmatov', login: 'user', password: 'user123' }
    };
  }
  return null;
};

const boyAvatars = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4&mouth=smile&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jude&backgroundColor=ffdfbf&mouth=smile,twinkle&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack&backgroundColor=b6e3f4&mouth=smile&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo&backgroundColor=c0aede&mouth=smile&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Max&backgroundColor=d1d4f9&mouth=smile,twinkle&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sam&backgroundColor=ffdfbf&mouth=smile&eyes=happy'
];

const girlAvatars = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=ffdfbf&mouth=smile&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sara&backgroundColor=d1d4f9&mouth=smile&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria&backgroundColor=ffdfbf&mouth=smile,twinkle&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia&backgroundColor=b6e3f4&mouth=smile&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Lily&backgroundColor=c0aede&mouth=smile,twinkle&eyes=happy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe&backgroundColor=d1d4f9&mouth=smile&eyes=happy'
];

const ProfilePage = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('huquq_user_logged_in') === 'true';
  });

  const avatarKey = () =>
    localStorage.getItem('huquq_admin_authed') === 'true'
      ? 'huquq_admin_avatar'
      : 'huquq_user_avatar';

  const [isEditing, setIsEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    const v = localStorage.getItem(avatarKey()) || null;
    // Blob URLs (blob:http://…) don't survive a page reload — they were
    // created in a previous session and are now dead. Drop them so we fall
    // back to the default User icon instead of showing a broken image.
    if (v && v.startsWith('blob:')) {
      localStorage.removeItem(avatarKey());
      return null;
    }
    return v;
  });
  const [avatarBroken, setAvatarBroken] = useState<boolean>(false);
  
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [avatarTab, setAvatarTab] = useState<'boys' | 'girls'>('boys');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('huquq_user_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    const defaultProfile = {
      firstName: 'Bekzod',
      lastName: 'Toshmatov',
      login: 'bekzod',
      password: 'user123'
    };
    localStorage.setItem('huquq_user_profile', JSON.stringify(defaultProfile));
    return defaultProfile;
  });

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerData, setRegisterData] = useState({
    firstName: '',
    lastName: '',
    login: '',
    password: ''
  });

  React.useEffect(() => {
    const checkAuth = () => {
      const logged = localStorage.getItem('huquq_user_logged_in') === 'true';
      if (logged !== isLoggedIn) {
        setIsLoggedIn(logged);
      }
      // Reload avatar matching the current account (user/admin have separate keys)
      const v = localStorage.getItem(avatarKey()) || null;
      if (v && v.startsWith('blob:')) {
        localStorage.removeItem(avatarKey());
        setAvatarUrl(null);
      } else {
        setAvatarUrl(v);
      }
      setAvatarBroken(false);
    };
    window.addEventListener('huquq-auth-change', checkAuth);
    window.addEventListener('storage', checkAuth);
    return () => {
      window.removeEventListener('huquq-auth-change', checkAuth);
      window.removeEventListener('storage', checkAuth);
    };
  }, [isLoggedIn]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    setIsEditing(false);
    setShowAvatarSelector(false);
    localStorage.setItem('huquq_user_profile', JSON.stringify(formData));
    localStorage.setItem('huquq_user_logged_in', 'true');
    // Persist updated login/password into the per-role vault so the next
    // login uses the new credentials. The role is whichever the current
    // session has — admin vs. regular user — so renaming admin to
    // "myadmin" or changing user's password actually sticks.
    const isAdminNow = localStorage.getItem('huquq_admin_authed') === 'true';
    const vaultKey = isAdminNow ? ADMIN_CREDS_KEY : USER_CREDS_KEY;
    if (formData?.login && formData?.password) {
      writeCreds(vaultKey, {
        login: String(formData.login).trim(),
        password: String(formData.password),
        firstName: formData.firstName,
        lastName: formData.lastName
      });
    }
    window.dispatchEvent(new Event('huquq-auth-change'));
  };

  const handleCancel = () => {
    setIsEditing(false);
    setShowAvatarSelector(false);
    // restore from localStorage
    const saved = localStorage.getItem('huquq_user_profile');
    if (saved) {
      try {
        setFormData(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Read as base64 data URL so the avatar survives page reloads.
    // (URL.createObjectURL produces a blob:… URL that dies with the page.)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      setAvatarUrl(dataUrl);
      setAvatarBroken(false);
      try {
        localStorage.setItem(avatarKey(), dataUrl);
      } catch {
        // localStorage may overflow on very large images — keep state but
        // skip persistence in that case so the UI still updates.
      }
      window.dispatchEvent(new Event('huquq-auth-change'));
      setShowAvatarSelector(false);
    };
    reader.readAsDataURL(file);
  };

  const selectDemoAvatar = (url: string) => {
    setAvatarUrl(url);
    setAvatarBroken(false);
    localStorage.setItem(avatarKey(), url);
    window.dispatchEvent(new Event('huquq-auth-change'));
    setShowAvatarSelector(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.setItem('huquq_user_logged_in', 'false');
    // Wipe subscription + profile state so the next account on this browser
    // doesn't inherit anything (otherwise grantFreeTrial sees a stale
    // paidUntil and silently denies the trial / mis-attributes paid days).
    clearUserSession();
    window.dispatchEvent(new Event('huquq-auth-change'));
    window.dispatchEvent(new Event('huquq-payment-change'));
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const inputLogin = loginUsername.trim();

    // 1. Match per-role vault first (so admin/user who renamed themselves
    //    keep working) and fall back to the factory shortcuts.
    const match = matchRole(inputLogin, loginPassword);
    if (match) {
      const profile = match.profile;
      localStorage.setItem('huquq_user_profile', JSON.stringify(profile));
      localStorage.setItem('huquq_user_logged_in', 'true');
      if (match.role === 'admin') {
        localStorage.setItem('huquq_admin_authed', 'true');
        // Seed the admin vault on first successful default-creds login so
        // future profile edits land in the right slot.
        if (!readCreds(ADMIN_CREDS_KEY)) writeCreds(ADMIN_CREDS_KEY, profile);
        setFormData(profile);
        setIsLoggedIn(true);
        window.dispatchEvent(new Event('huquq-auth-change'));
        setLoginUsername('');
        setLoginPassword('');
        navigate('/admin');
        return;
      }
      // Regular user
      localStorage.removeItem('huquq_admin_authed');
      if (!readCreds(USER_CREDS_KEY)) writeCreds(USER_CREDS_KEY, profile);
      const trial = grantFreeTrial(profile.login, 30, 'pro');
      upsertUser({
        firstName: profile.firstName,
        lastName: profile.lastName,
        login: profile.login,
        paidTier: trial.tier,
        paidUntil: trial.paidUntil
      });
      setFormData(profile);
      setIsLoggedIn(true);
      window.dispatchEvent(new Event('huquq-auth-change'));
      setLoginUsername('');
      setLoginPassword('');
      navigate('/');
      return;
    }

    // 2. Fallback: also accept the currently-saved profile credentials.
    //    Useful right after a user registers — the profile is set even if
    //    the vault wasn't (registration path also seeds the vault now).
    const saved = localStorage.getItem('huquq_user_profile');
    if (!saved) {
      setErrorMsg("Login yoki parol noto'g'ri!");
      return;
    }

    try {
      const profile = JSON.parse(saved);
      const profileLogin = (profile.login || '').trim();
      if (inputLogin.toLowerCase() === profileLogin.toLowerCase() && loginPassword === profile.password) {
        setFormData(profile);
        setIsLoggedIn(true);
        localStorage.setItem('huquq_user_logged_in', 'true');
        localStorage.removeItem('huquq_admin_authed');
        // Seed the user vault so this exact set of credentials keeps
        // working on next visit.
        writeCreds(USER_CREDS_KEY, {
          login: profile.login,
          password: profile.password,
          firstName: profile.firstName,
          lastName: profile.lastName
        });
        const trial = grantFreeTrial(profileLogin, 30, 'pro');
        upsertUser({
          firstName: profile.firstName,
          lastName: profile.lastName,
          login: profile.login,
          paidTier: trial.tier,
          paidUntil: trial.paidUntil
        });
        window.dispatchEvent(new Event('huquq-auth-change'));
        setLoginUsername('');
        setLoginPassword('');
        navigate('/');
      } else {
        setErrorMsg("Login yoki parol noto'g'ri!");
      }
    } catch (err) {
      setErrorMsg("Tizimda xatolik yuz berdi.");
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!registerData.firstName || !registerData.lastName || !registerData.login || !registerData.password) {
      setErrorMsg("Iltimos, barcha maydonlarni to'ldiring.");
      return;
    }

    // Save profile to localStorage but keep logged_in false
    localStorage.setItem('huquq_user_profile', JSON.stringify(registerData));
    localStorage.setItem('huquq_user_logged_in', 'false');
    // Seed the user vault so the just-registered credentials authenticate
    // on the next login (and survive logout).
    writeCreds(USER_CREDS_KEY, {
      login: registerData.login,
      password: registerData.password,
      firstName: registerData.firstName,
      lastName: registerData.lastName
    });
    // Launch promo: every new sign-up gets 30 days of free Pro (once per
    // login per device). Use the returned tier/expiry so we never lie to
    // the users-store about the user's actual paid state.
    const trial = grantFreeTrial(registerData.login, 30, 'pro');
    upsertUser({
      firstName: registerData.firstName,
      lastName: registerData.lastName,
      login: registerData.login,
      paidTier: trial.tier,
      paidUntil: trial.paidUntil
    });
    window.dispatchEvent(new Event('huquq-auth-change'));

    // Switch to login tab and prefill the login
    setLoginUsername(registerData.login);
    setFormData(registerData);
    setRegisterData({ firstName: '', lastName: '', login: '', password: '' });
    setSuccessMsg("Ro'yxatdan o'tish muvaffaqiyatli! Sizga 30 kun BEPUL Pro obuna sovg'a qilindi 🎁");
    setAuthMode('login');
  };

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', animation: 'fadeIn 0.3s ease-in-out' }}>
        <div style={{ 
          background: '#fff', 
          border: '1px solid #e2e8f0', 
          borderRadius: '24px', 
          padding: '40px', 
          width: '100%', 
          maxWidth: '450px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
          textAlign: 'center'
        }}>
          <div style={{ 
            width: '72px', height: '72px', borderRadius: '50%', 
            backgroundColor: '#eff6ff', color: '#3b82f6', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            margin: '0 auto 24px auto' 
          }}>
            <User size={36} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
            {authMode === 'login' ? 'Tizimga kirish' : "Ro'yxatdan o'tish"}
          </h2>
          <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '24px' }}>
            {authMode === 'login' ? 'Profilingizga kirish uchun ma\'lumotlarni kiriting' : 'Profil yaratish uchun ma\'lumotlaringizni kiriting'}
          </p>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setErrorMsg(null); setSuccessMsg(null); }}
              style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontWeight: '600', fontSize: '14px', transition: 'all 0.2s',
                backgroundColor: authMode === 'login' ? '#fff' : 'transparent',
                color: authMode === 'login' ? '#3b82f6' : '#64748b',
                boxShadow: authMode === 'login' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Kirish
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setErrorMsg(null); setSuccessMsg(null); }}
              style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontWeight: '600', fontSize: '14px', transition: 'all 0.2s',
                backgroundColor: authMode === 'register' ? '#fff' : 'transparent',
                color: authMode === 'register' ? '#3b82f6' : '#64748b',
                boxShadow: authMode === 'register' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Ro'yxatdan o'tish
            </button>
          </div>

          {successMsg && (
            <div style={{ 
              backgroundColor: '#ecfdf5', 
              color: '#10b981', 
              padding: '12px 16px', 
              borderRadius: '10px', 
              fontSize: '14px', 
              fontWeight: '500',
              marginBottom: '20px',
              textAlign: 'left',
              border: '1px solid #d1fae5'
            }}>
              ✅ {successMsg}
            </div>
          )}

          {errorMsg && (
            <div style={{ 
              backgroundColor: '#fef2f2', 
              color: '#ef4444', 
              padding: '12px 16px', 
              borderRadius: '10px', 
              fontSize: '14px', 
              fontWeight: '500',
              marginBottom: '20px',
              textAlign: 'left',
              border: '1px solid #fee2e2'
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={handleLoginSubmit}>
              <div style={{ display: 'grid', gap: '20px', marginBottom: '24px', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Login</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                      <AtSign size={18} />
                    </div>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      placeholder="Loginingizni kiriting..."
                      value={loginUsername}
                      onChange={e => setLoginUsername(e.target.value)}
                      style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Parolingiz</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                      <Lock size={18} />
                    </div>
                    <input 
                      type="password" 
                      required
                      placeholder="Parol..."
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                style={{ 
                  width: '100%', padding: '16px', backgroundColor: '#3b82f6', 
                  color: '#fff', border: 'none', borderRadius: '12px', 
                  fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', fontSize: '15px',
                  boxShadow: '0 8px 15px rgba(59, 130, 246, 0.2)' 
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
              >
                Kirish
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit}>
              <div style={{ display: 'grid', gap: '16px', marginBottom: '24px', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Ismingiz</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Ism..."
                      value={registerData.firstName}
                      onChange={e => setRegisterData(prev => ({ ...prev, firstName: e.target.value }))}
                      style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Familiyangiz</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Familiya..."
                      value={registerData.lastName}
                      onChange={e => setRegisterData(prev => ({ ...prev, lastName: e.target.value }))}
                      style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Login</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                      <AtSign size={18} />
                    </div>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      placeholder="Login tanlang..."
                      value={registerData.login}
                      onChange={e => setRegisterData(prev => ({ ...prev, login: e.target.value }))}
                      style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Yangi parol</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      required
                      placeholder="Parol yarating..."
                      value={registerData.password}
                      onChange={e => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                style={{
                  width: '100%', padding: '16px', backgroundColor: '#3b82f6',
                  color: '#fff', border: 'none', borderRadius: '12px',
                  fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', fontSize: '15px',
                  boxShadow: '0 8px 15px rgba(59, 130, 246, 0.2)'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
              >
                Ro'yxatdan o'tish
              </button>
            </form>
          )}
        </div>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="profile-page" style={{ width: '100%', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 5px 0', fontSize: '28px', color: '#1e293b' }}>Shaxsiy Profil</h1>
          <p className="page-subtitle" style={{ margin: 0, color: '#64748b', fontSize: '15px' }}>Ma'lumotlaringizni ko'rish va tahrirlash</p>
        </div>
        {!isEditing ? (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={() => setIsEditing(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)' }}
            >
              <Edit2 size={18} />
              Tahrirlash
            </button>
            <button 
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fcd3d3'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
            >
              <LogOut size={18} />
              Chiqish
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={handleCancel}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}
            >
              <X size={18} />
              Bekor qilish
            </button>
            <button 
              onClick={handleSave}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)' }}
            >
              <Save size={18} />
              Saqlash
            </button>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)', border: '1px solid #f1f5f9', display: 'flex', gap: '50px', alignItems: 'flex-start' }}>
        
        {/* Rasm qismi (chapda, katta to'rtburchak) */}
        <div style={{ position: 'relative', width: '220px', flexShrink: 0 }}>
          <div style={{ 
              width: '220px', height: '220px', borderRadius: '24px', backgroundColor: '#eff6ff', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              border: '2px solid #e2e8f0', overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.1), 0 8px 10px -6px rgba(59, 130, 246, 0.1)' 
            }}>
            {avatarUrl && !avatarBroken ? (
              <img
                src={avatarUrl}
                alt=""
                onError={() => setAvatarBroken(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <span style={{ fontSize: '80px', fontWeight: 'bold', color: '#3b82f6', letterSpacing: '4px' }}>
                {(formData.firstName?.charAt(0) || '').toUpperCase()}{(formData.lastName?.charAt(0) || '').toUpperCase()}
              </span>
            )}
          </div>
          
          {isEditing && (
            <>
              <button 
                onClick={() => setShowAvatarSelector(!showAvatarSelector)}
                style={{ 
                  position: 'absolute', bottom: '-15px', right: '-15px', 
                  backgroundColor: '#3b82f6', color: '#fff', border: '4px solid #fff', 
                  borderRadius: '50%', width: '50px', height: '50px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                  zIndex: 10
                }}
              >
                {showAvatarSelector ? <X size={24} /> : <Plus size={24} />}
              </button>

              {/* Avatar Selector Popup */}
              {showAvatarSelector && (
                <div style={{ 
                  position: 'absolute', top: '100%', left: '0', marginTop: '20px',
                  backgroundColor: '#fff', borderRadius: '16px', padding: '15px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0',
                  width: '320px', zIndex: 20
                }}>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Katalogdan tanlang:</p>
                  
                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                    <button 
                      onClick={() => setAvatarTab('boys')}
                      style={{ 
                        flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', 
                        fontWeight: '500', fontSize: '13px', transition: 'all 0.2s',
                        backgroundColor: avatarTab === 'boys' ? '#fff' : 'transparent',
                        color: avatarTab === 'boys' ? '#3b82f6' : '#64748b',
                        boxShadow: avatarTab === 'boys' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >
                      O'g'il bolalar
                    </button>
                    <button 
                      onClick={() => setAvatarTab('girls')}
                      style={{ 
                        flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', 
                        fontWeight: '500', fontSize: '13px', transition: 'all 0.2s',
                        backgroundColor: avatarTab === 'girls' ? '#fff' : 'transparent',
                        color: avatarTab === 'girls' ? '#ec4899' : '#64748b',
                        boxShadow: avatarTab === 'girls' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >
                      Qiz bolalar
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '15px' }}>
                    {(avatarTab === 'boys' ? boyAvatars : girlAvatars).map((url, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => selectDemoAvatar(url)}
                        style={{ 
                          width: '100%', aspectRatio: '1', borderRadius: '12px', overflow: 'hidden', 
                          cursor: 'pointer', border: '2px solid transparent',
                          transition: 'border-color 0.2s', backgroundColor: '#f8fafc'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.borderColor = avatarTab === 'boys' ? '#3b82f6' : '#ec4899'}
                        onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
                      >
                        <img src={url} alt={`Demo Avatar ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                  
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      style={{ 
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        gap: '8px', padding: '10px', backgroundColor: '#f8fafc', 
                        color: '#3b82f6', border: '1px dashed #cbd5e1', borderRadius: '8px', 
                        cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' 
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                    >
                      <Upload size={18} />
                      Yoki fayldan yuklash
                    </button>
                  </div>
                </div>
              )}

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </>
          )}
        </div>

        {/* Form qismi (o'ngda) */}
        {!isEditing ? (
          <div style={{ display: 'grid', gap: '24px', flexGrow: 1 }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
              borderRadius: '20px', 
              padding: '24px 30px', 
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '16px', 
                backgroundColor: '#3b82f6', 
                color: '#fff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: '800'
              }}>
                {(formData.firstName?.charAt(0) || 'U').toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#1e3a8a', margin: '0 0 6px 0' }}>
                  {formData.firstName} {formData.lastName}
                </h3>
                <span style={{ 
                  backgroundColor: '#3b82f6', 
                  color: '#fff', 
                  padding: '5px 12px', 
                  borderRadius: '30px', 
                  fontSize: '12px', 
                  fontWeight: '700',
                  letterSpacing: '0.5px'
                }}>
                  Foydalanuvchi hisobi
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ism</span>
                <span style={{ fontSize: '16px', color: '#0f172a', fontWeight: '700' }}>{formData.firstName || '-'}</span>
              </div>
              <div style={{ backgroundColor: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Familiya</span>
                <span style={{ fontSize: '16px', color: '#0f172a', fontWeight: '700' }}>{formData.lastName || '-'}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Login</span>
                <span style={{ fontSize: '16px', color: '#0f172a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AtSign size={16} color="#64748b" /> {formData.login || '-'}
                </span>
              </div>
              <div style={{ backgroundColor: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parol</span>
                <span style={{ fontSize: '16px', color: '#0f172a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '2px' }}>
                  <Lock size={16} color="#64748b" /> ••••••••
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '24px', flexGrow: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Ism */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Ism</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                    <User size={18} />
                  </div>
                  <input 
                    type="text" 
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Familiya */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Familiya</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                    <User size={18} />
                  </div>
                  <input 
                    type="text" 
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* Login */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Login</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                  <AtSign size={18} />
                </div>
                <input
                  type="text"
                  name="login"
                  value={formData.login || ''}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Parol */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Parol</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#94a3b8' }}>
                  <Lock size={18} />
                </div>
                <input 
                  type="text" 
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', fontSize: '15px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;

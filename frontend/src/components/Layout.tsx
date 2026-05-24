import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { WalleBot } from './WalleBot';
import ProfilePage from '../pages/ProfilePage';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('huquq_user_logged_in') === 'true';
  });
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('huquq_admin_authed') === 'true';
  });
  const [isPaid, setIsPaid] = useState(() => {
    return localStorage.getItem('huquq_user_paid') === 'true';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const checkAuth = () => {
      const logged = localStorage.getItem('huquq_user_logged_in') === 'true';
      if (logged !== isLoggedIn) {
        setIsLoggedIn(logged);
      }
      setIsAdmin(localStorage.getItem('huquq_admin_authed') === 'true');
      setIsPaid(localStorage.getItem('huquq_user_paid') === 'true');
    };

    window.addEventListener('huquq-auth-change', checkAuth);
    window.addEventListener('huquq-payment-change', checkAuth);
    window.addEventListener('storage', checkAuth);

    return () => {
      window.removeEventListener('huquq-auth-change', checkAuth);
      window.removeEventListener('huquq-payment-change', checkAuth);
      window.removeEventListener('storage', checkAuth);
    };
  }, [isLoggedIn]);

  // Route protection for admins: redirect to /admin if accessing student-only pages
  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      const allowedAdminPaths = ['/admin', '/profile', '/settings', '/ai-assistant'];
      const currentPath = location.pathname;
      const isAllowed = allowedAdminPaths.some(path => currentPath === path || currentPath.startsWith(path + '/'));

      if (!isAllowed) {
        navigate('/admin', { replace: true });
      }
    }
  }, [isLoggedIn, isAdmin, location.pathname, navigate]);

  // Gate AI assistant behind payment for non-admin users
  useEffect(() => {
    if (isLoggedIn && !isAdmin && !isPaid && location.pathname.startsWith('/ai-assistant')) {
      navigate('/payment', { replace: true });
    }
  }, [isLoggedIn, isAdmin, isPaid, location.pathname, navigate]);

  if (!isLoggedIn) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh', 
        width: '100vw',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: '20px',
        boxSizing: 'border-box',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999
      }}>
        <ProfilePage />
      </div>
    );
  }

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen && <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />}
      <div className="main-wrapper">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      <WalleBot />
    </div>
  );
};

export default Layout;


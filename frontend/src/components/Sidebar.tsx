import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  GraduationCap,
  ClipboardList,
  Bookmark,
  User,
  Settings,
  Sparkles,
  Scale,
  ShieldCheck,
  BookOpen,
  Bot,
  Crown,
  Lock,
  Wallet
} from 'lucide-react';

interface NavItem {
  path: string;
  icon: React.ReactNode;
  label: string;
  hasSubmenu?: boolean;
  adminTab?: string; // for admin tab links
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('huquq_admin_authed') === 'true');
  const [isPaid, setIsPaid] = useState(() => localStorage.getItem('huquq_user_paid') === 'true');

  useEffect(() => {
    const handleChange = () => {
      setIsAdmin(localStorage.getItem('huquq_admin_authed') === 'true');
      setIsPaid(localStorage.getItem('huquq_user_paid') === 'true');
    };

    window.addEventListener('huquq-auth-change', handleChange);
    window.addEventListener('huquq-payment-change', handleChange);
    window.addEventListener('storage', handleChange);

    return () => {
      window.removeEventListener('huquq-auth-change', handleChange);
      window.removeEventListener('huquq-payment-change', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  const currentTab = new URLSearchParams(location.search).get('tab');

  const navItems: NavItem[] = isAdmin
    ? [
        { path: '/admin', icon: <Home size={20} />, label: 'Bosh sahifa', adminTab: 'dashboard' },
        { path: '/admin?tab=books', icon: <BookOpen size={20} />, label: 'Darsliklar', adminTab: 'books' },
        { path: '/admin?tab=tests', icon: <ClipboardList size={20} />, label: 'Testlar qo\'shish', adminTab: 'tests' },
        { path: '/admin?tab=ai', icon: <Bot size={20} />, label: 'AI yordamchi', adminTab: 'ai' },
        { path: '/admin?tab=payments', icon: <Wallet size={20} />, label: "To'lovlar", adminTab: 'payments' },
        { path: '/profile', icon: <User size={20} />, label: 'Profil' },
        { path: '/settings', icon: <Settings size={20} />, label: 'Sozlamalar' },
      ]
    : [
        { path: '/', icon: <Home size={20} />, label: 'Bosh sahifa' },
        { path: '/classes', icon: <GraduationCap size={20} />, label: 'Sinflar' },
        { path: '/tests', icon: <ClipboardList size={20} />, label: 'Testlar', hasSubmenu: true },
        { path: '/saved', icon: <Bookmark size={20} />, label: 'Saqlanganlar' },
        { path: '/payment', icon: <Crown size={20} />, label: isPaid ? 'Premium obuna' : "To'lov" },
        { path: '/profile', icon: <User size={20} />, label: 'Profil' },
        { path: '/settings', icon: <Settings size={20} />, label: 'Sozlamalar' },
      ];

  const isItemActive = (item: NavItem) => {
    if (item.adminTab !== undefined) {
      if (location.pathname !== '/admin') return false;
      const tab = currentTab || 'dashboard';
      return tab === item.adminTab;
    }
    return location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
  };

  return (
    <aside
      className={`sidebar ${isOpen ? 'open' : ''}`}
      style={isAdmin ? { borderRight: '1px solid #4338ca' } : undefined}
      onClick={(e) => {
        // Auto-close on mobile when nav link is clicked
        const target = e.target as HTMLElement;
        if (target.closest('a') && onClose) onClose();
      }}
    >
      <div className="sidebar-header" style={isAdmin ? { background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)', borderBottom: '2px solid #4338ca' } : undefined}>
        <Scale className="logo-icon" style={isAdmin ? { color: '#818cf8' } : undefined} />
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Huquq ilovasi
            {isAdmin && (
              <span style={{ 
                fontSize: '10px', 
                backgroundColor: '#4338ca', 
                color: '#c7d2fe', 
                padding: '2px 6px', 
                borderRadius: '4px', 
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Admin
              </span>
            )}
          </h1>
          <p>{isAdmin ? 'Tizim Boshqaruvi' : 'Bilim - adolat sari'}</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, index) => {
          const isActive = isItemActive(item);

          return (
            <div key={index}>
              <Link 
                to={item.path} 
                className={`nav-item ${isActive && !item.hasSubmenu ? 'active' : ''} ${isActive && item.hasSubmenu ? 'active-light' : ''}`}
                style={isAdmin && isActive ? { background: 'linear-gradient(135deg, #4f46e5 0%, #311042 100%)', boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3)' } : undefined}
              >
                <div className="nav-item-content">
                  <span className="nav-item-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.hasSubmenu && (
                  <span className="arrow">{'>'}</span>
                )}
              </Link>
              
              {isActive && item.label === 'Testlar' && (
                 <div className="sidebar-submenu">
                    <Link to="/tests/by-class" className="submenu-item active">
                      <div className="dot"></div>
                      Sinflar bo'yicha testlar
                    </Link>
                 </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {!isAdmin ? (
          <>
            <Link
              to={isPaid ? '/ai-assistant' : '/payment'}
              className="ai-assistant-btn"
              title={isPaid ? "AI yordamchi" : "AI yordamchini ochish uchun to'lov qiling"}
            >
              {isPaid ? <Sparkles size={18} /> : <Lock size={18} />}
              {isPaid ? 'AI yordamchi' : 'AI ni ochish'}
            </Link>
          </>
        ) : (
          <div className="promo-card" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)', border: '1px solid #4338ca' }}>
            <ShieldCheck size={40} color="#818cf8" style={{marginBottom: 10}}/>
            <p style={{ color: '#c7d2fe', fontSize: '13px', lineHeight: '1.5' }}>
              Tizim boshqaruvi faol. Ilova darsliklari va testlarini nazorat qiling.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;

import { Bell, Menu, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onMenuClick?: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem('huquq_admin_authed') === 'true';
  });

  useEffect(() => {
    const loadUser = () => {
      const isLoggedIn = localStorage.getItem('huquq_user_logged_in') === 'true';
      setIsAdmin(localStorage.getItem('huquq_admin_authed') === 'true');
      if (isLoggedIn) {
        const saved = localStorage.getItem('huquq_user_profile');
        if (saved) {
          try {
            const profile = JSON.parse(saved);
            setUserName(profile.firstName || '');
          } catch (e) {
            console.error(e);
          }
        }
        const avatar = localStorage.getItem('huquq_user_avatar');
        setAvatarUrl(avatar);
      } else {
        setUserName('');
        setAvatarUrl(null);
      }
    };

    loadUser();
    
    window.addEventListener('huquq-auth-change', loadUser);
    window.addEventListener('storage', loadUser);
    
    return () => {
      window.removeEventListener('huquq-auth-change', loadUser);
      window.removeEventListener('storage', loadUser);
    };
  }, []);

  return (
    <header className="top-header" style={isAdmin ? { background: 'rgba(30, 27, 75, 0.05)', borderBottom: '1px solid #4338ca' } : undefined}>
      <div className="header-left">
        <button className="menu-toggle" onClick={onMenuClick} aria-label="Menyu">
          <Menu size={24} />
        </button>
        <div className="welcome-text">
          {isAdmin ? (
            <>
              <h2 style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #311042 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Tizim boshqaruvchisi 🛠️
              </h2>
              <p style={{ color: '#4338ca', fontWeight: '600' }}>Tizim ma'lumotlarini boshqarish va tahrirlash paneli.</p>
            </>
          ) : (
            <>
              <h2>Xush kelibsiz{userName ? `, ${userName}` : ''}! 👋</h2>
              <p>Bilimingizni oshirishda davom eting.</p>
            </>
          )}
        </div>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button className="notification-btn">
          <Bell size={20} />
          <span className="notification-dot"></span>
        </button>
        
        {/* User avatar/profile link in header */}
        <div 
          onClick={() => navigate('/profile')}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px', 
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            transition: 'all 0.2s',
            border: '2px solid transparent'
          }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
          title="Profilga o'tish"
        >
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            backgroundColor: '#eff6ff', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
            border: '1px solid #cbd5e1'
          }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={20} color="#3b82f6" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

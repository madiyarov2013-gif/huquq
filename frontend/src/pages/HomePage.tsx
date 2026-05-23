
import { BookOpen, ClipboardList, Bot, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  return (
    <div className="home-dashboard" style={{ padding: '20px', width: '100%', margin: '0 auto' }}>
      
      {/* Welcome Banner */}
      <div style={{ 
        background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)', 
        borderRadius: '24px', 
        padding: '40px 50px', 
        color: '#fff', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '40px',
        boxShadow: '0 20px 40px -15px rgba(37, 99, 235, 0.4)'
      }}>
        <div style={{ maxWidth: '600px' }}>
          <h1 style={{ fontSize: '36px', margin: '0 0 15px 0', fontWeight: '800', letterSpacing: '-0.5px' }}>Huquq ilovasiga xush kelibsiz! 👋</h1>
          <p style={{ fontSize: '18px', margin: '0 0 30px 0', opacity: 0.9, lineHeight: 1.6 }}>
            Bu yerda siz huquqshunoslik sirlarini o'rganishingiz, qonunlarni o'qishingiz va o'z bilimlaringizni amalda sinab ko'rishingiz mumkin.
          </p>
          <Link to="/classes" style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '8px', 
            backgroundColor: '#fff', color: '#1e40af', 
            padding: '14px 28px', borderRadius: '14px', 
            textDecoration: 'none', fontWeight: '700', fontSize: '16px',
            transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' 
          }}>
            O'qishni boshlash <ArrowRight size={20} />
          </Link>
        </div>
        <div style={{ padding: '25px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%', backdropFilter: 'blur(10px)' }}>
          <ShieldCheck size={120} color="#fff" strokeWidth={1.5} />
        </div>
      </div>

      <h2 style={{ fontSize: '24px', color: '#1e293b', marginBottom: '25px', fontWeight: '700' }}>Asosiy bo'limlar</h2>

      {/* Quick Links / Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* Books Card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '35px', border: '1px solid #f1f5f9', transition: 'all 0.3s', boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px', color: '#3b82f6' }}>
            <BookOpen size={32} />
          </div>
          <h3 style={{ fontSize: '22px', color: '#0f172a', margin: '0 0 12px 0', fontWeight: '700' }}>Darsliklar va Qonunlar</h3>
          <p style={{ color: '#64748b', margin: '0 0 25px 0', lineHeight: 1.6, fontSize: '15px' }}>Maktab darsliklari va O'zbekiston Respublikasi Konstitutsiyasi, hamda qonun hujjatlarini o'qing.</p>
          <Link to="/classes" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px' }}>
            Kirish <ArrowRight size={18} />
          </Link>
        </div>

        {/* Tests Card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '35px', border: '1px solid #f1f5f9', transition: 'all 0.3s', boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#fdf4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px', color: '#c026d3' }}>
            <ClipboardList size={32} />
          </div>
          <h3 style={{ fontSize: '22px', color: '#0f172a', margin: '0 0 12px 0', fontWeight: '700' }}>Testlar va Mashqlar</h3>
          <p style={{ color: '#64748b', margin: '0 0 25px 0', lineHeight: 1.6, fontSize: '15px' }}>O'zlashtirgan bilimlaringizni sinovdan o'tkazing va bilimingizni yanada mustahkamlang.</p>
          <Link to="/tests" style={{ color: '#c026d3', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px' }}>
            Kirish <ArrowRight size={18} />
          </Link>
        </div>

        {/* AI Assistant Card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '35px', border: '1px solid #f1f5f9', transition: 'all 0.3s', boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px', color: '#10b981' }}>
            <Bot size={32} />
          </div>
          <h3 style={{ fontSize: '22px', color: '#0f172a', margin: '0 0 12px 0', fontWeight: '700' }}>AI Yordamchi</h3>
          <p style={{ color: '#64748b', margin: '0 0 25px 0', lineHeight: 1.6, fontSize: '15px' }}>Tushunmagan huquqiy savollaringizga sun'iy intellektdan zudlik bilan javob oling.</p>
          <Link to="/ai-assistant" style={{ color: '#10b981', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px' }}>
            Kirish <ArrowRight size={18} />
          </Link>
        </div>

      </div>

    </div>
  );
};

export default HomePage;

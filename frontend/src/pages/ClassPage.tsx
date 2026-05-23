import { useState, useEffect } from 'react';
import { apiUrl } from '../config';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Gavel, Lock, GraduationCap } from 'lucide-react';
import { getBooksByGrade } from '../data/books';
import BookReader3D from '../components/BookReader3D';

const gradesList = [
  { id: '6', title: '6-sinf', desc: 'Huquqiy savodxonlik asoslari bilan ilk tanishuv.', color: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', text: '#1e40af', iconColor: '#3b82f6' },
  { id: '7', title: '7-sinf', desc: 'Davlat, jamiyat va huquqning asosiy prinsiplari.', color: 'linear-gradient(135deg, #f5f3ff 0%, #edd8ff 100%)', text: '#6b21a8', iconColor: '#8b5cf6' },
  { id: '8', title: '8-sinf', desc: 'Konstitutsiyaviy huquq asoslari va asosiy burchlar.', color: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', text: '#065f46', iconColor: '#10b981' },
  { id: '9', title: '9-sinf', desc: 'O\'zbekiston Respublikasi Konstitutsiyasini o\'rganish.', color: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', text: '#92400e', iconColor: '#f59e0b' },
  { id: '10', title: '10-sinf', desc: 'Davlat va huquq asoslari hamda amaliy qo\'llanmalar.', color: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)', text: '#9d174d', iconColor: '#ec4899' },
  { id: '11', title: '11-sinf', desc: 'Fuqarolik, jinoyat, mehnat va xalqaro huquq asoslari.', color: 'linear-gradient(135deg, #fff5f5 0%, #fed7d7 100%)', text: '#9b2c2c', iconColor: '#f56565' }
];

const ClassPage = () => {
  const { id } = useParams();
  const isValidGrade = id && ['6', '7', '8', '9', '10', '11'].includes(id);

  const [readingBook, setReadingBook] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const isLoggedIn = localStorage.getItem('huquq_user_logged_in') === 'true';

  useEffect(() => {
    if (!isLoggedIn || !isValidGrade) return;

    const fetchBooks = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/classes/${id}/books`));
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          setBooks(data.data);
        } else {
          setBooks(getBooksByGrade(id));
        }
      } catch (err) {
        console.error('Darsliklarni yuklashda xatolik:', err);
        setBooks(getBooksByGrade(id));
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
    setReadingBook(null);
  }, [id, isLoggedIn, isValidGrade]);

  if (!isLoggedIn) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '65vh', 
        textAlign: 'center',
        padding: '20px',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{ 
          background: '#fff', 
          border: '1px solid #e2e8f0', 
          borderRadius: '24px', 
          padding: '40px', 
          width: '100%', 
          maxWidth: '480px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '50%', 
            backgroundColor: '#fee2e2', color: '#ef4444', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            marginBottom: '24px' 
          }}>
            <Lock size={36} />
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Darsliklar qulflangan</h3>
          <p style={{ color: '#64748b', fontSize: '15px', lineHeight: '1.6', marginBottom: '30px' }}>
            Kitoblarni va darsliklarni o'qish uchun iltimos tizimga kiring yoki ro'yxatdan o'ting.
          </p>
          <Link 
            to="/profile" 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '100%', 
              padding: '14px 20px', 
              backgroundColor: '#3b82f6', 
              color: '#fff', 
              textDecoration: 'none', 
              borderRadius: '12px', 
              fontWeight: '700', 
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)', 
              transition: 'background-color 0.2s',
              fontSize: '15px'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            Tizimga kirish (Profil)
          </Link>
        </div>
      </div>
    );
  }

  if (readingBook) {
    return <BookReader3D book={readingBook} onClose={() => setReadingBook(null)} />;
  }

  // If we are at /classes, show the beautiful grid of classes
  if (!isValidGrade) {
    return (
      <div style={{ animation: 'fadeIn 0.3s ease-in-out', padding: '10px 0' }}>
        <div style={{ marginBottom: '35px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>Sinflarni tanlang</h2>
          <p style={{ color: '#64748b', fontSize: '16px' }}>Qonun va darsliklarni o'rganish uchun kerakli sinfni tanlang</p>
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: '25px' 
        }}>
          {gradesList.map((grade) => {
            const booksCount = getBooksByGrade(grade.id).length;
            return (
              <Link 
                to={`/classes/${grade.id}`} 
                key={grade.id}
                style={{ 
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  background: grade.color,
                  borderRadius: '24px',
                  padding: '30px',
                  border: '1px solid rgba(226, 232, 240, 0.8)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-6px)';
                  e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.08), 0 10px 10px -5px rgba(0,0,0,0.04)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
                }}
              >
                {/* Large Background Number */}
                <div style={{ 
                  position: 'absolute',
                  right: '-10px',
                  bottom: '-25px',
                  fontSize: '120px',
                  fontWeight: '900',
                  color: 'rgba(0, 0, 0, 0.03)',
                  lineHeight: '1',
                  userSelect: 'none'
                }}>
                  {grade.id}
                </div>

                <div style={{ 
                  width: '50px', 
                  height: '50px', 
                  borderRadius: '14px', 
                  backgroundColor: '#fff', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginBottom: '20px',
                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.03)',
                  color: grade.iconColor
                }}>
                  <GraduationCap size={26} />
                </div>

                <h3 style={{ 
                  fontSize: '22px', 
                  fontWeight: '800', 
                  color: grade.text, 
                  margin: '0 0 10px 0' 
                }}>
                  {grade.title} darsliklari
                </h3>
                
                <p style={{ 
                  color: '#475569', 
                  fontSize: '14px', 
                  lineHeight: '1.5',
                  margin: '0 0 20px 0',
                  flexGrow: 1
                }}>
                  {grade.desc}
                </p>

                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginTop: 'auto',
                  borderTop: '1px solid rgba(0, 0, 0, 0.04)',
                  paddingTop: '15px',
                  zIndex: 2
                }}>
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    color: '#64748b',
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    padding: '4px 10px',
                    borderRadius: '30px'
                  }}>
                    {booksCount} ta kitob
                  </span>
                  
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    fontSize: '14px', 
                    fontWeight: '700', 
                    color: grade.text
                  }}>
                    O'qish <ChevronRight size={16} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
      <div className="section-header" style={{ marginTop: 0 }}>
        <div>
          <h3>{id}-sinf uchun kitoblar</h3>
          <p>Tanlangan sinfga mos darsliklar va qo'llanmalar</p>
        </div>
        <Link to="/classes" className="view-all-link" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          Sinflarni tanlash <ChevronRight size={16} />
        </Link>
      </div>

      {loading ? (
        <div className="books-grid">
          {[1, 2, 3].map((n) => (
            <div className="book-card" key={n} style={{ opacity: 0.8, pointerEvents: 'none' }}>
              <div 
                style={{ 
                  height: '180px', 
                  borderRadius: '12px', 
                  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', 
                  backgroundSize: '200% 100%', 
                  animation: 'shimmer 1.5s infinite' 
                }}
              ></div>
              <div style={{ height: '20px', width: '80%', marginTop: '15px', borderRadius: '4px', background: '#e2e8f0', animation: 'pulse 1.5s infinite' }}></div>
              <div style={{ height: '14px', width: '50%', marginTop: '8px', borderRadius: '4px', background: '#e2e8f0', animation: 'pulse 1.5s infinite' }}></div>
              <div style={{ height: '36px', width: '100%', marginTop: 'auto', borderRadius: '8px', background: '#e2e8f0' }}></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="books-grid">
          {books.map((book, idx) => (
            <div className="book-card" key={idx}>
              <div className="book-cover" style={{ backgroundColor: book.color || '#1e3a8a', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                <span style={{ color: '#fde047', fontSize: '0.6rem', textAlign: 'center', marginBottom: '10px' }}>O'ZBEKISTON RESPUBLIKASI</span>
                <span style={{ color: '#fde047', fontSize: '0.9rem', fontWeight: 'bold', textAlign: 'center' }}>{book.code}</span>
                <div style={{ marginTop: '20px', borderTop: '1px solid #fde047', borderBottom: '1px solid #fde047', padding: '5px 0' }}>
                  <Gavel size={24} color="#fde047" />
                </div>
              </div>
              <h4>{book.title}</h4>
              {book.subtitle && <p>{book.subtitle}</p>}
              <button className="btn-outline" style={{ marginTop: 'auto' }} onClick={() => setReadingBook(book)}>O'qish</button>
            </div>
          ))}
          {books.length === 0 && (
            <p style={{ color: 'var(--text-gray)' }}>Ushbu sinf uchun hozircha kitoblar mavjud emas.</p>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .reader-content h3 { color: var(--primary-base); margin-bottom: 20px; font-size: 1.5rem; }
        .reader-content h4 { color: var(--text-dark); margin: 25px 0 15px 0; font-size: 1.2rem; }
        .reader-content p { margin-bottom: 15px; }
        .reader-content ul { padding-left: 20px; margin-bottom: 15px; }
        .reader-content li { margin-bottom: 8px; }
      `}</style>
    </div>
  );
};

export default ClassPage;

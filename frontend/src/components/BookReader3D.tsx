import React, { useState } from 'react';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface BookReaderProps {
  book: any;
  onClose: () => void;
}

const BookReader: React.FC<BookReaderProps> = ({ book, onClose }) => {
  const pages = book.pages || (book.content ? [book.content] : []);
  const totalPages = pages.length || 1;

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeHighlight, setActiveHighlight] = useState('');

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery || pages.length === 0) {
      setActiveHighlight('');
      return;
    }

    const query = cleanQuery.toLowerCase();
    const qApostrophes = query.replace(/[‘’`´ʻʼ']/g, "'");
    const cleanString = (s: string) => s.replace(/[^a-z0-9]/g, '');
    const qClean = cleanString(qApostrophes);

    const foundPageIndex = pages.findIndex((page: string) => {
      const pageText = page.replace(/<[^>]*>/g, ' '); // Strip HTML tags
      const tApostrophes = pageText.toLowerCase().replace(/[‘’`´ʻʼ']/g, "'");

      if (tApostrophes.includes(qApostrophes)) return true;

      const tClean = cleanString(tApostrophes);
      if (qClean.length > 0 && tClean.includes(qClean)) return true;

      return false;
    });

    if (foundPageIndex !== -1) {
      setCurrentPage(foundPageIndex + 1);
      setActiveHighlight(cleanQuery);
    } else {
      alert("Hech narsa topilmadi.");
    }
  };

  const highlightHtml = (html: string, search: string): string => {
    if (!search.trim()) return html;
    
    const cleanSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const patternStr = cleanSearch.replace(/['‘’`´ʻʼ]/g, "['‘’`´ʻʼ']?");
    const regex = new RegExp(`(<[^>]*>)|(${patternStr})`, 'gi');
    
    return html.replace(regex, (_match, tag, textNode) => {
      if (tag) {
        return tag;
      }
      return `<mark style="background-color: #fef08a; color: #0f172a; padding: 2px 4px; border-radius: 4px; font-weight: 600;">${textNode}</mark>`;
    });
  };

  return (
    <div className="book-reader-container" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
      <div className="reader-header" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px'}}>
         <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <div>
              <h2 style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-dark)'}}>{book.title}</h2>
              <p style={{color: 'var(--text-gray)'}}>{book.subtitle}</p>
            </div>
         </div>
         
         <form onSubmit={handleSearch} className="search-form">
           <input 
             type="text" 
             placeholder="Modda yoki so'zni izlash..." 
             value={searchQuery}
             onChange={(e) => {
               const val = e.target.value;
               setSearchQuery(val);
               if (!val.trim()) {
                 setActiveHighlight('');
               }
             }}
             className="search-input"
           />
           <button type="submit" className="search-btn">
             <Search size={18} />
           </button>
         </form>
         
         <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
           <BookOpen size={30} color="var(--primary-base)" />
         </div>
      </div>
      
      <div className="reader-content-wrapper">
         <div className="reader-paper">
           {pages[currentPage - 1] ? (
             <div dangerouslySetInnerHTML={{ __html: highlightHtml(pages[currentPage - 1], activeHighlight) }} />
           ) : (
             <div className="empty-page-placeholder">
                <p>{currentPage}-varaq</p>
                <p style={{fontSize: '1rem', color: '#94a3b8', marginTop: '10px'}}>Bu sahifaga ma'lumot kiritilmagan.</p>
             </div>
           )}
         </div>

         {/* Varaqni o'girish qismi (Pagination) */}
         <div className="pagination-container">
            <button 
              className="page-btn" 
              onClick={handlePrevPage} 
              disabled={currentPage === 1}
            >
              <ChevronLeft size={20} />
              <span>Oldingi</span>
            </button>
            
            <div className="page-indicator">
               <span className="current">{currentPage}</span>
               <span className="divider">/</span>
               <span className="total">{totalPages}</span>
            </div>
            
            <button 
              className="page-btn" 
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              <span>Keyingi</span>
              <ChevronRight size={20} />
            </button>
         </div>
      </div>

      {/* Floating Back Button */}
      <button onClick={onClose} className="floating-back-btn" title="Ortga qaytish">
        <ArrowLeft size={22} />
      </button>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .reader-content-wrapper {
          background: #f8fafc;
          padding: 20px 20px 40px 20px;
          border-radius: var(--border-radius-lg);
          border: 1px solid var(--border-color);
          box-shadow: inset 0 2px 10px rgba(0,0,0,0.02);
          position: relative;
        }

        .reader-paper {
          background: #ffffff;
          padding: 60px 80px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.05);
          min-height: 60vh;
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          margin-bottom: 30px;
        }

        .empty-page-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 40vh;
          color: #cbd5e1;
          font-size: 2rem;
          font-weight: 600;
        }

        /* Pagination Styles */
        .pagination-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 30px;
          padding: 15px;
          background: white;
          border-radius: 50px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.05);
          width: max-content;
          margin: 0 auto;
          border: 1px solid #e2e8f0;
        }

        .page-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 8px 16px;
          border-radius: 20px;
          border: none;
          background: #f1f5f9;
          color: #475569;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .page-btn:hover:not(:disabled) {
          background: #4338ca;
          color: white;
        }

        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: #f8fafc;
        }

        .page-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
        }

        .page-indicator .current {
          color: #4338ca;
          font-size: 1.1rem;
        }

        .page-indicator .divider {
          color: #94a3b8;
        }

        .page-indicator .total {
          color: #64748b;
          font-size: 0.95rem;
        }

        /* Constitution Styling */
        .constitution-section {
          color: #4338ca;
          font-size: 1.4rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 50px;
        }

        .constitution-chapter {
          color: #0f172a;
          font-size: 1.2rem;
          font-weight: 800;
          margin-top: 40px;
          margin-bottom: 25px;
        }

        .constitution-article {
          color: #334155;
          font-size: 1.1rem;
          line-height: 1.8;
          margin-bottom: 15px;
        }

        .article-number {
          color: #0f172a;
          font-weight: 700;
          margin-right: 5px;
        }

        .constitution-text {
          color: #334155;
          font-size: 1.05rem;
          line-height: 1.9;
          margin-bottom: 25px;
        }

        /* Search Styles */
        .search-form {
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 30px;
          padding: 5px 15px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
          transition: all 0.3s ease;
          width: 300px;
        }

        .search-form:focus-within {
          border-color: #4338ca;
          box-shadow: 0 4px 15px rgba(67, 56, 202, 0.1);
        }

        .search-input {
          border: none;
          outline: none;
          padding: 8px 10px;
          flex-grow: 1;
          font-size: 0.95rem;
          color: #334155;
          background: transparent;
        }

        .search-input::placeholder {
          color: #94a3b8;
        }

        .search-btn {
          background: #f8fafc;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .search-btn:hover {
          background: #4338ca;
          color: white;
        }



        .floating-back-btn {
          position: fixed;
          top: 110px; /* Below the 88px app header */
          left: 310px; /* Right of the 280px sidebar */
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--primary-gradient);
          color: white;
          box-shadow: 0 8px 20px rgba(67, 56, 202, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          border: none;
        }

        .floating-back-btn:hover {
          transform: translateY(-3px) scale(1.1);
          box-shadow: 0 12px 28px rgba(67, 56, 202, 0.45);
          background: var(--primary-hover);
        }

        .floating-back-btn:active {
          transform: translateY(-1px) scale(0.95);
        }

        @media (max-width: 768px) {
          .floating-back-btn {
            top: 100px;
            left: 20px;
            width: 42px;
            height: 42px;
          }
        }
      `}</style>
    </div>
  );
};

export default BookReader;


import React, { useState, useRef, useEffect } from 'react';
import {
  getAiSettings, setAiSettings,
  pickActiveKey, recordKeyUsage, getAiStats
} from '../ai-store';
import type { AiStats, AiSettings } from '../ai-store';
import { generateGemini, friendlyError } from '../ai-client';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  time: string;
}

const formatTime = () =>
  new Date().toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit' });

const AiAssistantPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'limits'>('chat');

  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [stats, setStats] = useState<AiStats>({
    keysTotal: 0, keysActive: 0, usedToday: 0, dailyLimit: 0, date: ''
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = getAiSettings();
    setSettings(s);
    setStats(getAiStats());
    setMessages([{
      id: 1,
      text: s.greeting || 'Assalomu alaykum!',
      sender: 'bot',
      time: formatTime()
    }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Pick up newly added API keys / settings changes from admin immediately —
  // either via the same-tab `huquq-ai-change` event, cross-tab `storage`
  // event, or when the tab regains focus.
  useEffect(() => {
    const refresh = () => {
      setSettings(getAiSettings());
      setStats(getAiStats());
    };
    window.addEventListener('huquq-ai-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('huquq-ai-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: Date.now(), text: input.trim(), sender: 'user', time: formatTime()
    };
    setMessages(prev => [...prev, userMsg]);
    const msgText = input.trim();
    setInput('');
    setIsTyping(true);

    const liveSettings = getAiSettings();
    if (!liveSettings.enabled) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "AI hozircha o'chirilgan. Administrator yoqishi kerak.",
        sender: 'bot',
        time: formatTime()
      }]);
      setIsTyping(false);
      return;
    }

    const key = pickActiveKey();
    if (!key) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "Faol API kalit topilmadi. Administrator panelida kalit qo'shing.",
        sender: 'bot',
        time: formatTime()
      }]);
      setIsTyping(false);
      return;
    }

    try {
      const { reply, model } = await generateGemini(
        key.apiKey,
        liveSettings.defaultModel,
        `${liveSettings.systemPrompt}\n\nFoydalanuvchi: ${msgText}`
      );

      if (model && model !== liveSettings.defaultModel) {
        const next = { ...liveSettings, defaultModel: model };
        setAiSettings(next);
        setSettings(next);
      }

      recordKeyUsage(key._id);
      setStats(getAiStats());

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: reply,
        sender: 'bot',
        time: formatTime()
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: friendlyError(err),
        sender: 'bot',
        time: formatTime()
      }]);
    }
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const tabs = [
    { id: 'chat' as const, label: 'Suhbat', icon: '💬' },
    { id: 'limits' as const, label: 'Limitlar', icon: '📊' }
  ];

  const statusText = !settings
    ? 'Sozlamalar yuklanmoqda...'
    : !settings.enabled
      ? "AI o'chirilgan (administrator yoqishi kerak)"
      : stats.keysActive === 0
        ? "API kalit topilmadi (administrator qo'shishi kerak)"
        : `Ulangan — ${settings.defaultProvider}`;

  return (
    <div className="ai-assistant-page">
      <div className="ai-tabs-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`ai-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'chat' && (
        <>
          <div className="ai-chat-header">
            <div className="ai-chat-header-left">
              <div className="ai-avatar-ring"><div className="ai-avatar-dot"></div></div>
              <div>
                <h2 className="ai-chat-title">Huquqiy AI Yordamchi</h2>
                <span className="ai-chat-status"><span className="status-dot"></span>{statusText}</span>
              </div>
            </div>
          </div>
          <div className="ai-chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`ai-msg ${msg.sender}`}>
                {msg.sender === 'bot' && <div className="ai-msg-avatar">🤖</div>}
                <div className="ai-msg-content">
                  <p>{msg.text}</p>
                  <span className="ai-msg-time">{msg.time}</span>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="ai-msg bot">
                <div className="ai-msg-avatar">🤖</div>
                <div className="ai-msg-content typing">
                  <div className="typing-dots"><span></span><span></span><span></span></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="ai-chat-input-bar">
            <textarea
              className="ai-chat-input"
              placeholder="Savolingizni yozing..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button className="ai-chat-send" onClick={handleSend} disabled={!input.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </>
      )}

      {activeTab === 'limits' && (
        <div className="ai-limits-section">
          <h2>Limitlar va statistika</h2>
          <div className="ai-limits-grid">
            <div className="ai-limit-card">
              <div className="ai-limit-icon">📨</div>
              <div className="ai-limit-data">
                <span className="ai-limit-value">{stats.usedToday} / {stats.dailyLimit}</span>
                <span className="ai-limit-label">Bugungi so'rovlar</span>
              </div>
            </div>
            <div className="ai-limit-card">
              <div className="ai-limit-icon">🔑</div>
              <div className="ai-limit-data">
                <span className="ai-limit-value">{stats.keysTotal}</span>
                <span className="ai-limit-label">Jami kalitlar</span>
              </div>
            </div>
            <div className="ai-limit-card">
              <div className="ai-limit-icon">✅</div>
              <div className="ai-limit-data">
                <span className="ai-limit-value">{stats.keysActive}</span>
                <span className="ai-limit-label">Faol kalitlar</span>
              </div>
            </div>
            <div className="ai-limit-card">
              <div className="ai-limit-icon">⚡</div>
              <div className="ai-limit-data">
                <span className="ai-limit-value">{Math.max(0, stats.dailyLimit - stats.usedToday)}</span>
                <span className="ai-limit-label">Qoldiq so'rovlar</span>
              </div>
            </div>
          </div>
          <p style={{ marginTop: '20px', color: '#64748b', fontSize: '14px' }}>
            API kalitlarni boshqarish faqat administratorda.
          </p>
        </div>
      )}
    </div>
  );
};

export default AiAssistantPage;

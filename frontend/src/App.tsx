import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ClassPage from './pages/ClassPage';
import AiAssistantPage from './pages/AiAssistantPage';
import SavedPage from './pages/SavedPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import TestsPage from './pages/TestsPage';
import AdminPage from './pages/AdminPage';
import PaymentPage from './pages/PaymentPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="classes" element={<ClassPage />} />
          <Route path="classes/:id" element={<ClassPage />} />
          <Route path="ai-assistant" element={<AiAssistantPage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="tests/*" element={<TestsPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="payment" element={<PaymentPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

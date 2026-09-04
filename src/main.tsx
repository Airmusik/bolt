import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import App from './App';
import './index.css';
import './styles/site-palette.css';
import { getInitialTheme, applyTheme } from '@/lib/theme';
import { SiteSettingsProvider } from '@/lib/siteSettings';
import { PromotionLiveProvider } from '@/lib/promotionLive';

applyTheme(getInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SiteSettingsProvider><AuthProvider><PromotionLiveProvider><App /></PromotionLiveProvider></AuthProvider></SiteSettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);

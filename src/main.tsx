import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import App from './App';
import './index.css';
import './styles/site-palette.css';
import { applyCachedSiteTheme } from '@/lib/siteTheme';

applyCachedSiteTheme();
import { getInitialTheme, applyTheme } from '@/lib/theme';
import { SiteSettingsProvider } from '@/lib/siteSettings';
import { PromotionLiveProvider } from '@/lib/promotionLive';

applyTheme(getInitialTheme());

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SiteSettingsProvider><AuthProvider><PromotionLiveProvider><App /></PromotionLiveProvider></AuthProvider></SiteSettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);

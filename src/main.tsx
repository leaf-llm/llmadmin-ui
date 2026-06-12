import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import faviconUrl from './assets/favicon.png';

import './i18n';
import './styles.css';

const link = document.createElement('link');
link.rel = 'icon';
link.type = 'image/png';
link.href = faviconUrl;
document.head.appendChild(link);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

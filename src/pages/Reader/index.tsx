import React from 'react';
import { createRoot } from 'react-dom/client';
import { createChromeArea } from '../../shared/storage/storageArea';
import { ReaderEnvProvider } from './env';
import App from './App';

const env = {
  area: createChromeArea(),
  openTab: (url: string) => {
    chrome.tabs.create({ url });
  },
};

createRoot(document.getElementById('app-container')!).render(
  <ReaderEnvProvider env={env}>
    <App />
  </ReaderEnvProvider>
);

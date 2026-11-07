import React from 'react';
import { createRoot } from 'react-dom/client';
import { createChromeArea } from '../../shared/storage/storageArea';
import { ReaderEnvProvider } from './env';
import App from './App';
import { createBrowserBackend } from './tts/speaker';

const env = {
  area: createChromeArea(),
  openTab: (url: string) => {
    chrome.tabs.create({ url });
  },
  speech: createBrowserBackend(),
};

createRoot(document.getElementById('app-container')!).render(
  <ReaderEnvProvider env={env}>
    <App />
  </ReaderEnvProvider>
);

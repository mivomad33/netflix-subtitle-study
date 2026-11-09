import React from 'react';
import { createRoot } from 'react-dom/client';
import { createExtensionClient } from '../../shared/rpc/extClient';
import { ReaderEnvProvider } from './env';
import App from './App';
import { AuthGate } from './account/AuthGate';
import { createBrowserBackend } from './tts/speaker';

// 저장소와 로그인은 서비스 워커에 부탁한다(Firebase는 서비스 워커에서만 돈다).
const client = createExtensionClient();

const env = {
  area: client.area,
  openTab: (url: string) => {
    chrome.tabs.create({ url });
  },
  speech: createBrowserBackend(),
};

createRoot(document.getElementById('app-container')!).render(
  <ReaderEnvProvider env={env}>
    <AuthGate auth={client.auth}>
      <App />
    </AuthGate>
  </ReaderEnvProvider>
);

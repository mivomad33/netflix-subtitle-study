// E2E 빌드(npm run build:e2e) 전용 서비스 워커. 일반 빌드에는 들어가지 않는다(check:build가 표시를 검사한다, 4.11-3).
// 에뮬레이터(demo- 프로젝트)에 붙고, 로그인 창 대신 테스트가 정한 가짜 Google 계정으로 로그인한다.
import { connectAuthEmulator } from 'firebase/auth/web-extension';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../../shared/firebase/config';
import { createBackend } from './backend';
import { serveChromePorts } from './server';
import { cleanupOldLocalData } from './localCleanup';

export const E2E_MARKER = 'NF_STUDY_E2E_EMULATOR_LOGIN';

let account = { sub: 'e2e-a', email: 'a@example.test' };

cleanupOldLocalData(chrome.storage.local as never).catch(() => {});

const backend = createBackend({
  config: FIREBASE_CONFIG!,
  emulator: {
    auth: (auth) => connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }),
    db: (db) => connectFirestoreEmulator(db, '127.0.0.1', 8080),
  },
  // 에뮬레이터는 서명하지 않은 가짜 ID 토큰을 받는다.
  getIdToken: async () => JSON.stringify({ sub: account.sub, email: account.email, email_verified: true }),
});

(globalThis as unknown as { nfStudyE2E: unknown }).nfStudyE2E = {
  marker: E2E_MARKER,
  setAccount(sub: string, email: string) {
    account = { sub, email };
  },
  state: () => backend.state(),
};

serveChromePorts(backend);

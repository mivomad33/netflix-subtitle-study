import { DEFAULT_OAUTH_CLIENT_ID, FIREBASE_CONFIG } from '../../shared/firebase/config';
import { createBackend, createUnconfiguredBackend } from './backend';
import { serveChromePorts } from './server';
import { launchGoogleSignIn } from './googleSignIn';
import { cleanupOldLocalData } from './localCleanup';

// 서비스 워커. Firebase(로그인·Firestore)는 여기서만 돌고, 화면과 넷플릭스 content script는 포트로 부탁한다.
cleanupOldLocalData(chrome.storage.local as never).catch((e) =>
  console.error('[NF-STUDY] Failed to clean up old local data:', e instanceof Error ? e.name : 'error')
);

serveChromePorts(
  FIREBASE_CONFIG
    ? createBackend({
        config: FIREBASE_CONFIG,
        getIdToken: () => launchGoogleSignIn(FIREBASE_CONFIG!.oauthClientId || DEFAULT_OAUTH_CLIENT_ID),
      })
    : createUnconfiguredBackend()
);

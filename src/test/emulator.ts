// 에뮬레이터 통합 테스트의 공통 도우미. 운영 프로젝트에 닿지 않게 demo- 프로젝트 id만 쓴다(4.11-1).
import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import { Auth, GoogleAuthProvider, connectAuthEmulator, getAuth, signInWithCredential } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, initializeFirestore, memoryLocalCache, terminate } from 'firebase/firestore';

export const PROJECT_ID = 'demo-nf-study';
export const FIRESTORE_HOST = '127.0.0.1';
export const FIRESTORE_PORT = 8080;
export const AUTH_URL = 'http://127.0.0.1:9099';

let counter = 0;

export interface TestClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  uid: string;
  close(): Promise<void>;
}

// 에뮬레이터는 서명하지 않은 가짜 Google ID 토큰을 받는다(테스트 전용).
export async function signedInClient(sub: string, email = `${sub}@example.test`): Promise<TestClient> {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, appId: 'demo-app' }, `test-${counter++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  const credential = GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }));
  const { user } = await signInWithCredential(auth, credential);
  const db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);
  return {
    app,
    auth,
    db,
    uid: user.uid,
    async close() {
      await terminate(db);
      await deleteApp(app);
    },
  };
}

export async function clearFirestore() {
  const res = await fetch(
    `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`clear firestore failed: ${res.status}`);
}

export async function clearAuth() {
  const res = await fetch(`${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`clear auth failed: ${res.status}`);
}

// 에뮬레이터의 Auth 사용자 uid 목록.
export async function listAuthUids(): Promise<string[]> {
  const res = await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = (await res.json()) as { userInfo?: { localId: string }[] };
  return (body.userInfo ?? []).map((u) => u.localId);
}

// 규칙을 거치지 않고 문서 수를 센다(관리자 권한).
export async function countDocs(path: string): Promise<number> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?pageSize=1000`,
    { headers: { Authorization: 'Bearer owner' } }
  );
  const body = (await res.json()) as { documents?: unknown[] };
  return body.documents?.length ?? 0;
}

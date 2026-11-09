// 서비스 워커의 Firebase(로그인·Firestore). 확장 프로그램 안에서 Firebase는 여기서만 돈다.
// 화면과 content script는 포트(server.ts)로 부탁한다.
import { FirebaseApp, initializeApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import {
  GoogleAuthProvider,
  deleteUser,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithCredential,
  signOut,
} from 'firebase/auth/web-extension';
import {
  Firestore,
  FirestoreSettings,
  clearIndexedDbPersistence,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  terminate,
} from 'firebase/firestore';
import { FirebaseWebConfig } from '../../shared/firebase/config';
import { AuthState, SignedOutNotice } from '../../shared/auth/types';
import { FirestoreArea, createFirestoreArea } from '../../shared/storage/firestoreArea';
import { StorageChanges } from '../../shared/storage/storageArea';
import { StorageError, toStorageErrorCode } from '../../shared/storage/errors';
import { deleteAccount as runDeleteAccount } from './account';

export interface Backend {
  state(): AuthState;
  onState(listener: (state: AuthState) => void): () => void;
  // 로그인했을 때만 있다.
  area(): FirestoreArea | null;
  onChanges(listener: (changes: StorageChanges) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

// E2E 빌드만 쓴다: 만든 Auth·Firestore를 에뮬레이터에 붙인다. 일반 빌드에는 에뮬레이터 연결 코드가 들어가지 않는다(4.11-3).
export interface EmulatorHooks {
  auth(auth: Auth): void;
  db(db: Firestore): void;
}

export interface BackendOptions {
  config: FirebaseWebConfig;
  // 로그인 창을 띄워 Google ID 토큰을 받는다. 취소하면 StorageError('cancelled').
  getIdToken: () => Promise<string>;
  emulator?: EmulatorHooks;
}

// 설정 없이 빌드한 확장 프로그램(4.10-5).
export function createUnconfiguredBackend(): Backend {
  const fail = async () => {
    throw new StorageError('not-configured');
  };
  return {
    state: () => ({ status: 'unconfigured' }),
    onState: () => () => {},
    area: () => null,
    onChanges: () => () => {},
    signIn: fail,
    signOut: fail,
    deleteAccount: fail,
  };
}

export function createBackend(options: BackendOptions): Backend {
  const app: FirebaseApp = initializeApp({
    apiKey: options.config.apiKey,
    authDomain: options.config.authDomain,
    projectId: options.config.projectId,
    appId: options.config.appId,
  });
  const auth: Auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  options.emulator?.auth(auth);

  const createDb = (): Firestore => {
    // 서비스 워커에는 XMLHttpRequest가 없어 fetch 스트림을 쓴다. 공개 타입에는 없는 설정이다.
    const settings = {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({ forceOwnership: true }) }),
      ignoreUndefinedProperties: true,
      useFetchStreams: true,
    } as FirestoreSettings;
    const db = initializeFirestore(app, settings);
    options.emulator?.db(db);
    return db;
  };

  let db = createDb();
  let current: FirestoreArea | null = null;
  let currentUid: string | null = null;
  let unsubscribeArea: (() => void) | null = null;
  let state: AuthState = { status: 'loading' };
  // 다음 로그아웃 상태에 붙일 안내. 앱이 로그아웃시키지 않았는데 사용자가 없어지면 만료로 본다(4.1-3).
  let pendingNotice: SignedOutNotice | null = null;
  // 캐시를 지우는 동안 새 로그인이 Firestore를 쓰지 않게 기다린다.
  let resetting: Promise<void> = Promise.resolve();
  const stateListeners = new Set<(s: AuthState) => void>();
  const changeListeners = new Set<(c: StorageChanges) => void>();

  const setState = (next: AuthState) => {
    state = next;
    stateListeners.forEach((l) => l(next));
  };

  const closeArea = () => {
    unsubscribeArea?.();
    unsubscribeArea = null;
    current?.close();
    current = null;
    currentUid = null;
  };

  const openArea = (uid: string) => {
    if (currentUid === uid && current) return;
    closeArea();
    current = createFirestoreArea(db, uid);
    currentUid = uid;
    unsubscribeArea = current.onChanged((changes) => changeListeners.forEach((l) => l(changes)));
  };

  // 4.1-4 로그아웃·탈퇴 뒤 Firestore SDK 캐시(IndexedDB)를 지운다.
  const resetCache = async () => {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    db = createDb();
  };

  // 저장소를 닫고(필요하면 그사이 다른 일을 하고) 캐시를 지운다. 끝날 때까지 새 로그인은 기다린다.
  const closeAndReset = async (between?: () => Promise<void>) => {
    const done = (async () => {
      closeArea();
      await between?.();
      await resetCache();
    })();
    resetting = done.catch(() => {});
    await done;
  };

  onAuthStateChanged(auth, (user: User | null) => {
    resetting.then(() => {
      if (user) {
        openArea(user.uid);
        setState({ status: 'signedIn', email: user.email ?? '' });
        return;
      }
      const hadUser = currentUid !== null;
      closeArea();
      const notice = pendingNotice ?? (hadUser ? 'expired' : undefined);
      pendingNotice = null;
      setState(notice ? { status: 'signedOut', notice } : { status: 'signedOut' });
    });
  });

  const credential = async () => GoogleAuthProvider.credential(await options.getIdToken());

  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw new StorageError(toStorageErrorCode(e));
    }
  };

  return {
    state: () => state,
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    area: () => (state.status === 'signedIn' ? current : null),
    onChanges(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    signIn: () =>
      wrap(async () => {
        await resetting;
        await signInWithCredential(auth, await credential());
      }),
    signOut: () =>
      wrap(async () => {
        pendingNotice = 'signed-out';
        await closeAndReset(() => signOut(auth));
      }),
    deleteAccount: () =>
      wrap(async () => {
        const user = auth.currentUser;
        const area = current;
        if (!user || !area) throw new StorageError('signed-out');
        await runDeleteAccount({
          removeData: () => area.deleteAll(),
          removeUser: async () => {
            // 계정을 지우면 로그아웃 알림이 바로 오므로 안내를 먼저 정해 둔다.
            pendingNotice = 'deleted';
            try {
              await deleteUser(user);
            } catch (e) {
              pendingNotice = null;
              throw e;
            }
          },
          reauthenticate: async () => {
            await reauthenticateWithCredential(user, await credential());
          },
        });
        await closeAndReset();
      }),
  };
}

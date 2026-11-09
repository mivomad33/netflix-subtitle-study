import { AuthClient, AuthState } from '../../../shared/auth/types';
import { StorageError, StorageErrorCode } from '../../../shared/storage/errors';
import { StorageArea } from '../../../shared/storage/storageArea';

// 개발 화면과 테스트에서 쓰는 가짜 로그인. 일반 빌드 결과에 들어가면 check:build가 이 표시로 막는다(4.11-3).
export const DEV_FAKE_AUTH_MARKER = 'NF_STUDY_DEV_FAKE_AUTH';

export interface FakeAuth extends AuthClient {
  marker: typeof DEV_FAKE_AUTH_MARKER;
  setState(state: AuthState): void;
  // 다음 로그인 창이 돌려줄 결과. 오류 종류를 주면 그 오류로 실패한다.
  nextSignIn: 'ok' | StorageErrorCode;
  calls: string[];
}

export function createFakeAuth(
  options: {
    initial?: AuthState;
    email?: string;
    area?: StorageArea;
    delayMs?: number;
    usage?: () => Promise<number>;
    onDeleteAccount?: () => Promise<void>;
  } = {}
): FakeAuth {
  const email = options.email ?? 'dev@example.test';
  let state: AuthState = options.initial ?? { status: 'signedIn', email };
  const listeners = new Set<(s: AuthState) => void>();
  const wait = () => new Promise((r) => setTimeout(r, options.delayMs ?? 0));

  const fake: FakeAuth = {
    marker: DEV_FAKE_AUTH_MARKER,
    nextSignIn: 'ok',
    calls: [],
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(next) {
      state = next;
      listeners.forEach((l) => l(next));
    },
    async signIn() {
      fake.calls.push('signIn');
      await wait();
      if (fake.nextSignIn !== 'ok') throw new StorageError(fake.nextSignIn);
      fake.setState({ status: 'signedIn', email });
    },
    async signOut() {
      fake.calls.push('signOut');
      await wait();
      fake.setState({ status: 'signedOut', notice: 'signed-out' });
    },
    async deleteAccount() {
      fake.calls.push('deleteAccount');
      await wait();
      if (options.onDeleteAccount) await options.onDeleteAccount();
      else if (options.area) await options.area.remove(await options.area.getKeys());
      fake.setState({ status: 'signedOut', notice: 'deleted' });
    },
    async usage() {
      if (options.usage) return options.usage();
      if (!options.area) return 0;
      const values = await options.area.get(await options.area.getKeys());
      return new Blob([JSON.stringify(values)]).size;
    },
  };
  return fake;
}

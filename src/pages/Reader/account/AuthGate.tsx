import React, { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { AuthClient, AuthState, SignedOutNotice } from '../../../shared/auth/types';
import { toStorageErrorCode } from '../../../shared/storage/errors';
import { storageErrorMessage } from '../../../shared/ui/storageErrors';
import { PolicyLinks } from './PolicyLinks';

const AuthContext = createContext<AuthClient | null>(null);

// 로그인 기능. AuthGate 밖(테스트에서 화면 하나만 그릴 때 등)에서는 null이다.
export const useAuthClient = () => useContext(AuthContext);

export function useAuthState(auth: AuthClient): AuthState {
  return useSyncExternalStore(auth.subscribe, auth.getState);
}

const NOTICES: Record<SignedOutNotice, string> = {
  cancelled: '로그인을 취소했습니다.',
  expired: '로그인이 만료되었거나 계정을 쓸 수 없게 되었습니다. 다시 로그인하세요.',
  'signed-out': '로그아웃했습니다. 데이터는 계정에 남아 있어 다시 로그인하면 보입니다.',
  deleted: '탈퇴했습니다. 계정과 모든 데이터를 지웠습니다.',
  failed: '로그인하지 못했습니다. 잠시 뒤 다시 시도하세요.',
  network: '인터넷에 연결되지 않아 로그인하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.',
};

// 로그인하지 않았으면 안의 화면(저장소를 읽는 화면)을 그리지 않고 로그인 안내를 보인다(4.1-2).
export const AuthGate: React.FC<{ auth: AuthClient; children: React.ReactNode }> = ({ auth, children }) => {
  const state = useAuthState(auth);
  if (state.status === 'signedIn') return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
  return <SignInScreen auth={auth} state={state} />;
};

const SignInScreen: React.FC<{ auth: AuthClient; state: AuthState }> = ({ auth, state }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.signIn();
    } catch (e) {
      setError(storageErrorMessage(toStorageErrorCode(e)));
    } finally {
      setBusy(false);
    }
  };

  const notice = error ?? (state.status === 'signedOut' && state.notice ? NOTICES[state.notice] : null);

  return (
    <main className="nfr-signin" aria-labelledby="signin-title">
      <div className="nfr-signin-card">
        {state.status === 'loading' && (
          <>
            <h1 id="signin-title" className="nfr-signin-title">
              원서 리더
            </h1>
            <p className="nfr-wait" role="status" aria-live="polite">
              <span className="nfr-spinner" aria-hidden="true" />
              로그인 상태를 확인하는 중입니다…
            </p>
          </>
        )}
        {state.status === 'unconfigured' && (
          <>
            <h1 id="signin-title" className="nfr-signin-title">
              Firebase 설정이 없습니다
            </h1>
            <p className="nfr-signin-desc">
              이 빌드에는 Firebase 웹 설정이 들어 있지 않아 로그인할 수 없습니다. DEVELOPMENT.md의 &ldquo;Firebase
              설정&rdquo;대로 설정 파일을 만든 뒤 다시 빌드하세요.
            </p>
          </>
        )}
        {state.status === 'signedOut' && (
          <>
            <h1 id="signin-title" className="nfr-signin-title">
              로그인하세요
            </h1>
            <p className="nfr-signin-desc">
              책, 메모, 학습 기록은 Google 계정에 저장되어 다른 PC에서도 이어 볼 수 있습니다. 로그인하지 않으면 원서
              리더와 메모 모아 보기를 쓸 수 없습니다.
            </p>
            {notice && (
              <p className="nfr-signin-notice" role="status">
                {notice}
              </p>
            )}
            <button
              type="button"
              className="nfr-btn nfr-btn-primary nfr-signin-button"
              onClick={signIn}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? '로그인하는 중입니다…' : 'Google로 로그인'}
            </button>
            {busy && (
              <p className="nfr-signin-hint" role="status">
                열린 Google 로그인 창에서 계정을 고르세요.
              </p>
            )}
          </>
        )}
        <PolicyLinks />
      </div>
    </main>
  );
};

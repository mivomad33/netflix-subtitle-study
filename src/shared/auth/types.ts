// 확장 프로그램 화면이 보는 로그인 상태. 넷플릭스 화면은 "로그인됨/안 됨"만 받는다(4.3-2).
export type SignedOutNotice = 'expired' | 'signed-out' | 'deleted';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'signedOut'; notice?: SignedOutNotice }
  | { status: 'signedIn'; email: string };

// 확장 프로그램 화면이 쓰는 로그인·계정 기능. 실제로는 서비스 워커에 부탁하고, 테스트와 개발 화면은 가짜를 쓴다.
export interface AuthClient {
  getState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  usage(): Promise<number>;
}

export const isAuthState = (v: unknown): v is AuthState => {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (s.status === 'signedIn') return typeof s.email === 'string';
  return s.status === 'loading' || s.status === 'unconfigured' || s.status === 'signedOut';
};

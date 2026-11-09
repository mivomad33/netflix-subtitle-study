// Google 로그인 창(chrome.identity.launchWebAuthFlow)으로 ID 토큰을 받는다. 범위는 openid email만 쓴다.
// 크롬 프로필에 로그인하지 않은 PC에서도 된다(명세서 2장).
import { StorageError } from '../../shared/storage/errors';

export const SIGN_IN_SCOPE = 'openid email';

const randomNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export function authUrl(clientId: string, redirectUri: string, nonce: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: SIGN_IN_SCOPE,
    nonce,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// 돌아온 주소의 조각(#id_token=...)에서 토큰을 꺼낸다.
export function idTokenFrom(responseUrl: string | undefined): string | null {
  if (!responseUrl) return null;
  const hash = responseUrl.split('#')[1] ?? '';
  return new URLSearchParams(hash).get('id_token');
}

export async function launchGoogleSignIn(clientId: string): Promise<string> {
  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl(clientId, chrome.identity.getRedirectURL(), randomNonce()),
      interactive: true,
    });
  } catch {
    // 창을 닫거나 취소하면 오류가 난다. 원래 문구는 넘기지 않는다.
    throw new StorageError('cancelled');
  }
  const token = idTokenFrom(responseUrl);
  if (!token) throw new StorageError('cancelled');
  return token;
}

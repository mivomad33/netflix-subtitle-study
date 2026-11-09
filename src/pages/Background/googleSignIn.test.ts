import { describe, expect, it } from 'vitest';
import { authUrl, idTokenFrom, launchGoogleSignIn } from './googleSignIn';

describe('Google sign-in window', () => {
  it('asks only for openid and email with an ID token', () => {
    const url = new URL(authUrl('client-1', 'https://abc.chromiumapp.org/', 'n1'));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('redirect_uri')).toBe('https://abc.chromiumapp.org/');
    expect(url.searchParams.get('client_id')).toBe('client-1');
  });

  it('reads the token from the returned address', () => {
    expect(idTokenFrom('https://abc.chromiumapp.org/#id_token=tok&authuser=0')).toBe('tok');
    expect(idTokenFrom('https://abc.chromiumapp.org/#error=access_denied')).toBeNull();
    expect(idTokenFrom(undefined)).toBeNull();
  });
});

describe('ID token nonce', () => {
  const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = (payload: object) => `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(payload))}.sig`;

  function withIdentity(makeToken: (nonce: string) => string) {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      identity: {
        getRedirectURL: () => 'https://abc.chromiumapp.org/',
        launchWebAuthFlow: async ({ url }: { url: string }) => {
          const nonce = new URL(url).searchParams.get('nonce') ?? '';
          return `https://abc.chromiumapp.org/#id_token=${makeToken(nonce)}`;
        },
      },
    };
  }

  it('accepts a token that carries the nonce of this sign-in', async () => {
    withIdentity((nonce) => token({ nonce, email: 'a@example.test' }));
    await expect(launchGoogleSignIn('client-1')).resolves.toMatch(/\.sig$/);
  });

  it('refuses a token issued for another sign-in', async () => {
    withIdentity(() => token({ nonce: 'someone-else' }));
    await expect(launchGoogleSignIn('client-1')).rejects.toMatchObject({ code: 'invalid' });
    withIdentity(() => token({}));
    await expect(launchGoogleSignIn('client-1')).rejects.toMatchObject({ code: 'invalid' });
    withIdentity(() => 'not-a-jwt');
    await expect(launchGoogleSignIn('client-1')).rejects.toMatchObject({ code: 'invalid' });
  });
});

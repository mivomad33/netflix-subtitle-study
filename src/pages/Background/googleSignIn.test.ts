import { describe, expect, it } from 'vitest';
import { authUrl, idTokenFrom } from './googleSignIn';

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

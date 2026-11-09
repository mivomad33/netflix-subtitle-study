// Firebase 웹 설정. 저장소에는 커밋하지 않고, 빌드할 때 webpack이 로컬 설정 파일
// (firebase.config.local.json, DEVELOPMENT.md 참고)에서 넣는다. 파일이 없으면 null이고,
// 그 빌드는 로그인 대신 "Firebase 설정이 없습니다" 안내를 보인다.
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  // Google 로그인 창에 쓰는 웹 OAuth 클라이언트 id. 없으면 이 프로젝트의 값을 쓴다.
  oauthClientId?: string;
  // 개인정보처리방침·저작권 안내가 있는 사이트. 없으면 이 프로젝트의 Hosting 주소를 쓴다.
  siteUrl?: string;
}

declare const __NF_FIREBASE_CONFIG__: FirebaseWebConfig | null | undefined;

export const FIREBASE_CONFIG: FirebaseWebConfig | null =
  typeof __NF_FIREBASE_CONFIG__ !== 'undefined' && __NF_FIREBASE_CONFIG__ ? __NF_FIREBASE_CONFIG__ : null;

// 이 프로젝트(nf-subtitle-study-21cae)의 값. 공개해도 되는 값이다(명세서 2장).
export const DEFAULT_OAUTH_CLIENT_ID =
  '777101314338-gs9g574npcnmjhpp65d2vrsb0fq3oabp.apps.googleusercontent.com';
export const DEFAULT_SITE_URL = 'https://nf-subtitle-study-21cae.web.app';

export const siteUrl = (config: FirebaseWebConfig | null = FIREBASE_CONFIG) =>
  (config?.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');

export const PRIVACY_PATH = '/privacy/';
export const COPYRIGHT_PATH = '/copyright/';

export const policyLinks = (config: FirebaseWebConfig | null = FIREBASE_CONFIG) => ({
  privacy: `${siteUrl(config)}${PRIVACY_PATH}`,
  copyright: `${siteUrl(config)}${COPYRIGHT_PATH}`,
});

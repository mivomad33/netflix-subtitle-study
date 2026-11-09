#!/usr/bin/env node
// Checks the built extension and the repository for things that must never ship.
// Usage: node scripts/check-build.mjs [buildDir]   (default: build)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SHIM_MARKER = 'NF_STUDY_DEV_STORAGE_SHIM';
// 개발 화면·테스트용 가짜 음성(src/pages/Reader/dev/fakeSpeech.ts)
export const FAKE_SPEECH_MARKER = 'NF_STUDY_FAKE_SPEECH';
// 개발 화면·테스트용 가짜 로그인(src/pages/Reader/dev/fakeAuth.ts)
export const FAKE_AUTH_MARKER = 'NF_STUDY_DEV_FAKE_AUTH';
// E2E 빌드의 에뮬레이터 연결과 테스트 로그인(src/pages/Background/e2e.ts)
export const E2E_MARKER = 'NF_STUDY_E2E_EMULATOR_LOGIN';
const DEV_MARKERS = [
  [SHIM_MARKER, '개발용 대체 저장소 표시'],
  [FAKE_SPEECH_MARKER, '개발용 가짜 음성 표시'],
  [FAKE_AUTH_MARKER, '개발용 가짜 로그인 표시'],
  [E2E_MARKER, 'E2E 에뮬레이터 연결·테스트 로그인 표시'],
  // Firebase SDK가 에뮬레이터에 붙을 때만 쓰는 문구(connectAuthEmulator)
  ['Running in emulator mode', '에뮬레이터 연결 코드'],
];
export const EXTENSION_PAGES = ['reader.html', 'popup.html'];
const EXPECTED_PERMISSIONS = ['storage', 'unlimitedStorage', 'identity'];

// 확장 프로그램이 네트워크로 연결해도 되는 곳(4.10-2): Firebase(Firestore·Auth)와 Google 로그인,
// 개인정보처리방침·저작권 안내가 있는 Firebase Hosting.
export const CONNECT_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com',
  'accounts.google.com',
  'nf-subtitle-study-21cae.web.app',
];
// 연결하지 않는 주소(화면 링크, 라이브러리의 오류 안내, XML 이름공간). 번들에 있어도 되지만 연결 대상이면 안 된다.
// 라이브러리의 라이선스 머리말(apache.org)과 오류 안내 문구(github.com, stackoverflow.com)도 여기 든다.
export const LINK_HOSTS = [
  'www.netflix.com',
  'reactjs.org',
  'react.dev',
  'www.w3.org',
  'firebase.google.com',
  'www.apache.org',
  'github.com',
  'stackoverflow.com',
];

// 네트워크 호출의 대상을 글자 그대로 쓴 곳. 대상이 CONNECT_HOSTS 밖이면 문제다.
const CALL_TARGET =
  /\b(fetch|sendBeacon|WebSocket|EventSource)\s*\(\s*["'`]((?:https?|wss?):)?\/\/([a-z0-9.-]+)/gi;
const XHR_TARGET = /\.open\(\s*["'][A-Za-z]+["']\s*,\s*["'`](?:https?:)?\/\/([a-z0-9.-]+)/gi;
// 원격 코드: 외부 스크립트 불러오기는 대상이 어디든 막는다.
const REMOTE_CODE = /\bimportScripts\s*\(\s*["'`](?:(?:https?:)?\/\/)/i;
// 번들 안의 모든 외부 주소. 두 목록 어디에도 없으면 문제다(새 주소는 목록에 넣고 연결 대상인지 정한다).
const URL_LITERAL = /\b((?:https?|wss?):)\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;

// 넷플릭스 페이지에 들어가는 번들에 있으면 안 되는 Firebase 표지(4.3-4).
export const FIREBASE_MARKERS = [
  'firestore.googleapis.com',
  'identitytoolkit',
  'securetoken.googleapis.com',
  '@firebase/',
  'FirebaseError',
];

// 저장소와 빌드 결과에 있으면 안 되는 비밀 값 모양(4.10-3).
export const SECRET_PATTERNS = [
  ['서비스 계정 키(private_key)', /"private_key"\s*:/],
  ['OAuth 클라이언트 보안 비밀(client_secret)', /client_secret/],
];
// 비밀 값 모양을 설명하거나 시험하는 파일은 검사에서 뺀다.
const SECRET_EXEMPT = (file) =>
  file.startsWith('docs/') || /\.test\.[cm]?[jt]sx?$/.test(file) || file === 'scripts/check-build.mjs';
// 커밋하면 안 되는 파일 이름.
const UNTRACKED_NAMES = [
  [/\.pem$/i, '키 파일'],
  [/^nf-study-backup-.*\.json$/i, '백업 파일'],
  [/^firebase\.config\.local\.json$/i, 'Firebase 웹 설정 파일'],
  [/^(firebase|firestore|ui|database|pubsub)-debug\.log$/i, 'Firebase 로그'],
];

const CSS_EXTERNAL_IMPORT = /@import\s+(?:url\(\s*)?['"]?\s*(?:https?:)?\/\//i;
const EXTERNAL_URL = /^(?:https?:)?\/\//i;

/** @param {Record<string, unknown>} manifest */
export function checkManifest(manifest) {
  const problems = [];
  const perms = manifest.permissions;
  const ok =
    Array.isArray(perms) &&
    perms.length === EXPECTED_PERMISSIONS.length &&
    EXPECTED_PERMISSIONS.every((p) => perms.includes(p));
  if (!ok) {
    problems.push(
      `manifest.json: permissions는 정확히 ${JSON.stringify(EXPECTED_PERMISSIONS)}여야 함 (현재 ${JSON.stringify(perms)})`
    );
  }
  const hosts = manifest.host_permissions;
  if (hosts !== undefined && !(Array.isArray(hosts) && hosts.length === 0)) {
    problems.push(`manifest.json: host_permissions가 있으면 안 됨 (현재 ${JSON.stringify(hosts)})`);
  }
  if (typeof manifest.key !== 'string' || manifest.key.length === 0) {
    problems.push('manifest.json: key 문자열이 없음');
  }
  if (manifest.chrome_url_overrides !== undefined) {
    problems.push(
      `manifest.json: chrome_url_overrides가 있으면 안 됨 (현재 ${JSON.stringify(manifest.chrome_url_overrides)})`
    );
  }
  return problems;
}

/** @param {string} buildDir */
export function checkManifestFile(buildDir) {
  const file = join(buildDir, 'manifest.json');
  if (!existsSync(file)) return ['manifest.json 없음'];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return [`manifest.json: JSON을 읽을 수 없음 (${e instanceof Error ? e.message : e})`];
  }
  return checkManifest(manifest);
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? m[1] ?? m[2] ?? m[3] : undefined;
}

/** 번들 하나의 연결 대상과 원격 코드를 검사한다(4.10-2). */
export function scanJs(label, code) {
  const problems = [];
  for (const m of code.matchAll(CALL_TARGET)) {
    const host = m[3].toLowerCase();
    if (!CONNECT_HOSTS.includes(host)) problems.push(`${label}: 허용 목록 밖으로 연결 \`${m[1]}\` → ${host}`);
  }
  for (const m of code.matchAll(XHR_TARGET)) {
    const host = m[1].toLowerCase();
    if (!CONNECT_HOSTS.includes(host)) problems.push(`${label}: 허용 목록 밖으로 연결 XMLHttpRequest → ${host}`);
  }
  if (REMOTE_CODE.test(code)) problems.push(`${label}: 외부 스크립트 불러오기 \`importScripts\``);
  const unknown = new Set();
  for (const m of code.matchAll(URL_LITERAL)) {
    const host = m[2].toLowerCase();
    if (!CONNECT_HOSTS.includes(host) && !LINK_HOSTS.includes(host)) unknown.add(host);
  }
  for (const host of unknown) problems.push(`${label}: 목록에 없는 외부 주소 ${host}`);
  return problems;
}

function scanCss(label, css) {
  return CSS_EXTERNAL_IMPORT.test(css) ? [`${label}: 외부 CSS @import`] : [];
}

/** @param {string} buildDir */
export function checkExtensionPages(buildDir) {
  const problems = [];
  const scanned = new Set();
  for (const page of EXTENSION_PAGES) {
    const pagePath = join(buildDir, page);
    if (!existsSync(pagePath)) {
      problems.push(`${page} 없음`);
      continue;
    }
    const html = readFileSync(pagePath, 'utf8');
    const refs = [];
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
      const src = attr(tag, 'src');
      if (src !== undefined) refs.push({ url: src, kind: 'script' });
    }
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      const href = attr(tag, 'href');
      if (href !== undefined) refs.push({ url: href, kind: 'link' });
    }
    for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      problems.push(...scanJs(`${page} (인라인 스크립트)`, m[1]));
    }
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      problems.push(...scanCss(`${page} (인라인 스타일)`, m[1]));
    }
    for (const { url, kind } of refs) {
      if (EXTERNAL_URL.test(url)) {
        problems.push(`${page}: 외부 ${kind} 로드 ${url}`);
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue; // data:, chrome-extension: etc.
      const rel = url.replace(/[?#].*$/, '').replace(/^\/+/, '');
      if (!rel) continue;
      const file = join(buildDir, rel);
      if (scanned.has(file)) continue;
      scanned.add(file);
      if (!existsSync(file)) {
        problems.push(`${page}: 불러오는 파일 ${rel} 없음`);
        continue;
      }
      const content = readFileSync(file, 'utf8');
      // 스크립트는 checkAllScripts가 빌드 전체에서 본다.
      if (/\.css$/i.test(rel)) problems.push(...scanCss(rel, content));
    }
  }
  return problems;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** @param {string} buildDir */
export function checkShimMarker(buildDir) {
  if (!existsSync(buildDir)) return [];
  return walk(buildDir).flatMap((file) => {
    const content = readFileSync(file);
    return DEV_MARKERS.filter(([marker]) => content.includes(Buffer.from(marker))).map(
      ([marker, label]) => `${relative(buildDir, file)}: ${label} ${marker} 포함`
    );
  });
}

/** 빌드의 모든 스크립트(서비스 워커 포함)를 검사한다(4.10-2). */
export function checkAllScripts(buildDir) {
  if (!existsSync(buildDir)) return [];
  return walk(buildDir)
    .filter((f) => /\.m?js$/i.test(f))
    .flatMap((f) => scanJs(relative(buildDir, f), readFileSync(f, 'utf8')));
}

/** 넷플릭스 페이지에 들어가는 번들(content script와 그것이 넣는 스크립트)에 Firebase가 없는지(4.3-4). */
export function checkContentBundles(buildDir) {
  const file = join(buildDir, 'manifest.json');
  if (!existsSync(file)) return [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  const bundles = new Set([
    ...(manifest.content_scripts ?? []).flatMap((c) => c.js ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((w) => (w.resources ?? []).filter((r) => /\.m?js$/i.test(r))),
  ]);
  const problems = [];
  for (const bundle of bundles) {
    const path = join(buildDir, bundle);
    if (!existsSync(path)) {
      problems.push(`${bundle}: manifest가 가리키는 content 번들 없음`);
      continue;
    }
    const code = readFileSync(path, 'utf8');
    for (const marker of FIREBASE_MARKERS) {
      if (code.includes(marker)) problems.push(`${bundle}: 넷플릭스 페이지 번들에 Firebase 표지 ${marker}`);
    }
  }
  return problems;
}

/** 글 하나에 비밀 값 모양이 있는지(4.10-3). */
export function scanSecrets(label, text) {
  return SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => `${label}: ${name}`);
}

/** 빌드 결과의 비밀 값 모양. */
export function checkBuildSecrets(buildDir) {
  if (!existsSync(buildDir)) return [];
  return walk(buildDir).flatMap((f) => scanSecrets(relative(buildDir, f), readFileSync(f, 'latin1')));
}

/** 추적 파일의 비밀 값 모양(문서·테스트·이 스크립트는 뺀다). */
export function checkTrackedSecrets(root, files) {
  return files
    .filter((f) => !SECRET_EXEMPT(f))
    .flatMap((f) => {
      const path = join(root, f);
      if (!existsSync(path) || statSync(path).isDirectory()) return [];
      return scanSecrets(f, readFileSync(path, 'latin1'));
    });
}

/** @param {string[]} files paths from `git ls-files` */
export function checkTrackedFiles(files) {
  return files.flatMap((f) => {
    const name = basename(f);
    return UNTRACKED_NAMES.filter(([re]) => re.test(name)).map(([, label]) => `git에 올라가면 안 되는 ${label}: ${f}`);
  });
}

/** @param {string} cwd */
export function repoRoot(cwd) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** @param {string} root */
export function listTrackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

/** Checks a build directory (manifest, extension pages, shim marker). */
export function checkBuildDir(buildDir) {
  if (!existsSync(buildDir)) return [`빌드 폴더 ${buildDir} 없음`];
  return [
    ...checkManifestFile(buildDir),
    ...checkExtensionPages(buildDir),
    ...checkAllScripts(buildDir),
    ...checkContentBundles(buildDir),
    ...checkShimMarker(buildDir),
    ...checkBuildSecrets(buildDir),
  ];
}

function main() {
  const buildDir = resolve(process.argv[2] ?? 'build');
  const problems = checkBuildDir(buildDir);
  try {
    const root = repoRoot(dirname(fileURLToPath(import.meta.url)));
    const files = listTrackedFiles(root);
    problems.push(...checkTrackedFiles(files), ...checkTrackedSecrets(root, files));
  } catch (e) {
    problems.push(`git ls-files 실행 실패 (${e instanceof Error ? e.message : e})`);
  }
  if (problems.length > 0) {
    console.error(`check-build: 문제 ${problems.length}개`);
    for (const p of problems) console.error(`- ${p}`);
    process.exitCode = 1;
  } else {
    console.log('check-build: ok');
  }
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href) {
  main();
}

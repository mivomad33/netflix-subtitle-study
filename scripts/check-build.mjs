#!/usr/bin/env node
// Checks the built extension and the repository for things that must never ship.
// Usage: node scripts/check-build.mjs [buildDir]   (default: build)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SHIM_MARKER = 'NF_STUDY_DEV_STORAGE_SHIM';
export const EXTENSION_PAGES = ['reader.html', 'popup.html'];
const EXPECTED_PERMISSIONS = ['storage', 'unlimitedStorage'];

const JS_PATTERNS = [
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['importScripts(', /\bimportScripts\s*\(/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['new WebSocket', /\bnew\s+WebSocket\b/],
  ['new EventSource', /\bnew\s+EventSource\b/],
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

function scanJs(label, code) {
  return JS_PATTERNS.filter(([, re]) => re.test(code)).map(
    ([name]) => `${label}: 외부 전송 코드 \`${name}\``
  );
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
      if (/\.m?js$/i.test(rel)) problems.push(...scanJs(rel, content));
      else if (/\.css$/i.test(rel)) problems.push(...scanCss(rel, content));
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
  const marker = Buffer.from(SHIM_MARKER);
  return walk(buildDir)
    .filter((file) => readFileSync(file).includes(marker))
    .map((file) => `${relative(buildDir, file)}: 개발용 대체 저장소 표시 ${SHIM_MARKER} 포함`);
}

/** @param {string[]} files paths from `git ls-files` */
export function checkTrackedFiles(files) {
  return files
    .filter((f) => {
      const name = basename(f);
      return /\.pem$/i.test(name) || /^nf-study-backup-.*\.json$/i.test(name);
    })
    .map((f) => `git에 올라가면 안 되는 파일: ${f}`);
}

/** @param {string} cwd */
export function listTrackedFiles(cwd) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

/** Checks a build directory (manifest, extension pages, shim marker). */
export function checkBuildDir(buildDir) {
  if (!existsSync(buildDir)) return [`빌드 폴더 ${buildDir} 없음`];
  return [...checkManifestFile(buildDir), ...checkExtensionPages(buildDir), ...checkShimMarker(buildDir)];
}

function main() {
  const buildDir = resolve(process.argv[2] ?? 'build');
  const problems = checkBuildDir(buildDir);
  try {
    problems.push(...checkTrackedFiles(listTrackedFiles(dirname(fileURLToPath(import.meta.url)))));
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

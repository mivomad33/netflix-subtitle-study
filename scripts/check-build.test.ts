// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
  permissions: ['unlimitedStorage', 'storage'],
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
  write('background.bundle.js', 'chrome.storage.local.get(null);');
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
    const m = { ...okManifest(), permissions: ['storage', 'unlimitedStorage', 'tabs'] };
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

  it('flags fetch( in a loaded bundle', () => {
    write('reader.bundle.js', 'fetch("https://api.example.com/x").then(r => r.json());');
    const problems = checkExtensionPages(dir);
    expect(problems.join('\n')).toMatch(/reader\.bundle\.js/);
    expect(problems.join('\n')).toMatch(/fetch\(/);
  });

  it.each([
    ['XMLHttpRequest', 'const x = new XMLHttpRequest();'],
    ['importScripts(', 'importScripts("a.js");'],
    ['sendBeacon', 'navigator.sendBeacon("/x", "y");'],
    ['new WebSocket', 'const s = new WebSocket("wss://a");'],
    ['new EventSource', 'const s = new EventSource("/a");'],
  ])('flags %s in a loaded bundle', (label, code) => {
    write('popup.bundle.js', code);
    const problems = checkExtensionPages(dir).join('\n');
    expect(problems).toMatch(/popup\.bundle\.js/);
    expect(problems).toContain(label);
  });

  it('does not scan bundles the pages do not load', () => {
    write('background.bundle.js', 'fetch("/x");');
    expect(checkExtensionPages(dir)).toEqual([]);
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

describe('checkShimMarker', () => {
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

// 빌드한 확장 프로그램을 띄워 본다(4.1-4, 4.2-3, 완료 정의의 로그인 전 화면).
// build/(이 PC의 실제 설정)와 build-e2e/(에뮬레이터에 붙는 빌드)가 있어야 한다: npm run test:e2e
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearAuth,
  clearFirestore,
  signedInClient,
} from '../src/test/emulator';
import { createFirestoreArea } from '../src/shared/storage/firestoreArea';

const EXTENSION_ID = 'flhkacfjjpipfoicbnmednajnhebihmb';
const READER = `chrome-extension://${EXTENSION_ID}/reader.html`;
const SHOTS = resolve(
  __dirname,
  '../docs/specs/20261108-0925-firebase-sync/screens'
);

const EDIT_SHOTS = resolve(__dirname, '../docs/specs/20261111-1712-book-edit/shots');

type Playwright = typeof import('playwright');
let playwright: Playwright;

async function launch(buildDir: string) {
  const profile = mkdtempSync(join(tmpdir(), 'nf-e2e-'));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${buildDir}`,
      `--load-extension=${buildDir}`,
    ],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  return {
    context,
    worker,
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

beforeAll(async () => {
  const module =
    process.env.PLAYWRIGHT_MODULE ??
    join(homedir(), '.cache/design-tools/node_modules/playwright/index.mjs');
  playwright = (await import(module)) as Playwright;
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(EDIT_SHOTS, { recursive: true });
});

describe('the real build before sign-in', () => {
  it('shows the sign-in button and the policy links on the reader page', async () => {
    const ext = await launch(resolve(__dirname, '../build'));
    try {
      const page = await ext.context.newPage();
      await page.goto(READER);
      await page
        .getByRole('button', { name: 'Google로 로그인' })
        .waitFor({ timeout: 20000 });
      expect(
        await page
          .getByRole('link', { name: '개인정보처리방침' })
          .getAttribute('href')
      ).toBe('https://nf-subtitle-study-21cae.web.app/privacy/');
      expect(
        await page
          .getByRole('link', { name: '저작권 안내' })
          .getAttribute('href')
      ).toBe('https://nf-subtitle-study-21cae.web.app/copyright/');
      await page.screenshot({
        path: join(SHOTS, 'reader-signed-out-1280.png'),
      });
    } finally {
      await ext.close();
    }
  });
});

describe('the emulator build', () => {
  beforeAll(async () => {
    await clearFirestore();
    await clearAuth();
  });

  // 서비스 워커의 Firestore IndexedDB 캐시 전체를 글로 읽는다.
  const readFirestoreCache = (worker: import('playwright').Worker) =>
    worker.evaluate(async () => {
      const names = (await indexedDB.databases())
        .map((d) => d.name ?? '')
        .filter((n) => n.startsWith('firestore'));
      const out: string[] = [];
      for (const name of names) {
        const db = await new Promise<IDBDatabase>((ok, fail) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => ok(req.result);
          req.onerror = () => fail(req.error);
        });
        for (const store of Array.from(db.objectStoreNames)) {
          const all = await new Promise<unknown[]>((ok, fail) => {
            const req = db.transaction(store).objectStore(store).getAll();
            req.onsuccess = () => ok(req.result);
            req.onerror = () => fail(req.error);
          });
          out.push(JSON.stringify(all));
        }
        db.close();
      }
      return out.join('\n');
    });

  const signIn = async (
    ext: Awaited<ReturnType<typeof launch>>,
    sub: string,
    email: string
  ) => {
    await ext.worker.evaluate(
      ([s, e]) => (globalThis as any).nfStudyE2E.setAccount(s, e),
      [sub, email]
    );
    const page = await ext.context.newPage();
    await page.goto(READER);
    await page.getByRole('button', { name: 'Google로 로그인' }).click();
    await page.getByText(email).waitFor({ timeout: 20000 });
    return page;
  };

  it('4.1-4 clears the Firestore cache on sign-out and shows nothing of the previous account', async () => {
    const ext = await launch(resolve(__dirname, '../build-e2e'));
    try {
      const first = await signIn(ext, 'e2e-a', 'a@example.test');
      const second = await ext.context.newPage();
      await second.goto(READER);
      await second.getByText('a@example.test').waitFor();

      await ext.worker.evaluate(() =>
        (globalThis as any).nfStudyE2E.write({
          'book:alpha': {
            id: 'alpha',
            title: 'Alpha Secret Book',
            author: 'A',
            chapters: [{ id: 'c1', title: 'One', paragraphCount: 1 }],
            createdAt: 1,
            updatedAt: 1,
          },
          'bookch:alpha:c1': ['Only account A may read this line.'],
        })
      );
      // 두 화면 모두 실시간으로 보인다.
      await first.getByText('Alpha Secret Book').waitFor({ timeout: 10000 });
      await second.getByText('Alpha Secret Book').waitFor({ timeout: 10000 });
      expect(await readFirestoreCache(ext.worker)).toContain(
        'Alpha Secret Book'
      );

      await first.getByRole('button', { name: '로그아웃' }).click();
      await first
        .getByRole('dialog')
        .getByRole('button', { name: '로그아웃' })
        .click();
      await first
        .getByRole('button', { name: 'Google로 로그인' })
        .waitFor({ timeout: 20000 });
      await second
        .getByRole('button', { name: 'Google로 로그인' })
        .waitFor({ timeout: 20000 });
      expect(await readFirestoreCache(ext.worker)).not.toContain(
        'Alpha Secret Book'
      );
      expect(await second.content()).not.toContain('Alpha Secret Book');

      await ext.worker.evaluate(() =>
        (globalThis as any).nfStudyE2E.setAccount('e2e-b', 'b@example.test')
      );
      await first.getByRole('button', { name: 'Google로 로그인' }).click();
      await first.getByText('b@example.test').waitFor({ timeout: 20000 });
      await second.getByText('b@example.test').waitFor({ timeout: 20000 });
      await first
        .getByRole('heading', { name: '내 책' })
        .waitFor()
        .catch(() => {});
      await first.waitForTimeout(1500);
      for (const page of [first, second]) {
        const html = await page.content();
        expect(html).not.toContain('Alpha Secret Book');
        expect(html).not.toContain('a@example.test');
      }
      expect(await readFirestoreCache(ext.worker)).not.toContain(
        'Alpha Secret Book'
      );
    } finally {
      await ext.close();
    }
  });

  // 원서 고치기(명세서 book-edit, 완료 정의): 책을 등록하고, 하이라이트가 있는 문단의 오타를 고쳐 저장한다.
  it('book-edit keeps a highlight on the fixed text after a typo is corrected in the chapter editor', async () => {
    const ext = await launch(resolve(__dirname, '../build-e2e'));
    try {
      const page = await signIn(ext, 'e2e-edit', 'edit@example.test');
      // 직접 쓴 예시 글.
      const paragraphs = [
        'The lamp glowed over a quiet desk.',
        'A cat slept beside teh warm window.',
        'Rain tapped softly on the roof.',
      ];
      await page.getByRole('button', { name: '책 등록' }).click();
      await page.getByLabel('책 제목 (필수)').fill('Lamp Stories');
      await page.getByLabel(/본문 \(필수\)/).fill(paragraphs.join('\n\n'));
      await page.getByRole('button', { name: '저장' }).click();
      // 저장이 끝나면 리더(#/book/<id>)로 간다.
      await page.waitForFunction(() => window.location.hash.startsWith('#/book/'), null, { timeout: 20000 });
      await page.locator('.nfr-paragraph').first().waitFor({ timeout: 20000 });
      const bookId = decodeURIComponent(new URL(page.url()).hash.split('/')[2].split('?')[0]);

      const start = paragraphs[1].indexOf('teh warm');
      await ext.worker.evaluate(
        ([id, text, at]) =>
          (globalThis as any).nfStudyE2E.write({
            'memo:e2e-edit-m1': {
              id: 'e2e-edit-m1',
              kind: 'book',
              sourceId: id,
              contextText: text,
              start: at,
              end: (at as number) + 8,
              quote: 'teh warm',
              note: 'typo here',
              createdAt: 1,
              updatedAt: 1,
              chapterId: 'ch1',
              paragraphIndex: 1,
            },
          }),
        [bookId, paragraphs[1], start] as const
      );
      const mark = page.locator('mark[data-memo-id="e2e-edit-m1"]');
      await mark.waitFor({ timeout: 15000 });
      expect(await mark.textContent()).toContain('teh warm');

      await page.getByRole('button', { name: '이 장 고치기' }).click();
      const body = page.getByLabel('장 본문');
      await body.waitFor({ timeout: 15000 });
      expect(await body.inputValue()).toBe(paragraphs.join('\n\n'));
      await body.fill(paragraphs.join('\n\n').replace('teh warm', 'the warm'));
      await page.getByText('문단 3→3 · 글자 0').waitFor();
      await page.screenshot({ path: join(EDIT_SHOTS, 'e2e-chapter-editor-1280.png') });
      await page.getByRole('button', { name: '저장', exact: true }).click();

      // 확인 창 없이 저장되고, 리더로 돌아와 하이라이트가 고친 글에 그려진다.
      await page.getByText('A cat slept beside the warm window.').waitFor({ timeout: 20000 });
      await page.waitForFunction(
        () => document.querySelector('mark[data-memo-id="e2e-edit-m1"]')?.textContent?.includes('the warm'),
        null,
        { timeout: 15000 }
      );
      expect(await page.getByText('위치를 찾지 못함').count()).toBe(0);
      await page.screenshot({ path: join(EDIT_SHOTS, 'e2e-reader-after-edit-1280.png') });

      // 새로 연 화면(다른 탭)에서도 고친 본문과 하이라이트가 보인다.
      const second = await ext.context.newPage();
      await second.goto(`${READER}#/book/${encodeURIComponent(bookId)}`);
      await second.getByText('A cat slept beside the warm window.').waitFor({ timeout: 20000 });
      await second.waitForFunction(
        () => document.querySelector('mark[data-memo-id="e2e-edit-m1"]')?.textContent?.includes('the warm'),
        null,
        { timeout: 15000 }
      );
    } finally {
      await ext.close();
    }
  }, 120000);

  it('4.2-3 the Netflix bridge gets a change from another client within 10 seconds after the service worker stopped', async () => {
    const ext = await launch(resolve(__dirname, '../build-e2e'));
    const otherPc = await signedInClient('e2e-c', 'c@example.test');
    const otherArea = createFirestoreArea(otherPc.db, otherPc.uid);
    try {
      const reader = await signIn(ext, 'e2e-c', 'c@example.test');
      await reader.close();

      // 넷플릭스 주소를 가짜 페이지로 바꿔 content script(브리지)만 쓴다. 페이지 쪽은 학습 패널과 같은 메시지를 보낸다.
      await ext.context.route('https://www.netflix.com/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body>stub</body></html>',
        })
      );
      const netflix = await ext.context.newPage();
      await netflix.goto('https://www.netflix.com/watch/1');
      await netflix.evaluate(() => {
        const w = window as any;
        w.__events = [];
        window.addEventListener('message', (e) => {
          if (e.data?.channel === 'NF_STUDY_STORE_EVENT')
            w.__events.push({ ...e.data, at: Date.now() });
          if (e.data?.channel === 'NF_STUDY_STORE_RESPONSE')
            w.__responses = [...(w.__responses ?? []), e.data];
        });
        w.__ask = (op: string) =>
          new Promise((ok) => {
            const requestId = `r${Math.random()}`;
            const listen = (e: MessageEvent) => {
              if (
                e.data?.channel === 'NF_STUDY_STORE_RESPONSE' &&
                e.data.requestId === requestId
              ) {
                window.removeEventListener('message', listen);
                ok(e.data);
              }
            };
            window.addEventListener('message', listen);
            window.postMessage(
              { channel: 'NF_STUDY_STORE_REQUEST', requestId, op },
              '*'
            );
          });
      });
      const signedIn = async () => {
        await expect
          .poll(
            () => netflix.evaluate(() => (window as any).__ask('auth.status')),
            { timeout: 20000 }
          )
          .toMatchObject({ ok: true, result: { signedIn: true } });
      };
      await signedIn();

      // 서비스 워커를 멈춘다. 넷플릭스 쪽 포트가 끊겼다가 다시 붙으며 서비스 워커가 새로 뜬다.
      // 멈췄다가 다시 도는 것을 CDP의 서비스 워커 상태 알림으로 확인한다.
      const cdp = await ext.context.newCDPSession(netflix);
      const statuses: string[] = [];
      cdp.on(
        'ServiceWorker.workerVersionUpdated',
        (e: { versions: { runningStatus: string }[] }) =>
          e.versions.forEach((v) => statuses.push(v.runningStatus))
      );
      await cdp.send('ServiceWorker.enable');
      await cdp.send('ServiceWorker.stopAllWorkers');
      await expect
        .poll(() => statuses.includes('stopped'), { timeout: 10000 })
        .toBe(true);
      const stoppedAt = statuses.lastIndexOf('stopped');
      await expect
        .poll(() => statuses.slice(stoppedAt).includes('running'), {
          timeout: 20000,
        })
        .toBe(true);
      await signedIn();
      await netflix.waitForTimeout(2000);
      await netflix.evaluate(() => ((window as any).__events = []));

      // 다른 PC에서 쓴다.
      await otherArea.ready();
      const writtenAt = Date.now();
      await otherArea.set({ 'nf:itemsPerPage:v1': 25 });
      await expect
        .poll(
          () =>
            netflix.evaluate(() =>
              (window as any).__events.filter(
                (e: any) =>
                  e.event === 'changed' &&
                  e.scope === 'itemsPerPage' &&
                  e.videoId === 'v1'
              )
            ),
          { timeout: 10000, interval: 200 }
        )
        .toHaveLength(1);
      const [event] = await netflix.evaluate(() =>
        (window as any).__events.filter((e: any) => e.scope === 'itemsPerPage')
      );
      expect(event.at - writtenAt).toBeLessThan(10000);
      expect(event).not.toHaveProperty('value');
    } finally {
      otherArea.close();
      await otherPc.close();
      await ext.close();
    }
  });
});

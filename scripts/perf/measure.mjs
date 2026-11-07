#!/usr/bin/env node
// 성능 측정(원서 리더 명세서 4.10-3, 학습 진행률·소리 내어 읽기 명세서 4.6-4). 개발 서버(npm start)를 띄운 뒤 실행한다.
//   node scripts/perf/measure.mjs [http://localhost:3000]
// 책 20권(그중 한 권 200만 자)과 메모 5,000개를 개발 화면(reader-dev.html?seed=perf)에 채우고 다섯 시간을 잰다.
// 소리 내어 읽기는 개발 화면의 가짜 음성(voices=device)으로 첫 발화 요청 시각을 잰다.
// 시간은 브라우저 안에서 동작을 시작한 때부터 결과가 그려진 뒤 다음 화면 그리기까지다.
// Playwright는 디자인 도구 폴더(DESIGN_TOOLS_DIR, 기본 ~/.cache/design-tools)의 것을 쓴다.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const toolsDir = process.env.DESIGN_TOOLS_DIR || join(homedir(), '.cache', 'design-tools');
const require = createRequire(join(toolsDir, 'package.json'));
const { chromium } = require('playwright');

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const LIMITS = { preview: 3000, chapter: 1000, search: 500, bookList: 1000, bookListOld: 1000, firstSpeak: 500 };

// 조건이 참이 된 뒤 화면이 한 번 그려질 때까지 기다리고, 시작부터 걸린 ms를 돌려준다.
const waitPainted = (condition) => `
  new Promise((resolve) => {
    const check = () => {
      if (${condition}) requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())));
      else requestAnimationFrame(check);
    };
    check();
  })`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(120000);
const results = {};

try {
  await page.goto(`${base}/reader-dev.html?seed=perf&voices=device#/`);
  await page.waitForSelector('.nfr-book-list');
  const counts = await page.evaluate(async () => {
    const area = window.nfStudyDev.area;
    const keys = await area.getKeys();
    return { books: keys.filter((k) => k.startsWith('book:')).length, memos: keys.filter((k) => k.startsWith('memo:')).length };
  });
  results.data = counts;

  // (a) 200만 자 붙여 넣기 → 정리·장 나누기 미리 보기
  await page.evaluate(() => (window.location.hash = '#/import'));
  await page.waitForSelector('.nfr-import-body');
  await page.evaluate(() => {
    const raw = window.nfStudyDev.syntheticRawBook(2_000_000, 12);
    const textarea = document.querySelector('.nfr-import-body');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, raw.slice(0, 2_000_000));
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const preview = await page.evaluate(`(async () => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === '미리 보기');
    let sawBusy = false;
    const observer = new MutationObserver(() => { if (document.querySelector('.nfr-busy')) sawBusy = true; });
    observer.observe(document.body, { childList: true, subtree: true });
    const start = performance.now();
    button.click();
    const end = await ${waitPainted("document.querySelector('#preview-title') && !document.querySelector('.nfr-busy')")};
    observer.disconnect();
    return { ms: end - start, sawBusy, chars: document.querySelector('.nfr-import-body').value.length, heading: document.querySelector('#preview-title').textContent };
  })()`);
  results.preview = preview;

  // (b) 장 하나(20만 자) 열기: 큰 책에서 다른 장을 누른다.
  await page.evaluate(() => (window.location.hash = '#/book/perf-0?chapter=ch1'));
  await page.waitForSelector('.nfr-paragraph');
  const chapter = await page.evaluate(`(async () => {
    const button = Array.from(document.querySelectorAll('.nfr-chapter-btn'))[1];
    const start = performance.now();
    button.click();
    const end = await ${waitPainted("document.querySelector('.nfr-chapter-btn.active') === document.querySelectorAll('.nfr-chapter-btn')[1] && document.querySelectorAll('.nfr-paragraph').length > 100")};
    const text = Array.from(document.querySelectorAll('.nfr-paragraph p')).reduce((n, p) => n + p.textContent.length, 0);
    return { ms: end - start, paragraphs: document.querySelectorAll('.nfr-paragraph').length, chars: text };
  })()`);
  results.chapter = chapter;

  // (c) 모아 보기 검색
  await page.evaluate(() => (window.location.hash = '#/memos'));
  await page.waitForSelector('.nfr-memo-card');
  const search = await page.evaluate(`(async () => {
    const input = document.querySelector('.nfr-search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const before = document.querySelector('.nfr-collection [role=status]').textContent;
    const start = performance.now();
    setter.call(input, 'lantern');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const end = await ${waitPainted("document.querySelector('.nfr-collection [role=status]') && document.querySelector('.nfr-collection [role=status]').textContent !== " + "'" + "' + before + '" + "'")};
    return { ms: end - start, before, after: document.querySelector('.nfr-collection [role=status]').textContent };
  })()`.replace(`!== '' + before + ''`, '!== before'));
  results.search = search;

  // (d) 진행률이 들어간 책 목록: 다른 화면에서 책 목록으로 간다.
  const openBookList = `(async () => {
    const start = performance.now();
    window.location.hash = '#/';
    const end = await ${waitPainted("document.querySelectorAll('.nfr-book-list .nfr-progress-text').length === 20")};
    return { ms: end - start, books: document.querySelectorAll('.nfr-book-row').length, first: document.querySelector('.nfr-progress-text').textContent };
  })()`;
  await page.evaluate(async () => {
    const area = window.nfStudyDev.area;
    // 큰 책의 장 몇 개를 학습 완료로 둔다.
    for (const ch of ['ch1', 'ch2', 'ch3']) {
      await area.set({ [`done:perf-0:${ch}`]: { bookId: 'perf-0', chapterId: ch, done: true, updatedAt: Date.now() } });
    }
    window.location.hash = '#/memos';
  });
  await page.waitForSelector('.nfr-memo-card');
  results.bookList = await page.evaluate(openBookList);

  // (e) 이 기능 전에 저장한 모양(장 글자 수 없음)의 책 20권을 처음 열 때: 본문을 한 번 읽어 글자 수를 채운다.
  await page.evaluate(async () => {
    const area = window.nfStudyDev.area;
    const keys = (await area.getKeys()).filter((k) => k.startsWith('book:'));
    const books = await area.get(keys);
    const items = {};
    for (const [k, b] of Object.entries(books)) {
      items[k] = { ...b, chapters: b.chapters.map(({ charCount, ...rest }) => rest) };
    }
    await area.set(items);
    window.location.hash = '#/memos';
  });
  await page.waitForSelector('.nfr-memo-card');
  results.bookListOld = await page.evaluate(openBookList);

  // (f) 20만 자 장에서 "여기서부터 읽기" → 첫 발화 요청
  await page.evaluate(() => (window.location.hash = '#/book/perf-0?chapter=ch5'));
  await page.waitForFunction(() => document.querySelectorAll('.nfr-paragraph').length > 100 && document.querySelector('.nfr-read-from'));
  results.firstSpeak = await page.evaluate(`(async () => {
    const speech = window.nfStudyDev.speech;
    const before = speech.spoken.length;
    const buttons = document.querySelectorAll('.nfr-read-from');
    const button = buttons[Math.floor(buttons.length / 2)];
    const start = performance.now();
    button.click();
    await new Promise((resolve) => { const check = () => (speech.spoken.length > before ? resolve() : setTimeout(check, 1)); check(); });
    const first = speech.spoken[before];
    return { ms: first.at - start, paragraphs: buttons.length, text: first.text.slice(0, 40) };
  })()`);
} finally {
  await browser.close();
}

const pass = {
  preview: results.preview.ms <= LIMITS.preview && results.preview.sawBusy,
  chapter: results.chapter.ms <= LIMITS.chapter,
  search: results.search.ms <= LIMITS.search,
  bookList: results.bookList.ms <= LIMITS.bookList && results.bookList.books === 20,
  bookListOld: results.bookListOld.ms <= LIMITS.bookListOld && results.bookListOld.books === 20,
  firstSpeak: results.firstSpeak.ms <= LIMITS.firstSpeak,
};
console.log(JSON.stringify({ results, limitsMs: LIMITS, pass }, null, 2));
process.exit(Object.values(pass).every(Boolean) ? 0 : 1);

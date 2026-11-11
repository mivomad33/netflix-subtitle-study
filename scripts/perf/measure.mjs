#!/usr/bin/env node
// 성능 측정(원서 리더 명세서 4.10-3, 학습 진행률·소리 내어 읽기 명세서 4.6-4, 원서 고치기 명세서 4.3-14). 개발 서버(npm start)를 띄운 뒤 실행한다.
//   node scripts/perf/measure.mjs [http://localhost:3000]
// 책 20권(그중 한 권 200만 자)과 메모 5,000개, 20만 자 장에 붙은 메모 200개를 개발 화면(reader-dev.html?seed=perf)에 채우고 아홉 시간을 잰다.
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
const LIMITS = {
  preview: 3000,
  chapter: 1000,
  search: 500,
  bookList: 1000,
  bookListOld: 1000,
  firstSpeak: 500,
  editorOpen: 1000,
  editorType: 100,
  editorSave: 2000,
};

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
// 어느 단계인지 표준 오류에 적는다(결과 JSON은 표준 출력).
const step = (name) => console.error(`[perf] ${name}`);

try {
  await page.goto(`${base}/reader-dev.html?seed=perf&voices=device#/`);
  await page.waitForSelector('.nfr-book-list');
  const counts = await page.evaluate(async () => {
    const area = window.nfStudyDev.area;
    const keys = await area.getKeys();
    return { books: keys.filter((k) => k.startsWith('book:')).length, memos: keys.filter((k) => k.startsWith('memo:')).length };
  });
  results.data = counts;

  step('preview');
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

  step('chapter');
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

  step('search');
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

  step('bookList');
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

  step('bookListOld');
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

  step('firstSpeak');
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

  step('editorOpen');
  // (g) 20만 자 장의 본문 편집 창 열기: 리더에서 "이 장 고치기"를 누른다.
  await page.evaluate(() => (window.location.hash = '#/book/perf-0?chapter=ch7'));
  await page.waitForFunction(() => document.querySelectorAll('.nfr-paragraph').length > 100);
  await page.waitForFunction(() => document.querySelectorAll('.nfr-paragraph mark').length >= 150);
  // 장 가운데의 문단까지 내려가 읽던 위치로 저장되게 한다(4.3-2: 편집 창은 그 문단에서 열린다).
  const readingAt = await page.evaluate(async () => {
    const target = document.querySelector('[data-paragraph-index="200"]');
    target.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -60);
    await new Promise((resolve) => setTimeout(resolve, 700));
    // 리더가 읽던 위치로 보는 문단: 머리글(72px) 아래에 걸친 첫 문단.
    const top = Array.from(document.querySelectorAll('[data-paragraph-index]')).find((el) => el.getBoundingClientRect().bottom > 72);
    return { paragraph: Number(top.dataset.paragraphIndex), text: top.querySelector('p').textContent.slice(0, 60) };
  });
  results.editorOpen = await page.evaluate(`(async () => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === '이 장 고치기');
    const start = performance.now();
    button.click();
    const end = await ${waitPainted("document.querySelector('.nfr-chapter-body') && document.querySelector('.nfr-chapter-body').value.length > 150000")};
    const textarea = document.querySelector('.nfr-chapter-body');
    await new Promise((resolve) => setTimeout(resolve, 100));
    // 커서가 있는 줄이 입력칸의 보이는 범위 안에 있는지: 커서 앞의 글만 넣은 같은 폭의 사본 높이로 잰다.
    const style = getComputedStyle(textarea);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;';
    for (const name of ['font', 'lineHeight', 'padding', 'border', 'letterSpacing']) probe.style[name] = style[name];
    probe.style.width = textarea.clientWidth + 'px';
    probe.textContent = textarea.value.slice(0, textarea.selectionStart) + 'x';
    document.body.appendChild(probe);
    const caretTop = probe.offsetHeight;
    probe.remove();
    return {
      ms: end - start,
      chars: textarea.value.length,
      caretText: textarea.value.slice(textarea.selectionStart, textarea.selectionStart + 60),
      scrollTop: Math.round(textarea.scrollTop),
      caretTop,
      viewHeight: textarea.clientHeight,
      caretVisible: caretTop >= textarea.scrollTop && caretTop <= textarea.scrollTop + textarea.clientHeight + 30,
      focused: document.activeElement === textarea,
    };
  })()`);
  results.editorOpen.readingAt = readingAt;
  await page.screenshot({ path: process.env.NF_PERF_SHOT || '/dev/null' }).catch(() => {});

  step('editorType');
  // (h) 그 편집 창에 글자 하나를 넣고 화면에 반영되기까지. 실제 키 입력으로 다섯 번 재고 가장 느린 것을 본다.
  await page.evaluate(() => {
    const textarea = document.querySelector('.nfr-chapter-body');
    const middle = textarea.value.indexOf(' ', Math.floor(textarea.value.length / 2));
    textarea.focus();
    textarea.setSelectionRange(middle, middle);
    window.__typed = [];
    let start = 0;
    textarea.addEventListener('keydown', () => (start = performance.now()), true);
    textarea.addEventListener('input', () => {
      const from = start;
      requestAnimationFrame(() => requestAnimationFrame(() => window.__typed.push(performance.now() - from)));
    });
  });
  for (const key of ['x', 'y', 'z', 'Backspace', 'Backspace']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
  results.editorType = await page.evaluate(() => ({
    ms: Math.max(...window.__typed),
    all: window.__typed.map((n) => Math.round(n)),
    summary: document.querySelector('.nfr-edit-summary').textContent,
  }));

  step('editorSave');
  // (i) 메모 200개가 붙은 그 장에서 낱말 하나를 고치고 저장 → 저장이 끝나 리더가 다시 그려지기까지.
  results.editorSave = await page.evaluate(`(async () => {
    const textarea = document.querySelector('.nfr-chapter-body');
    // 성능 시드의 큰 책은 글자 수 상한에 닿아 있어서, 글이 늘지 않게 낱말의 한 글자를 다른 글자로 바꾼다.
    const at = textarea.value.indexOf(' ', Math.floor(textarea.value.length / 3)) + 1;
    window.__editedWord = textarea.value.slice(at, textarea.value.indexOf(' ', at));
    textarea.setRangeText(textarea.value[at] === 'q' ? 'z' : 'q', at, at + 1, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === '저장');
    const start = performance.now();
    button.click();
    const end = await ${waitPainted("document.querySelector('dialog[open]') || document.querySelector('.nfr-chapter-edit [role=alert]') || (!document.querySelector('.nfr-chapter-body') && document.querySelectorAll('.nfr-paragraph').length > 100)")};
    const dialog = !!document.querySelector('dialog[open]');
    const alert = document.querySelector('.nfr-chapter-edit [role=alert]');
    return { ms: end - start, dialog, alert: alert ? alert.textContent : null, word: window.__editedWord };
  })()`);
  const saved = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const area = window.nfStudyDev.area;
    const body = (await area.get(['bookch:perf-0:ch7']))['bookch:perf-0:ch7'];
    const keys = (await area.getKeys()).filter((k) => k.startsWith('memo:perf-edit-'));
    const memos = Object.values(await area.get(keys));
    const attached = memos.filter((m) => body[m.paragraphIndex] === m.contextText && m.contextText.slice(m.start, m.end) === m.quote).length;
    const word = window.__editedWord;
    const edited = (word[0] === 'q' ? 'z' : 'q') + word.slice(1);
    return { corrected: body.some((p) => p.includes(edited)), memos: memos.length, attached, marks: document.querySelectorAll('.nfr-paragraph mark').length };
  });
  results.editorSave = { ...results.editorSave, ...saved };
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
  // 읽던 문단(200번째)에서 열리고 그 문단이 입력칸에 보여야 한다.
  editorOpen:
    results.editorOpen.ms <= LIMITS.editorOpen &&
    results.editorOpen.chars > 150000 &&
    results.editorOpen.readingAt.paragraph > 150 &&
    results.editorOpen.caretText.startsWith(results.editorOpen.readingAt.text.slice(0, 40)) &&
    results.editorOpen.scrollTop > 0 &&
    results.editorOpen.caretVisible,
  editorType: results.editorType.ms <= LIMITS.editorType,
  // 낱말 하나를 고친 저장은 확인 창 없이 끝나고, 메모는 199개 넘게 붙어 있어야 한다(고친 낱말을 고른 메모는 고른 글이 바뀐다).
  editorSave:
    results.editorSave.ms <= LIMITS.editorSave &&
    !results.editorSave.dialog &&
    !results.editorSave.alert &&
    results.editorSave.corrected &&
    results.editorSave.memos === 200 &&
    results.editorSave.attached === 200,
};
console.log(JSON.stringify({ results, limitsMs: LIMITS, pass }, null, 2));
process.exit(Object.values(pass).every(Boolean) ? 0 : 1);

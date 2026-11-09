import { describe, it, expect, vi } from 'vitest';
import { createMemoryArea } from '../storage/storageArea';
import { getMemo, putMemo, listMemos, saveBook, getChapterParagraphs, getUnplacedNetflixMemoIds, getBook, setChapterDone, updateReaderSettings } from '../storage/repo';
import { netflixMemo, bookMemo } from '../storage/testFixtures';
import { BRIDGE_REQUEST, MAX_MEMO_CHARS, parseBridgeRequest } from './protocol';
import { DEFAULT_NETFLIX_SETTINGS, MAX_CHECKLIST_CHARS } from './netflixRecords';
import { handleBridgeCall } from './handler';

const req = (body: Record<string, unknown>) => ({ channel: BRIDGE_REQUEST, requestId: 'r1', ...body });

const run = async (
  area: ReturnType<typeof createMemoryArea> | null,
  body: Record<string, unknown>,
  openPage = vi.fn()
) => {
  const parsed = parseBridgeRequest(req(body));
  if (!parsed) return null;
  const { channel: _c, requestId: _r, ...call } = parsed;
  return handleBridgeCall(area, call as never, openPage);
};

describe('bridge request handling', () => {
  it('lists, saves, and deletes netflix memos', async () => {
    const area = createMemoryArea();
    await putMemo(area, bookMemo());
    expect(await run(area, { op: 'memos.put', memo: netflixMemo({ id: 'n1' }) })).toEqual({ ok: true });
    await putMemo(area, netflixMemo({ id: 'n2', sourceId: 'other' }));

    const listed = await run(area, { op: 'memos.list', videoId: 'v1' });
    expect(listed).toEqual({ ok: true, result: [netflixMemo({ id: 'n1' })] });

    expect(await run(area, { op: 'memos.delete', id: 'n1' })).toEqual({ ok: true });
    expect((await listMemos(area)).map((m) => m.id).sort()).toEqual(['b1', 'n2']);
  });

  it('4.7-3 has no legacy migration and opens extension pages', async () => {
    const area = createMemoryArea();
    expect(await run(area, { op: 'legacy.migrate', payload: { annotations: {}, studiedVideos: null } })).toBeNull();

    const openPage = vi.fn();
    expect(await run(area, { op: 'page.open', page: 'memos' }, openPage)).toEqual({ ok: true });
    expect(openPage).toHaveBeenCalledWith('memos');
  });

  it('refuses to touch book memos, book text, or other keys', async () => {
    const area = createMemoryArea();
    await saveBook(area, { id: 'bk1', title: 'T', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'C', paragraphs: ['Keep me.'] },
    ]);
    await putMemo(area, bookMemo({ id: 'b1' }));

    // 원서 메모를 넷플릭스 쪽에서 지우거나 덮어쓰려는 요청
    expect((await run(area, { op: 'memos.delete', id: 'b1' }))!.ok).toBe(false);
    expect(await run(area, { op: 'memos.put', memo: bookMemo({ id: 'b1', note: 'x' }) })).toBeNull();
    // 메모가 아닌 키를 지우려는 요청(메모 ID에 키 이름을 넣는 시도 포함)
    expect((await run(area, { op: 'memos.delete', id: '../book:bk1' }))!.ok).toBe(true);
    expect(await run(area, { op: 'storage.remove', keys: ['book:bk1'] })).toBeNull();
    expect(await run(area, { op: 'storage.get', keys: ['bookch:bk1:c1'] })).toBeNull();
    // 위치를 찾지 못한 메모 목록 요청으로 책 키를 건드리려는 시도
    expect((await run(area, { op: 'memos.reportUnplaced', videoId: 'x:book:bk1', ids: [] }))!.ok).toBe(true);
    expect((await run(area, { op: 'memos.reportUnplaced', videoId: 'bk1', ids: ['b1'] }))!.ok).toBe(true);

    expect((await listMemos(area)).find((m) => m.id === 'b1')!.note).toBe('a pot for boiling water');
    expect(await getChapterParagraphs(area, 'bk1', 'c1')).toEqual(['Keep me.']);
    expect(await getBook(area, 'bk1')).not.toBeNull();
  });

  it('4.5-3 cannot read, write or delete study completion and reading settings', async () => {
    const area = createMemoryArea();
    await saveBook(area, { id: 'bk1', title: 'T', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'C', paragraphs: ['Keep me.'] },
    ]);
    await setChapterDone(area, 'bk1', 'c1', true, 1);
    await updateReaderSettings(area, { fontSize: 14, allowOnlineVoices: false, voiceURI: 'Daniel' });
    const protectedKeys = ['done:bk1:c1', 'reader:settings'];
    const before = await area.get(protectedKeys);

    const attempts: Record<string, unknown>[] = [
      { op: 'memos.list', videoId: '../done:bk1:c1' },
      { op: 'memos.delete', id: '../done:bk1:c1' },
      { op: 'memos.delete', id: 'reader:settings' },
      { op: 'memos.put', memo: netflixMemo({ id: '../reader:settings' }) },
      { op: 'memos.reportUnplaced', videoId: '../../done:bk1:c1', ids: [] },
      { op: 'memos.reportUnplaced', videoId: 'x', ids: ['reader:settings'] },
      { op: 'settings.set', settings: { allowOnlineVoices: true } },
      { op: 'nfSettings.set', settings: { allowOnlineVoices: true } },
      { op: 'checklist.get', videoId: '../done:bk1:c1' },
      { op: 'studied.put', video: { videoId: '../reader:settings' } },
      { op: 'completion.set', bookId: 'bk1', chapterId: 'c1', done: false },
      { op: 'storage.get', keys: protectedKeys },
    ];
    for (const body of attempts) {
      const result = await run(area, body);
      // 받아들인 요청도 결과에 이 키들의 값이 들어 있지 않다.
      expect(JSON.stringify(result ?? null)).not.toMatch(/Daniel|"done":true/);
    }
    expect(await area.get(protectedKeys)).toEqual(before);
  });

  it('records and clears the Netflix memos the panel could not place', async () => {
    const area = createMemoryArea();
    expect(await run(area, { op: 'memos.reportUnplaced', videoId: 'v1', ids: ['n1', 'n2'] })).toEqual({ ok: true });
    expect(Array.from((await getUnplacedNetflixMemoIds(area, ['v1', 'v2'])).get('v1')!).sort()).toEqual(['n1', 'n2']);
    expect(await run(area, { op: 'memos.reportUnplaced', videoId: 'v1', ids: [] })).toEqual({ ok: true });
    expect((await getUnplacedNetflixMemoIds(area, ['v1'])).get('v1')!.size).toBe(0);
    // 메모 외의 키는 지우지 않고 빈 목록으로 남긴다.
    expect(await area.getKeys()).toEqual(['meta:netflixUnplaced:v1']);
  });

  it('ignores malformed messages', () => {
    expect(parseBridgeRequest(null)).toBeNull();
    expect(parseBridgeRequest({ channel: 'OTHER', requestId: 'r', op: 'memos.list', videoId: 'v' })).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.list' }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.put', memo: { id: 'x' } }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'page.open', page: 'settings' }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.reportUnplaced', videoId: 'v', ids: [1] }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.reportUnplaced', videoId: 'v', ids: 'n1' }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.reportUnplaced', videoId: 'v'.repeat(201), ids: [] }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.reportUnplaced', videoId: 'v', ids: ['n'.repeat(201)] }))).toBeNull();
    expect(parseBridgeRequest({ op: 'memos.list', videoId: 'v', channel: BRIDGE_REQUEST })).toBeNull();
  });

  it('4.3-1 serves Netflix study records and nothing else', async () => {
    const area = createMemoryArea();
    const checklist = { currentActiveRound: 2, rounds: { 1: { 0: { preStudy: true } }, 2: {} } };
    const video = { videoId: 'v1', title: 'Show', cover: '', epTitle: 'Ep', epSeq: 1, seasonSeq: 1, totalPages: 3, updatedAt: 5 };
    const settings = { ...DEFAULT_NETFLIX_SETTINGS, isAutoPause: true, fontSize: 18 };
    expect(await run(area, { op: 'nfSettings.get' })).toEqual({ ok: true, result: null });
    expect(await run(area, { op: 'nfSettings.set', settings })).toEqual({ ok: true });
    expect(await run(area, { op: 'nfSettings.get' })).toEqual({ ok: true, result: settings });
    expect(await run(area, { op: 'checklist.set', videoId: 'v1', checklist })).toEqual({ ok: true });
    expect(await run(area, { op: 'checklist.get', videoId: 'v1' })).toEqual({ ok: true, result: checklist });
    expect(await run(area, { op: 'itemsPerPage.set', videoId: 'v1', value: 30 })).toEqual({ ok: true });
    expect(await run(area, { op: 'itemsPerPage.get', videoId: 'v1' })).toEqual({ ok: true, result: 30 });
    expect(await run(area, { op: 'studied.put', video })).toEqual({ ok: true });
    expect(await run(area, { op: 'studied.list' })).toEqual({ ok: true, result: [video] });
    expect(await run(area, { op: 'studied.delete', videoId: 'v1' })).toEqual({ ok: true });
    expect(await run(area, { op: 'checklist.delete', videoId: 'v1' })).toEqual({ ok: true });
    expect(await run(area, { op: 'studied.list' })).toEqual({ ok: true, result: [] });
    expect((await area.getKeys()).sort()).toEqual(['nf:itemsPerPage:v1', 'nf:settings']);
  });

  it('4.3-1 refuses requests for books, book memos, account data and unknown operations', async () => {
    const area = createMemoryArea();
    await putMemo(area, bookMemo({ id: 'n-like', note: 'book secret' }));
    for (const body of [
      { op: 'books.list' },
      { op: 'book.get', id: 'bk1' },
      { op: 'chapter.get', bookId: 'bk1', chapterId: 'c1' },
      { op: 'account.get' },
      { op: 'auth.token' },
      { op: 'auth.email' },
      { op: 'area.get', keys: ['memo:n-like'] },
    ]) {
      expect(await run(area, body)).toBeNull();
    }
    // 넷플릭스 메모와 닮은 원서 메모 id는 덮어쓰거나 지울 수 없다.
    expect(await run(area, { op: 'memos.put', memo: netflixMemo({ id: 'n-like' }) })).toEqual({ ok: false, error: 'invalid' });
    expect(await run(area, { op: 'memos.delete', id: 'n-like' })).toEqual({ ok: false, error: 'invalid' });
    expect((await getMemo(area, 'n-like'))!.note).toBe('book secret');
    // 영상 id로 원서 메모를 찾으려 해도 넷플릭스 메모만 나온다.
    expect(await run(area, { op: 'memos.list', videoId: 'bk1' })).toEqual({ ok: true, result: [] });
  });

  it('4.3-2 answers only signed in or not, and error codes without the original message', async () => {
    expect(await run(null, { op: 'auth.status' })).toEqual({ ok: true, result: { signedIn: false } });
    expect(await run(createMemoryArea(), { op: 'auth.status' })).toEqual({ ok: true, result: { signedIn: true } });
    expect(await run(null, { op: 'memos.list', videoId: 'v1' })).toEqual({ ok: false, error: 'signed-out' });
    const failing = createMemoryArea();
    const denied = async (): Promise<never> => {
      throw Object.assign(new Error('Missing permission on users/uid-secret-123/kv/memos-1'), { code: 'permission-denied' });
    };
    failing.get = denied;
    failing.getKeys = denied;
    const result = await run(failing, { op: 'memos.list', videoId: 'v1' });
    expect(result).toEqual({ ok: false, error: 'permission-denied' });
    expect(JSON.stringify(result)).not.toContain('uid-secret-123');
  });

  it('4.3-3 limits the size of new values: just under passes, over or malformed fails', () => {
    const page = { preStudy: true, noSubtitles: false };
    const rounds = (pages: number) => ({ 1: Object.fromEntries(Array.from({ length: pages }, (_, i) => [i, page])) });
    const size = (v: unknown) => JSON.stringify(v).length;
    let pages = 1;
    while (size({ currentActiveRound: 1, rounds: rounds(pages + 1) }) <= MAX_CHECKLIST_CHARS && pages < 1000) pages++;
    const under = { currentActiveRound: 1, rounds: rounds(pages) };
    expect(size(under)).toBeLessThanOrEqual(MAX_CHECKLIST_CHARS);
    expect(parseBridgeRequest(req({ op: 'checklist.set', videoId: 'v', checklist: under }))).not.toBeNull();
    const over = { currentActiveRound: 1, rounds: { ...rounds(pages), 2: { 0: { preStudy: true, note: 'x'.repeat(MAX_CHECKLIST_CHARS) } } } };
    expect(parseBridgeRequest(req({ op: 'checklist.set', videoId: 'v', checklist: over }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'checklist.set', videoId: 'v', checklist: { currentActiveRound: 'one', rounds: {} } }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'checklist.set', videoId: 'v', checklist: { currentActiveRound: 1, rounds: { 1: { 0: { a: 'yes' } } } } }))).toBeNull();

    const video = { videoId: 'v1', title: 't'.repeat(500), cover: 'c'.repeat(2000), epTitle: '', epSeq: 1, seasonSeq: 1, totalPages: 3, updatedAt: 1 };
    expect(parseBridgeRequest(req({ op: 'studied.put', video }))).not.toBeNull();
    expect(parseBridgeRequest(req({ op: 'studied.put', video: { ...video, title: 't'.repeat(501) } }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'studied.put', video: { ...video, extra: 1 } }))).toBeNull();

    expect(parseBridgeRequest(req({ op: 'itemsPerPage.set', videoId: 'v', value: 1000 }))).not.toBeNull();
    expect(parseBridgeRequest(req({ op: 'itemsPerPage.set', videoId: 'v', value: 1001 }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'itemsPerPage.set', videoId: 'v', value: 2.5 }))).toBeNull();

    const settings = { ...DEFAULT_NETFLIX_SETTINGS, fontSize: 40 };
    expect(parseBridgeRequest(req({ op: 'nfSettings.set', settings }))).not.toBeNull();
    expect(parseBridgeRequest(req({ op: 'nfSettings.set', settings: { ...settings, fontSize: 41 } }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'nfSettings.set', settings: { ...settings, extra: true } }))).toBeNull();

    expect(parseBridgeRequest(req({ op: 'memos.put', memo: netflixMemo({ note: 'n'.repeat(MAX_MEMO_CHARS - 1000) }) }))).not.toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.put', memo: netflixMemo({ note: 'n'.repeat(MAX_MEMO_CHARS) }) }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'checklist.get', videoId: 'v'.repeat(200) }))).not.toBeNull();
    expect(parseBridgeRequest(req({ op: 'checklist.get', videoId: 'v'.repeat(201) }))).toBeNull();
  });
});

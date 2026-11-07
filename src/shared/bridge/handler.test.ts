import { describe, it, expect, vi } from 'vitest';
import { createMemoryArea } from '../storage/storageArea';
import { putMemo, listMemos, saveBook, getChapterParagraphs, getUnplacedNetflixMemoIds, getBook, setChapterDone, updateReaderSettings } from '../storage/repo';
import { netflixMemo, bookMemo } from '../storage/testFixtures';
import { BRIDGE_REQUEST, parseBridgeRequest } from './protocol';
import { handleBridgeRequest } from './handler';

const req = (body: Record<string, unknown>) => ({ channel: BRIDGE_REQUEST, requestId: 'r1', ...body });

const run = async (area: ReturnType<typeof createMemoryArea>, body: Record<string, unknown>, openPage = vi.fn()) => {
  const parsed = parseBridgeRequest(req(body));
  if (!parsed) return null;
  return handleBridgeRequest(area, parsed, openPage);
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

  it('runs the legacy migration and opens extension pages', async () => {
    const area = createMemoryArea();
    const result = await run(area, {
      op: 'legacy.migrate',
      payload: { annotations: {}, studiedVideos: null },
    });
    expect(result).toEqual({ ok: true, result: { copied: 0, failedVideoIds: [], completed: true } });

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
});

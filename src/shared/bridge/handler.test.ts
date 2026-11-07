import { describe, it, expect, vi } from 'vitest';
import { createMemoryArea } from '../storage/storageArea';
import { putMemo, listMemos, saveBook, getChapterParagraphs } from '../storage/repo';
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

    expect((await listMemos(area)).find((m) => m.id === 'b1')!.note).toBe('a pot for boiling water');
    expect(await getChapterParagraphs(area, 'bk1', 'c1')).toEqual(['Keep me.']);
  });

  it('ignores malformed messages', () => {
    expect(parseBridgeRequest(null)).toBeNull();
    expect(parseBridgeRequest({ channel: 'OTHER', requestId: 'r', op: 'memos.list', videoId: 'v' })).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.list' }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'memos.put', memo: { id: 'x' } }))).toBeNull();
    expect(parseBridgeRequest(req({ op: 'page.open', page: 'settings' }))).toBeNull();
    expect(parseBridgeRequest({ op: 'memos.list', videoId: 'v', channel: BRIDGE_REQUEST })).toBeNull();
  });
});

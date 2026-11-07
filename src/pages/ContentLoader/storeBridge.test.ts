import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeClient } from '../Content/utils/storeClient';
import { installStoreBridge } from './storeBridge';
import { createMemoryArea } from '../../shared/storage/storageArea';
import { getMemo, putMemo, getBook } from '../../shared/storage/repo';
import { bookMemo, netflixMemo } from '../../shared/storage/testFixtures';
import { BRIDGE_REQUEST } from '../../shared/bridge/protocol';

describe('store bridge between the Netflix page and the content script', () => {
  let uninstall: () => void = () => {};

  // jsdom의 postMessage는 origin과 source를 채우지 않는다. 브라우저처럼 채워 보낸다.
  beforeEach(() => {
    vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
      setTimeout(() =>
        window.dispatchEvent(
          new MessageEvent('message', { data, origin: window.location.origin, source: window })
        )
      );
    });
  });
  afterEach(() => {
    uninstall();
    vi.restoreAllMocks();
  });

  it('saves, lists, and deletes Netflix memos through window messages', async () => {
    const area = createMemoryArea();
    const openPage = vi.fn();
    uninstall = installStoreBridge(window, area, openPage);
    const client = createBridgeClient(window, 2000);

    await client.call({ op: 'memos.put', memo: netflixMemo({ id: 'n1', sourceId: '77' }) });
    expect(await getMemo(area, 'n1')).not.toBeNull();
    expect(await client.call({ op: 'memos.list', videoId: '77' })).toHaveLength(1);

    await client.call({ op: 'page.open', page: 'memos' });
    expect(openPage).toHaveBeenCalledWith('memos');

    await client.call({ op: 'memos.delete', id: 'n1' });
    expect(await getMemo(area, 'n1')).toBeNull();
  });

  it('applies requests in the order they were sent even when storage answers slowly', async () => {
    // chrome.storage처럼 읽기·쓰기가 다른 작업 사이에 끼어드는 저장소
    const base = createMemoryArea();
    const slow = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const area = {
      ...base,
      get: async (keys: string[]) => {
        const v = await base.get(keys);
        await slow(10);
        return v;
      },
      set: async (items: Record<string, unknown>) => {
        await slow(10);
        return base.set(items);
      },
    };
    uninstall = installStoreBridge(window, area, vi.fn());
    const client = createBridgeClient(window, 2000);

    // 새 메모를 저장하자마자 지운다.
    const put = client.call({ op: 'memos.put', memo: netflixMemo({ id: 'n5' }) });
    const del = client.call({ op: 'memos.delete', id: 'n5' });
    await Promise.all([put, del]);

    expect(await getMemo(base, 'n5')).toBeNull();
  });

  it('ignores messages from other windows and requests outside the protocol', async () => {
    const area = createMemoryArea({ 'book:bk1': { id: 'bk1' } });
    await putMemo(area, bookMemo({ id: 'b1' }));
    await putMemo(area, netflixMemo({ id: 'n9' }));
    uninstall = installStoreBridge(window, area, vi.fn());
    const before = JSON.stringify(await area.get(await area.getKeys()));

    // 다른 창에서 온 메시지
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: BRIDGE_REQUEST, requestId: 'x', op: 'memos.delete', id: 'n9' },
        origin: window.location.origin,
        source: null,
      })
    );
    // 다른 출처에서 온 메시지
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: BRIDGE_REQUEST, requestId: 'y', op: 'memos.delete', id: 'n9' },
        origin: 'https://evil.example',
        source: window,
      })
    );
    const client = createBridgeClient(window, 2000);
    // 원서 메모는 넷플릭스 쪽에서 지울 수 없다.
    await expect(client.call({ op: 'memos.delete', id: 'b1' })).rejects.toThrow();
    // 프로토콜에 없는 요청은 답 없이 무시된다.
    window.postMessage(
      { channel: BRIDGE_REQUEST, requestId: 'z', op: 'storage.remove', keys: ['book:bk1'] },
      window.location.origin
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(JSON.stringify(await area.get(await area.getKeys()))).toBe(before);
    expect(await getBook(area, 'bk1')).not.toBeUndefined();
  });
});

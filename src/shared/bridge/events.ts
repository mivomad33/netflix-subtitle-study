import { BRIDGE_EVENT, BridgeEvent, BridgeEventScope } from './protocol';
import { StorageChanges } from '../storage/storageArea';
import { NETFLIX_KEY, NETFLIX_PREFIX, PREFIX } from '../storage/keys';
import { isValidMemo } from '../memo/types';

// 넷플릭스 쪽에 알릴 변경. 원서 메모·책·본문의 변경은 알리지 않는다.
export function netflixEvents(changes: StorageChanges): BridgeEvent[] {
  const seen = new Set<string>();
  const out: BridgeEvent[] = [];
  const add = (scope: BridgeEventScope, videoId?: string) => {
    const id = `${scope}:${videoId ?? ''}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(videoId === undefined ? { channel: BRIDGE_EVENT, event: 'changed', scope } : { channel: BRIDGE_EVENT, event: 'changed', scope, videoId });
  };
  Object.entries(changes).forEach(([key, change]) => {
    if (key.startsWith(PREFIX.memo)) {
      [change.oldValue, change.newValue].forEach((v) => {
        if (isValidMemo(v) && v.kind === 'netflix') add('memos', v.sourceId);
      });
    } else if (key === NETFLIX_KEY.settings) add('nfSettings');
    else if (key.startsWith(NETFLIX_PREFIX.checklist)) add('checklist', key.slice(NETFLIX_PREFIX.checklist.length));
    else if (key.startsWith(NETFLIX_PREFIX.itemsPerPage)) add('itemsPerPage', key.slice(NETFLIX_PREFIX.itemsPerPage.length));
    else if (key.startsWith(NETFLIX_PREFIX.studied)) add('studied');
  });
  return out;
}


import { useCallback, useEffect, useRef, useState } from 'react';
import { MultiRoundChecklists } from '../../../types';
import { migrateChecklists } from '../utils/checklistMigrator';
import { reportStorageError, storeRead, storeWrite, useStoreEvent, useStudyAuth } from '../utils/studyStore';

export const DEFAULT_ITEMS_PER_PAGE = 50;

export type ProgressStatus = 'waiting' | 'out' | 'loading' | 'ready';

const emptyChecklists = (): MultiRoundChecklists => migrateChecklists(null);

// 영상 하나의 체크리스트(회차 포함)와 페이지당 대사 수. 로그인했을 때만 저장소에서 읽고 쓴다.
// 다른 곳에서 바뀌었다는 알림이 오면 다시 읽는다(4.2-3).
export function useVideoProgress(videoId: string | number) {
  const auth = useStudyAuth();
  const id = videoId.toString();
  const [checklists, setChecklistsState] = useState<MultiRoundChecklists>(emptyChecklists);
  const [itemsPerPage, setItemsPerPageState] = useState(DEFAULT_ITEMS_PER_PAGE);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const checklistsRef = useRef(checklists);
  checklistsRef.current = checklists;
  const idRef = useRef(id);
  idRef.current = id;
  // 이 화면에서 쓴 횟수. 읽는 사이에 쓰면 읽은 값(쓰기 전 값일 수 있다)을 버린다.
  const writeSeq = useRef(0);

  const load = useCallback(
    (part: 'checklist' | 'itemsPerPage' | 'both') => {
      const target = idRef.current;
      const seq = writeSeq.current;
      const wantChecklist = part !== 'itemsPerPage';
      const wantItems = part !== 'checklist';
      Promise.all([
        wantChecklist ? storeRead<unknown>({ op: 'checklist.get', videoId: target }) : Promise.resolve(undefined),
        wantItems ? storeRead<number | null>({ op: 'itemsPerPage.get', videoId: target }) : Promise.resolve(undefined),
      ])
        .then(([storedChecklist, storedItems]) => {
          if (idRef.current !== target || writeSeq.current !== seq) return;
          if (wantChecklist) setChecklistsState(migrateChecklists(storedChecklist ?? null));
          if (wantItems) setItemsPerPageState(storedItems ?? DEFAULT_ITEMS_PER_PAGE);
          setLoadedId(target);
        })
        .catch((e) => {
          if (idRef.current === target) reportStorageError(e, () => load(part));
        });
    },
    []
  );

  // 영상이나 로그인 상태가 바뀌면 빈 상태에서 다시 시작한다(앞 영상·앞 계정의 기록을 보이지 않게).
  useEffect(() => {
    setChecklistsState(emptyChecklists());
    setItemsPerPageState(DEFAULT_ITEMS_PER_PAGE);
    setLoadedId(null);
    if (auth === 'in') load('both');
  }, [auth, id, load]);

  useStoreEvent((event) => {
    if (auth !== 'in' || event.event !== 'changed') return;
    if (event.scope === 'all') load('both');
    else if (event.scope === 'checklist' && event.videoId === id) load('checklist');
    else if (event.scope === 'itemsPerPage' && event.videoId === id) load('itemsPerPage');
  });

  const saveChecklists = useCallback((next: MultiRoundChecklists) => {
    const target = idRef.current;
    storeWrite({ op: 'checklist.set', videoId: target, checklist: next });
  }, []);

  // 로그인했을 때만 바꾼다. 로그아웃 상태에서는 체크리스트 자리에 로그인 안내가 있다.
  const updateChecklists = useCallback(
    (update: (prev: MultiRoundChecklists) => MultiRoundChecklists) => {
      if (auth !== 'in') return;
      const next = update(checklistsRef.current);
      checklistsRef.current = next;
      writeSeq.current += 1;
      setChecklistsState(next);
      saveChecklists(next);
    },
    [auth, saveChecklists]
  );

  // 페이지당 대사 수를 바꾸면 그 영상의 체크리스트를 비운다. 로그아웃 상태에서는 이 화면에서만 바뀐다.
  const changeItemsPerPage = useCallback(
    (value: number) => {
      const fresh = emptyChecklists();
      checklistsRef.current = fresh;
      writeSeq.current += 1;
      setItemsPerPageState(value);
      setChecklistsState(fresh);
      if (auth !== 'in') return;
      const target = idRef.current;
      storeWrite({ op: 'itemsPerPage.set', videoId: target, value });
      storeWrite({ op: 'checklist.delete', videoId: target });
    },
    [auth]
  );

  const status: ProgressStatus =
    auth === 'unknown' ? 'waiting' : auth === 'out' ? 'out' : loadedId === id ? 'ready' : 'loading';

  return { status, checklists, itemsPerPage, updateChecklists, changeItemsPerPage };
}

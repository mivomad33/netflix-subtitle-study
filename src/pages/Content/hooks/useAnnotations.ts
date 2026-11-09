import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Memo, createId } from '../../../shared/memo/types';
import { reportStorageError, storeRead, storeWrite, useStoreEvent, useStudyAuth } from '../utils/studyStore';
import { getVideoInfo } from '../utils/dashboardHelper';
import { getAnnotationsForSentence } from '../utils/annotationHelper';

export interface NewAnnotationInput {
  sentenceStartMs: number;
  sentenceText: string;
  start: number;
  end: number;
}

type Sentence = { startTime_ms: number; text: string };

// 넷플릭스 영상 하나의 메모. 로그인했을 때만 저장소에서 불러오고, 바뀔 때마다 그 메모 하나만 저장한다.
// 어느 대사에도 붙지 않는 메모는 모아 보기가 "위치를 찾지 못함"으로 보이도록 저장소에 알린다.
// 다른 곳에서 이 영상의 메모가 바뀌었다는 알림이 오면 다시 읽는다(4.2-3).
export function useAnnotations(videoId: string | number, sentences: Sentence[] = []) {
  const auth = useStudyAuth();
  const [annotations, setAnnotations] = useState<Memo[]>([]);
  // 저장된 메모를 다 불러온 영상. 영상이 바뀐 직후 앞 영상의 메모로 판정하지 않기 위해 둔다.
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const annotationsRef = useRef<Memo[]>([]);
  annotationsRef.current = annotations;
  const sourceIdRef = useRef(videoId.toString());
  sourceIdRef.current = videoId.toString();
  // 이 화면에서 쓴 횟수. 다시 읽는 사이에 쓰면 읽은 목록(쓰기 전일 수 있다)을 버린다.
  const writeSeq = useRef(0);

  const load = useCallback((first: boolean) => {
    const sourceId = sourceIdRef.current;
    const seq = writeSeq.current;
    storeRead<Memo[]>({ op: 'memos.list', videoId: sourceId })
      .then((stored) => {
        if (sourceIdRef.current !== sourceId) return;
        if (first) {
          // 불러오는 동안 이 영상에 만든 메모는 그대로 두고, 불러온 것을 합친다. 앞 영상의 메모는 버린다.
          setAnnotations((prev) => {
            const local = prev.filter((m) => m.sourceId === sourceId);
            const localIds = new Set(local.map((m) => m.id));
            return [...local, ...stored.filter((m) => !localIds.has(m.id))];
          });
          setLoadedVideoId(sourceId);
        } else if (writeSeq.current === seq) {
          // 다시 읽을 때는 저장소 쪽이 기준이다(다른 곳에서 지운 메모도 사라진다).
          setAnnotations(stored);
        }
      })
      .catch((e) => {
        if (sourceIdRef.current === sourceId) reportStorageError(e, () => load(first));
      });
  }, []);

  useEffect(() => {
    // 로그아웃하면 앞 계정의 메모를 화면에서 지운다. 영상이 바뀌면 그 영상의 메모를 새로 읽는다.
    if (auth !== 'in') {
      setAnnotations([]);
      setLoadedVideoId(null);
      return;
    }
    const sourceId = videoId.toString();
    setAnnotations((prev) => prev.filter((m) => m.sourceId === sourceId));
    setLoadedVideoId(null);
    load(true);
  }, [auth, videoId, load]);

  useStoreEvent((event) => {
    if (auth !== 'in' || event.event !== 'changed') return;
    if (event.scope === 'all' || (event.scope === 'memos' && event.videoId === videoId.toString())) load(false);
  });

  // 메모 글을 고칠 때마다 대사 전체를 훑지 않도록 대사를 원문으로 묶어 둔다.
  const sentencesByText = useMemo(() => {
    const map = new Map<string, Sentence[]>();
    sentences.forEach((s) => map.set(s.text, [...(map.get(s.text) ?? []), s]));
    return map;
  }, [sentences]);

  const reportedUnplaced = useRef<string | null>(null);
  useEffect(() => {
    const sourceId = videoId.toString();
    if (auth !== 'in' || loadedVideoId !== sourceId || sentencesByText.size === 0) return;
    const ids = annotations
      .filter((m) => m.sourceId === sourceId)
      .filter(
        (m) =>
          !(sentencesByText.get(m.contextText) ?? []).some(
            (s) => getAnnotationsForSentence([m], s).length > 0
          )
      )
      .map((m) => m.id)
      .sort();
    const signature = `${sourceId}:${ids.join(',')}`;
    if (reportedUnplaced.current === signature) return;
    reportedUnplaced.current = signature;
    storeWrite({ op: 'memos.reportUnplaced', videoId: sourceId, ids }).then((ok) => {
      if (!ok) reportedUnplaced.current = null;
    });
  }, [annotations, auth, loadedVideoId, sentencesByText, videoId]);

  const save = useCallback((memo: Memo) => {
    writeSeq.current += 1;
    const write = () => {
      storeWrite({ op: 'memos.put', memo }, write).then((ok) => setSaveFailed(!ok));
    };
    write();
  }, []);

  const addAnnotation = useCallback(
    (input: NewAnnotationInput): Memo => {
      const now = Date.now();
      const info = getVideoInfo(videoId);
      const memo: Memo = {
        id: createId(),
        kind: 'netflix',
        sourceId: videoId.toString(),
        contextText: input.sentenceText,
        start: input.start,
        end: input.end,
        quote: input.sentenceText.slice(input.start, input.end),
        note: '',
        createdAt: now,
        updatedAt: now,
        sentenceStartMs: input.sentenceStartMs,
        ...(info?.title ? { videoTitle: info.title } : {}),
        ...(info?.episodeTitle !== undefined
          ? { seasonSeq: info.seasonSeq, episodeSeq: info.episodeSeq, episodeTitle: info.episodeTitle }
          : {}),
      };
      setAnnotations((prev) => [...prev, memo]);
      save(memo);
      return memo;
    },
    [save, videoId]
  );

  const updateNote = useCallback(
    (id: string, note: string) => {
      const target = annotationsRef.current.find((a) => a.id === id);
      if (!target) return;
      const updated = { ...target, note, updatedAt: Date.now() };
      setAnnotations((prev) => prev.map((a) => (a.id === id ? updated : a)));
      save(updated);
    },
    [save]
  );

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    writeSeq.current += 1;
    const remove = () => {
      storeWrite({ op: 'memos.delete', id }, remove);
    };
    remove();
  }, []);

  return { annotations, addAnnotation, updateNote, removeAnnotation, saveFailed };
}

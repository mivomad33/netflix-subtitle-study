import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Memo, createId } from '../../../shared/memo/types';
import { ensureLegacyMigration, getStoreClient } from '../utils/storeClient';
import { getVideoInfo } from '../utils/dashboardHelper';
import { getAnnotationsForSentence } from '../utils/annotationHelper';

export interface NewAnnotationInput {
  sentenceStartMs: number;
  sentenceText: string;
  start: number;
  end: number;
}

type Sentence = { startTime_ms: number; text: string };

// 넷플릭스 영상 하나의 메모. 공통 저장소에서 불러오고, 바뀔 때마다 그 메모 하나만 저장한다.
// 어느 대사에도 붙지 않는 메모는 모아 보기가 "위치를 찾지 못함"으로 보이도록 저장소에 알린다.
export function useAnnotations(videoId: string | number, sentences: Sentence[] = []) {
  const [annotations, setAnnotations] = useState<Memo[]>([]);
  // 저장된 메모를 다 불러온 영상. 영상이 바뀐 직후 앞 영상의 메모로 판정하지 않기 위해 둔다.
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const annotationsRef = useRef<Memo[]>([]);
  annotationsRef.current = annotations;

  useEffect(() => {
    let cancelled = false;
    const sourceId = videoId.toString();
    ensureLegacyMigration()
      .then(() => getStoreClient().call<Memo[]>({ op: 'memos.list', videoId: sourceId }))
      .then((stored) => {
        if (cancelled) return;
        // 불러오는 동안 이 영상에 만든 메모는 그대로 두고, 불러온 것을 합친다. 앞 영상의 메모는 버린다.
        setAnnotations((prev) => {
          const local = prev.filter((m) => m.sourceId === sourceId);
          const localIds = new Set(local.map((m) => m.id));
          return [...local, ...stored.filter((m) => !localIds.has(m.id))];
        });
        setLoadedVideoId(sourceId);
      })
      .catch((e) => console.error('[NF-STUDY] Failed to load annotations:', e));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // 메모 글을 고칠 때마다 대사 전체를 훑지 않도록 대사를 원문으로 묶어 둔다.
  const sentencesByText = useMemo(() => {
    const map = new Map<string, Sentence[]>();
    sentences.forEach((s) => map.set(s.text, [...(map.get(s.text) ?? []), s]));
    return map;
  }, [sentences]);

  const reportedUnplaced = useRef<string | null>(null);
  useEffect(() => {
    const sourceId = videoId.toString();
    if (loadedVideoId !== sourceId || sentencesByText.size === 0) return;
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
    getStoreClient()
      .call({ op: 'memos.reportUnplaced', videoId: sourceId, ids })
      .catch((e) => {
        reportedUnplaced.current = null;
        console.error('[NF-STUDY] Failed to report unplaced annotations:', e);
      });
  }, [annotations, loadedVideoId, sentencesByText, videoId]);

  const save = useCallback((memo: Memo) => {
    getStoreClient()
      .call({ op: 'memos.put', memo })
      .then(() => setSaveFailed(false))
      .catch((e) => {
        console.error('[NF-STUDY] Failed to save annotation:', e);
        setSaveFailed(true);
      });
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
    getStoreClient()
      .call({ op: 'memos.delete', id })
      .catch((e) => console.error('[NF-STUDY] Failed to delete annotation:', e));
  }, []);

  return { annotations, addAnnotation, updateNote, removeAnnotation, saveFailed };
}

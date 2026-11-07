import { useState, useCallback, useEffect, useRef } from 'react';
import { Memo, createId } from '../../../shared/memo/types';
import { ensureLegacyMigration, getStoreClient } from '../utils/storeClient';
import { getVideoInfo } from '../utils/dashboardHelper';

export interface NewAnnotationInput {
  sentenceStartMs: number;
  sentenceText: string;
  start: number;
  end: number;
}

// 넷플릭스 영상 하나의 메모. 공통 저장소에서 불러오고, 바뀔 때마다 그 메모 하나만 저장한다.
export function useAnnotations(videoId: string | number) {
  const [annotations, setAnnotations] = useState<Memo[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const annotationsRef = useRef<Memo[]>([]);
  annotationsRef.current = annotations;

  useEffect(() => {
    let cancelled = false;
    const sourceId = videoId.toString();
    ensureLegacyMigration()
      .then(() => getStoreClient().call<Memo[]>({ op: 'memos.list', videoId: sourceId }))
      .then((loaded) => {
        if (cancelled) return;
        // 불러오는 동안 만든 메모는 그대로 두고, 불러온 것을 합친다.
        setAnnotations((prev) => {
          const localIds = new Set(prev.map((m) => m.id));
          return [...prev, ...loaded.filter((m) => !localIds.has(m.id))];
        });
      })
      .catch((e) => console.error('[NF-STUDY] Failed to load annotations:', e));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

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

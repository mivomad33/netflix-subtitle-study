import { useState, useCallback, useEffect, useRef } from 'react';
import { SentenceAnnotation } from '../../../types';
import {
  loadAnnotations,
  saveAnnotations,
  createAnnotationId,
} from '../utils/annotationHelper';

export interface NewAnnotationInput {
  sentenceStartMs: number;
  sentenceText: string;
  start: number;
  end: number;
}

export function useAnnotations(videoId: string | number) {
  const [annotations, setAnnotations] = useState<SentenceAnnotation[]>(() =>
    loadAnnotations(videoId)
  );
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveAnnotations(videoId, annotations);
  }, [annotations, videoId]);

  const addAnnotation = useCallback(
    (input: NewAnnotationInput): SentenceAnnotation => {
      const now = Date.now();
      const annotation: SentenceAnnotation = {
        id: createAnnotationId(),
        ...input,
        quote: input.sentenceText.slice(input.start, input.end),
        note: '',
        createdAt: now,
        updatedAt: now,
      };
      setAnnotations((prev) => [...prev, annotation]);
      return annotation;
    },
    []
  );

  const updateNote = useCallback((id: string, note: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, note, updatedAt: Date.now() } : a))
    );
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { annotations, addAnnotation, updateNote, removeAnnotation };
}

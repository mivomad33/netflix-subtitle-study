import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SentenceAnnotation } from '../../../types';
import { NewAnnotationInput } from '../hooks/useAnnotations';
import {
  buildSegments,
  getAnnotationsForSentence,
  getRangeOffsetsWithin,
  rangesOverlap,
  trimRange,
} from '../utils/annotationHelper';
import { AnnotationEditor } from './AnnotationEditor';

interface SentenceListProps {
  sentences: {
    startTime_ms: number;
    endTime_ms: number;
    text: string;
    hTranslation: string;
  }[];
  currentTab: number;
  itemsPerPage: number;
  activeIndex: number | null;
  isEnglishVisible: boolean;
  isAllVisible: boolean;
  visibleTranslations: Set<number>;
  visibleEnglishSentences: Set<number>;
  toggleEnglishSentence: (index: number) => void;
  toggleTranslation: (index: number) => void;
  handlePlaySentence: (startTime_ms: number) => void;
  sentenceRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  annotations: SentenceAnnotation[];
  editingAnnotationId: string | null;
  onAddAnnotation: (input: NewAnnotationInput) => SentenceAnnotation;
  onUpdateNote: (id: string, note: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onEditAnnotation: (id: string | null) => void;
}

interface PendingSelection {
  index: number;
  start: number;
  end: number;
  top: number;
  left: number;
}

const TOOLBAR_HEIGHT = 36;
const TOOLBAR_WIDTH = 170;

const hasTextSelection = () => {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== '';
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

export const SentenceList: React.FC<SentenceListProps> = ({
  sentences,
  currentTab,
  itemsPerPage,
  activeIndex,
  isEnglishVisible,
  isAllVisible,
  visibleTranslations,
  visibleEnglishSentences,
  toggleEnglishSentence,
  toggleTranslation,
  handlePlaySentence,
  sentenceRefs,
  annotations,
  editingAnnotationId,
  onAddAnnotation,
  onUpdateNote,
  onRemoveAnnotation,
  onEditAnnotation,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);

  useEffect(() => {
    setPending(null);
  }, [currentTab, itemsPerPage]);

  useEffect(() => {
    if (!pending) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pending]);

  // 영어 대사 하나 안에서 글을 고르면 하이라이트·메모 도구막대를 띄운다.
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setPending(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer;
    const ancestorElement =
      ancestor.nodeType === Node.ELEMENT_NODE
        ? (ancestor as Element)
        : ancestor.parentElement;
    const textElement = ancestorElement?.closest(
      '.sentence-text'
    ) as HTMLElement | null;
    if (
      !textElement ||
      !listRef.current?.contains(textElement) ||
      (textElement.classList.contains('hide-english') &&
        !textElement.classList.contains('always-visible'))
    ) {
      setPending(null);
      return;
    }

    const index = Number(textElement.dataset.index);
    const sentence = sentences[index];
    const offsets = getRangeOffsetsWithin(textElement, range);
    const trimmed = sentence && offsets ? trimRange(sentence.text, offsets) : null;
    if (!sentence || !trimmed) {
      setPending(null);
      return;
    }

    // 이미 칠한 곳과 겹치면 새로 칠하지 않고 그 하이라이트를 연다.
    const overlapping = getAnnotationsForSentence(annotations, sentence).find(
      (a) => rangesOverlap(a, trimmed)
    );
    if (overlapping) {
      selection.removeAllRanges();
      setPending(null);
      onEditAnnotation(overlapping.id);
      return;
    }

    let top = -TOOLBAR_HEIGHT - 6;
    let left = 0;
    const sentenceElement = textElement.closest('.sentence');
    if (sentenceElement && typeof range.getBoundingClientRect === 'function') {
      const rect = range.getBoundingClientRect();
      const base = sentenceElement.getBoundingClientRect();
      top = rect.top - base.top - TOOLBAR_HEIGHT - 6;
      if (top < 0) top = rect.bottom - base.top + 6;
      left = Math.max(
        0,
        Math.min(rect.left - base.left, base.width - TOOLBAR_WIDTH)
      );
    }
    setPending({ index, ...trimmed, top, left });
  }, [annotations, onEditAnnotation, sentences]);

  const createFromPending = (openEditor: boolean) => {
    if (!pending) return;
    const sentence = sentences[pending.index];
    const annotation = onAddAnnotation({
      sentenceStartMs: sentence.startTime_ms,
      sentenceText: sentence.text,
      start: pending.start,
      end: pending.end,
    });
    window.getSelection()?.removeAllRanges();
    setPending(null);
    if (openEditor) onEditAnnotation(annotation.id);
  };

  const getCurrentPageSentences = () => {
    const start = currentTab * itemsPerPage;
    const end = start + itemsPerPage;
    return sentences.slice(start, end);
  };

  return (
    <div className="sentence-list" ref={listRef} onMouseUp={handleMouseUp}>
      {getCurrentPageSentences().map((sentence, index) => {
        const globalIndex = currentTab * itemsPerPage + index;
        const sentenceAnnotations = getAnnotationsForSentence(
          annotations,
          sentence
        );
        const editingAnnotation = sentenceAnnotations.find(
          (a) => a.id === editingAnnotationId
        );
        return (
          <div
            key={index}
            ref={(el) => (sentenceRefs.current[globalIndex] = el)}
            className={`sentence ${
              globalIndex === activeIndex ? 'active' : ''
            }`}
          >
            <div className="sentence-header">
              <div
                className="sentence-time"
                onClick={() => handlePlaySentence(sentence.startTime_ms)}
              >
                {formatTime(sentence.startTime_ms)}
              </div>
            </div>
            <div
              className={`sentence-text ${
                !isEnglishVisible
                  ? visibleEnglishSentences.has(globalIndex)
                    ? 'hide-english always-visible'
                    : 'hide-english'
                  : ''
              }`}
              data-index={globalIndex}
              onClick={() => {
                if (!isEnglishVisible && !hasTextSelection()) {
                  toggleEnglishSentence(globalIndex);
                }
              }}
            >
              {buildSegments(sentence.text, sentenceAnnotations).map(
                (segment) =>
                  segment.annotation ? (
                    <mark
                      key={segment.annotation.id}
                      className={`highlighted-word ${
                        segment.annotation.note.trim() ? 'has-note' : ''
                      } ${
                        segment.annotation.id === editingAnnotationId
                          ? 'editing'
                          : ''
                      }`}
                      title={segment.annotation.note || '눌러서 메모 쓰기'}
                      onClick={(event) => {
                        if (hasTextSelection()) return;
                        event.stopPropagation();
                        onEditAnnotation(segment.annotation!.id);
                      }}
                    >
                      {segment.text}
                    </mark>
                  ) : (
                    <React.Fragment key={`text-${segment.start}`}>
                      {segment.text}
                    </React.Fragment>
                  )
              )}
            </div>
            <div
              className={`sentence-translation ${
                isAllVisible || visibleTranslations.has(globalIndex)
                  ? 'always-visible'
                  : ''
              }`}
              onClick={() => toggleTranslation(globalIndex)}
            >
              {sentence.hTranslation}
            </div>
            {pending && pending.index === globalIndex && (
              <div
                className="annotation-toolbar"
                style={{ top: pending.top, left: pending.left }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseUp={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="annotation-toolbar-btn"
                  onClick={() => createFromPending(false)}
                >
                  하이라이트
                </button>
                <button
                  type="button"
                  className="annotation-toolbar-btn"
                  onClick={() => createFromPending(true)}
                >
                  메모
                </button>
              </div>
            )}
            {editingAnnotation && (
              <AnnotationEditor
                annotation={editingAnnotation}
                onChangeNote={(note) => onUpdateNote(editingAnnotation.id, note)}
                onDelete={() => {
                  onRemoveAnnotation(editingAnnotation.id);
                  onEditAnnotation(null);
                }}
                onClose={() => onEditAnnotation(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

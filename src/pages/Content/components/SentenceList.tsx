import React, { useCallback, useRef } from 'react';
import { Memo } from '../../../shared/memo/types';
import { AnnotationEditor } from '../../../shared/ui/AnnotationEditor';
import {
  AnnotatedText,
  AnnotationToolbar,
  hasTextSelection,
  useAnnotationSelection,
} from '../../../shared/ui/annotationUi';
import { NewAnnotationInput } from '../hooks/useAnnotations';
import { getAnnotationsForSentence } from '../utils/annotationHelper';

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
  annotations: Memo[];
  editingAnnotationId: string | null;
  onAddAnnotation: (input: NewAnnotationInput) => Memo;
  onUpdateNote: (id: string, note: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onEditAnnotation: (id: string | null) => void;
  saveFailed?: boolean;
}

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
  saveFailed = false,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // 영어 대사 하나 안에서 고른 글만 받는다. 숨긴 대사는 고를 수 없다.
  const resolveTarget = useCallback(
    (key: string, element: HTMLElement) => {
      if (
        element.classList.contains('hide-english') &&
        !element.classList.contains('always-visible')
      ) {
        return null;
      }
      const sentence = sentences[Number(key)];
      if (!sentence) return null;
      return { text: sentence.text, memos: getAnnotationsForSentence(annotations, sentence) };
    },
    [annotations, sentences]
  );

  const { pending, handleMouseUp, clearPending } = useAnnotationSelection({
    containerRef: listRef,
    resolveTarget,
    onOpenMemo: onEditAnnotation,
    resetKey: `${currentTab}-${itemsPerPage}`,
  });

  const createFromPending = (openEditor: boolean) => {
    if (!pending) return;
    const sentence = sentences[Number(pending.key)];
    const annotation = onAddAnnotation({
      sentenceStartMs: sentence.startTime_ms,
      sentenceText: sentence.text,
      start: pending.start,
      end: pending.end,
    });
    clearPending();
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
            data-annotation-anchor
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
              className={`sentence-text annotatable ${
                !isEnglishVisible
                  ? visibleEnglishSentences.has(globalIndex)
                    ? 'hide-english always-visible'
                    : 'hide-english'
                  : ''
              }`}
              data-annotatable-key={globalIndex}
              onClick={() => {
                if (!isEnglishVisible && !hasTextSelection()) {
                  toggleEnglishSentence(globalIndex);
                }
              }}
            >
                <AnnotatedText
                text={sentence.text}
                memos={sentenceAnnotations}
                editingId={editingAnnotationId}
                onOpenMemo={onEditAnnotation}
              />
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
            {pending && pending.key === String(globalIndex) && (
              <AnnotationToolbar
                pending={pending}
                onHighlight={() => createFromPending(false)}
                onMemo={() => createFromPending(true)}
              />
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
                saveFailed={saveFailed}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

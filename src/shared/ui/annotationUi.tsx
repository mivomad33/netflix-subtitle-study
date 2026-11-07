import React, { useCallback, useEffect, useState } from 'react';
import { Memo } from '../memo/types';
import {
  TextRange,
  buildSegments,
  getRangeOffsetsWithin,
  rangesOverlap,
  trimRange,
} from '../memo/annotate';
import './annotations.css';

// 글을 고르면 하이라이트·메모 도구막대를 띄우는 부품. 넷플릭스 학습 패널과 원서 리더가 함께 쓴다.
// 고를 수 있는 글은 class "annotatable"과 data-annotatable-key를 가진 요소이고,
// 도구막대는 그 요소를 감싼 data-annotation-anchor 요소 기준으로 놓인다.

export interface PendingSelection extends TextRange {
  key: string;
  top: number;
  left: number;
}

export interface AnnotatableTarget {
  text: string;
  memos: Memo[];
}

const TOOLBAR_HEIGHT = 36;
const TOOLBAR_WIDTH = 170;

export const hasTextSelection = () => {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== '';
};

export function useAnnotationSelection({
  containerRef,
  resolveTarget,
  onOpenMemo,
  resetKey,
}: {
  containerRef: React.RefObject<HTMLElement>;
  resolveTarget: (key: string, element: HTMLElement) => AnnotatableTarget | null;
  onOpenMemo: (id: string) => void;
  resetKey?: unknown;
}) {
  const [pending, setPending] = useState<PendingSelection | null>(null);

  useEffect(() => {
    setPending(null);
  }, [resetKey]);

  useEffect(() => {
    if (!pending) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pending]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setPending(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer;
    const ancestorElement =
      ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as Element) : ancestor.parentElement;
    const element = ancestorElement?.closest('.annotatable') as HTMLElement | null;
    const key = element?.dataset.annotatableKey;
    const target =
      element && key !== undefined && containerRef.current?.contains(element)
        ? resolveTarget(key, element)
        : null;
    const offsets = element && target ? getRangeOffsetsWithin(element, range) : null;
    const trimmed = target && offsets ? trimRange(target.text, offsets) : null;
    if (!element || !target || !trimmed || key === undefined) {
      setPending(null);
      return;
    }

    // 이미 칠한 곳과 겹치면 새로 칠하지 않고 그 하이라이트를 연다.
    const overlapping = target.memos.find((m) => rangesOverlap(m, trimmed));
    if (overlapping) {
      selection.removeAllRanges();
      setPending(null);
      onOpenMemo(overlapping.id);
      return;
    }

    let top = -TOOLBAR_HEIGHT - 6;
    let left = 0;
    const anchor = element.closest('[data-annotation-anchor]');
    if (anchor && typeof range.getBoundingClientRect === 'function') {
      const rect = range.getBoundingClientRect();
      const base = anchor.getBoundingClientRect();
      top = rect.top - base.top - TOOLBAR_HEIGHT - 6;
      if (top < 0) top = rect.bottom - base.top + 6;
      left = Math.max(0, Math.min(rect.left - base.left, base.width - TOOLBAR_WIDTH));
    }
    setPending({ key, ...trimmed, top, left });
  }, [containerRef, onOpenMemo, resolveTarget]);

  const clearPending = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }, []);

  return { pending, handleMouseUp, clearPending };
}

export const AnnotationToolbar: React.FC<{
  pending: PendingSelection;
  onHighlight: () => void;
  onMemo: () => void;
}> = ({ pending, onHighlight, onMemo }) => (
  <div
    className="annotation-toolbar"
    style={{ top: pending.top, left: pending.left }}
    onMouseDown={(event) => event.preventDefault()}
    onMouseUp={(event) => event.stopPropagation()}
  >
    <button type="button" className="annotation-toolbar-btn" onClick={onHighlight}>
      하이라이트
    </button>
    <button type="button" className="annotation-toolbar-btn" onClick={onMemo}>
      메모
    </button>
  </div>
);

// 하이라이트를 mark로 그린다. 고를 수 있는 요소 안에 넣는다.
export const AnnotatedText: React.FC<{
  text: string;
  memos: Memo[];
  editingId: string | null;
  onOpenMemo: (id: string) => void;
}> = ({ text, memos, editingId, onOpenMemo }) => (
  <>
    {buildSegments(text, memos).map((segment) =>
      segment.memo ? (
        <mark
          key={segment.memo.id}
          data-memo-id={segment.memo.id}
          className={`highlighted-word ${segment.memo.note.trim() ? 'has-note' : ''} ${
            segment.memo.id === editingId ? 'editing' : ''
          }`}
          title={segment.memo.note || '눌러서 메모 쓰기'}
          onClick={(event) => {
            if (hasTextSelection()) return;
            event.stopPropagation();
            onOpenMemo(segment.memo!.id);
          }}
        >
          {segment.text}
        </mark>
      ) : (
        <React.Fragment key={`text-${segment.start}`}>{segment.text}</React.Fragment>
      )
    )}
  </>
);

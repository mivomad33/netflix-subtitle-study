import React, { useEffect, useRef } from 'react';
import { SentenceAnnotation } from '../../../types';

interface AnnotationEditorProps {
  annotation: SentenceAnnotation;
  onChangeNote: (note: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

// 넷플릭스 플레이어 단축키(스페이스, F, 화살표 등)가 메모 입력에 반응하지 않게 키 이벤트를 여기서 멈춘다.
const stopKeyPropagation = (event: React.KeyboardEvent) => {
  event.stopPropagation();
};

export const AnnotationEditor: React.FC<AnnotationEditorProps> = ({
  annotation,
  onChangeNote,
  onDelete,
  onClose,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [annotation.id]);

  // 글이 늘면 높이도 같이 늘린다. 최소 높이는 CSS가 정한다.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [annotation.note]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const handleDelete = () => {
    if (
      annotation.note.trim() &&
      !window.confirm('하이라이트를 지우면 메모도 함께 지워집니다. 지울까요?')
    ) {
      return;
    }
    onDelete();
  };

  return (
    <div
      className="annotation-editor"
      onKeyDown={handleKeyDown}
      onKeyUp={stopKeyPropagation}
      onKeyPress={stopKeyPropagation}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="annotation-editor-quote">{annotation.quote}</div>
      <textarea
        ref={textareaRef}
        className="annotation-editor-textarea"
        rows={6}
        value={annotation.note}
        placeholder="뜻, 쓰임, 발음, 비슷한 표현 등 이 단어·문장에 대해 배운 것을 적어 보세요."
        aria-label="메모"
        onChange={(e) => onChangeNote(e.target.value)}
      />
      <div className="annotation-editor-footer">
        <span className="annotation-editor-hint">자동 저장 · Esc로 닫기</span>
        <div className="annotation-editor-actions">
          <button
            type="button"
            className="annotation-btn annotation-btn-danger"
            onClick={handleDelete}
          >
            하이라이트 지우기
          </button>
          <button type="button" className="annotation-btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

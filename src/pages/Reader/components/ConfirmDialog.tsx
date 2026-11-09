import React, { useEffect, useId, useRef } from 'react';

// 되돌리기 어려운 일을 묻는 대화상자. 브라우저의 dialog 요소(showModal)가 포커스 가두기와 Esc 닫기를 맡는다.
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions: React.ReactNode;
}> = ({ open, title, onClose, children, actions }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="nfr-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className="nfr-dialog-title">
            {title}
          </h2>
          <div className="nfr-dialog-body">{children}</div>
          <div className="nfr-dialog-actions">{actions}</div>
        </>
      )}
    </dialog>
  );
};

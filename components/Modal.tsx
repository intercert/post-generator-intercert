'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  onClose: () => void;
  /** Se informado, o conteúdo vira um formulário e o rodapé pode ter botão submit. */
  onSubmit?: (e: React.FormEvent) => void;
  footer: ReactNode;
  children: ReactNode;
}

/** Janela modal sobre <dialog>: foco preso, Esc fecha, fundo escurecido. */
export default function Modal({ title, description, onClose, onSubmit, footer, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Só fecha pelo fundo se o clique começou nele; selecionar texto e soltar fora não deve fechar.
  const pressedBackdrop = useRef(false);

  const inner = (
    <>
      <header className="modal-head modal-head-bar">
        <div>
          <h2>{title}</h2>
          {description && <p className="hint">{description}</p>}
        </div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className="modal-body">{children}</div>
      <footer className="modal-foot">{footer}</footer>
    </>
  );

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === ref.current) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {onSubmit ? (
        <form className="modal-form" onSubmit={onSubmit} noValidate>
          {inner}
        </form>
      ) : (
        <div className="modal-form">{inner}</div>
      )}
    </dialog>
  );
}

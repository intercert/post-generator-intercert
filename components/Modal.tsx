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

  const inner = (
    <>
      <header className="modal-head">
        <h2>{title}</h2>
        {description && <p className="hint">{description}</p>}
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

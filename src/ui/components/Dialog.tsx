import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  /** Called on Escape / backdrop dismiss. Omit to make the dialog non-dismissable. */
  onCancel?: () => void;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Modal built on the native <dialog>: `showModal()` makes the rest of the page
 * inert (focus stays inside) and restores focus on close.
 */
export function Dialog({ open, title, onCancel, children, className, testId }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      dialog.showModal();
      return () => {
        if (dialog.open) dialog.close();
        previouslyFocused?.focus?.();
      };
    }
    return undefined;
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog panel ${className ?? ''}`}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel?.();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className="panel__title">
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  );
}

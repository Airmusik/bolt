import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex items-start gap-3">
        {danger && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-danger" />
          </span>
        )}
        <p className="text-sm text-ink-700">{message}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">{cancelLabel}</button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={danger ? 'btn bg-danger text-white hover:bg-red-700' : 'btn-primary'}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

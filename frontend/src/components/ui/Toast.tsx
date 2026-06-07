import { X } from 'lucide-react'
export type ToastTone = 'success' | 'error' | 'info'

export interface ToastState {
  message: string
  tone?: ToastTone
}

interface ToastProps {
  toast: ToastState | null
  onDismiss: () => void
}

const toneClass: Record<ToastTone, string> = {
  success: 'toast-success',
  error: 'toast-error',
  info: 'toast-info',
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null

  return (
    <div
      className={`toast ${toneClass[toast.tone ?? 'info']}`}
      role="status"
      aria-live="polite"
    >
      <span>{toast.message}</span>
      <button type="button" onClick={onDismiss} className="toast-dismiss" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant =
  | 'primary'
  | 'soft'
  | 'ghost'
  | 'pipeline'
  | 'brain'
  | 'vault'
  | 'destructive'

export type ButtonSize = 'xs' | 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const sizeClass: Record<ButtonSize, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
}

export function Button({
  variant = 'soft',
  size = 'sm',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'btn btn-primary'
      : variant === 'ghost'
        ? 'btn btn-ghost'
        : variant === 'soft'
          ? 'btn btn-soft'
          : `action-btn ${variant}`

  return (
    <button
      className={`${variantClass} ${sizeClass[size]} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  )
}
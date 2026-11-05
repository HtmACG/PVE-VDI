import * as React from 'react'
import { cn } from '@renderer/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full min-w-0 border border-input bg-transparent px-3 py-1 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border-strong focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full border border-input bg-transparent px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border-strong focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Input, Textarea }

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap border text-[13px] font-medium leading-none transition-colors outline-none focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/88',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/75',
        /** 实底白/浅色按钮：浅色模式为白底，深色模式保持与卡片一致的可读实底。 */
        surface: 'border-border-strong bg-surface text-foreground hover:bg-surface-hover',
        outline: 'border-border bg-transparent text-foreground hover:border-border-strong hover:bg-accent',
        ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        destructive:
          'border-destructive/45 bg-destructive/10 text-destructive hover:border-destructive/70 hover:bg-destructive/20',
        brand: 'border-brand bg-brand text-brand-foreground hover:bg-brand/90',
        link: 'border-transparent bg-transparent text-foreground underline-offset-4 hover:underline'
      },
      size: {
        sm: 'h-8 px-3 text-[12px]',
        default: 'h-9 px-3.5',
        lg: 'h-10 px-4 text-[13px]',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-lg': 'h-10 w-10 p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 spin" /> : null}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }

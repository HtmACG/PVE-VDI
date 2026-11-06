import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'animate-overlay-in fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideClose?: boolean
}

/**
 * 弹窗外壳：顶部标题带 + 内容区 + 可选页脚，三段式纵向布局。
 * 关闭按钮浮在标题带上，与标题同一视觉基线，不再单独切出一条边框竖线。
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'animate-dialog-in fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-48px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-border-strong bg-popover shadow-[0_24px_80px_rgba(0,0,0,0.5)] focus:outline-none',
        className
      )}
      {...props}
    >
      {children}
      {hideClose ? null : (
        <DialogPrimitive.Close className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-brand">
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

/** 标题带：浅底 + 下边线，和内容区形成层次，而不是靠一条通栏横线硬切。 */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div
    className={cn('flex shrink-0 flex-col gap-1 border-b border-border bg-panel/40 px-5 py-3.5 pr-12', className)}
    {...props}
  />
)

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div
    className={cn(
      'flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-panel/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-end',
      className
    )}
    {...props}
  />
)

/** 内容区：统一内边距与纵向节奏，避免各个弹窗各写一套 py-1 / space-y-3。 */
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4', className)} {...props} />
)

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-[14px] font-semibold leading-5 tracking-tight text-foreground', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-[11.5px] leading-[18px] text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

/** 弹窗里的字段组：标签与控件贴到 6px，提示文字再退一档，整体读起来是一条竖线。 */
const DialogField = ({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element => (
  <div className={cn('space-y-1.5', className)}>
    <DialogPrimitive.Title asChild>
      <span className="block text-[11.5px] font-medium text-foreground/80">{label}</span>
    </DialogPrimitive.Title>
    {children}
    {hint && <p className="text-[10.5px] leading-[16px] text-muted-foreground/85">{hint}</p>}
  </div>
)

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'animate-sheet-in fixed inset-y-0 right-0 z-50 flex w-full max-w-[660px] flex-col border-l border-border-strong bg-popover shadow-[-24px_0_80px_rgba(0,0,0,0.4)] focus:outline-none',
        className
      )}
      {...props}
    >
      {children}
      {hideClose ? null : (
        <DialogPrimitive.Close className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center border-b border-l border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-brand">
          <X className="h-4 w-4" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn('flex flex-col gap-1.5 px-5 py-4', className)} {...props} />
)

const SheetTitle = DialogTitle
const SheetDescription = DialogDescription

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogField,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
  SheetTrigger
}

import { Toaster as SonnerToaster } from 'sonner'
import type { Theme } from '@shared/types'

export function Toaster({ theme }: { theme: Theme }): React.JSX.Element {
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      offset={16}
      gap={8}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group border border-border-strong bg-popover text-foreground shadow-[0_16px_50px_rgba(0,0,0,0.4)] text-[12px]',
          title: 'text-[12px] font-medium',
          description: 'text-[11px] text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-secondary text-secondary-foreground',
          closeButton: 'bg-popover border-border text-muted-foreground hover:text-foreground'
        }
      }}
    />
  )
}

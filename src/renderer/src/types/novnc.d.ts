declare module '@novnc/novnc' {
  interface RFBCredentials {
    username?: string
    password?: string
    target?: string
  }

  interface RFBConnectOptions {
    credentials?: RFBCredentials
    shared?: boolean
    repeaterID?: string
    wsProtocols?: string[]
    showDotCursor?: boolean
  }

  interface RFBDisconnectDetail {
    clean: boolean
  }

  interface RFBSecurityFailureDetail {
    status: number
    reason: string
  }

  interface RFBClipboardDetail {
    text: string
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: RFBConnectOptions)
    viewOnly: boolean
    focusOnClick: boolean
    clipViewport: boolean
    dragViewport: boolean
    scaleViewport: boolean
    resizeSession: boolean
    showDotCursor: boolean
    qualityLevel: number
    compressionLevel: number
    background: string
    disconnect(): void
    sendCtrlAltDel(): void
    sendCredentials(credentials: RFBCredentials): void
    focus(options?: FocusOptions): void
    blur(): void
    clipboardPasteFrom(text: string): void
    getImageData(): ImageData
    toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void
    addEventListener(
      type: 'connect' | 'disconnect' | 'securityfailure' | 'credentialsrequired' | 'clipboard' | 'bell' | 'desktopname' | 'capabilities',
      listener: (event: CustomEvent<RFBDisconnectDetail & RFBSecurityFailureDetail & RFBClipboardDetail>) => void
    ): void
    removeEventListener(
      type: 'connect' | 'disconnect' | 'securityfailure' | 'credentialsrequired' | 'clipboard' | 'bell' | 'desktopname' | 'capabilities',
      listener: (event: CustomEvent<RFBDisconnectDetail & RFBSecurityFailureDetail & RFBClipboardDetail>) => void
    ): void
  }
}

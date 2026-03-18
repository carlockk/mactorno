type ElectronBrowserHostPayload = {
  visible: boolean
  bounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  url?: string
}

type ElectronDesktopApi = {
  getDeviceInfo: () => Promise<unknown>
  getInstalledApps: () => Promise<unknown>
  listVolumeEntries: (target: string) => Promise<unknown>
  getSystemControls: () => Promise<unknown>
  setSystemControls: (payload: { brightness?: number; volume?: number }) => Promise<unknown>
  executeTerminalCommand: (payload: { command: string; cwd: string }) => Promise<unknown>
  launchApp: (target: string) => Promise<unknown>
  onBrowserSyncRequest: (callback: () => void) => () => void
  onBrowserState: (
    callback: (payload: {
      url: string
      title: string
      loading: boolean
      lastError: string | null
    }) => void,
  ) => () => void
  browser: {
    syncHost: (payload: ElectronBrowserHostPayload) => void
    navigate: (url: string) => void
    goBack: () => void
    goForward: () => void
    reload: () => void
    openExternal: (url: string) => void
    hide: () => void
  }
}

declare global {
  interface Window {
    electronDesktop?: ElectronDesktopApi
  }
}

export {}

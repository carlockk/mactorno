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
  getBootDeviceInfo: () => Promise<unknown>
  getDeviceInfo: () => Promise<unknown>
  getInstalledApps: (payload?: { lite?: boolean }) => Promise<unknown>
  listVolumeEntries: (payload: { target: string; offset?: number; limit?: number; lite?: boolean }) => Promise<unknown>
  getSystemControls: () => Promise<unknown>
  setSystemControls: (payload: { brightness?: number; volume?: number }) => Promise<unknown>
  pickMediaFile: (kind: 'photo' | 'video') => Promise<{ path: string; name: string } | null>
  revealPath: (target: string) => Promise<{ ok?: boolean; error?: string | null }>
  executeTerminalCommand: (payload: { command: string; cwd: string }) => Promise<unknown>
  launchApp: (target: string) => Promise<{ ok?: boolean; error?: string | null }>
  quitApp: () => Promise<{ ok?: boolean }>
  reloadApp: () => Promise<{ ok?: boolean }>
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
    setAppearance: (mode: 'classic' | 'dark') => void
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

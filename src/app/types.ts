export type AppId = 'finder' | 'notes' | 'textedit' | 'safari' | 'terminal' | 'launcher' | 'calculator' | 'photos' | 'videos' | 'display' | 'about' | 'docksettings'
export type FinderRoute = 'computer' | 'desktop' | 'trash' | 'device' | 'applications' | 'dock' | 'display' | 'recents' | `volume:${string}` | `desktop-folder:${string}`
export type RectState = { x: number; y: number; width: number; height: number }

export type DockIconSpec = {
  kind: 'glyph' | 'image'
  value: string
}

export type DesktopApp = {
  id: AppId
  name: string
  accent: string
  icon: string | DockIconSpec
  menu: string[]
  dockable: boolean
}

export type GenieState = {
  mode: 'opening' | 'closing' | 'closing-fade'
  dockRect?: RectState
  minimizeOnFinish?: boolean
  removeOnFinish?: boolean
}

export type FinderTab = {
  id: string
  history: FinderRoute[]
  historyIndex: number
}

export type FinderViewMode = 'icons' | 'list'
export type FinderSortMode = 'name' | 'type' | 'date' | 'size'

export type FinderState = {
  tabs: FinderTab[]
  activeTabId: string
  viewMode: FinderViewMode
  sortMode: FinderSortMode
}

export type BrowserTab = {
  id: string
  history: string[]
  historyIndex: number
  inputValue: string
  reloadKey: number
  loading: boolean
  progress: number
  title: string
  lastError: string | null
}

export type BrowserState = {
  tabs: BrowserTab[]
  activeTabId: string
  history: string[]
  historyIndex: number
  inputValue: string
  reloadKey: number
  loading: boolean
  progress: number
  title: string
  lastError: string | null
}

export type CalculatorState = {
  display: string
  storedValue: number | null
  operator: '/' | '×' | '-' | '+' | null
  waitingForOperand: boolean
}

export type TerminalEntry = {
  id: string
  command: string
  output: string
  error: string
  exitCode: number
}

export type TerminalState = {
  cwd: string
  input: string
  busy: boolean
  history: TerminalEntry[]
}

export type WindowState = {
  id: string
  appId: AppId
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  minimized: boolean
  maximized: boolean
  restoreBounds: RectState | null
  genie: GenieState | null
  finderState: FinderState | null
  browserState: BrowserState | null
  calculatorState: CalculatorState | null
  terminalState: TerminalState | null
  mediaPath: string | null
  textDocumentId: string | null
}

export type DragState = { id: string; offsetX: number; offsetY: number }
export type ResizeState = { id: string; startX: number; startY: number; startWidth: number; startHeight: number }

export type DeviceInfo = {
  hostname: string
  osName: string
  platform: string
  release: string
  version: string
  arch: string
  cpuModel: string
  cpuCount: number
  totalMemoryGb: string
  freeMemoryGb: string
  uptimeHours: string
  homeDir: string
  userName: string
  userAvatar: string | null
  gpuModel?: string | null
  videoMemoryMb?: number | null
  systemWallpapers: Array<{ id: string; name: string; path: string }>
  volumes: Array<{ name: string; mount: string; totalGb: string; freeGb: string; kind: 'internal' | 'external' }>
}

export type VolumeInfo = DeviceInfo['volumes'][number]

export type VolumeEntry = {
  name: string
  path: string
  kind: 'directory' | 'file'
  extension: string
  sizeBytes: number | null
  icon?: string | null
}

export type VolumeEntriesPage = {
  entries: VolumeEntry[]
  total: number
  nextOffset: number | null
  hasMore: boolean
}

export type InstalledApp = {
  id: string
  name: string
  target: string
  launchTarget?: string
  source: string
  icon?: string | null
}

export type CustomDockItem = {
  id: string
  name: string
  icon: DockIconSpec
  accent: string
  kind: 'url' | 'app' | 'finder-route' | 'path' | 'desktop-document'
  target: string
}

export type AppVisualOverrides = Partial<
  Record<
    AppId,
    {
      icon?: DockIconSpec
      accent?: string
    }
  >
>

export type WallpaperPreset = {
  id: string
  name: string
  background: string
}

export type WallpaperSelection =
  | { kind: 'preset'; value: string }
  | { kind: 'upload'; value: string; name: string }
  | { kind: 'system'; value: string; name: string }
  | { kind: 'asset'; value: string; name: string }

export type NoteItem = {
  id: string
  title: string
  body: string
  updatedAt: number
}

export type DesktopItem = {
  id: string
  kind: 'folder' | 'text' | 'file'
  name: string
  parentId: string | null
  content: string
  sourcePath: string | null
  extension: string
  iconDataUrl: string | null
  x: number
  y: number
  updatedAt: number
  trashedAt: number | null
}

export type ContextMenuState =
  | {
      type: 'desktop'
      x: number
      y: number
      desktopX: number
      desktopY: number
    }
  | {
      type: 'desktop-item'
      x: number
      y: number
      itemId: string
      label: string
      kind: DesktopItem['kind']
    }
  | {
      type: 'trash'
      x: number
      y: number
    }
  | {
      type: 'finder'
      x: number
      y: number
      windowId: string
      route: FinderRoute
      label: string
    }
  | {
      type: 'finder-virtual'
      x: number
      y: number
      windowId: string
      parentId: string | null
    }
  | {
      type: 'volume-entry'
      x: number
      y: number
      label: string
      entry: VolumeEntry
    }
  | {
      type: 'dock-app'
      x: number
      y: number
      appId: AppId
      label: string
    }
  | {
      type: 'dock-custom'
      x: number
      y: number
      itemId: string
      label: string
    }
  | {
      type: 'dock-transient'
      x: number
      y: number
      itemId: string
      label: string
    }
  | {
      type: 'dock-volume'
      x: number
      y: number
      mount: string
      label: string
    }
  | null

export type AppMenuAction = 'media-open' | 'media-reveal' | 'media-open-system' | 'window-minimize' | 'window-close'
  | 'media-open-finder'
  | 'note-new'
  | 'photo-zoom-in'
  | 'photo-zoom-out'
  | 'photo-rotate-right'
  | 'photo-reset-view'
  | 'calculator-clear'
  | 'safari-new-window'
  | 'browser-go-back'
  | 'browser-go-forward'
  | 'browser-reload'
  | 'browser-open-external'
  | 'browser-home'
  | 'terminal-new-window'
  | 'video-toggle-play'
  | 'video-restart'
  | 'video-toggle-mute'
  | 'video-speed-normal'
  | 'video-speed-fast'
  | 'finder-new-folder'
  | 'finder-new-text'
  | 'finder-paste'
  | 'finder-refresh'
  | 'finder-go-back'
  | 'finder-go-forward'
  | 'finder-go-desktop'
  | 'finder-go-computer'
  | 'finder-go-trash'
  | 'finder-go-device'
  | 'finder-go-applications'
  | 'finder-go-dock'
  | 'finder-go-display'
  | 'finder-new-window'
  | 'finder-new-tab'
  | 'about-open'
  | 'finder-new-folder'
  | 'finder-new-text'
  | 'finder-paste'
  | 'finder-refresh'
  | 'finder-go-back'
  | 'finder-go-forward'
  | 'finder-go-desktop'
  | 'finder-go-computer'
  | 'finder-go-trash'
  | 'finder-go-device'
  | 'finder-go-applications'
  | 'finder-go-dock'
  | 'finder-go-display'
  | 'finder-new-window'
  | 'finder-new-tab'
  | 'about-open'

export type PhotoViewState = {
  zoom: number
  rotation: number
}

export type SystemControlsState = {
  brightness: number
  volume: number
  supportsBrightness: boolean
  supportsVolume: boolean
}

export type SystemControlPatch = Partial<Pick<SystemControlsState, 'brightness' | 'volume'>>
export type DesktopVolumeDragState = { mount: string; offsetX: number; offsetY: number; moved: boolean }
export type AppearanceMode = 'classic' | 'dark'
export type PerformanceMode = 'auto' | 'high' | 'balanced' | 'compatibility'
export type ResolvedPerformanceProfile = Exclude<PerformanceMode, 'auto'>
export type DesktopItemDragState = {
  id: string
  offsetX: number
  offsetY: number
  moved: boolean
}

export type DesktopTrashDragState = {
  offsetX: number
  offsetY: number
  moved: boolean
}

export type DesktopClipboardState =
  | { type: 'desktop-item'; itemId: string }
  | { type: 'volume-entry'; entry: VolumeEntry }
  | null

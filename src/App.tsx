import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'
import './App.css'

type AppId = 'finder' | 'notes' | 'safari' | 'terminal' | 'launcher' | 'calculator' | 'photos' | 'videos' | 'display' | 'about' | 'docksettings'
type FinderRoute = 'computer' | 'device' | 'applications' | 'dock' | 'display' | `volume:${string}`
type RectState = { x: number; y: number; width: number; height: number }

type DesktopApp = {
  id: AppId
  name: string
  accent: string
  icon: string | DockIconSpec
  menu: string[]
  dockable: boolean
}

type GenieState = {
  mode: 'opening' | 'closing' | 'closing-fade'
  dockRect?: RectState
  minimizeOnFinish?: boolean
  removeOnFinish?: boolean
}

type FinderTab = {
  id: string
  history: FinderRoute[]
  historyIndex: number
}

type FinderState = {
  tabs: FinderTab[]
  activeTabId: string
}

type BrowserState = {
  history: string[]
  historyIndex: number
  inputValue: string
  reloadKey: number
  loading: boolean
  title: string
  lastError: string | null
}

type CalculatorState = {
  display: string
  storedValue: number | null
  operator: '/' | '×' | '-' | '+' | null
  waitingForOperand: boolean
}

type TerminalEntry = {
  id: string
  command: string
  output: string
  error: string
  exitCode: number
}

type TerminalState = {
  cwd: string
  input: string
  busy: boolean
  history: TerminalEntry[]
}

type WindowState = {
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
}

type DragState = { id: string; offsetX: number; offsetY: number }
type ResizeState = { id: string; startX: number; startY: number; startWidth: number; startHeight: number }

type DeviceInfo = {
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
  volumes: Array<{ name: string; mount: string; totalGb: string; freeGb: string; kind: 'internal' | 'external' }>
}

type VolumeInfo = DeviceInfo['volumes'][number]

type VolumeEntry = {
  name: string
  path: string
  kind: 'directory' | 'file'
  extension: string
  sizeBytes: number | null
}

type InstalledApp = {
  id: string
  name: string
  target: string
  launchTarget?: string
  source: string
  icon?: string | null
}

type DockIconSpec = {
  kind: 'glyph' | 'image'
  value: string
}

type CustomDockItem = {
  id: string
  name: string
  icon: DockIconSpec
  accent: string
  kind: 'url' | 'app' | 'finder-route'
  target: string
}

type AppVisualOverrides = Partial<
  Record<
    AppId,
    {
      icon?: DockIconSpec
      accent?: string
    }
  >
>

type ContextMenuState =
  | {
      type: 'finder'
      x: number
      y: number
      windowId: string
      route: FinderRoute
      label: string
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
      type: 'dock-volume'
      x: number
      y: number
      mount: string
      label: string
    }
  | null

type AppMenuAction = 'media-open' | 'media-reveal' | 'media-open-system' | 'window-minimize' | 'window-close'
  | 'media-open-finder'
  | 'photo-zoom-in'
  | 'photo-zoom-out'
  | 'photo-rotate-right'
  | 'photo-reset-view'
  | 'video-toggle-play'
  | 'video-restart'
  | 'video-toggle-mute'
  | 'video-speed-normal'
  | 'video-speed-fast'

type PhotoViewState = {
  zoom: number
  rotation: number
}

type SystemControlsState = {
  brightness: number
  volume: number
  supportsBrightness: boolean
  supportsVolume: boolean
}

type SystemControlPatch = Partial<Pick<SystemControlsState, 'brightness' | 'volume'>>
type DesktopVolumeDragState = { mount: string; offsetX: number; offsetY: number; moved: boolean }
type AppearanceMode = 'classic' | 'dark'
type WallpaperPreset = {
  id: string
  name: string
  background: string
}
type NoteItem = {
  id: string
  title: string
  body: string
  updatedAt: number
}

const MENU_BAR_HEIGHT = 30
const DOCK_BOTTOM = 0
const DOCK_HEIGHT = 82
const WINDOW_RADIUS = 8
const DESKTOP_SIDE_MARGIN = 24
const DESKTOP_TOP_GAP = 16
const DESKTOP_BOTTOM_GAP = 18
const MIN_WINDOW_WIDTH = 320
const MIN_WINDOW_HEIGHT = 220
const DOCK_STORAGE_KEY = 'mactorno-dock-items'
const CUSTOM_DOCK_STORAGE_KEY = 'mactorno-custom-dock-items'
const APP_VISUAL_STORAGE_KEY = 'mactorno-app-visuals'
const DESKTOP_VOLUME_POSITIONS_STORAGE_KEY = 'mactorno-desktop-volume-positions'
const APPEARANCE_MODE_STORAGE_KEY = 'mactorno-appearance-mode'
const WALLPAPER_STORAGE_KEY = 'mactorno-wallpaper-id'
const NOTES_STORAGE_KEY = 'mactorno-notes'
const SYSTEM_CONTROLS_DEBOUNCE_MS = 120
const DEFAULT_DOCK_ITEMS: AppId[] = ['finder', 'launcher', 'notes', 'safari', 'photos', 'videos', 'calculator', 'docksettings', 'terminal']
const SAFARI_HOME_URL = 'mactorno://home'
const DEFAULT_BROWSER_URL = SAFARI_HOME_URL
const DEFAULT_WEB_FALLBACK_URL = SAFARI_HOME_URL
const ICON_PRESETS: DockIconSpec[] = [
  { kind: 'glyph', value: '📁' },
  { kind: 'glyph', value: '🌐' },
  { kind: 'glyph', value: '📝' },
  { kind: 'glyph', value: '⌘' },
  { kind: 'glyph', value: '⚙' },
  { kind: 'glyph', value: '💻' },
  { kind: 'glyph', value: '🧭' },
  { kind: 'glyph', value: '🔧' },
]

const ICON_ASSET_PRESETS: Array<{ label: string; icon: DockIconSpec }> = [
  { label: 'Finder', icon: { kind: 'image', value: '/finder.jpg' } },
  { label: 'Apps', icon: { kind: 'image', value: '/app.png' } },
  { label: 'Notas', icon: { kind: 'image', value: '/notas.png' } },
  { label: 'Safari', icon: { kind: 'image', value: '/safari.png' } },
  { label: 'Fotos', icon: { kind: 'image', value: '/fotos.png' } },
  { label: 'Videos', icon: { kind: 'image', value: '/video.png' } },
  { label: 'Calculadora', icon: { kind: 'image', value: '/calculator.png' } },
  { label: 'Terminal', icon: { kind: 'image', value: '/Terminalicon2.png' } },
  { label: 'Config', icon: { kind: 'image', value: '/config.png' } },
]

const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'coast',
    name: 'Costa',
    background:
      'radial-gradient(circle at top left, rgba(255, 213, 161, 0.85), transparent 28%), radial-gradient(circle at 80% 18%, rgba(140, 214, 255, 0.7), transparent 26%), linear-gradient(160deg, #17365f 0%, #2856a8 34%, #8b4ba5 72%, #f58e63 100%)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    background:
      'radial-gradient(circle at 18% 20%, rgba(168, 255, 221, 0.42), transparent 24%), radial-gradient(circle at 82% 22%, rgba(123, 213, 255, 0.34), transparent 22%), linear-gradient(160deg, #071b32 0%, #0a456e 36%, #17657b 62%, #2f8f80 100%)',
  },
  {
    id: 'graphite',
    name: 'Grafito',
    background:
      'radial-gradient(circle at 22% 18%, rgba(112, 124, 163, 0.24), transparent 24%), radial-gradient(circle at 78% 72%, rgba(72, 78, 102, 0.28), transparent 26%), linear-gradient(155deg, #0d111a 0%, #161d29 34%, #1f2a39 66%, #2a3241 100%)',
  },
  {
    id: 'violet-night',
    name: 'Noche violeta',
    background:
      'radial-gradient(circle at 18% 16%, rgba(255, 178, 229, 0.28), transparent 20%), radial-gradient(circle at 84% 22%, rgba(130, 183, 255, 0.24), transparent 24%), linear-gradient(160deg, #120f26 0%, #291b4d 34%, #453380 68%, #0f6a8e 100%)',
  },
]

const APPS: DesktopApp[] = [
  { id: 'finder', name: 'Finder', accent: 'linear-gradient(135deg, #7fd1ff 0%, #2f84ff 100%)', icon: 'F', menu: ['Archivo', 'Edicion', 'Ver', 'Ir', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'launcher', name: 'Apps', accent: 'linear-gradient(135deg, #ffd59f 0%, #ff8b4d 100%)', icon: 'A', menu: ['Archivo', 'Ver', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'notes', name: 'Notas', accent: 'linear-gradient(135deg, #ffe57a 0%, #ffbf2f 100%)', icon: 'N', menu: ['Archivo', 'Edicion', 'Formato', 'Organizar', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'safari', name: 'Safari', accent: 'linear-gradient(135deg, #a8fff7 0%, #21b8ff 100%)', icon: 'S', menu: ['Archivo', 'Edicion', 'Visualizacion', 'Historial', 'Marcadores'], dockable: true },
  { id: 'calculator', name: 'Calculadora', accent: 'linear-gradient(135deg, #ffcc74 0%, #ff8e3b 100%)', icon: 'C', menu: ['Archivo', 'Edicion', 'Ver', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'photos', name: 'Fotos', accent: 'linear-gradient(135deg, #ff9bc2 0%, #ff6c81 100%)', icon: 'P', menu: ['Archivo', 'Edicion', 'Imagen', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'videos', name: 'Videos', accent: 'linear-gradient(135deg, #8fd3ff 0%, #4d76ff 100%)', icon: 'V', menu: ['Archivo', 'Edicion', 'Reproduccion', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'docksettings', name: 'Configurar dock', accent: 'linear-gradient(135deg, #d8dee7 0%, #7c8ba3 100%)', icon: { kind: 'image', value: '/config.png' }, menu: ['Archivo', 'Edicion', 'Ver', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'display', name: 'Pantalla', accent: 'linear-gradient(135deg, #b6c8ff 0%, #6d87ff 100%)', icon: 'P', menu: ['Archivo', 'Edicion', 'Ver', 'Ventana', 'Ayuda'], dockable: false },
  { id: 'terminal', name: 'Terminal', accent: 'linear-gradient(135deg, #35383f 0%, #0f1116 100%)', icon: 'T', menu: ['Shell', 'Editar', 'Vista', 'Ventana', 'Ayuda'], dockable: true },
  { id: 'about', name: 'Acerca de este equipo', accent: 'linear-gradient(135deg, #bddcff 0%, #5d8bff 100%)', icon: 'M', menu: ['Archivo', 'Ventana', 'Ayuda'], dockable: false },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampPercent(value: number) {
  return clamp(value, 0, 100)
}

function createLampClipPath(anchorX: number, topInset: number, waistInset: number, tipWidth: number, bias = 0) {
  const anchor = clampPercent(anchorX * 100 + bias)
  const topLeft = clampPercent(topInset)
  const topRight = clampPercent(100 - topInset)
  const waistLeft = clampPercent(anchor - tipWidth * 0.5 - waistInset)
  const waistRight = clampPercent(anchor + tipWidth * 0.5 + waistInset)
  const tipLeft = clampPercent(anchor - tipWidth * 0.5)
  const tipRight = clampPercent(anchor + tipWidth * 0.5)

  return `polygon(${topLeft}% 0%, ${topRight}% 0%, ${waistRight}% 72%, ${tipRight}% 100%, ${tipLeft}% 100%, ${waistLeft}% 72%)`
}

function createVolumeRoute(mount: string): FinderRoute {
  return `volume:${encodeURIComponent(mount)}::${encodeURIComponent(mount)}` as FinderRoute
}

function isVolumeRoute(route: FinderRoute): route is `volume:${string}` {
  return route.startsWith('volume:')
}

function getVolumeRouteParts(route: FinderRoute) {
  if (!isVolumeRoute(route)) {
    return null
  }

  const raw = route.slice('volume:'.length)
  const separatorIndex = raw.indexOf('::')
  if (separatorIndex === -1) {
    const mount = decodeURIComponent(raw)
    return { mount, targetPath: mount }
  }

  const mount = decodeURIComponent(raw.slice(0, separatorIndex))
  const targetPath = decodeURIComponent(raw.slice(separatorIndex + 2))
  return { mount, targetPath: targetPath || mount }
}

function getVolumeMountFromRoute(route: FinderRoute) {
  return getVolumeRouteParts(route)?.mount ?? null
}

function getVolumePathFromRoute(route: FinderRoute) {
  return getVolumeRouteParts(route)?.targetPath ?? null
}

function createVolumeSubRoute(mount: string, targetPath: string): FinderRoute {
  return `volume:${encodeURIComponent(mount)}::${encodeURIComponent(targetPath)}` as FinderRoute
}

function formatVolumeLabel(mount: string) {
  return mount.replace(/[\\/]+$/, '')
}

function getPathLeaf(targetPath: string) {
  const normalized = targetPath.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? normalized
}

function getDesktopVolumeKind(volume: VolumeInfo) {
  if (volume.kind === 'external') {
    return 'sd' as const
  }
  if (volume.kind === 'internal') {
    return 'drive' as const
  }

  const text = `${volume.name} ${volume.mount}`.toLowerCase()
  if (text.includes('micro') || text.includes('sd') || text.includes('card')) {
    return 'sd' as const
  }
  if (text.includes('usb') || text.includes('flash') || text.includes('pendrive') || text.includes('remov')) {
    return 'usb' as const
  }
  return 'drive' as const
}

function getDesktopVolumeIconSrc(volume: VolumeInfo) {
  return getDesktopVolumeKind(volume) === 'drive' ? '/hd.png' : '/sd.png'
}

function createVolumeDockItem(volume: VolumeInfo): CustomDockItem {
  return {
    id: `volume-${encodeURIComponent(volume.mount)}`,
    name: volume.name,
    target: createVolumeRoute(volume.mount),
    kind: 'finder-route',
    icon: { kind: 'image', value: getDesktopVolumeIconSrc(volume) },
    accent: 'transparent',
  }
}

function formatVolumeSize(sizeBytes: number | null) {
  if (sizeBytes === null || Number.isNaN(sizeBytes)) {
    return 'Tamano no disponible'
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = sizeBytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function isImageEntry(entry: VolumeEntry) {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'].includes(entry.extension.toLowerCase())
}

function isVideoEntry(entry: VolumeEntry) {
  return ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'].includes(entry.extension.toLowerCase())
}

function getMediaSource(filePath: string) {
  if (/^blob:/i.test(filePath)) {
    return filePath
  }

  return window.electronDesktop
    ? `mactorno-media://${encodeURIComponent(filePath)}`
    : `/api/media-file?path=${encodeURIComponent(filePath)}`
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getApp(appId: AppId) {
  const app = APPS.find((item) => item.id === appId)
  if (!app) {
    throw new Error(`App desconocida: ${appId}`)
  }
  return app
}

function getFinderLabel(route: FinderRoute) {
  if (isVolumeRoute(route)) {
    const parts = getVolumeRouteParts(route)
    if (!parts) {
      return route
    }

    return parts.targetPath === parts.mount ? formatVolumeLabel(parts.mount) : getPathLeaf(parts.targetPath)
  }

  switch (route) {
    case 'computer':
      return 'Equipo'
    case 'device':
      return 'Informacion del dispositivo'
    case 'applications':
      return 'Aplicaciones'
    case 'dock':
      return 'Dock'
    case 'display':
      return 'Pantalla'
  }
}

function loadAppearanceMode() {
  if (typeof window === 'undefined') {
    return 'classic' as AppearanceMode
  }

  const raw = window.localStorage.getItem(APPEARANCE_MODE_STORAGE_KEY)
  return raw === 'dark' ? 'dark' : 'classic'
}

function loadWallpaperId() {
  if (typeof window === 'undefined') {
    return WALLPAPER_PRESETS[0].id
  }

  const raw = window.localStorage.getItem(WALLPAPER_STORAGE_KEY)
  return WALLPAPER_PRESETS.some((preset) => preset.id === raw) ? raw! : WALLPAPER_PRESETS[0].id
}

function loadNotes() {
  if (typeof window === 'undefined') {
    return [] as NoteItem[]
  }

  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) {
      return [
        {
          id: 'note-welcome',
          title: 'Bienvenido',
          body: 'Esta app ya puede crear, editar y guardar notas localmente.',
          updatedAt: Date.now(),
        },
      ] as NoteItem[]
    }
    const parsed = JSON.parse(raw) as NoteItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadDesktopVolumePositions() {
  if (typeof window === 'undefined') {
    return {} as Record<string, { x: number; y: number }>
  }

  try {
    const raw = window.localStorage.getItem(DESKTOP_VOLUME_POSITIONS_STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, { x: number; y: number }> : {}
  } catch {
    return {}
  }
}

function createFinderTab(route: FinderRoute, index: number): FinderTab {
  return { id: `finder-tab-${Date.now()}-${index}`, history: [route], historyIndex: 0 }
}

function createCalculatorState(): CalculatorState {
  return {
    display: '0',
    storedValue: null,
    operator: null,
    waitingForOperand: false,
  }
}

function createTerminalState(cwd: string): TerminalState {
  return {
    cwd,
    input: '',
    busy: false,
    history: [],
  }
}

function createFinderState(route: FinderRoute): FinderState {
  const tab = createFinderTab(route, 1)
  return { tabs: [tab], activeTabId: tab.id }
}

function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return SAFARI_HOME_URL
  }

  if (/^mactorno:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return `https://${trimmed}`
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`
}

function createBrowserState(initialUrl = DEFAULT_BROWSER_URL): BrowserState {
  const normalized = normalizeBrowserUrl(initialUrl)
  return {
    history: [normalized],
    historyIndex: 0,
    inputValue: normalized,
    reloadKey: 0,
    loading: false,
    title: '',
    lastError: null,
  }
}

function getInitialBrowserUrl(isElectronDesktop: boolean) {
  return isElectronDesktop ? DEFAULT_BROWSER_URL : DEFAULT_WEB_FALLBACK_URL
}

function isSafariHomeUrl(url: string) {
  return url === SAFARI_HOME_URL
}

function isBlockedEmbeddedPage(lastError: string | null) {
  return lastError?.includes('ERR_BLOCKED_BY_RESPONSE') ?? false
}

function getActiveFinderTab(finderState: FinderState | null) {
  if (!finderState) {
    return null
  }
  return finderState.tabs.find((tab) => tab.id === finderState.activeTabId) ?? finderState.tabs[0] ?? null
}

function getActiveFinderRoute(finderState: FinderState | null) {
  const tab = getActiveFinderTab(finderState)
  return tab ? tab.history[tab.historyIndex] : ('computer' as FinderRoute)
}

function loadDockItems() {
  if (typeof window === 'undefined') {
    return DEFAULT_DOCK_ITEMS
  }

  try {
    const raw = window.localStorage.getItem(DOCK_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_DOCK_ITEMS
    }
    const parsed = JSON.parse(raw) as AppId[]
    const valid = parsed.filter((item) => APPS.some((app) => app.id === item && app.dockable))
    if (valid.length === 0) {
      return DEFAULT_DOCK_ITEMS
    }

    const next: AppId[] = [...valid]

    if (!next.includes('photos')) {
      const safariIndex = next.indexOf('safari')
      if (safariIndex >= 0) {
        next.splice(safariIndex + 1, 0, 'photos')
      } else {
        next.push('photos')
      }
    }

    if (!next.includes('videos')) {
      const photosIndex = next.indexOf('photos')
      if (photosIndex >= 0) {
        next.splice(photosIndex + 1, 0, 'videos')
      } else {
        next.push('videos')
      }
    }

    if (!next.includes('calculator')) {
      const terminalIndex = next.indexOf('terminal')
      if (terminalIndex >= 0) {
        next.splice(terminalIndex, 0, 'calculator')
      } else {
        next.push('calculator')
      }
    }

    if (!next.includes('docksettings')) {
      const terminalIndex = next.indexOf('terminal')
      if (terminalIndex >= 0) {
        next.splice(terminalIndex, 0, 'docksettings')
      } else {
        next.push('docksettings')
      }
    }

    return next
  } catch {
    return DEFAULT_DOCK_ITEMS
  }
}

function loadCustomDockItems() {
  if (typeof window === 'undefined') {
    return [] as CustomDockItem[]
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_DOCK_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as Array<CustomDockItem & { icon: DockIconSpec | string }>
    return parsed.map((item) => ({
      ...item,
      icon: normalizeIconSpec(item.icon),
    }))
  } catch {
    return []
  }
}

function normalizeIconSpec(value: DockIconSpec | string | null | undefined): DockIconSpec {
  if (typeof value === 'string') {
    return { kind: 'glyph', value: value || '?' }
  }

  if (value && (value.kind === 'glyph' || value.kind === 'image') && typeof value.value === 'string') {
    return { kind: value.kind, value: value.value || '?' }
  }

  return { kind: 'glyph', value: '?' }
}

function loadAppVisualOverrides() {
  if (typeof window === 'undefined') {
    return {} as AppVisualOverrides
  }

  try {
    const raw = window.localStorage.getItem(APP_VISUAL_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, { icon?: DockIconSpec | string; accent?: string }>
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        {
          icon: value.icon ? normalizeIconSpec(value.icon) : undefined,
          accent: value.accent,
        },
      ]),
    ) as AppVisualOverrides
  } catch {
    return {}
  }
}

function renderDockIconContent(icon: DockIconSpec) {
  if (icon.kind === 'image') {
    return <img className="dock-icon-image" src={icon.value} alt="" draggable={false} />
  }
  return <span className="dock-icon-glyph">{icon.value}</span>
}

function getAppLauncherIcon(app: InstalledApp) {
  if (app.icon) {
    return <img className="launchpad-app-icon-image" src={app.icon} alt="" draggable={false} />
  }

  const name = app.name
  const normalized = name.toLowerCase()
  if (normalized.includes('chrome') || normalized.includes('edge') || normalized.includes('firefox') || normalized.includes('browser')) {
    return '🌐'
  }
  if (normalized.includes('terminal') || normalized.includes('powershell') || normalized.includes('cmd')) {
    return '⌘'
  }
  if (normalized.includes('code') || normalized.includes('studio')) {
    return '💠'
  }
  if (normalized.includes('note') || normalized.includes('nota')) {
    return '📝'
  }
  if (normalized.includes('music') || normalized.includes('spotify')) {
    return '🎵'
  }
  if (normalized.includes('steam') || normalized.includes('game')) {
    return '🎮'
  }
  if (normalized.includes('photo') || normalized.includes('camera')) {
    return '📷'
  }
  return (name.trim()[0] || 'A').toUpperCase()
}

function clampControlValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function DockIconButton({
  name,
  accent,
  icon,
  isOpen,
  mouseX,
  centerX,
  onActivate,
  registerRef,
  id,
  draggable = false,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: {
  id: string
  name: string
  accent: string
  icon: DockIconSpec
  isOpen: boolean
  mouseX: MotionValue<number>
  centerX: number
  onActivate: () => void
  registerRef: (id: string, node: HTMLButtonElement | null) => void
  draggable?: boolean
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: (event: React.DragEvent<HTMLButtonElement>) => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const itemRef = useRef<HTMLButtonElement | null>(null)
  const [hovered, setHovered] = useState(false)

  const distance = useTransform(mouseX, (value) => value - centerX)

  const itemWidth = useSpring(useTransform(distance, [-180, 0, 180], [50, 82, 50]), {
    mass: 0.12,
    stiffness: 180,
    damping: 14,
  })
  const iconScale = useSpring(useTransform(distance, [-180, 0, 180], [1, 80 / 48, 1]), {
    mass: 0.12,
    stiffness: 180,
    damping: 14,
  })
  const iconLift = useSpring(useTransform(distance, [-180, 0, 180], [0, -18, 0]), {
    mass: 0.12,
    stiffness: 180,
    damping: 14,
  })
  const tooltipLift = useTransform(iconLift, (value) => value - 8)

  return (
    <motion.button
      ref={(node) => {
        itemRef.current = node
        registerRef(id, node)
      }}
      type="button"
      className="dock-item"
      style={{ width: itemWidth, minWidth: itemWidth }}
      aria-label={`Abrir ${name}`}
      draggable={draggable}
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStartCapture={onDragStart}
      onDragEndCapture={onDragEnd}
      onContextMenu={onContextMenu}
    >
      <AnimatePresence>
        {hovered ? (
          <motion.span
            className="dock-label visible"
            style={{ y: tooltipLift }}
            initial={{ opacity: 0, y: 8, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 4, x: '-50%' }}
          >
            {name}
          </motion.span>
        ) : null}
      </AnimatePresence>
      <motion.span
        className="dock-icon"
        style={{ background: accent, scale: iconScale, y: iconLift }}
      >
        {renderDockIconContent(icon)}
      </motion.span>
      <motion.span
        className={`dock-indicator${isOpen ? ' visible' : ''}`}
        style={{ y: useTransform(iconLift, (value) => value * 0.35) }}
      />
    </motion.button>
  )
}

function VideoPlayer({
  src,
  videoRef,
  onPlaybackStateChange,
}: {
  src: string
  videoRef?: (node: HTMLVideoElement | null) => void
  onPlaybackStateChange?: () => void
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [aspectRatio, setAspectRatio] = useState(16 / 10)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    const updateSize = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      if (!width || !height) {
        return
      }

      const containerRatio = width / height
      if (containerRatio > aspectRatio) {
        const nextHeight = height
        const nextWidth = Math.round(nextHeight * aspectRatio)
        setFrameSize({ width: nextWidth, height: nextHeight })
        return
      }

      const nextWidth = width
      const nextHeight = Math.round(nextWidth / aspectRatio)
      setFrameSize({ width: nextWidth, height: nextHeight })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [aspectRatio, src])

  return (
    <div ref={stageRef} className="media-stage media-video-stage">
      <div className="media-video-frame" style={{ width: frameSize.width, height: frameSize.height }}>
        <video
          className="media-video"
          src={src}
          controls
          preload="metadata"
          ref={videoRef}
          onPlay={onPlaybackStateChange}
          onPause={onPlaybackStateChange}
          onVolumeChange={onPlaybackStateChange}
          onRateChange={onPlaybackStateChange}
          onLoadedMetadata={async (event) => {
            const video = event.currentTarget
            if (video.videoWidth && video.videoHeight) {
              setAspectRatio(video.videoWidth / video.videoHeight)
            }
            onPlaybackStateChange?.()
          }}
        />
      </div>
    </div>
  )
}

function PhotoViewer({ src, alt, zoom = 1, rotation = 0 }: { src: string; alt: string; zoom?: number; rotation?: number }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [aspectRatio, setAspectRatio] = useState(4 / 3)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    const updateSize = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      if (!width || !height) {
        return
      }

      const containerRatio = width / height
      if (containerRatio > aspectRatio) {
        const nextHeight = height
        const nextWidth = Math.round(nextHeight * aspectRatio)
        setFrameSize({ width: nextWidth, height: nextHeight })
        return
      }

      const nextWidth = width
      const nextHeight = Math.round(nextWidth / aspectRatio)
      setFrameSize({ width: nextWidth, height: nextHeight })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [aspectRatio, src])

  return (
    <div ref={stageRef} className="media-stage media-photo-stage">
      <div className="media-photo-frame" style={{ width: frameSize.width, height: frameSize.height }}>
        <img
          className="media-image"
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          onLoad={(event) => {
            const image = event.currentTarget
            if (image.naturalWidth && image.naturalHeight) {
              setAspectRatio(image.naturalWidth / image.naturalHeight)
            }
          }}
        />
      </div>
    </div>
  )
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [clock, setClock] = useState(() => formatTime(new Date()))
  const [windows, setWindows] = useState<WindowState[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [resize, setResize] = useState<ResizeState | null>(null)
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [volumeEntriesByMount, setVolumeEntriesByMount] = useState<Record<string, VolumeEntry[]>>({})
  const [loadingVolumeMounts, setLoadingVolumeMounts] = useState<Record<string, boolean>>({})
  const [loadingSystem, setLoadingSystem] = useState(false)
  const [systemError, setSystemError] = useState<string | null>(null)
  const [controlCenterOpen, setControlCenterOpen] = useState(false)
  const [systemControls, setSystemControls] = useState<SystemControlsState>({
    brightness: 70,
    volume: 50,
    supportsBrightness: false,
    supportsVolume: false,
  })
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [dockItems, setDockItems] = useState<AppId[]>(() => loadDockItems())
  const [customDockItems, setCustomDockItems] = useState<CustomDockItem[]>(() => loadCustomDockItems())
  const [appVisualOverrides, setAppVisualOverrides] = useState<AppVisualOverrides>(() => loadAppVisualOverrides())
  const [desktopVolumePositions, setDesktopVolumePositions] = useState<Record<string, { x: number; y: number }>>(() => loadDesktopVolumePositions())
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => loadAppearanceMode())
  const [wallpaperId, setWallpaperId] = useState(() => loadWallpaperId())
  const [notes, setNotes] = useState<NoteItem[]>(() => loadNotes())
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [launcherSearch, setLauncherSearch] = useState('')
  const [launcherPage, setLauncherPage] = useState(0)
  const [newDockName, setNewDockName] = useState('')
  const [newDockIconKind, setNewDockIconKind] = useState<DockIconSpec['kind']>('glyph')
  const [newDockIconValue, setNewDockIconValue] = useState('📁')
  const [newDockTarget, setNewDockTarget] = useState('')
  const [newDockAccent, setNewDockAccent] = useState('#4f7cff')
  const nextWindowId = useRef(2)
  const dockMouseX = useMotionValue(Infinity)
  const isElectronDesktop = typeof window !== 'undefined' && !!window.electronDesktop
  const dockItemRefs = useRef<Record<string, HTMLButtonElement | null>>({
    finder: null,
    notes: null,
    safari: null,
    terminal: null,
    launcher: null,
    about: null,
  })
  const windowRefs = useRef<Record<string, HTMLElement | null>>({})
  const windowFrameRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const browserHostRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dockRef = useRef<HTMLDivElement | null>(null)
  const menuBarRef = useRef<HTMLDivElement | null>(null)
  const launcherPanelRef = useRef<HTMLDivElement | null>(null)
  const controlCenterRef = useRef<HTMLDivElement | null>(null)
  const runningGenies = useRef(new Set<string>())
  const desktopVolumeDragRef = useRef<DesktopVolumeDragState | null>(null)
  const skipDesktopVolumeClickRef = useRef<string | null>(null)
  const pendingSystemControlsPatchRef = useRef<SystemControlPatch>({})
  const systemControlsFlushTimerRef = useRef<number | null>(null)
  const pendingDockMouseX = useRef<number | null>(null)
  const dockMouseFrameRef = useRef<number | null>(null)
  const [dockCenters, setDockCenters] = useState<Record<string, number>>({})
  const [openAppMenu, setOpenAppMenu] = useState<string | null>(null)
  const [photoViewStates, setPhotoViewStates] = useState<Record<string, PhotoViewState>>({})
  const [videoPlaybackState, setVideoPlaybackState] = useState<Record<string, { playing: boolean; muted: boolean; rate: number }>>({})
  const wallpaperPreset = WALLPAPER_PRESETS.find((preset) => preset.id === wallpaperId) ?? WALLPAPER_PRESETS[0]
  const activeNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null
  const videoElementRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const visibleDockAppIds = useMemo(() => {
    const runningDockableApps = windows
      .map((item) => item.appId)
      .filter((appId, index, current) =>
        current.indexOf(appId) === index && getApp(appId).dockable && !dockItems.includes(appId),
      )

    return [...dockItems, ...runningDockableApps]
  }, [dockItems, windows])
  const visibleVolumeDockItems = useMemo(() => {
    const pinnedTargets = new Set(
      customDockItems
        .filter((item) => item.kind === 'finder-route')
        .map((item) => item.target),
    )

    const openMounts = windows
      .filter((item) => item.appId === 'finder' && item.finderState && !item.genie?.removeOnFinish)
      .map((item) => getVolumeMountFromRoute(getActiveFinderRoute(item.finderState)))
      .filter((mount): mount is string => !!mount)

    return [...new Set(openMounts)]
      .map((mount) => deviceInfo?.volumes.find((volume) => volume.mount === mount))
      .filter((volume): volume is VolumeInfo => !!volume)
      .filter((volume) => !pinnedTargets.has(createVolumeRoute(volume.mount)))
      .map((volume) => createVolumeDockItem(volume))
  }, [customDockItems, deviceInfo?.volumes, windows])

  function openContextMenuAt(payload: Record<string, unknown>, x: number, y: number) {
    const estimatedWidth = 240
    const estimatedHeight = 180
    const margin = 12

    setContextMenu({
      ...payload,
      x: Math.min(x, Math.max(margin, window.innerWidth - estimatedWidth - margin)),
      y: Math.min(y, Math.max(margin, window.innerHeight - estimatedHeight - margin)),
    } as ContextMenuState)
  }

  function getDesktopBounds() {
    return {
      x: DESKTOP_SIDE_MARGIN,
      y: MENU_BAR_HEIGHT + DESKTOP_TOP_GAP,
      width: window.innerWidth - DESKTOP_SIDE_MARGIN * 2,
      height:
        window.innerHeight -
        (MENU_BAR_HEIGHT + DESKTOP_TOP_GAP) -
        (DOCK_HEIGHT + DOCK_BOTTOM + DESKTOP_BOTTOM_GAP),
    }
  }

  function getDesktopVolumePosition(volume: VolumeInfo, index: number) {
    const saved = desktopVolumePositions[volume.mount]
    if (saved) {
      return saved
    }

    const desktop = getDesktopBounds()
    const columnWidth = 104
    const itemHeight = 102
    const rightInset = 22
    const topInset = 18
    const itemsPerColumn = Math.max(1, Math.floor((desktop.height - topInset) / itemHeight))
    const column = Math.floor(index / itemsPerColumn)
    const row = index % itemsPerColumn
    const maxX = desktop.x + desktop.width - 88
    const maxY = desktop.y + desktop.height - 92

    return {
      x: clamp(desktop.x + desktop.width - rightInset - 72 - column * columnWidth, desktop.x, maxX),
      y: clamp(desktop.y + topInset + row * itemHeight, desktop.y, maxY),
    }
  }

  function getMaximizedBounds() {
    return {
      x: 0,
      y: MENU_BAR_HEIGHT,
      width: window.innerWidth,
      height: window.innerHeight - MENU_BAR_HEIGHT - (DOCK_HEIGHT + DOCK_BOTTOM),
    }
  }

  function getDockRect(appId: string): RectState | null {
    const dockItem = dockItemRefs.current[appId]
    if (!dockItem) {
      return null
    }
    const dockIcon = dockItem.querySelector<HTMLElement>('.dock-icon')
    const rect = (dockIcon ?? dockItem).getBoundingClientRect()
    const anchorHeight = Math.max(10, rect.height * 0.28)
    return {
      x: rect.left,
      y: rect.bottom - anchorHeight,
      width: rect.width,
      height: anchorHeight,
    }
  }

  function registerDockItemRef(id: string, node: HTMLButtonElement | null) {
    dockItemRefs.current[id] = node
  }

  function measureDockCenters() {
    const nextCenters = Object.fromEntries(
      Object.entries(dockItemRefs.current)
        .filter(([, node]) => !!node)
        .map(([id, node]) => {
          const rect = (node as HTMLButtonElement).getBoundingClientRect()
          return [id, rect.left + rect.width / 2]
        }),
    )

    setDockCenters((current) => {
      const currentKeys = Object.keys(current)
      const nextKeys = Object.keys(nextCenters)
      if (currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === nextCenters[key])) {
        return current
      }
      return nextCenters
    })
  }

  function queueDockMouseUpdate(pageX: number) {
    pendingDockMouseX.current = pageX
    if (dockMouseFrameRef.current !== null) {
      return
    }

    dockMouseFrameRef.current = window.requestAnimationFrame(() => {
      dockMouseFrameRef.current = null
      dockMouseX.set(pendingDockMouseX.current ?? Infinity)
    })
  }

  function getResolvedApp(appId: AppId) {
    const baseApp = getApp(appId)
    const override = appVisualOverrides[appId]
    return {
      ...baseApp,
      accent: override?.accent ?? baseApp.accent,
      iconSpec: normalizeIconSpec(override?.icon ?? baseApp.icon),
    }
  }

  function readIconFile(file: File, onLoad: (value: string) => void) {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onLoad(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  function updateAppVisual(appId: AppId, patch: { icon?: DockIconSpec; accent?: string }) {
    setAppVisualOverrides((current) => ({
      ...current,
      [appId]: {
        ...(current[appId] ?? {}),
        ...patch,
      },
    }))
  }

  function resetAppVisual(appId: AppId) {
    setAppVisualOverrides((current) => {
      const next = { ...current }
      delete next[appId]
      return next
    })
  }

  function renderIconEditor(options: {
    label: string
    icon: DockIconSpec
    accent: string
    onIconChange: (icon: DockIconSpec) => void
    onAccentChange: (accent: string) => void
  }) {
    const { label, icon, accent, onIconChange, onAccentChange } = options

    return (
      <div className="icon-editor">
        <div className="icon-editor-header">
          <strong>{label}</strong>
          <div className="icon-preview-chip" style={{ background: accent }}>
            {renderDockIconContent(icon)}
          </div>
        </div>
        <div className="icon-editor-controls">
          <select
            value={icon.kind}
            onChange={(event) => onIconChange({ kind: event.target.value as DockIconSpec['kind'], value: icon.value })}
          >
            <option value="glyph">Texto o emoji</option>
            <option value="image">Imagen</option>
          </select>
          <input
            value={icon.value}
            onChange={(event) => onIconChange({ kind: icon.kind, value: event.target.value })}
            placeholder={icon.kind === 'image' ? 'URL o data:image/...' : 'Letra, emoji o simbolo'}
          />
          <input
            value={accent}
            onChange={(event) => onAccentChange(event.target.value)}
            placeholder="Color o gradient CSS"
          />
          <label className="file-pill">
            Subir imagen
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) {
                  return
                }
                readIconFile(file, (value) => onIconChange({ kind: 'image', value }))
                event.currentTarget.value = ''
              }}
            />
          </label>
        </div>
        <div className="icon-preset-grid">
          {ICON_PRESETS.map((preset, index) => (
            <button
              key={`${preset.kind}-${preset.value}-${index}`}
              type="button"
              className="icon-preset"
              onClick={() => onIconChange(preset)}
            >
              {renderDockIconContent(preset)}
            </button>
          ))}
        </div>
        <div className="icon-asset-grid">
          {ICON_ASSET_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="icon-asset-preset"
              title={preset.label}
              onClick={() => onIconChange(preset.icon)}
            >
              {renderDockIconContent(preset.icon)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatTime(new Date())), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    function handleMenuPointerDown(event: MouseEvent) {
      if (!menuBarRef.current?.contains(event.target as Node | null)) {
        setOpenAppMenu(null)
      }
    }

    window.addEventListener('mousedown', handleMenuPointerDown)
    return () => window.removeEventListener('mousedown', handleMenuPointerDown)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dockItems))
  }, [dockItems])

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_DOCK_STORAGE_KEY, JSON.stringify(customDockItems))
  }, [customDockItems])

  useEffect(() => {
    window.localStorage.setItem(APP_VISUAL_STORAGE_KEY, JSON.stringify(appVisualOverrides))
  }, [appVisualOverrides])

  useEffect(() => {
    window.localStorage.setItem(DESKTOP_VOLUME_POSITIONS_STORAGE_KEY, JSON.stringify(desktopVolumePositions))
  }, [desktopVolumePositions])

  useEffect(() => {
    window.localStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, appearanceMode)
  }, [appearanceMode])

  useEffect(() => {
    window.localStorage.setItem(WALLPAPER_STORAGE_KEY, wallpaperId)
  }, [wallpaperId])

  useEffect(() => {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
    if (!selectedNoteId && notes[0]) {
      setSelectedNoteId(notes[0].id)
    }
    if (selectedNoteId && !notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(notes[0]?.id ?? null)
    }
  }, [notes, selectedNoteId])

  useEffect(() => {
    if (!loggedIn) {
      return
    }

    let cancelled = false
    async function loadSystemData() {
      setLoadingSystem(true)
      setSystemError(null)
      try {
        const [device, apps] = window.electronDesktop
          ? await Promise.all([
              window.electronDesktop.getDeviceInfo() as Promise<DeviceInfo>,
              window.electronDesktop.getInstalledApps() as Promise<InstalledApp[]>,
            ])
          : await Promise.all([
              fetch('/api/device-info').then((response) => {
                if (!response.ok) throw new Error('No fue posible leer los datos del dispositivo')
                return response.json() as Promise<DeviceInfo>
              }),
              fetch('/api/apps').then((response) => {
                if (!response.ok) throw new Error('No fue posible leer las aplicaciones')
                return response.json() as Promise<InstalledApp[]>
              }),
            ])

        if (!cancelled) {
          setDeviceInfo(device)
          setInstalledApps(apps)
        }
      } catch (error) {
        if (!cancelled) {
          setSystemError(error instanceof Error ? error.message : 'Error desconocido')
        }
      } finally {
        if (!cancelled) {
          setLoadingSystem(false)
        }
      }
    }

    void loadSystemData()
    return () => {
      cancelled = true
    }
  }, [loggedIn])

  useEffect(() => {
    if (!loggedIn) {
      return
    }

    let cancelled = false
    async function loadControls() {
      try {
        const controls = window.electronDesktop
          ? await window.electronDesktop.getSystemControls() as SystemControlsState
          : await fetch('/api/system-controls').then((response) => {
              if (!response.ok) throw new Error('No fue posible leer los controles del sistema')
              return response.json() as Promise<SystemControlsState>
            })

        if (!cancelled) {
          setSystemControls(controls)
        }
      } catch {
        if (!cancelled) {
          setSystemControls((current) => ({
            ...current,
            supportsBrightness: false,
            supportsVolume: false,
          }))
        }
      }
    }

    void loadControls()
    return () => {
      cancelled = true
    }
  }, [loggedIn])

  useEffect(() => {
    if (!drag) {
      return undefined
    }

    const activeDrag = drag
    function onPointerMove(event: PointerEvent) {
      setWindows((current) =>
        current.map((item) => {
          if (item.id !== activeDrag.id) {
            return item
          }
          const maxX = Math.max(24, window.innerWidth - item.width - 24)
          const maxY = Math.max(84, window.innerHeight - item.height - 120)
          return {
            ...item,
            x: clamp(event.clientX - activeDrag.offsetX, 24, maxX),
            y: clamp(event.clientY - activeDrag.offsetY, 52, maxY),
          }
        }),
      )
    }

    function onPointerUp() {
      setDrag(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag])

  useEffect(() => {
    if (!resize) {
      return undefined
    }

    const activeResize = resize
    function onPointerMove(event: PointerEvent) {
      setWindows((current) =>
        current.map((item) => {
          if (item.id !== activeResize.id) {
            return item
          }

          const desktop = getDesktopBounds()
          const maxWidth = desktop.x + desktop.width - item.x
          const maxHeight = desktop.y + desktop.height - item.y

          return {
            ...item,
            width: clamp(activeResize.startWidth + (event.clientX - activeResize.startX), MIN_WINDOW_WIDTH, maxWidth),
            height: clamp(activeResize.startHeight + (event.clientY - activeResize.startY), MIN_WINDOW_HEIGHT, maxHeight),
          }
        }),
      )
    }

    function onPointerUp() {
      setResize(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [resize])

  useEffect(() => {
    function closeContextMenu() {
      setContextMenu(null)
    }
    window.addEventListener('click', closeContextMenu)
    return () => window.removeEventListener('click', closeContextMenu)
  }, [])

  useEffect(() => {
    function closeLauncher(event: MouseEvent) {
      const target = event.target as Node | null
      if (
        launcherPanelRef.current?.contains(target ?? null) ||
        dockRef.current?.contains(target ?? null)
      ) {
        return
      }
      setLauncherOpen(false)
    }

    window.addEventListener('mousedown', closeLauncher)
    return () => window.removeEventListener('mousedown', closeLauncher)
  }, [])

  useEffect(() => {
    if (!launcherOpen) {
      setLauncherPage(0)
    }
  }, [launcherOpen])

  useEffect(() => {
    function closeControlCenter(event: MouseEvent) {
      const target = event.target as Node | null
      if (controlCenterRef.current?.contains(target ?? null)) {
        return
      }
      setControlCenterOpen(false)
    }

    window.addEventListener('mousedown', closeControlCenter)
    return () => window.removeEventListener('mousedown', closeControlCenter)
  }, [])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const activeDrag = desktopVolumeDragRef.current
      if (!activeDrag) {
        return
      }

      const nextX = clamp(event.clientX - activeDrag.offsetX, 12, Math.max(12, window.innerWidth - 108))
      const nextY = clamp(event.clientY - activeDrag.offsetY, MENU_BAR_HEIGHT + 12, Math.max(MENU_BAR_HEIGHT + 12, window.innerHeight - 132))

      desktopVolumeDragRef.current = {
        ...activeDrag,
        moved: activeDrag.moved || Math.abs(event.movementX) > 0 || Math.abs(event.movementY) > 0,
      }

      setDesktopVolumePositions((current) => ({
        ...current,
        [activeDrag.mount]: { x: nextX, y: nextY },
      }))
    }

    function handlePointerUp() {
      if (desktopVolumeDragRef.current?.moved) {
        skipDesktopVolumeClickRef.current = desktopVolumeDragRef.current.mount
      }
      desktopVolumeDragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (systemControlsFlushTimerRef.current !== null) {
        window.clearTimeout(systemControlsFlushTimerRef.current)
      }
      if (dockMouseFrameRef.current !== null) {
        window.cancelAnimationFrame(dockMouseFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    measureDockCenters()

    function handleResize() {
      measureDockCenters()
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [dockItems, customDockItems])

  useEffect(() => {
    const desktopApi = window.electronDesktop
    if (!desktopApi) {
      return undefined
    }
    const api = desktopApi

    function syncBrowserHost() {
      const currentActiveWindow = [...windows]
        .filter((item) => !item.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0]
      const safariWindow = [...windows]
        .filter((item) => item.appId === 'safari' && !item.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0]

      if (
        !safariWindow ||
        safariWindow.id !== currentActiveWindow?.id ||
        !safariWindow.browserState ||
        isSafariHomeUrl(safariWindow.browserState.history[safariWindow.browserState.historyIndex])
      ) {
        api.browser.hide()
        return
      }

      const host = browserHostRefs.current[safariWindow.id]
      if (!host) {
        api.browser.hide()
        return
      }

      const rect = host.getBoundingClientRect()
      api.browser.syncHost({
        visible: true,
        bounds: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
        url: safariWindow.browserState.history[safariWindow.browserState.historyIndex],
      })
    }

    const unsubscribe = api.onBrowserSyncRequest(syncBrowserHost)
    syncBrowserHost()
    window.addEventListener('resize', syncBrowserHost)

    return () => {
      unsubscribe()
      window.removeEventListener('resize', syncBrowserHost)
      api.browser.hide()
    }
  }, [windows])

  useEffect(() => {
    const desktopApi = window.electronDesktop
    if (!desktopApi) {
      return undefined
    }

    return desktopApi.onBrowserState((payload) => {
      setWindows((current) =>
        current.map((item) => {
          if (item.appId !== 'safari' || !item.browserState) {
            return item
          }

          const nextState = { ...item.browserState }

          if (payload.url && payload.url !== nextState.history[nextState.historyIndex]) {
            const nextHistory = [...nextState.history.slice(0, nextState.historyIndex + 1), payload.url]
            nextState.history = nextHistory
            nextState.historyIndex = nextHistory.length - 1
            nextState.inputValue = payload.url
          }

          nextState.loading = !!payload.loading
          nextState.title = payload.title ?? nextState.title
          nextState.lastError = payload.lastError ?? null

          return { ...item, browserState: nextState }
        }),
      )
    })
  }, [])

  useEffect(() => {
    const requestedTargets = new Set<string>()

    windows.forEach((windowItem) => {
      const route = getActiveFinderRoute(windowItem.finderState)
      const targetPath = getVolumePathFromRoute(route)
      if (targetPath) {
        requestedTargets.add(targetPath)
      }
    })

    requestedTargets.forEach((targetPath) => {
      if (volumeEntriesByMount[targetPath] || loadingVolumeMounts[targetPath]) {
        return
      }

      setLoadingVolumeMounts((current) => ({ ...current, [targetPath]: true }))

      const loader = window.electronDesktop
        ? window.electronDesktop.listVolumeEntries(targetPath) as Promise<VolumeEntry[]>
        : fetch(`/api/volumes/entries?target=${encodeURIComponent(targetPath)}`).then((response) => {
            if (!response.ok) {
              throw new Error('No fue posible leer la unidad')
            }
            return response.json() as Promise<VolumeEntry[]>
          })

      void loader
        .then((entries) => {
          setVolumeEntriesByMount((current) => ({ ...current, [targetPath]: entries }))
        })
        .catch(() => {
          setVolumeEntriesByMount((current) => ({ ...current, [targetPath]: [] }))
        })
        .finally(() => {
          setLoadingVolumeMounts((current) => ({ ...current, [targetPath]: false }))
        })
    })
  }, [loadingVolumeMounts, volumeEntriesByMount, windows])

  useEffect(() => {
    windows.forEach((item) => {
      if (!item.genie || runningGenies.current.has(item.id)) {
        return
      }

      const windowNode = windowRefs.current[item.id]
      const frameNode = windowFrameRefs.current[item.id]
      if (!windowNode || !frameNode) {
        return
      }

      runningGenies.current.add(item.id)
      const windowRect = windowNode.getBoundingClientRect()
      const animation =
        item.genie.mode === 'closing-fade'
          ? frameNode.animate(
              [
                {
                  transform: 'translate(0px, 0px) scale(1, 1)',
                  opacity: '1',
                  filter: 'blur(0px)',
                  clipPath: `inset(0 round ${WINDOW_RADIUS}px)`,
                  offset: 0,
                },
                {
                  transform: 'translate(0px, -4px) scale(0.992, 0.992)',
                  opacity: '0.54',
                  filter: 'blur(1.5px)',
                  clipPath: `inset(0 round ${WINDOW_RADIUS}px)`,
                  offset: 0.6,
                },
                {
                  transform: 'translate(0px, -8px) scale(0.985, 0.985)',
                  opacity: '0',
                  filter: 'blur(3px)',
                  clipPath: `inset(0 round ${WINDOW_RADIUS}px)`,
                  offset: 1,
                },
              ],
              {
                duration: 180,
                easing: 'ease-out',
                fill: 'both',
              },
            )
          : (() => {
              const dockRect = item.genie.dockRect!
              const deltaX = dockRect.x - windowRect.x
              const deltaY = dockRect.y - windowRect.y
              const scaleX = clamp(dockRect.width / Math.max(windowRect.width, 1), 0.08, 1)
              const scaleY = clamp(dockRect.height / Math.max(windowRect.height, 1), 0.08, 1)
              const dockCenterX = dockRect.x + dockRect.width / 2
              const anchorX = clamp((dockCenterX - windowRect.x) / Math.max(windowRect.width, 1), 0.08, 0.92)
              const bias = (0.5 - anchorX) * 18
              const narrowTip = Math.max(1.6, scaleX * 100 * 0.2)
              const mediumTip = Math.max(6, scaleX * 100 * 0.5)
              const wideTip = Math.max(14, scaleX * 100 * 0.9)

              const frames: Keyframe[] =
                item.genie.mode === 'opening'
                  ? [
                      { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, clipPath: createLampClipPath(anchorX, 49, 3, narrowTip, bias), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.84', offset: 0 },
                      { transform: `translate(${deltaX * 0.9}px, ${deltaY * 0.93}px) scale(${Math.min(0.14, scaleX + 0.01)}, ${Math.min(0.3, scaleY + 0.04)})`, clipPath: createLampClipPath(anchorX, 41, 6, Math.max(3.2, narrowTip * 1.15), bias * 0.9), borderRadius: `${WINDOW_RADIUS + 9}px`, opacity: '0.85', offset: 0.12 },
                      { transform: `translate(${deltaX * 0.72}px, ${deltaY * 0.82}px) scale(${Math.min(0.2, scaleX + 0.02)}, ${Math.min(0.46, scaleY + 0.09)})`, clipPath: createLampClipPath(anchorX, 34, 9, mediumTip, bias * 0.72), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.89', offset: 0.26 },
                      { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.64}px) scale(${Math.min(0.46, scaleX + 0.14)}, ${Math.min(0.68, scaleY + 0.15)})`, clipPath: createLampClipPath(anchorX, 22, 11, Math.max(10, wideTip * 0.82), bias * 0.5), borderRadius: `${WINDOW_RADIUS + 6}px`, opacity: '0.93', offset: 0.46 },
                      { transform: `translate(${deltaX * 0.26}px, ${deltaY * 0.36}px) scale(${Math.min(0.8, scaleX + 0.31)}, ${Math.min(0.9, scaleY + 0.19)})`, clipPath: createLampClipPath(anchorX, 12, 12, wideTip, bias * 0.26), borderRadius: `${WINDOW_RADIUS + 4}px`, opacity: '0.97', offset: 0.68 },
                      { transform: `translate(${deltaX * 0.08}px, ${deltaY * 0.12}px) scale(1.02, 0.99)`, clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0.9 },
                      { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 1 },
                    ]
                  : [
                      { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0 },
                      { transform: `translate(${deltaX * 0.08}px, ${deltaY * 0.12}px) scale(1.02, 0.99)`, clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0.1 },
                      { transform: `translate(${deltaX * 0.26}px, ${deltaY * 0.36}px) scale(${Math.max(0.56, 1 - (1 - scaleX) * 0.18)}, ${Math.max(0.76, 1 - (1 - scaleY) * 0.08)})`, clipPath: createLampClipPath(anchorX, 12, 12, wideTip, bias * 0.26), borderRadius: `${WINDOW_RADIUS + 4}px`, opacity: '0.97', offset: 0.3 },
                      { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.64}px) scale(${Math.max(0.34, scaleX + 0.14)}, ${Math.max(0.56, scaleY + 0.15)})`, clipPath: createLampClipPath(anchorX, 22, 11, Math.max(10, wideTip * 0.82), bias * 0.5), borderRadius: `${WINDOW_RADIUS + 6}px`, opacity: '0.93', offset: 0.54 },
                      { transform: `translate(${deltaX * 0.72}px, ${deltaY * 0.82}px) scale(${Math.max(0.18, scaleX + 0.02)}, ${Math.max(0.3, scaleY + 0.09)})`, clipPath: createLampClipPath(anchorX, 34, 9, mediumTip, bias * 0.72), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.89', offset: 0.76 },
                      { transform: `translate(${deltaX * 0.9}px, ${deltaY * 0.93}px) scale(${Math.max(0.1, scaleX + 0.01)}, ${Math.max(0.18, scaleY + 0.04)})`, clipPath: createLampClipPath(anchorX, 41, 6, Math.max(3.2, narrowTip * 1.15), bias * 0.9), borderRadius: `${WINDOW_RADIUS + 9}px`, opacity: '0.85', offset: 0.9 },
                      { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, clipPath: createLampClipPath(anchorX, 49, 3, narrowTip, bias), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.84', offset: 1 },
                    ]

              return frameNode.animate(frames, {
                duration: 820,
                easing: 'cubic-bezier(0.2, 0.85, 0.22, 1)',
                fill: 'both',
              })
            })()

      animation.onfinish = () => {
        runningGenies.current.delete(item.id)
        const finishedGenie = item.genie
        setWindows((current) =>
          current.flatMap((windowItem) => {
            if (windowItem.id !== item.id) {
              return [windowItem]
            }
            if (finishedGenie?.removeOnFinish) {
              return []
            }
            if (finishedGenie && 'minimizeOnFinish' in finishedGenie && finishedGenie.minimizeOnFinish) {
              return [{ ...windowItem, minimized: true, genie: null }]
            }
            return [{ ...windowItem, minimized: false, genie: null }]
          }),
        )
        animation.onfinish = null
        animation.oncancel = null
      }

      animation.oncancel = () => {
        runningGenies.current.delete(item.id)
      }
    })
  }, [windows])

  const activeWindow = useMemo(
    () =>
      [...windows]
        .filter((item) => !item.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0],
    [windows],
  )
  const activeApp = activeWindow ? getResolvedApp(activeWindow.appId) : getResolvedApp('finder')
  const topZIndex = useMemo(() => windows.reduce((max, item) => Math.max(max, item.zIndex), 0), [windows])

  function getAppMenuActions(windowItem: WindowState | undefined, menuLabel: string): Array<{ id: AppMenuAction; label: string }> {
    if (!windowItem) {
      return []
    }

    if (windowItem.appId === 'photos') {
      switch (menuLabel) {
        case 'Archivo':
          return [
            { id: 'media-open', label: 'Abrir imagen...' },
            { id: 'media-open-finder', label: 'Buscar en Finder' },
            { id: 'media-reveal', label: 'Mostrar en carpeta' },
            { id: 'media-open-system', label: 'Abrir con el sistema' },
          ]
        case 'Imagen':
          return [
            { id: 'photo-zoom-in', label: 'Acercar' },
            { id: 'photo-zoom-out', label: 'Alejar' },
            { id: 'photo-rotate-right', label: 'Rotar a la derecha' },
            { id: 'photo-reset-view', label: 'Restablecer vista' },
            { id: 'media-reveal', label: 'Mostrar imagen en carpeta' },
            { id: 'media-open-system', label: 'Abrir con app externa' },
          ]
        case 'Ventana':
          return [
            { id: 'window-minimize', label: 'Minimizar ventana' },
            { id: 'window-close', label: 'Cerrar ventana' },
          ]
        default:
          return []
      }
    }

    if (windowItem.appId === 'videos') {
      const playback = videoPlaybackState[windowItem.id] ?? { playing: false, muted: false, rate: 1 }
      switch (menuLabel) {
        case 'Archivo':
          return [
            { id: 'media-open', label: 'Abrir video...' },
            { id: 'media-open-finder', label: 'Buscar en Finder' },
            { id: 'media-reveal', label: 'Mostrar en carpeta' },
            { id: 'media-open-system', label: 'Abrir con el sistema' },
          ]
        case 'Reproduccion':
          return [
            { id: 'video-toggle-play', label: playback.playing ? 'Pausar' : 'Reproducir' },
            { id: 'video-restart', label: 'Volver al inicio' },
            { id: 'video-toggle-mute', label: playback.muted ? 'Activar sonido' : 'Silenciar' },
            { id: 'video-speed-normal', label: 'Velocidad normal' },
            { id: 'video-speed-fast', label: 'Velocidad x1.5' },
            { id: 'media-open-system', label: 'Abrir con app externa' },
          ]
        case 'Ventana':
          return [
            { id: 'window-minimize', label: 'Minimizar ventana' },
            { id: 'window-close', label: 'Cerrar ventana' },
          ]
        default:
          return []
      }
    }

    return []
  }

  async function runAppMenuAction(action: AppMenuAction) {
    if (!activeWindow) {
      return
    }

    setOpenAppMenu(null)

    switch (action) {
      case 'media-open':
        await pickMediaFile(activeWindow.id, activeWindow.appId === 'videos' ? 'video' : 'photo')
        return
      case 'photo-zoom-in':
        updatePhotoViewState(activeWindow.id, (state) => ({ ...state, zoom: Math.min(4, Number((state.zoom + 0.25).toFixed(2))) }))
        return
      case 'photo-zoom-out':
        updatePhotoViewState(activeWindow.id, (state) => ({ ...state, zoom: Math.max(0.5, Number((state.zoom - 0.25).toFixed(2))) }))
        return
      case 'photo-rotate-right':
        updatePhotoViewState(activeWindow.id, (state) => ({ ...state, rotation: (state.rotation + 90) % 360 }))
        return
      case 'photo-reset-view':
        resetPhotoView(activeWindow.id)
        return
      case 'media-reveal':
        if (activeWindow.mediaPath) {
          await revealSystemPath(activeWindow.mediaPath)
        }
        return
      case 'media-open-finder':
        if (activeWindow.mediaPath) {
          openFinderWindow(createFinderRouteForFilePath(activeWindow.mediaPath))
        }
        return
      case 'media-open-system':
        if (activeWindow.mediaPath) {
          await openSystemPath(activeWindow.mediaPath)
        }
        return
      case 'window-minimize':
        minimizeWindow(activeWindow.id)
        return
      case 'window-close':
        closeWindow(activeWindow.id)
        return
      case 'video-toggle-play':
        await withVideoElement(activeWindow.id, async (video) => {
          if (video.paused) {
            await video.play().catch(() => {})
          } else {
            video.pause()
          }
        })
        return
      case 'video-restart':
        await withVideoElement(activeWindow.id, (video) => {
          video.currentTime = 0
          void video.play().catch(() => {})
        })
        return
      case 'video-toggle-mute':
        await withVideoElement(activeWindow.id, (video) => {
          video.muted = !video.muted
        })
        return
      case 'video-speed-normal':
        await withVideoElement(activeWindow.id, (video) => {
          video.playbackRate = 1
        })
        return
      case 'video-speed-fast':
        await withVideoElement(activeWindow.id, (video) => {
          video.playbackRate = 1.5
        })
        return
    }
  }

  function focusWindow(id: string) {
    setWindows((current) =>
      current.map((item) =>
        item.id === id ? { ...item, zIndex: topZIndex + 1, minimized: false, genie: null } : item,
      ),
    )
  }

  function createWindow(appId: AppId, route?: FinderRoute): WindowState {
    const initialBrowserUrl = getInitialBrowserUrl(isElectronDesktop)
    return {
      id: `${appId}-${nextWindowId.current++}`,
      appId,
      title: getApp(appId).name,
      x: 140 + windows.length * 24,
      y: 100 + windows.length * 20,
      width: appId === 'finder' ? 780 : appId === 'launcher' ? 700 : appId === 'about' ? 520 : appId === 'calculator' ? 292 : appId === 'display' ? 620 : 460,
      height: appId === 'finder' ? 500 : appId === 'launcher' ? 460 : appId === 'about' ? 420 : appId === 'calculator' ? 430 : appId === 'display' ? 520 : 340,
      zIndex: topZIndex + 1,
      minimized: false,
      maximized: false,
      restoreBounds: null,
      genie: null,
      finderState: appId === 'finder' ? createFinderState(route ?? 'computer') : null,
      browserState: appId === 'safari' ? createBrowserState(initialBrowserUrl) : null,
      calculatorState: appId === 'calculator' ? createCalculatorState() : null,
      terminalState: appId === 'terminal' ? createTerminalState(deviceInfo?.homeDir ?? 'C:\\') : null,
      mediaPath: null,
    }
  }

  function openApp(appId: AppId) {
    if (appId === 'launcher') {
      setLauncherOpen((current) => !current)
      return
    }

    if (appId === 'docksettings') {
      setLauncherOpen(false)
      const existingFinder = windows.find((item) => item.appId === 'finder')
      if (existingFinder) {
        navigateFinder(existingFinder.id, 'dock')
        focusWindow(existingFinder.id)
        return
      }

      openFinderWindow('dock')
      return
    }

    setLauncherOpen(false)

    if (appId === 'finder') {
      const existingFinder = windows.find((item) => item.appId === 'finder' && !item.minimized)
      if (existingFinder) {
        focusWindow(existingFinder.id)
        return
      }
    }

    const existing = windows.find((item) => item.appId === appId)
    if (existing) {
      if (existing.minimized) {
        const dockRect = getDockRect(appId)
        setWindows((current) =>
          current.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  minimized: false,
                  zIndex: topZIndex + 1,
                  genie: dockRect ? { mode: 'opening', dockRect } : null,
                }
              : item,
          ),
        )
        return
      }
      focusWindow(existing.id)
      return
    }

    const nextWindow = createWindow(appId)
    const dockRect = getDockRect(appId)
    nextWindow.genie = dockRect ? { mode: 'opening', dockRect } : null
    setWindows((current) => [...current, nextWindow])
  }

  function openFinderWindow(route: FinderRoute) {
    setLauncherOpen(false)
    const nextWindow = createWindow('finder', route)
    const dockRect = getDockRect('finder')
    nextWindow.genie = dockRect ? { mode: 'opening', dockRect } : null
    setWindows((current) => [...current, nextWindow])
    setContextMenu(null)
  }

  function startDesktopVolumeDrag(event: React.PointerEvent<HTMLButtonElement>, mount: string) {
    const rect = event.currentTarget.getBoundingClientRect()
    desktopVolumeDragRef.current = {
      mount,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    }
  }

  function openDesktopVolume(mount: string) {
    if (skipDesktopVolumeClickRef.current === mount) {
      skipDesktopVolumeClickRef.current = null
      return
    }

    openOrFocusFinderRoute(createVolumeRoute(mount))
  }

  function openSafariWindow(url?: string) {
    setLauncherOpen(false)
    const nextWindow = createWindow('safari')
    if (nextWindow.browserState && url) {
      const normalized = normalizeBrowserUrl(url)
      nextWindow.browserState = {
        ...nextWindow.browserState,
        history: [normalized],
        historyIndex: 0,
        inputValue: normalized,
      }
    }
    const dockRect = getDockRect('safari')
    nextWindow.genie = dockRect ? { mode: 'opening', dockRect } : null
    setWindows((current) => [...current, nextWindow])
  }

  function openMediaWindow(appId: 'photos' | 'videos', entry: VolumeEntry) {
    setLauncherOpen(false)
    const existing = windows.find((item) => item.appId === appId)
    if (existing) {
      if (appId === 'photos') {
        resetPhotoView(existing.id)
      }
      setWindows((current) =>
        current.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                title: entry.name,
                mediaPath: entry.path,
                minimized: false,
                zIndex: topZIndex + 1,
                genie: null,
              }
            : item,
        ),
      )
      return
    }

    const nextWindow = createWindow(appId)
    if (appId === 'photos') {
      resetPhotoView(nextWindow.id)
    }
    nextWindow.title = entry.name
    nextWindow.mediaPath = entry.path
    nextWindow.width = appId === 'photos' ? 880 : 960
    nextWindow.height = appId === 'photos' ? 620 : 640
    const dockRect = getDockRect(appId)
    nextWindow.genie = dockRect ? { mode: 'opening', dockRect } : null
    setWindows((current) => [...current, nextWindow])
  }

  function closeWindow(id: string) {
    setWindows((current) =>
      current.flatMap((item) => {
        if (item.id !== id) {
          return [item]
        }
        return [{ ...item, genie: { mode: 'closing-fade', removeOnFinish: true } }]
      }),
    )
  }

  function minimizeWindow(id: string) {
    setWindows((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item
        }
        const dockRect = getDockRect(item.appId)
        if (!dockRect) {
          return { ...item, minimized: true, genie: null }
        }
        return { ...item, genie: { mode: 'closing', dockRect, minimizeOnFinish: true } }
      }),
    )
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>, id: string) {
    const targetWindow = windows.find((item) => item.id === id)
    if (!targetWindow || targetWindow.maximized) {
      return
    }
    focusWindow(id)
    setDrag({ id, offsetX: event.clientX - targetWindow.x, offsetY: event.clientY - targetWindow.y })
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>, id: string) {
    event.stopPropagation()
    const targetWindow = windows.find((item) => item.id === id)
    if (!targetWindow || targetWindow.maximized) {
      return
    }
    focusWindow(id)
    setResize({
      id,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: targetWindow.width,
      startHeight: targetWindow.height,
    })
  }

  function toggleMaximize(id: string) {
    const desktop = getMaximizedBounds()
    setWindows((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item
        }
        if (item.maximized && item.restoreBounds) {
          return {
            ...item,
            ...item.restoreBounds,
            maximized: false,
            restoreBounds: null,
            zIndex: topZIndex + 1,
            genie: null,
          }
        }
        return {
          ...item,
          x: desktop.x,
          y: desktop.y,
          width: desktop.width,
          height: desktop.height,
          maximized: true,
          minimized: false,
          restoreBounds: { x: item.x, y: item.y, width: item.width, height: item.height },
          zIndex: topZIndex + 1,
          genie: null,
        }
      }),
    )
  }

  function updateFinderWindow(windowId: string, updater: (state: FinderState) => FinderState) {
    setWindows((current) =>
      current.map((item) =>
        item.id === windowId && item.finderState ? { ...item, finderState: updater(item.finderState) } : item,
      ),
    )
  }

  function navigateFinder(windowId: string, route: FinderRoute) {
    updateFinderWindow(windowId, (finderState) => ({
      ...finderState,
      tabs: finderState.tabs.map((tab) => {
        if (tab.id !== finderState.activeTabId) {
          return tab
        }
        const nextHistory = [...tab.history.slice(0, tab.historyIndex + 1), route]
        return { ...tab, history: nextHistory, historyIndex: nextHistory.length - 1 }
      }),
    }))
    setContextMenu(null)
  }

  function openFinderTab(windowId: string, route: FinderRoute) {
    updateFinderWindow(windowId, (finderState) => {
      const nextTab = createFinderTab(route, finderState.tabs.length + 1)
      return { tabs: [...finderState.tabs, nextTab], activeTabId: nextTab.id }
    })
    setContextMenu(null)
  }

  function selectFinderTab(windowId: string, tabId: string) {
    updateFinderWindow(windowId, (finderState) => ({ ...finderState, activeTabId: tabId }))
  }

  function closeFinderTab(windowId: string, tabId: string) {
    const windowItem = windows.find((item) => item.id === windowId)
    const finderState = windowItem?.finderState
    if (!finderState) {
      return
    }

    if (finderState.tabs.length <= 1) {
      closeWindow(windowId)
      return
    }

    updateFinderWindow(windowId, (currentFinderState) => {
      const closingIndex = currentFinderState.tabs.findIndex((tab) => tab.id === tabId)
      const nextTabs = currentFinderState.tabs.filter((tab) => tab.id !== tabId)
      const activeWasClosing = currentFinderState.activeTabId === tabId
      const fallbackIndex = clamp(closingIndex <= 0 ? 0 : closingIndex - 1, 0, nextTabs.length - 1)

      return {
        ...currentFinderState,
        tabs: nextTabs,
        activeTabId: activeWasClosing
          ? nextTabs[fallbackIndex]?.id ?? nextTabs[0].id
          : currentFinderState.activeTabId,
      }
    })
  }

  function moveFinderHistory(windowId: string, direction: -1 | 1) {
    updateFinderWindow(windowId, (finderState) => ({
      ...finderState,
      tabs: finderState.tabs.map((tab) =>
        tab.id === finderState.activeTabId
          ? { ...tab, historyIndex: clamp(tab.historyIndex + direction, 0, tab.history.length - 1) }
          : tab,
      ),
    }))
  }

  function toggleDockItem(appId: AppId) {
    if (appId === 'finder') {
      return
    }
    setDockItems((current) =>
      current.includes(appId) ? current.filter((item) => item !== appId) : [...current, appId],
    )
  }

  function addCustomDockItem(item: CustomDockItem) {
    setCustomDockItems((current) => {
      const exists = current.some((entry) => entry.target === item.target && entry.kind === item.kind)
      if (exists) {
        return current
      }
      return [...current, item]
    })
  }

  function removeCustomDockItem(id: string) {
    setCustomDockItems((current) => current.filter((item) => item.id !== id))
  }

  function handleDockIconDragEnd(event: React.DragEvent<HTMLButtonElement>, id: string, removable: boolean) {
    if (!removable) {
      return
    }

    const dockRect = dockRef.current?.getBoundingClientRect()
    if (!dockRect) {
      return
    }

    const { clientX, clientY } = event
    const insideDock =
      clientX >= dockRect.left &&
      clientX <= dockRect.right &&
      clientY >= dockRect.top &&
      clientY <= dockRect.bottom

    if (!insideDock) {
      removeCustomDockItem(id)
    }
  }

  function createCustomDockShortcut() {
    const name = newDockName.trim()
    const target = newDockTarget.trim()
    if (!name || !target) {
      return
    }

    addCustomDockItem({
      id: `custom-${Date.now()}`,
      name,
      target,
      kind: /^https?:\/\//i.test(target) || target.includes('.') ? 'url' : 'app',
      icon: normalizeIconSpec({
        kind: newDockIconKind,
        value: newDockIconValue.trim() || name[0] || 'C',
      }),
      accent: newDockAccent,
    })

    setNewDockName('')
    setNewDockTarget('')
    setNewDockIconKind('glyph')
    setNewDockIconValue('📁')
    setNewDockAccent('#4f7cff')
  }

  function pinInstalledAppToDock(app: InstalledApp) {
    addCustomDockItem({
      id: `app-${app.id}`,
      name: app.name,
      target: app.launchTarget || app.target,
      kind: 'app',
      icon: { kind: 'glyph', value: '💻' },
      accent: 'linear-gradient(135deg, #6ec3ff 0%, #4361ff 100%)',
    })
  }

  function pinBuiltInAppToDock(appId: AppId) {
    if (!getApp(appId).dockable) {
      return
    }

    setDockItems((current) => current.includes(appId) ? current : [...current, appId])
  }

  function unpinBuiltInAppFromDock(appId: AppId) {
    setDockItems((current) => current.filter((item) => item !== appId))
  }

  function pinVolumeToDock(mount: string) {
    const volume = deviceInfo?.volumes.find((item) => item.mount === mount)
    if (!volume) {
      return
    }

    addCustomDockItem(createVolumeDockItem(volume))
  }

  function openOrFocusFinderRoute(route: FinderRoute, dockItemId?: string) {
    const targetMount = getVolumeMountFromRoute(route)
    const existingFinder = windows.find((item) => {
      if (item.appId !== 'finder' || !item.finderState) {
        return false
      }

      const currentRoute = getActiveFinderRoute(item.finderState)
      if (targetMount) {
        return getVolumeMountFromRoute(currentRoute) === targetMount
      }

      return currentRoute === route
    })

    if (!existingFinder) {
      openFinderWindow(route)
      return
    }

    if (existingFinder.minimized) {
      const dockRect = getDockRect(dockItemId ?? 'finder')
      setWindows((current) =>
        current.map((item) =>
          item.id === existingFinder.id
            ? {
                ...item,
                minimized: false,
                zIndex: topZIndex + 1,
                genie: dockRect ? { mode: 'opening', dockRect } : null,
              }
            : item,
        ),
      )
    } else {
      focusWindow(existingFinder.id)
    }

    navigateFinder(existingFinder.id, route)
  }

  async function activateCustomDockItem(item: CustomDockItem) {
    setLauncherOpen(false)
    if (item.kind === 'url') {
      const safariWindow = windows.find((entry) => entry.appId === 'safari')
      if (!safariWindow) {
        openSafariWindow(item.target)
        return
      }
      if (safariWindow.minimized) {
        openApp('safari')
      }
      commitBrowserNavigation(safariWindow.id, item.target)
      focusWindow(safariWindow.id)
      return
    }

    if (item.kind === 'finder-route') {
      openOrFocusFinderRoute(item.target as FinderRoute, item.id)
      return
    }

    await launchSystemApp(item.target)
  }

  async function launchSystemApp(target: string) {
    setLauncherOpen(false)
    if (window.electronDesktop) {
      const result = await window.electronDesktop.launchApp(target) as { ok?: boolean; error?: string | null }
      if (result?.ok === false) {
        setSystemError(result.error || `No se pudo abrir: ${target}`)
      } else {
        setSystemError(null)
      }
      return
    }

    const response = await fetch('/api/apps/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    })
    if (!response.ok) {
      setSystemError(`No se pudo abrir: ${target}`)
      return
    }
    setSystemError(null)
  }

  async function openSystemPath(target: string) {
    await launchSystemApp(target)
  }

  function setMediaWindowPath(windowId: string, nextPath: string, nextTitle?: string) {
    setWindows((current) =>
      current.map((item) =>
        item.id === windowId
          ? {
              ...item,
              mediaPath: nextPath,
              title: nextTitle || pathToLabel(nextPath),
              width: item.appId === 'photos' ? 880 : item.appId === 'videos' ? 960 : item.width,
              height: item.appId === 'photos' ? 620 : item.appId === 'videos' ? 640 : item.height,
              minimized: false,
              zIndex: topZIndex + 1,
              genie: null,
            }
          : item,
      ),
    )
  }

  function getPhotoViewState(windowId: string) {
    return photoViewStates[windowId] ?? { zoom: 1, rotation: 0 }
  }

  function updatePhotoViewState(windowId: string, updater: (state: PhotoViewState) => PhotoViewState) {
    setPhotoViewStates((current) => ({
      ...current,
      [windowId]: updater(current[windowId] ?? { zoom: 1, rotation: 0 }),
    }))
  }

  function resetPhotoView(windowId: string) {
    setPhotoViewStates((current) => ({
      ...current,
      [windowId]: { zoom: 1, rotation: 0 },
    }))
  }

  function updateVideoPlaybackMeta(windowId: string) {
    const video = videoElementRefs.current[windowId]
    if (!video) {
      return
    }

    setVideoPlaybackState((current) => ({
      ...current,
      [windowId]: {
        playing: !video.paused,
        muted: video.muted,
        rate: video.playbackRate,
      },
    }))
  }

  function registerVideoElement(windowId: string, node: HTMLVideoElement | null) {
    if (node) {
      videoElementRefs.current[windowId] = node
      return
    }

    delete videoElementRefs.current[windowId]
  }

  async function withVideoElement(windowId: string, action: (video: HTMLVideoElement) => void | Promise<void>) {
    const video = videoElementRefs.current[windowId]
    if (!video) {
      return
    }

    await action(video)
    updateVideoPlaybackMeta(windowId)
  }

  function pathToLabel(targetPath: string) {
    return targetPath.split(/[\\/]/).filter(Boolean).pop() || targetPath
  }

  function createFinderRouteForFilePath(targetPath: string): FinderRoute {
    if (!deviceInfo?.volumes?.length) {
      return 'computer'
    }

    const normalizedTarget = targetPath.replace(/\//g, '\\').toLowerCase()
    const matchedVolume = [...deviceInfo.volumes]
      .sort((left, right) => right.mount.length - left.mount.length)
      .find((volume) => normalizedTarget.startsWith(volume.mount.replace(/\//g, '\\').toLowerCase()))

    if (!matchedVolume) {
      return 'computer'
    }

    const directoryPath = targetPath.replace(/[\\/][^\\/]+$/, '')
    return createVolumeSubRoute(matchedVolume.mount, directoryPath || matchedVolume.mount)
  }

  async function pickMediaFile(windowId: string, kind: 'photo' | 'video') {
    if (!window.electronDesktop) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = kind === 'video'
        ? '.mp4,.mov,.mkv,.avi,.webm,.m4v,video/*'
        : '.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.avif,image/*'

      const selected = await new Promise<File | null>((resolve) => {
        input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
        input.click()
      })

      if (!selected) {
        return
      }

      setSystemError(null)
      if (kind === 'photo') {
        resetPhotoView(windowId)
      }
      setMediaWindowPath(windowId, URL.createObjectURL(selected), selected.name)
      return
    }

    const selected = await window.electronDesktop.pickMediaFile(kind)
    if (!selected) {
      return
    }

    setSystemError(null)
    if (kind === 'photo') {
      resetPhotoView(windowId)
    }
    setMediaWindowPath(windowId, selected.path, selected.name)
  }

  async function revealSystemPath(target: string) {
    if (!window.electronDesktop) {
      return
    }

    const result = await window.electronDesktop.revealPath(target)
    if (result?.ok === false) {
      setSystemError(result.error || `No se pudo mostrar la ruta: ${target}`)
      return
    }

    setSystemError(null)
  }

  async function flushSystemControls(immediatePatch?: SystemControlPatch) {
    const patch = {
      ...pendingSystemControlsPatchRef.current,
      ...immediatePatch,
    }

    pendingSystemControlsPatchRef.current = {}
    if (systemControlsFlushTimerRef.current !== null) {
      window.clearTimeout(systemControlsFlushTimerRef.current)
      systemControlsFlushTimerRef.current = null
    }

    if (Object.keys(patch).length === 0) {
      return
    }

    try {
      const nextControls = window.electronDesktop
        ? await window.electronDesktop.setSystemControls(patch) as SystemControlsState
        : await fetch('/api/system-controls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          }).then((response) => {
            if (!response.ok) throw new Error('No fue posible actualizar los controles del sistema')
            return response.json() as Promise<SystemControlsState>
          })

      setSystemControls(nextControls)
    } catch {
      // Mantiene el estado optimista si el sistema no expone estos controles.
    }
  }

  function scheduleSystemControlsFlush() {
    if (systemControlsFlushTimerRef.current !== null) {
      window.clearTimeout(systemControlsFlushTimerRef.current)
    }

    systemControlsFlushTimerRef.current = window.setTimeout(() => {
      systemControlsFlushTimerRef.current = null
      void flushSystemControls()
    }, SYSTEM_CONTROLS_DEBOUNCE_MS)
  }

  function updateSystemControls(patch: SystemControlPatch, immediate = false) {
    const normalizedPatch = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [key, value === undefined ? value : clampControlValue(Number(value))]),
    ) as SystemControlPatch

    setSystemControls((current) => ({
      ...current,
      ...normalizedPatch,
    }))

    pendingSystemControlsPatchRef.current = {
      ...pendingSystemControlsPatchRef.current,
      ...normalizedPatch,
    }

    if (immediate) {
      void flushSystemControls()
      return
    }

    scheduleSystemControlsFlush()
  }

  function updateBrowserWindow(windowId: string, updater: (state: BrowserState) => BrowserState) {
    setWindows((current) =>
      current.map((item) =>
        item.id === windowId && item.browserState ? { ...item, browserState: updater(item.browserState) } : item,
      ),
    )
  }

  function updateTerminalWindow(windowId: string, updater: (state: TerminalState) => TerminalState) {
    setWindows((current) =>
      current.map((item) =>
        item.id === windowId && item.terminalState ? { ...item, terminalState: updater(item.terminalState) } : item,
      ),
    )
  }

  async function runTerminalCommand(windowId: string) {
    const terminalWindow = windows.find((item) => item.id === windowId)
    const terminalState = terminalWindow?.terminalState
    if (!terminalState) {
      return
    }

    const command = terminalState.input.trim()
    if (!command || terminalState.busy) {
      return
    }

    if (command === 'clear' || command === 'cls') {
      updateTerminalWindow(windowId, (state) => ({ ...state, input: '', history: [] }))
      return
    }

    if (command.startsWith('cd')) {
      const target = command.slice(2).trim()
      const nextCwd = target
        ? (target.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(target)
            ? target
            : `${terminalState.cwd.replace(/[\\/]+$/, '')}${terminalState.cwd.includes('\\') ? '\\' : '/'}${target}`)
        : (deviceInfo?.homeDir ?? terminalState.cwd)

      updateTerminalWindow(windowId, (state) => ({
        ...state,
        cwd: nextCwd,
        input: '',
        history: [
          ...state.history,
          { id: `term-${Date.now()}`, command, output: '', error: '', exitCode: 0 },
        ],
      }))
      return
    }

    updateTerminalWindow(windowId, (state) => ({ ...state, busy: true, input: '' }))

    const result = window.electronDesktop
      ? await window.electronDesktop.executeTerminalCommand({ command, cwd: terminalState.cwd }) as { stdout: string; stderr: string; exitCode: number }
      : await fetch('/api/terminal/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, cwd: terminalState.cwd }),
        }).then((response) => response.json() as Promise<{ stdout: string; stderr: string; exitCode: number }>)

    updateTerminalWindow(windowId, (state) => ({
      ...state,
      busy: false,
      history: [
        ...state.history,
        {
          id: `term-${Date.now()}`,
          command,
          output: result.stdout,
          error: result.stderr,
          exitCode: result.exitCode,
        },
      ],
    }))
  }

  function updateCalculatorWindow(windowId: string, updater: (state: CalculatorState) => CalculatorState) {
    setWindows((current) =>
      current.map((item) =>
        item.id === windowId && item.calculatorState
          ? { ...item, calculatorState: updater(item.calculatorState) }
          : item,
      ),
    )
  }

  function applyCalculatorOperation(left: number, right: number, operator: CalculatorState['operator']) {
    switch (operator) {
      case '+':
        return left + right
      case '-':
        return left - right
      case '×':
        return left * right
      case '/':
        return right === 0 ? 0 : left / right
      default:
        return right
    }
  }

  function inputCalculatorDigit(windowId: string, digit: string) {
    updateCalculatorWindow(windowId, (calculatorState) => {
      if (calculatorState.waitingForOperand) {
        return {
          ...calculatorState,
          display: digit,
          waitingForOperand: false,
        }
      }

      return {
        ...calculatorState,
        display: calculatorState.display === '0' ? digit : `${calculatorState.display}${digit}`,
      }
    })
  }

  function inputCalculatorDecimal(windowId: string) {
    updateCalculatorWindow(windowId, (calculatorState) => {
      if (calculatorState.waitingForOperand) {
        return {
          ...calculatorState,
          display: '0.',
          waitingForOperand: false,
        }
      }

      if (calculatorState.display.includes('.')) {
        return calculatorState
      }

      return {
        ...calculatorState,
        display: `${calculatorState.display}.`,
      }
    })
  }

  function clearCalculator(windowId: string) {
    updateCalculatorWindow(windowId, () => createCalculatorState())
  }

  function toggleCalculatorSign(windowId: string) {
    updateCalculatorWindow(windowId, (calculatorState) => {
      const value = Number(calculatorState.display || '0')
      return {
        ...calculatorState,
        display: String(value * -1),
      }
    })
  }

  function inputCalculatorPercent(windowId: string) {
    updateCalculatorWindow(windowId, (calculatorState) => {
      const value = Number(calculatorState.display || '0')
      return {
        ...calculatorState,
        display: String(value / 100),
      }
    })
  }

  function chooseCalculatorOperator(windowId: string, nextOperator: NonNullable<CalculatorState['operator']>) {
    updateCalculatorWindow(windowId, (calculatorState) => {
      const inputValue = Number(calculatorState.display || '0')

      if (calculatorState.storedValue === null) {
        return {
          ...calculatorState,
          storedValue: inputValue,
          operator: nextOperator,
          waitingForOperand: true,
        }
      }

      if (calculatorState.waitingForOperand) {
        return {
          ...calculatorState,
          operator: nextOperator,
        }
      }

      const result = applyCalculatorOperation(calculatorState.storedValue, inputValue, calculatorState.operator)
      return {
        display: String(Number.isFinite(result) ? Number(result.toFixed(10)) : 0),
        storedValue: result,
        operator: nextOperator,
        waitingForOperand: true,
      }
    })
  }

  function evaluateCalculator(windowId: string) {
    updateCalculatorWindow(windowId, (calculatorState) => {
      if (calculatorState.operator === null || calculatorState.storedValue === null) {
        return calculatorState
      }

      const inputValue = Number(calculatorState.display || '0')
      const result = applyCalculatorOperation(calculatorState.storedValue, inputValue, calculatorState.operator)
      return {
        display: String(Number.isFinite(result) ? Number(result.toFixed(10)) : 0),
        storedValue: null,
        operator: null,
        waitingForOperand: true,
      }
    })
  }

  function setBrowserInput(windowId: string, value: string) {
    updateBrowserWindow(windowId, (browserState) => ({ ...browserState, inputValue: value }))
  }

  function commitBrowserNavigation(windowId: string, rawValue: string) {
    const nextUrl = normalizeBrowserUrl(rawValue)
    updateBrowserWindow(windowId, (browserState) => {
      const nextHistory = [...browserState.history.slice(0, browserState.historyIndex + 1), nextUrl]
      return {
        ...browserState,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        inputValue: nextUrl,
      }
    })
    window.electronDesktop?.browser.navigate(nextUrl)
  }

  function moveBrowserHistory(windowId: string, direction: -1 | 1) {
    updateBrowserWindow(windowId, (browserState) => {
      const nextIndex = clamp(browserState.historyIndex + direction, 0, browserState.history.length - 1)
      return {
        ...browserState,
        historyIndex: nextIndex,
        inputValue: browserState.history[nextIndex],
      }
    })

    if (direction === -1) {
      window.electronDesktop?.browser.goBack()
    } else {
      window.electronDesktop?.browser.goForward()
    }
  }

  function reloadBrowser(windowId: string) {
    updateBrowserWindow(windowId, (browserState) => ({
      ...browserState,
      reloadKey: browserState.reloadKey + 1,
    }))
    window.electronDesktop?.browser.reload()
  }

  function openBrowserExternally(url: string) {
    if (!url || isSafariHomeUrl(url)) {
      return
    }

    if (window.electronDesktop) {
      window.electronDesktop.browser.openExternal(url)
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function renderFinderCard(windowId: string, route: FinderRoute, subtitle: string) {
    return (
      <button
        key={route}
        type="button"
        className="finder-card"
        onClick={() => navigateFinder(windowId, route)}
        onContextMenu={(event) => {
          event.preventDefault()
          setContextMenu({ type: 'finder', x: event.clientX, y: event.clientY, windowId, route, label: getFinderLabel(route) })
        }}
      >
        <strong>{getFinderLabel(route)}</strong>
        <span>{subtitle}</span>
      </button>
    )
  }

  function renderDisplayCard(subtitle: string) {
    return (
      <button
        key="display-preferences"
        type="button"
        className="finder-card"
        onClick={() => openApp('display')}
      >
        <strong>Pantalla</strong>
        <span>{subtitle}</span>
      </button>
    )
  }

  function renderFinderContent(windowItem: WindowState) {
    const finderState = windowItem.finderState
    const activeTab = getActiveFinderTab(finderState)
    const activeRoute = getActiveFinderRoute(finderState)
    const activeVolumeMount = getVolumeMountFromRoute(activeRoute)
    const activeVolumePath = getVolumePathFromRoute(activeRoute)
    const activeVolume = activeVolumeMount
      ? deviceInfo?.volumes.find((volume) => volume.mount === activeVolumeMount) ?? null
      : null
    const activeVolumeEntries = activeVolumePath ? volumeEntriesByMount[activeVolumePath] ?? [] : []
    const activeVolumeFolders = activeVolumeEntries.filter((entry) => entry.kind === 'directory')
    const activeVolumeFiles = activeVolumeEntries.filter((entry) => entry.kind !== 'directory')
    const activeVolumeLoading = activeVolumePath ? !!loadingVolumeMounts[activeVolumePath] : false
    const canGoBack = !!activeTab && activeTab.historyIndex > 0
    const canGoForward = !!activeTab && activeTab.historyIndex < activeTab.history.length - 1

    return (
      <div className="finder-shell">
        <div className="finder-browser-bar">
          <div className="finder-nav-group">
            <button type="button" disabled={!canGoBack} onClick={() => moveFinderHistory(windowItem.id, -1)}>
              Atras
            </button>
            <button type="button" disabled={!canGoForward} onClick={() => moveFinderHistory(windowItem.id, 1)}>
              Adelante
            </button>
          </div>
          <strong>{getFinderLabel(activeRoute)}</strong>
          <button type="button" onClick={() => openFinderTab(windowItem.id, activeRoute)}>
            Nueva pestana
          </button>
        </div>

        <div className="finder-tabs">
          {finderState?.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`finder-tab${tab.id === finderState.activeTabId ? ' active' : ''}`}
            >
              <button type="button" className="finder-tab-label" onClick={() => selectFinderTab(windowItem.id, tab.id)}>
                {getFinderLabel(tab.history[tab.historyIndex])}
              </button>
              <button
                type="button"
                className="finder-tab-close"
                aria-label={`Cerrar pestaña ${getFinderLabel(tab.history[tab.historyIndex])}`}
                onClick={() => closeFinderTab(windowItem.id, tab.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="finder-layout">
          <aside className="finder-sidebar">
            <button type="button" onClick={() => navigateFinder(windowItem.id, 'computer')}>
              Equipo
            </button>
            <button type="button" onClick={() => navigateFinder(windowItem.id, 'device')}>
              Dispositivo
            </button>
            <button type="button" onClick={() => navigateFinder(windowItem.id, 'applications')}>
              Aplicaciones
            </button>
            <button type="button" onClick={() => navigateFinder(windowItem.id, 'dock')}>
              Dock
            </button>
            <button type="button" onClick={() => navigateFinder(windowItem.id, 'display')}>
              Pantalla
            </button>
            {deviceInfo?.volumes.length ? (
              <div className="finder-sidebar-section">
                <span>Unidades</span>
                {deviceInfo.volumes.map((volume) => (
                  <button
                    key={volume.mount}
                    type="button"
                    onClick={() => navigateFinder(windowItem.id, createVolumeRoute(volume.mount))}
                  >
                    {volume.name}
                  </button>
                ))}
              </div>
            ) : null}
          </aside>

          <div className="finder-panel">
            {activeRoute === 'computer' ? (
              <>
                <h2>Equipo</h2>
                <p>Entrada principal del dispositivo local.</p>
                <div className="finder-card-grid">
                  {renderFinderCard(windowItem.id, 'device', 'CPU, RAM, sistema operativo y discos')}
                  {renderFinderCard(windowItem.id, 'applications', 'Apps detectadas segun el sistema operativo')}
                  {renderFinderCard(windowItem.id, 'dock', 'Personaliza los iconos del dock inferior')}
                  {renderDisplayCard('Cambia apariencia y fondo de pantalla')}
                  {deviceInfo?.volumes.map((volume) =>
                    renderFinderCard(
                      windowItem.id,
                      createVolumeRoute(volume.mount),
                      `${volume.freeGb} GB libres de ${volume.totalGb} GB`,
                    ),
                  )}
                </div>
              </>
            ) : null}

            {activeRoute === 'device' ? (
              <div className="device-panel">
                <h2>Informacion del dispositivo</h2>
                {loadingSystem ? <p>Cargando informacion del equipo...</p> : null}
                {systemError ? <p>{systemError}</p> : null}
                {deviceInfo ? (
                  <>
                    <div className="info-grid">
                      <article><strong>Equipo</strong><span>{deviceInfo.hostname}</span></article>
                      <article><strong>Sistema</strong><span>{deviceInfo.osName} {deviceInfo.release}</span></article>
                      <article><strong>Version</strong><span>{deviceInfo.version}</span></article>
                      <article><strong>Arquitectura</strong><span>{deviceInfo.arch}</span></article>
                      <article><strong>CPU</strong><span>{deviceInfo.cpuModel}</span></article>
                      <article><strong>Nucleos</strong><span>{deviceInfo.cpuCount}</span></article>
                      <article><strong>RAM total</strong><span>{deviceInfo.totalMemoryGb} GB</span></article>
                      <article><strong>RAM libre</strong><span>{deviceInfo.freeMemoryGb} GB</span></article>
                      <article><strong>Usuario</strong><span>{deviceInfo.userName}</span></article>
                      <article><strong>Home</strong><span>{deviceInfo.homeDir}</span></article>
                    </div>
                    <div className="volume-list">
                      {deviceInfo.volumes.map((volume) => (
                        <article key={volume.mount}>
                          <strong>{volume.name}</strong>
                          <span>{volume.mount}</span>
                          <span>{volume.freeGb} GB libres de {volume.totalGb} GB</span>
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {activeRoute === 'applications' ? (
              <div className="device-panel">
                <h2>Aplicaciones del dispositivo</h2>
                <p>{deviceInfo ? `Sistema detectado: ${deviceInfo.osName}` : 'Leyendo sistema operativo...'}</p>
                <div className="apps-list">
                  {installedApps.slice(0, 60).map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className="app-row"
                      onClick={() => void launchSystemApp(app.launchTarget || app.target)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setContextMenu({
                          type: 'finder',
                          x: event.clientX,
                          y: event.clientY,
                          windowId: windowItem.id,
                          route: 'applications',
                          label: app.name,
                        })
                      }}
                    >
                      <strong>{app.name}</strong>
                      <span>{app.source}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeRoute === 'dock' ? (
              <div className="device-panel">
                <h2>Dock</h2>
                <p>Activa o desactiva iconos y personaliza su apariencia. Finder se mantiene fijo.</p>
                <div className="dock-settings-list">
                  {APPS.filter((app) => app.dockable).map((app) => {
                    const resolvedApp = getResolvedApp(app.id)
                    return (
                      <div key={app.id} className="dock-setting dock-setting-editor">
                        <label className="dock-toggle-row">
                          <input
                            type="checkbox"
                            checked={dockItems.includes(app.id)}
                            disabled={app.id === 'finder'}
                            onChange={() => toggleDockItem(app.id)}
                          />
                          <span>{app.name}</span>
                        </label>
                        {renderIconEditor({
                          label: `Icono de ${app.name}`,
                          icon: resolvedApp.iconSpec,
                          accent: resolvedApp.accent,
                          onIconChange: (icon) => updateAppVisual(app.id, { icon }),
                          onAccentChange: (accent) => updateAppVisual(app.id, { accent }),
                        })}
                        <button type="button" onClick={() => resetAppVisual(app.id)}>
                          Restaurar icono original
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="custom-dock-form">
                  <h3>Crear acceso personalizado</h3>
                  <input value={newDockName} onChange={(event) => setNewDockName(event.target.value)} placeholder="Nombre" />
                  <input value={newDockTarget} onChange={(event) => setNewDockTarget(event.target.value)} placeholder="URL o ruta/app" />
                  {renderIconEditor({
                    label: 'Icono del acceso',
                    icon: { kind: newDockIconKind, value: newDockIconValue },
                    accent: newDockAccent,
                    onIconChange: (icon) => {
                      setNewDockIconKind(icon.kind)
                      setNewDockIconValue(icon.value)
                    },
                    onAccentChange: setNewDockAccent,
                  })}
                  <button type="button" onClick={createCustomDockShortcut}>Agregar al dock</button>
                </div>
                {customDockItems.length ? (
                  <div className="apps-list">
                    {customDockItems.map((item) => (
                      <div key={item.id} className="app-row">
                        <div className="custom-dock-meta">
                          <strong>{item.name}</strong>
                          <span>{item.target}</span>
                        </div>
                        <div className="custom-dock-actions">
                          <div className="icon-preview-chip small" style={{ background: item.accent }}>
                            {renderDockIconContent(item.icon)}
                          </div>
                        </div>
                        <button type="button" onClick={() => removeCustomDockItem(item.id)}>Quitar</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeRoute === 'display' ? (
              <div className="device-panel">
                <h2>Pantalla</h2>
                <p>Elige entre la apariencia actual y un modo oscuro, y cambia el fondo del escritorio.</p>
                {renderDisplayContent()}
              </div>
            ) : null}

            {activeVolumeMount ? (
              <div className="device-panel">
                <h2>{activeVolume?.name ?? formatVolumeLabel(activeVolumeMount)}</h2>
                <p>{activeVolumePath ?? activeVolume?.mount ?? activeVolumeMount}</p>
                {activeVolume ? (
                  <div className="finder-volume-summary">
                    <article>
                      <strong>Capacidad</strong>
                      <span>{activeVolume.totalGb} GB</span>
                    </article>
                    <article>
                      <strong>Libre</strong>
                      <span>{activeVolume.freeGb} GB</span>
                    </article>
                  </div>
                ) : null}
                {activeVolumeLoading ? <p>Cargando contenido de la unidad...</p> : null}
                {!activeVolumeLoading && activeVolumeEntries.length === 0 ? (
                  <p>No se encontraron elementos visibles en esta unidad.</p>
                ) : null}
                {activeVolumeFolders.length ? (
                  <div className="finder-entry-section">
                    <strong className="finder-entry-title">Carpetas</strong>
                    <div className="finder-folder-grid">
                      {activeVolumeFolders.map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          className="finder-folder-tile"
                          onClick={() => navigateFinder(windowItem.id, createVolumeSubRoute(activeVolumeMount, entry.path))}
                        >
                          <span className="finder-folder-icon" aria-hidden="true" />
                          <strong>{entry.name}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {activeVolumeFiles.length ? (
                  <div className="finder-entry-section">
                    <strong className="finder-entry-title">Archivos</strong>
                    <div className="finder-file-list">
                      {activeVolumeFiles.map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          className="finder-file-row interactive"
                          onClick={() => void (async () => {
                            if (isImageEntry(entry)) {
                              openMediaWindow('photos', entry)
                              return
                            }
                            if (isVideoEntry(entry)) {
                              openMediaWindow('videos', entry)
                              return
                            }
                            await openSystemPath(entry.path)
                          })()}
                        >
                          <strong>{entry.name}</strong>
                          <span>{formatVolumeSize(entry.sizeBytes)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  function renderAboutContent() {
    return (
      <div className="about-panel">
        <span className="notes-chip about-chip">Acerca de este dispositivo</span>
        {loadingSystem ? <p>Cargando informacion real del equipo...</p> : null}
        {systemError ? <p>{systemError}</p> : null}
        {deviceInfo ? (
          <>
            <h2>{deviceInfo.hostname}</h2>
            <div className="info-grid">
              <article><strong>SO</strong><span>{deviceInfo.osName}</span></article>
              <article><strong>Release</strong><span>{deviceInfo.release}</span></article>
              <article><strong>CPU</strong><span>{deviceInfo.cpuModel}</span></article>
              <article><strong>RAM</strong><span>{deviceInfo.totalMemoryGb} GB</span></article>
              <article><strong>Arquitectura</strong><span>{deviceInfo.arch}</span></article>
              <article><strong>Uptime</strong><span>{deviceInfo.uptimeHours} horas</span></article>
            </div>
          </>
        ) : null}
      </div>
    )
  }

  function renderLauncherContent() {
    return (
      <div className="launcher-panel">
        <h2>Aplicaciones del sistema</h2>
        <p>{deviceInfo ? `Mostrando apps para ${deviceInfo.osName}` : 'Detectando sistema...'}</p>
        <div className="apps-list launcher-grid">
          {installedApps.slice(0, 40).map((app) => (
            <button
              key={app.id}
              type="button"
              className="app-row launch-card"
              onClick={() => void launchSystemApp(app.launchTarget || app.target)}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('application/json', JSON.stringify(app))
                event.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <strong>{app.name}</strong>
              <span>{app.source}</span>
              <span className="pin-hint" onClick={(event) => {
                event.stopPropagation()
                pinInstalledAppToDock(app)
              }}>Fijar al dock</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  function renderLauncherPopup() {
    const filteredApps = installedApps
      .filter((app) => app.name.toLowerCase().includes(launcherSearch.trim().toLowerCase()))
      .slice(0, 80)
    const appsPerPage = 16
    const totalLauncherPages = Math.max(1, Math.ceil(filteredApps.length / appsPerPage))
    const currentLauncherPage = Math.min(launcherPage, totalLauncherPages - 1)
    const pagedApps = filteredApps.slice(
      currentLauncherPage * appsPerPage,
      currentLauncherPage * appsPerPage + appsPerPage,
    )

    return (
      <AnimatePresence>
        {launcherOpen ? (
          <div
            ref={launcherPanelRef}
          >
            <div className="launchpad-shell">
              <motion.div
                className="launchpad-panel"
                initial={{ opacity: 0, y: 18, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.99 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="launchpad-search-wrap">
                  <input
                    className="launchpad-search"
                    value={launcherSearch}
                    onChange={(event) => {
                      setLauncherSearch(event.target.value)
                      setLauncherPage(0)
                    }}
                    placeholder="Buscar apps"
                  />
                </div>
                {loadingSystem ? <p className="launchpad-empty">Buscando aplicaciones del dispositivo...</p> : null}
                {!loadingSystem && systemError ? <p className="launchpad-empty">{systemError}</p> : null}
                {!loadingSystem && !systemError && filteredApps.length === 0 ? (
                  <p className="launchpad-empty">No se encontraron aplicaciones para este sistema.</p>
                ) : null}
                {filteredApps.length > 0 ? (
                  <div className="launchpad-pages">
                    {totalLauncherPages > 1 ? (
                      <button
                        type="button"
                        className="launchpad-nav launchpad-nav-prev"
                        onClick={() => setLauncherPage((current) => Math.max(0, current - 1))}
                        disabled={currentLauncherPage === 0}
                        aria-label="Pagina anterior"
                      >
                        ‹
                      </button>
                    ) : null}
                    <div className="launchpad-grid">
                      {pagedApps.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          className="launchpad-app"
                          onClick={() => void launchSystemApp(app.launchTarget || app.target)}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/json', JSON.stringify(app))
                            event.dataTransfer.effectAllowed = 'copy'
                          }}
                        >
                          <span className="launchpad-app-icon">{getAppLauncherIcon(app)}</span>
                          <strong>{app.name}</strong>
                          <span>{app.source}</span>
                        </button>
                      ))}
                    </div>
                    {totalLauncherPages > 1 ? (
                      <button
                        type="button"
                        className="launchpad-nav launchpad-nav-next"
                        onClick={() => setLauncherPage((current) => Math.min(totalLauncherPages - 1, current + 1))}
                        disabled={currentLauncherPage >= totalLauncherPages - 1}
                        aria-label="Pagina siguiente"
                      >
                        ›
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {filteredApps.length > 0 && totalLauncherPages > 1 ? (
                  <div className="launchpad-pagination" aria-label="Paginas del lanzador">
                    {Array.from({ length: totalLauncherPages }, (_, index) => (
                      <span
                        key={`launchpad-page-${index}`}
                        className={`launchpad-page-dot${index === currentLauncherPage ? ' active' : ''}`}
                      />
                    ))}
                  </div>
                ) : null}
              </motion.div>
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    )
  }

  function renderCalculatorContent(windowItem: WindowState) {
    const calculatorState = windowItem.calculatorState ?? createCalculatorState()
    const keys: Array<Array<{ label: string; kind: 'function' | 'operator' | 'digit' | 'wide'; action: () => void; active?: boolean }>> = [
      [
        { label: 'AC', kind: 'function', action: () => clearCalculator(windowItem.id) },
        { label: '±', kind: 'function', action: () => toggleCalculatorSign(windowItem.id) },
        { label: '%', kind: 'function', action: () => inputCalculatorPercent(windowItem.id) },
        { label: '÷', kind: 'operator', action: () => chooseCalculatorOperator(windowItem.id, '/'), active: calculatorState.operator === '/' },
      ],
      [
        { label: '7', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '7') },
        { label: '8', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '8') },
        { label: '9', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '9') },
        { label: '×', kind: 'operator', action: () => chooseCalculatorOperator(windowItem.id, '×'), active: calculatorState.operator === '×' },
      ],
      [
        { label: '4', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '4') },
        { label: '5', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '5') },
        { label: '6', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '6') },
        { label: '−', kind: 'operator', action: () => chooseCalculatorOperator(windowItem.id, '-'), active: calculatorState.operator === '-' },
      ],
      [
        { label: '1', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '1') },
        { label: '2', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '2') },
        { label: '3', kind: 'digit', action: () => inputCalculatorDigit(windowItem.id, '3') },
        { label: '+', kind: 'operator', action: () => chooseCalculatorOperator(windowItem.id, '+'), active: calculatorState.operator === '+' },
      ],
      [
        { label: '0', kind: 'wide', action: () => inputCalculatorDigit(windowItem.id, '0') },
        { label: ',', kind: 'digit', action: () => inputCalculatorDecimal(windowItem.id) },
        { label: '=', kind: 'operator', action: () => evaluateCalculator(windowItem.id) },
      ],
    ]

    return (
      <div className="calculator-view">
        <div className="calculator-display-wrap">
          <span className="calculator-mode">{calculatorState.operator ?? 'Calculadora'}</span>
          <output className="calculator-display">{calculatorState.display}</output>
        </div>
        <div className="calculator-grid">
          {keys.flat().map((key, index) => (
            <button
              key={`${key.label}-${index}`}
              type="button"
              className={`calculator-key ${key.kind}${key.active ? ' active' : ''}`}
              onClick={key.action}
            >
              {key.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  function renderDisplayContent() {
    return (
      <div className="display-preferences">
        <section className="display-card">
          <div>
            <strong>Apariencia</strong>
            <p>Elige si quieres mantener el look actual o usar modo oscuro.</p>
          </div>
          <div className="appearance-toggle">
            <button
              type="button"
              className={appearanceMode === 'classic' ? 'active' : ''}
              onClick={() => setAppearanceMode('classic')}
            >
              Claro actual
            </button>
            <button
              type="button"
              className={appearanceMode === 'dark' ? 'active' : ''}
              onClick={() => setAppearanceMode('dark')}
            >
              Oscuro
            </button>
          </div>
        </section>

        <section className="display-card">
          <div>
            <strong>Fondos de pantalla</strong>
            <p>Presets locales optimizados para este entorno.</p>
          </div>
          <div className="wallpaper-grid">
            {WALLPAPER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`wallpaper-preset${wallpaperId === preset.id ? ' active' : ''}`}
                onClick={() => setWallpaperId(preset.id)}
              >
                <span className="wallpaper-swatch" style={{ background: preset.background }} />
                <strong>{preset.name}</strong>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  function createNote() {
    const nextNote: NoteItem = {
      id: `note-${Date.now()}`,
      title: 'Nueva nota',
      body: '',
      updatedAt: Date.now(),
    }

    setNotes((current) => [nextNote, ...current])
    setSelectedNoteId(nextNote.id)
  }

  function updateNote(noteId: string, patch: Partial<Pick<NoteItem, 'title' | 'body'>>) {
    setNotes((current) =>
      current
        .map((note) =>
          note.id === noteId
            ? {
                ...note,
                ...patch,
                updatedAt: Date.now(),
              }
            : note,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
    )
  }

  function deleteNote(noteId: string) {
    setNotes((current) => current.filter((note) => note.id !== noteId))
  }

  function renderNotesContent() {
    return (
      <div className="notes-view">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-head">
            <span className="notes-chip">Notas</span>
            <button type="button" onClick={createNote}>Nueva</button>
          </div>
          <div className="notes-list">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={`notes-list-item${note.id === activeNote?.id ? ' active' : ''}`}
                onClick={() => setSelectedNoteId(note.id)}
              >
                <strong>{note.title || 'Sin titulo'}</strong>
                <span>{new Date(note.updatedAt).toLocaleDateString('es-CL')}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="notes-editor">
          {activeNote ? (
            <>
              <div className="notes-editor-actions">
                <button type="button" onClick={() => deleteNote(activeNote.id)}>Eliminar</button>
              </div>
              <input
                className="notes-title-input"
                value={activeNote.title}
                onChange={(event) => updateNote(activeNote.id, { title: event.target.value })}
                placeholder="Titulo"
              />
              <textarea
                className="notes-body-input"
                value={activeNote.body}
                onChange={(event) => updateNote(activeNote.id, { body: event.target.value })}
                placeholder="Escribe aqui..."
              />
            </>
          ) : (
            <div className="notes-empty-state">
              <p>No hay notas todavia.</p>
              <button type="button" onClick={createNote}>Crear primera nota</button>
            </div>
          )}
        </section>
      </div>
    )
  }

  function renderControlCenter() {
    return (
      <AnimatePresence>
        {controlCenterOpen ? (
          <motion.div
            ref={controlCenterRef}
            className="control-center"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="control-card-grid">
              <button type="button" className="control-card">
                <span className="control-pill-icon">Wi</span>
                <strong>Wi-Fi</strong>
              </button>
              <button type="button" className="control-card">
                <span className="control-pill-icon">Bt</span>
                <strong>Bluetooth</strong>
              </button>
              <button type="button" className="control-card">
                <span className="control-pill-icon">DnD</span>
                <strong>No molestar</strong>
              </button>
              <button type="button" className="control-card">
                <span className="control-pill-icon">⚡</span>
                <strong>{deviceInfo ? deviceInfo.osName : 'Sistema'}</strong>
              </button>
              <button type="button" className="control-card" onClick={() => {
                setControlCenterOpen(false)
                openApp('display')
              }}>
                <span className="control-pill-icon">{appearanceMode === 'dark' ? '◐' : '◑'}</span>
                <strong>Pantalla</strong>
              </button>
            </div>

            <div className="control-slider-card">
              <div className="control-slider-head">
                <strong>Brillo</strong>
                <span>{systemControls.brightness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={systemControls.brightness}
                disabled={!systemControls.supportsBrightness}
                onInput={(event) => {
                  updateSystemControls({ brightness: Number(event.currentTarget.value) })
                }}
                onChange={(event) => {
                  updateSystemControls({ brightness: Number(event.currentTarget.value) }, true)
                }}
              />
              {!systemControls.supportsBrightness ? <span className="control-note">No disponible en este equipo.</span> : null}
            </div>

            <div className="control-slider-card">
              <div className="control-slider-head">
                <strong>Volumen</strong>
                <span>{systemControls.volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={systemControls.volume}
                disabled={!systemControls.supportsVolume}
                onInput={(event) => {
                  updateSystemControls({ volume: Number(event.currentTarget.value) })
                }}
                onChange={(event) => {
                  updateSystemControls({ volume: Number(event.currentTarget.value) }, true)
                }}
              />
              {!systemControls.supportsVolume ? <span className="control-note">No disponible en este equipo.</span> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    )
  }

  function renderBrowserContent(windowItem: WindowState) {
    const browserState = windowItem.browserState
    if (!browserState) {
      return null
    }

    const currentUrl = browserState.history[browserState.historyIndex]
    const canGoBack = browserState.historyIndex > 0
    const canGoForward = browserState.historyIndex < browserState.history.length - 1
    const isHome = isSafariHomeUrl(currentUrl)
    const isBlocked = isBlockedEmbeddedPage(browserState.lastError)

    return (
      <div className="browser-view chrome-view">
        <div className="browser-controls">
          <div className="finder-nav-group browser-actions">
            <button type="button" disabled={!canGoBack} onClick={() => moveBrowserHistory(windowItem.id, -1)}>
              Atras
            </button>
            <button type="button" disabled={!canGoForward} onClick={() => moveBrowserHistory(windowItem.id, 1)}>
              Adelante
            </button>
            <button type="button" onClick={() => reloadBrowser(windowItem.id)}>
              Recargar
            </button>
            <button
              type="button"
              onClick={() =>
                commitBrowserNavigation(
                  windowItem.id,
                  SAFARI_HOME_URL,
                )
              }
            >
              Home
            </button>
          </div>
          <form
            className="browser-address-form"
            onSubmit={(event) => {
              event.preventDefault()
              commitBrowserNavigation(windowItem.id, browserState.inputValue)
            }}
          >
            <input
              className="browser-address-input"
              value={browserState.inputValue}
              onChange={(event) => setBrowserInput(windowItem.id, event.target.value)}
              placeholder="Escribe URL o busqueda"
            />
          </form>
        </div>
        <div className="browser-page browser-page-live">
          {!isHome && (browserState.loading || browserState.lastError || browserState.title) ? (
            <div className="browser-meta">
              {browserState.title ? <strong>{browserState.title}</strong> : null}
              {browserState.loading ? <span>Cargando pagina...</span> : null}
              {browserState.lastError ? <span className="browser-error">{browserState.lastError}</span> : null}
              {isBlocked ? (
                <button type="button" onClick={() => openBrowserExternally(currentUrl)}>
                  Abrir en navegador externo
                </button>
              ) : null}
            </div>
          ) : null}
          {isHome ? (
            <div className="mactorno-home">
              <div className="mactorno-logo-wrap">
                <h1 className="mactorno-logo">
                  <span>Mac</span>
                  <span>torno</span>
                </h1>
                <p>Una portada inspirada en Google para tu navegador del escritorio.</p>
              </div>

              <form
                className="mactorno-search"
                onSubmit={(event) => {
                  event.preventDefault()
                  commitBrowserNavigation(windowItem.id, browserState.inputValue)
                }}
              >
                <input
                  className="mactorno-search-input"
                  value={browserState.inputValue === SAFARI_HOME_URL ? '' : browserState.inputValue}
                  onChange={(event) => setBrowserInput(windowItem.id, event.target.value)}
                  placeholder="Buscar en la web o escribir una URL"
                />
                <div className="mactorno-home-actions">
                  <button type="submit">Buscar</button>
                  <button
                    type="button"
                    onClick={() => commitBrowserNavigation(windowItem.id, 'coffeewaffles.cl')}
                  >
                    Voy a Coffeewaffles
                  </button>
                </div>
              </form>
            </div>
          ) : isElectronDesktop ? (
            <>
              <div
                className="browser-frame browser-host"
                ref={(node) => {
                  browserHostRefs.current[windowItem.id] = node
                }}
              />
            </>
          ) : (
            <>
              <iframe
                key={`${currentUrl}-${browserState.reloadKey}`}
                className="browser-frame"
                src={currentUrl}
                title={`Navegador ${windowItem.id}`}
                referrerPolicy="no-referrer"
              />
            </>
          )}
        </div>
      </div>
    )
  }

  function renderPhotoContent(windowItem: WindowState) {
    const mediaPath = windowItem.mediaPath
    const photoView = getPhotoViewState(windowItem.id)
    if (!mediaPath) {
      return (
        <div className="media-view photo-view">
          <div className="media-empty-state">
            <strong>Fotos</strong>
            <p>Abre una imagen desde Finder para verla aqui.</p>
            <div className="media-actions">
              <button type="button" onClick={() => void pickMediaFile(windowItem.id, 'photo')}>
                Abrir imagen
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="media-view photo-view">
        <div className="media-toolbar">
          <div className="media-actions">
            <button type="button" onClick={() => void pickMediaFile(windowItem.id, 'photo')}>
              Abrir imagen
            </button>
            <button type="button" onClick={() => void revealSystemPath(mediaPath)}>
              Mostrar en carpeta
            </button>
            <button type="button" onClick={() => void openSystemPath(mediaPath)}>
              Abrir con el sistema
            </button>
          </div>
          <span className="media-path">{`${Math.round(photoView.zoom * 100)}% · ${photoView.rotation}° · ${mediaPath}`}</span>
        </div>
        <PhotoViewer
          src={getMediaSource(mediaPath)}
          alt={windowItem.title}
          zoom={photoView.zoom}
          rotation={photoView.rotation}
        />
      </div>
    )
  }

  function renderVideoContent(windowItem: WindowState) {
    const mediaPath = windowItem.mediaPath
    const playback = videoPlaybackState[windowItem.id] ?? { playing: false, muted: false, rate: 1 }
    if (!mediaPath) {
      return (
        <div className="media-view video-view">
          <div className="media-empty-state">
            <strong>Videos</strong>
            <p>Abre un video desde Finder para reproducirlo aqui.</p>
            <div className="media-actions">
              <button type="button" onClick={() => void pickMediaFile(windowItem.id, 'video')}>
                Abrir video
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="media-view video-view">
        <div className="media-toolbar">
          <div className="media-actions">
            <button type="button" onClick={() => void pickMediaFile(windowItem.id, 'video')}>
              Abrir video
            </button>
            <button type="button" onClick={() => void revealSystemPath(mediaPath)}>
              Mostrar en carpeta
            </button>
            <button type="button" onClick={() => void openSystemPath(mediaPath)}>
              Abrir con el sistema
            </button>
          </div>
          <span className="media-path">{`${playback.playing ? 'Reproduciendo' : 'Pausado'} · ${playback.muted ? 'Mute' : 'Audio'} · x${playback.rate} · ${mediaPath}`}</span>
        </div>
        <VideoPlayer
          src={getMediaSource(mediaPath)}
          videoRef={(node) => registerVideoElement(windowItem.id, node)}
          onPlaybackStateChange={() => updateVideoPlaybackMeta(windowItem.id)}
        />
      </div>
    )
  }

  function renderWindowContent(windowItem: WindowState) {
    switch (windowItem.appId) {
      case 'finder':
        return renderFinderContent(windowItem)
      case 'about':
        return renderAboutContent()
      case 'launcher':
        return renderLauncherContent()
      case 'notes':
        return renderNotesContent()
      case 'calculator':
        return renderCalculatorContent(windowItem)
      case 'display':
        return renderDisplayContent()
      case 'photos':
        return renderPhotoContent(windowItem)
      case 'safari':
        return renderBrowserContent(windowItem)
      case 'videos':
        return renderVideoContent(windowItem)
      case 'terminal':
        return (
          <div className="terminal-view">
            <div className="terminal-header">
              <strong>{windowItem.terminalState?.cwd ?? (deviceInfo?.homeDir ?? 'C:\\')}</strong>
              <span className="terminal-muted">{windowItem.terminalState?.busy ? 'Ejecutando...' : 'Listo'}</span>
            </div>
            <div className="terminal-history">
              {(windowItem.terminalState?.history ?? []).map((entry) => (
                <div key={entry.id} className="terminal-block">
                  <p>
                    <span className="terminal-prompt">visitor@mactorno %</span> {entry.command}
                  </p>
                  {entry.output ? <pre className="terminal-output">{entry.output}</pre> : null}
                  {entry.error ? <pre className="terminal-output terminal-error-output">{entry.error}</pre> : null}
                </div>
              ))}
            </div>
            <form
              className="terminal-input-row"
              onSubmit={(event) => {
                event.preventDefault()
                void runTerminalCommand(windowItem.id)
              }}
            >
              <span className="terminal-prompt">visitor@mactorno %</span>
              <input
                className="terminal-input"
                value={windowItem.terminalState?.input ?? ''}
                onChange={(event) =>
                  updateTerminalWindow(windowItem.id, (state) => ({ ...state, input: event.target.value }))
                }
                placeholder="Escribe un comando..."
              />
            </form>
          </div>
        )
      default:
        return null
    }
  }

  if (!loggedIn) {
    return (
      <main className="login-screen">
        <div className="login-panel">
          <div className="avatar-shell">ME</div>
          <p className="welcome-tag">Mini macOS local</p>
          <h1>Mactorno</h1>
          <p className="welcome-copy">
            Pantalla de acceso inspirada en macOS. Sin clave: entra directo al escritorio.
          </p>
          <button type="button" onClick={() => setLoggedIn(true)}>
            Ingresar
          </button>
        </div>
      </main>
    )
  }

  return (
    <main
      className={`desktop-shell appearance-${appearanceMode}`}
      style={{ '--desktop-background': wallpaperPreset.background } as CSSProperties}
    >
      <header className="menu-bar">
        <div className="menu-left" ref={menuBarRef}>
          <button type="button" className="apple-mark apple-button" onClick={() => openApp('about')}>
            M
          </button>
          <strong>{activeApp.name}</strong>
          {activeApp.menu.map((item) => {
            const actions = getAppMenuActions(activeWindow, item)
            if (actions.length === 0) {
              return <span key={item}>{item}</span>
            }

            return (
              <div key={item} className="menu-entry-wrap">
                <button
                  type="button"
                  className={`menu-entry-button${openAppMenu === item ? ' open' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenAppMenu((current) => current === item ? null : item)
                  }}
                >
                  {item}
                </button>
                {openAppMenu === item ? (
                  <div className="app-menu-dropdown">
                    {actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => void runAppMenuAction(action.id)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="menu-right">
          <button
            type="button"
            className="control-center-toggle"
            onMouseDown={(event) => {
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              setControlCenterOpen((current) => !current)
            }}
            aria-label="Abrir centro de control"
          >
            <span className="control-center-icon" aria-hidden="true">
              <span className="control-center-line line-top">
                <span className="control-center-knob" />
              </span>
              <span className="control-center-line line-bottom">
                <span className="control-center-knob" />
              </span>
            </span>
          </button>
          <span>{deviceInfo ? deviceInfo.osName : 'Localhost'}</span>
          <span>{clock}</span>
        </div>
      </header>

      {renderControlCenter()}

      <section className="desktop-canvas">
        <div className="wallpaper-glow wallpaper-glow-a" />
        <div className="wallpaper-glow wallpaper-glow-b" />

        {deviceInfo?.volumes.map((volume, index) => {
          const position = getDesktopVolumePosition(volume, index)
          return (
            <button
              key={volume.mount}
              type="button"
              className="desktop-volume-icon"
              style={{ left: position.x, top: position.y }}
              onPointerDown={(event) => startDesktopVolumeDrag(event, volume.mount)}
              onClick={() => openDesktopVolume(volume.mount)}
            >
              <img
                className={`desktop-volume-art ${getDesktopVolumeKind(volume)}`}
                src={getDesktopVolumeIconSrc(volume)}
                alt=""
                draggable={false}
              />
              <strong>{volume.name}</strong>
              <span>{formatVolumeLabel(volume.mount)}</span>
            </button>
          )
        })}

        {windows
          .filter((item) => !item.minimized)
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((item) => {
            const app = getResolvedApp(item.appId)
            const isActive = activeWindow?.id === item.id
            const title =
              item.appId === 'finder'
                ? `Finder · ${getFinderLabel(getActiveFinderRoute(item.finderState))}`
                : item.title

            return (
              <article
                key={item.id}
                className={`app-window app-${item.appId}${isActive ? ' active' : ''}${item.genie ? ' is-genie' : ''}${item.maximized ? ' maximized' : ''}`}
                style={{
                  width: item.width,
                  height: item.height,
                  transform: `translate(${item.x}px, ${item.y}px)`,
                  zIndex: item.zIndex,
                  borderRadius: item.maximized ? 0 : WINDOW_RADIUS,
                }}
                onPointerDown={() => focusWindow(item.id)}
                ref={(node) => {
                  windowRefs.current[item.id] = node
                }}
              >
                <div
                  className="window-frame"
                  style={{ borderRadius: item.maximized ? 0 : WINDOW_RADIUS }}
                  ref={(node) => {
                    windowFrameRefs.current[item.id] = node
                  }}
                >
                  <div
                    className="window-toolbar"
                    style={{ borderRadius: item.maximized ? 0 : undefined }}
                    onPointerDown={(event) => startDrag(event, item.id)}
                    onDoubleClick={() => toggleMaximize(item.id)}
                  >
                    <div className="traffic-lights">
                      <button
                        type="button"
                        className="light close"
                        aria-label={`Cerrar ${title}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => closeWindow(item.id)}
                      />
                      <button
                        type="button"
                        className="light minimize"
                        aria-label={`Minimizar ${title}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => minimizeWindow(item.id)}
                      />
                      <button
                        type="button"
                        className="light zoom"
                        aria-label={`${item.maximized ? 'Restaurar' : 'Expandir'} ${title}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => toggleMaximize(item.id)}
                      />
                    </div>
                    <div className="window-title">
                      <span className="window-app-icon" style={{ background: app.accent }}>
                        {renderDockIconContent(app.iconSpec)}
                      </span>
                      <span>{title}</span>
                    </div>
                  </div>
                  <div className="window-content" style={{ borderRadius: item.maximized ? 0 : undefined }}>
                    {renderWindowContent(item)}
                  </div>
                  <div
                    className={`resize-handle${item.maximized ? ' disabled' : ''}`}
                    onPointerDown={(event) => startResize(event, item.id)}
                  />
                </div>
              </article>
            )
          })}
      </section>

      {contextMenu?.type === 'finder' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => navigateFinder(contextMenu.windowId, contextMenu.route)}>
            Abrir {contextMenu.label}
          </button>
          <button type="button" onClick={() => openFinderTab(contextMenu.windowId, contextMenu.route)}>
            Abrir en nueva pestana
          </button>
          <button type="button" onClick={() => openFinderWindow(contextMenu.route)}>
            Abrir en otra ventana
          </button>
        </div>
      ) : null}

      {contextMenu?.type === 'dock-app' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => openApp(contextMenu.appId)}>
            Abrir {contextMenu.label}
          </button>
          {dockItems.includes(contextMenu.appId) ? (
            <button
              type="button"
              onClick={() => {
                unpinBuiltInAppFromDock(contextMenu.appId)
                setContextMenu(null)
              }}
            >
              Quitar del dock
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                pinBuiltInAppToDock(contextMenu.appId)
                setContextMenu(null)
              }}
            >
              Mantener en dock
            </button>
          )}
        </div>
      ) : null}

      {contextMenu?.type === 'dock-custom' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              removeCustomDockItem(contextMenu.itemId)
              setContextMenu(null)
            }}
          >
            Quitar {contextMenu.label} del dock
          </button>
        </div>
      ) : null}

      {contextMenu?.type === 'dock-volume' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              openDesktopVolume(contextMenu.mount)
              setContextMenu(null)
            }}
          >
            Abrir {contextMenu.label}
          </button>
          <button
            type="button"
            onClick={() => {
              pinVolumeToDock(contextMenu.mount)
              setContextMenu(null)
            }}
          >
            Mantener en dock
          </button>
        </div>
      ) : null}

      {renderLauncherPopup()}

      <footer className="dock-wrap">
        <motion.div
          className="dock"
          ref={dockRef}
          onMouseEnter={() => {
            measureDockCenters()
          }}
          onMouseMove={(event) => {
            queueDockMouseUpdate(event.pageX)
          }}
          onMouseLeave={() => {
            pendingDockMouseX.current = Infinity
            if (dockMouseFrameRef.current !== null) {
              window.cancelAnimationFrame(dockMouseFrameRef.current)
              dockMouseFrameRef.current = null
            }
            dockMouseX.set(Infinity)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(event) => {
            event.preventDefault()
            const payload = event.dataTransfer.getData('application/json')
            if (!payload) {
              return
            }

            try {
              const app = JSON.parse(payload) as InstalledApp
              if (app?.id && app?.name && app?.target) {
                pinInstalledAppToDock(app)
              }
            } catch {
              // Ignora payloads que no correspondan a apps instaladas.
            }
          }}
        >
          {visibleDockAppIds.map((appId) => {
            const app = getResolvedApp(appId)
            const isOpen = windows.some((item) => item.appId === app.id)
            return (
              <DockIconButton
                key={app.id}
                id={app.id}
                name={app.name}
                accent={app.accent}
                icon={app.iconSpec}
                isOpen={isOpen}
                mouseX={dockMouseX}
                centerX={dockCenters[app.id] ?? -9999}
                onActivate={() => openApp(app.id)}
                registerRef={registerDockItemRef}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openContextMenuAt({
                    type: 'dock-app',
                    appId: app.id,
                    label: app.name,
                  }, event.clientX, event.clientY)
                }}
              />
            )
          })}
          {customDockItems.map((item) => (
            <DockIconButton
              key={item.id}
              id={item.id}
              name={item.name}
              accent={item.accent}
              icon={item.icon}
              isOpen={false}
              mouseX={dockMouseX}
              centerX={dockCenters[item.id] ?? -9999}
              onActivate={() => {
                void activateCustomDockItem(item)
              }}
              registerRef={registerDockItemRef}
              onContextMenu={(event) => {
                event.preventDefault()
                openContextMenuAt({
                  type: 'dock-custom',
                  itemId: item.id,
                  label: item.name,
                }, event.clientX, event.clientY)
              }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', item.id)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={(event) => handleDockIconDragEnd(event, item.id, true)}
            />
          ))}
          {visibleVolumeDockItems.map((item) => (
            <DockIconButton
              key={item.id}
              id={item.id}
              name={item.name}
              accent={item.accent}
              icon={item.icon}
              isOpen
              mouseX={dockMouseX}
              centerX={dockCenters[item.id] ?? -9999}
              onActivate={() => {
                void activateCustomDockItem(item)
              }}
              registerRef={registerDockItemRef}
              onContextMenu={(event) => {
                event.preventDefault()
                const mount = getVolumeMountFromRoute(item.target as FinderRoute)
                if (!mount) {
                  return
                }
                openContextMenuAt({
                  type: 'dock-volume',
                  mount,
                  label: item.name,
                }, event.clientX, event.clientY)
              }}
            />
          ))}
        </motion.div>
      </footer>
    </main>
  )
}

export default App

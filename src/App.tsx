import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
} from 'motion/react'
import loginWallpaperSvg from './assets/login-wallpaper.svg'
import { FinderApplicationsPanel, FinderCard, FinderDesktopPanel, FinderFileTile, FinderListHeader, FinderSidebar, FinderVolumePanel } from './app/components/finder'
import { DockIconButton, PhotoViewer, VideoPlayer } from './app/components/media-and-dock'
import { AboutPanel, DisplayPanel, LauncherPanel, LauncherPopup } from './app/components/system-panels'
import { VideoThumbnail } from './app/components/video-thumbnail'
import { getApp, getDesktopVolumeIconSrc, getDesktopVolumeKind, getDocumentPreviewIcon, getFinderLabel, getMediaSource, getPathLeaf, getVolumeMountFromRoute, getVolumePathFromRoute, isImageEntry, isVideoEntry, normalizeIconSpec, parseVolumeEntryPayload, readIconFile, renderDockIconContent, renderInstalledAppIcon, resolvePublicAssetPath, serializeVolumeEntryPayload } from './app/helpers'
import { useDock } from './app/hooks/useDock'
import { useFinder } from './app/hooks/useFinder'
import { useSystemData } from './app/hooks/useSystemData'
import type {
  AppId,
  AppMenuAction,
  BrowserState,
  BrowserTab,
  CalculatorState,
  ContextMenuState,
  CustomDockItem,
  DesktopApp,
  DesktopItem,
  DesktopItemDragState,
  DesktopTrashDragState,
  DesktopVolumeDragState,
  DockIconSpec,
  DragState,
  FinderRoute,
  FinderSortMode,
  FinderState,
  FinderTab,
  FinderViewMode,
  InstalledApp,
  NoteItem,
  PhotoViewState,
  RectState,
  ResizeState,
  SystemControlPatch,
  SystemControlsState,
  TerminalState,
  VolumeEntry,
  VolumeInfo,
  WallpaperPreset,
  WallpaperSelection,
  WindowState,
} from './app/types'
import './App.css'

const MENU_BAR_HEIGHT = 28
const DOCK_BOTTOM = 0
const DOCK_HEIGHT = 82
const WINDOW_RADIUS = 8
const DESKTOP_SIDE_MARGIN = 24
const DESKTOP_TOP_GAP = 16
const DESKTOP_BOTTOM_GAP = 18
const MIN_WINDOW_WIDTH = 320
const MIN_WINDOW_HEIGHT = 220
const DESKTOP_VOLUME_POSITIONS_STORAGE_KEY = 'mactorno-desktop-volume-positions'
const DOCK_PINNED_ORDER_STORAGE_KEY = 'mactorno-dock-pinned-order'
const NOTES_STORAGE_KEY = 'mactorno-notes'
const WINDOW_SESSION_STORAGE_KEY = 'mactorno-window-session'
const RECENT_ITEMS_STORAGE_KEY = 'mactorno-recent-items'
const SYSTEM_CONTROLS_DEBOUNCE_MS = 120
const BROWSER_PROGRESS_SHOW_DELAY_MS = 120
const BROWSER_PROGRESS_MIN_VISIBLE_MS = 200
const BROWSER_PROGRESS_HIDE_DELAY_MS = 220
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
  { label: 'Mapas', icon: { kind: 'image', value: '/map.png' } },
  { label: 'Notas', icon: { kind: 'image', value: '/notas.png' } },
  { label: 'Safari', icon: { kind: 'image', value: '/safari.png' } },
  { label: 'Fotos', icon: { kind: 'image', value: '/fotos.png' } },
  { label: 'Videos', icon: { kind: 'image', value: '/video.png' } },
  { label: 'Calculadora', icon: { kind: 'image', value: '/calculator.png' } },
  { label: 'Terminal', icon: { kind: 'image', value: '/Terminalicon2.png' } },
  { label: 'Config', icon: { kind: 'image', value: '/config.png' } },
]

type ToastMessage = {
  id: string
  title: string
  detail?: string
  createdAt: number
  read: boolean
}

type RecentItem = {
  id: string
  key: string
  kind: 'app' | 'installed-app' | 'note' | 'document' | 'volume' | 'route' | 'path'
  title: string
  subtitle: string
  createdAt: number
  appId?: AppId
  installedAppId?: string
  noteId?: string
  itemId?: string
  route?: FinderRoute
  mount?: string
  path?: string
  icon?: DockIconSpec
}

type SystemDialogTone = 'default' | 'danger'

type SystemDialogState = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  tone?: SystemDialogTone
}

type DockFolderStackEntry = {
  key: string
  title: string
  subtitle: string
  icon: DockIconSpec
  action: () => void
}

type AltTabState = {
  open: boolean
  selectedIndex: number
}

type MissionControlState = {
  open: boolean
  selectedIndex: number
}

type QuickLookTarget = {
  key: string
  name: string
  subtitle: string
  kind: 'image' | 'video' | 'text' | 'folder' | 'file'
  path?: string | null
  extension?: string
  iconSrc?: string | null
  textContent?: string
  location?: string
}

type WindowSessionEntry = {
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
  finderState: FinderState | null
  browserState: BrowserState | null
  calculatorState: CalculatorState | null
  terminalState: TerminalState | null
  mediaPath: string | null
  textDocumentId: string | null
}

type StoredRecentItem = Omit<RecentItem, 'icon'> & {
  icon?: DockIconSpec
}

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
  { id: 'textedit', name: 'Documento', accent: 'linear-gradient(135deg, #f7faff 0%, #d6deeb 100%)', icon: 'T', menu: ['Archivo', 'Edicion', 'Formato', 'Ventana', 'Ayuda'], dockable: false },
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

function getDockPinnedAppKey(appId: AppId) {
  return `app:${appId}`
}

function getDockPinnedCustomKey(itemId: string) {
  return `custom:${itemId}`
}

function syncDockPinnedOrder(order: string[], dockItems: AppId[], customDockItems: CustomDockItem[]) {
  const validIds = [
    ...dockItems.map((item) => getDockPinnedAppKey(item)),
    ...customDockItems.map((item) => getDockPinnedCustomKey(item.id)),
  ]
  const validSet = new Set(validIds)
  const next = order.filter((item) => validSet.has(item))

  validIds.forEach((item) => {
    if (!next.includes(item)) {
      next.push(item)
    }
  })

  return next
}

function loadDockPinnedOrder(dockItems: AppId[], customDockItems: CustomDockItem[]) {
  const fallback = syncDockPinnedOrder([], dockItems, customDockItems)
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(DOCK_PINNED_ORDER_STORAGE_KEY)
    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? syncDockPinnedOrder(parsed.filter((item): item is string => typeof item === 'string'), dockItems, customDockItems) : fallback
  } catch {
    return fallback
  }
}

function moveDockPinnedItem(order: string[], draggedId: string, targetId: string) {
  if (draggedId === targetId) {
    return order
  }

  const draggedIndex = order.indexOf(draggedId)
  const targetIndex = order.indexOf(targetId)
  if (draggedIndex === -1 || targetIndex === -1) {
    return order
  }

  const next = [...order]
  next.splice(draggedIndex, 1)
  next.splice(targetIndex, 0, draggedId)
  return next
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

function createDesktopFolderRoute(itemId: string): FinderRoute {
  return `desktop-folder:${itemId}` as FinderRoute
}

function isDesktopFolderRoute(route: FinderRoute): route is `desktop-folder:${string}` {
  return route.startsWith('desktop-folder:')
}

function getDesktopFolderIdFromRoute(route: FinderRoute) {
  return isDesktopFolderRoute(route) ? route.slice('desktop-folder:'.length) : null
}

function isVolumeRoute(route: FinderRoute): route is `volume:${string}` {
  return route.startsWith('volume:')
}

function createVolumeSubRoute(mount: string, targetPath: string): FinderRoute {
  return `volume:${encodeURIComponent(mount)}::${encodeURIComponent(targetPath)}` as FinderRoute
}

const DESKTOP_ITEM_DRAG_MIME = 'application/x-mactorno-desktop-item'

function serializeDesktopItemDragPayload(itemId: string) {
  return JSON.stringify({ itemId })
}

function parseDesktopItemDragPayload(value: string) {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as { itemId?: unknown }
    return typeof parsed.itemId === 'string' && parsed.itemId ? parsed.itemId : null
  } catch {
    return null
  }
}

function formatVolumeLabel(mount: string) {
  return mount.replace(/[\\/]+$/, '')
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

function createDockItemId(prefix: string, value: string) {
  return `${prefix}-${encodeURIComponent(value)}`
}

function getDockPathEntry(targetPath: string, label?: string, icon?: string | null): VolumeEntry {
  const name = label || getPathLeaf(targetPath)
  const extensionMatch = name.match(/\.([^.]+)$/)
  return {
    name,
    path: targetPath,
    kind: 'file',
    extension: extensionMatch?.[1] ?? '',
    sizeBytes: null,
    icon: icon ?? null,
  }
}

function createPathDockItem(targetPath: string, label?: string, icon?: string | null): CustomDockItem {
  const entry = getDockPathEntry(targetPath, label, icon)
  const iconSpec =
    entry.icon
      ? { kind: 'image' as const, value: entry.icon }
      : isImageEntry(entry)
        ? { kind: 'image' as const, value: getMediaSource(targetPath) }
        : { kind: 'image' as const, value: getDocumentPreviewIcon(entry.name, entry.extension) }

  return {
    id: createDockItemId('path', targetPath),
    name: entry.name,
    target: targetPath,
    kind: 'path',
    icon: iconSpec,
    accent: 'transparent',
  }
}

function getWallpaperPreviewSource(selection: WallpaperSelection) {
  switch (selection.kind) {
    case 'preset': {
      const preset = WALLPAPER_PRESETS.find((item) => item.id === selection.value) ?? WALLPAPER_PRESETS[0]
      return { type: 'gradient' as const, value: preset.background, label: preset.name }
    }
    case 'asset':
      return { type: 'image' as const, value: loginWallpaperSvg, label: selection.name }
    case 'system':
      return { type: 'image' as const, value: getMediaSource(selection.value), label: selection.name }
    case 'upload':
      return { type: 'image' as const, value: selection.value, label: selection.name }
  }
}

function getWallpaperBackground(selection: WallpaperSelection) {
  const preview = getWallpaperPreviewSource(selection)
  return preview.type === 'gradient'
    ? preview.value
    : `url("${preview.value}") center center / cover no-repeat`
}

const MENU_TIME_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const LOGIN_DATE_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const LOGIN_TIME_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatTime(date: Date) {
  return MENU_TIME_FORMATTER.format(date)
}

function formatLoginDate(date: Date) {
  return LOGIN_DATE_FORMATTER.format(date)
}

function formatLoginTime(date: Date) {
  return LOGIN_TIME_FORMATTER.format(date)
}

function getFinderRouteIcon(route: FinderRoute) {
  if (isVolumeRoute(route)) {
    return '◫'
  }

  switch (route) {
    case 'computer':
      return '⌘'
    case 'desktop':
      return '⌂'
    case 'trash':
      return '🗑'
    case 'device':
      return '◌'
    case 'applications':
      return '▦'
    case 'dock':
      return '◩'
    case 'display':
      return '◱'
  }
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

function loadWindowSession() {
  if (typeof window === 'undefined') {
    return [] as WindowSessionEntry[]
  }

  try {
    const raw = window.localStorage.getItem(WINDOW_SESSION_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as WindowSessionEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadRecentItems() {
  if (typeof window === 'undefined') {
    return [] as RecentItem[]
  }

  try {
    const raw = window.localStorage.getItem(RECENT_ITEMS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as StoredRecentItem[]
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
  return { tabs: [tab], activeTabId: tab.id, viewMode: 'icons', sortMode: 'name' }
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
  const initialTab: BrowserTab = {
    id: `browser-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    history: [normalized],
    historyIndex: 0,
    inputValue: normalized,
    reloadKey: 0,
    loading: false,
    progress: 0,
    title: '',
    lastError: null,
  }
  return {
    tabs: [initialTab],
    activeTabId: initialTab.id,
    history: initialTab.history,
    historyIndex: initialTab.historyIndex,
    inputValue: initialTab.inputValue,
    reloadKey: initialTab.reloadKey,
    loading: initialTab.loading,
    progress: initialTab.progress,
    title: initialTab.title,
    lastError: initialTab.lastError,
  }
}

function getInitialBrowserUrl(isElectronDesktop: boolean) {
  return isElectronDesktop ? DEFAULT_BROWSER_URL : DEFAULT_WEB_FALLBACK_URL
}

function isSafariHomeUrl(url: string) {
  return url === SAFARI_HOME_URL
}

function getActiveBrowserTab(browserState: BrowserState) {
  return browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ?? browserState.tabs[0]
}

function syncBrowserState(browserState: BrowserState): BrowserState {
  const activeTab = getActiveBrowserTab(browserState)
  if (!activeTab) {
    return createBrowserState()
  }

  return {
    ...browserState,
    activeTabId: activeTab.id,
    history: activeTab.history,
    historyIndex: activeTab.historyIndex,
    inputValue: activeTab.inputValue,
    reloadKey: activeTab.reloadKey,
    loading: activeTab.loading,
    progress: activeTab.progress,
    title: activeTab.title,
    lastError: activeTab.lastError,
  }
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


function clampControlValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function getSearchScore(query: string, ...sources: Array<string | null | undefined>) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return 0
  }

  let bestScore = -1
  for (const source of sources) {
    const normalizedSource = normalizeSearchText(source ?? '')
    if (!normalizedSource) {
      continue
    }

    if (normalizedSource === normalizedQuery) {
      bestScore = Math.max(bestScore, 120)
      continue
    }

    if (normalizedSource.startsWith(normalizedQuery)) {
      bestScore = Math.max(bestScore, 90)
      continue
    }

    const wordMatch = normalizedSource
      .split(/\s+/)
      .some((part) => part.startsWith(normalizedQuery))
    if (wordMatch) {
      bestScore = Math.max(bestScore, 72)
      continue
    }

    if (normalizedSource.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 56)
    }
  }

  return bestScore
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [loginTransitioning, setLoginTransitioning] = useState(false)
  const [clock, setClock] = useState(() => {
    const now = new Date()
    return {
      menu: formatTime(now),
      loginDate: formatLoginDate(now),
      loginTime: formatLoginTime(now),
    }
  })
  const [windows, setWindows] = useState<WindowState[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [resize, setResize] = useState<ResizeState | null>(null)
  const [controlCenterOpen, setControlCenterOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [dockFolderStackItemId, setDockFolderStackItemId] = useState<string | null>(null)
  const [desktopVolumePositions, setDesktopVolumePositions] = useState<Record<string, { x: number; y: number }>>(() => loadDesktopVolumePositions())
  const [notes, setNotes] = useState<NoteItem[]>(() => loadNotes())
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [notificationHistory, setNotificationHistory] = useState<ToastMessage[]>([])
  const [recentItems, setRecentItems] = useState<RecentItem[]>(() => loadRecentItems())
  const [systemDialog, setSystemDialog] = useState<SystemDialogState | null>(null)
  const [altTabState, setAltTabState] = useState<AltTabState>({ open: false, selectedIndex: 0 })
  const [missionControlState, setMissionControlState] = useState<MissionControlState>({ open: false, selectedIndex: 0 })
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [launcherSearch, setLauncherSearch] = useState('')
  const [launcherPage, setLauncherPage] = useState(0)
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const [spotlightQuery, setSpotlightQuery] = useState('')
  const [spotlightSelectionIndex, setSpotlightSelectionIndex] = useState(0)
  const [quickLookCandidate, setQuickLookCandidate] = useState<QuickLookTarget | null>(null)
  const [quickLookTarget, setQuickLookTarget] = useState<QuickLookTarget | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [windowMorphIds, setWindowMorphIds] = useState<string[]>([])
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
  const dockFolderStackRef = useRef<HTMLDivElement | null>(null)
  const menuBarRef = useRef<HTMLDivElement | null>(null)
  const launcherPanelRef = useRef<HTMLDivElement | null>(null)
  const spotlightPanelRef = useRef<HTMLDivElement | null>(null)
  const spotlightInputRef = useRef<HTMLInputElement | null>(null)
  const controlCenterRef = useRef<HTMLDivElement | null>(null)
  const powerMenuRef = useRef<HTMLDivElement | null>(null)
  const statusMenusRef = useRef<HTMLDivElement | null>(null)
  const runningGenies = useRef(new Set<string>())
  const dragPreviewRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const dockDragItemIdRef = useRef<string | null>(null)
  const resizePreviewRef = useRef<{ id: string; width: number; height: number } | null>(null)
  const desktopVolumeDragRef = useRef<DesktopVolumeDragState | null>(null)
  const skipDesktopVolumeClickRef = useRef<string | null>(null)
  const desktopItemDragRef = useRef<DesktopItemDragState | null>(null)
  const skipDesktopItemClickRef = useRef<string | null>(null)
  const desktopTrashDragRef = useRef<DesktopTrashDragState | null>(null)
  const skipDesktopTrashClickRef = useRef(false)
  const pendingSystemControlsPatchRef = useRef<SystemControlPatch>({})
  const systemControlsFlushTimerRef = useRef<number | null>(null)
  const pendingDockMouseX = useRef<number | null>(null)
  const dockMouseFrameRef = useRef<number | null>(null)
  const windowsRef = useRef<WindowState[]>(windows)
  const browserSyncFrameRef = useRef<number | null>(null)
  const scheduleBrowserHostSyncRef = useRef<(() => void) | null>(null)
  const lastBrowserSyncSignatureRef = useRef('')
  const browserProgressResetTimersRef = useRef<Record<string, number>>({})
  const browserProgressShowTimersRef = useRef<Record<string, number>>({})
  const browserProgressVisibleSinceRef = useRef<Record<string, number>>({})
  const windowMorphTimersRef = useRef<Record<string, number>>({})
  const moveDesktopItemToFolderRef = useRef<(itemId: string, folderId: string) => void>(() => {})
  const moveDesktopItemToTrashRef = useRef<(itemId: string) => void>(() => {})
  const completeBrowserProgressRef = useRef<(windowId: string, hasError?: boolean) => void>(() => {})
  const activeSafariWindowIdRef = useRef<string | null>(null)
  const toastTimersRef = useRef<Record<string, number>>({})
  const dialogConfirmActionRef = useRef<(() => void) | null>(null)
  const sessionHydratedRef = useRef(false)
  const [dockCenters, setDockCenters] = useState<Record<string, number>>({})
  const [openAppMenu, setOpenAppMenu] = useState<string | null>(null)
  const [powerMenuOpen, setPowerMenuOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState<'wifi' | 'bluetooth' | null>(null)
  const [networkOnline, setNetworkOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [photoViewStates, setPhotoViewStates] = useState<Record<string, PhotoViewState>>({})
  const [videoPlaybackState, setVideoPlaybackState] = useState<Record<string, { playing: boolean; muted: boolean; rate: number }>>({})
  const {
    desktopClipboard,
    desktopItems,
    desktopTrashPosition,
    editingDesktopItemId,
    editingDesktopItemName,
    hasApplicationsFinderOpen,
    progressiveEntryPaths,
    rootDesktopItems,
    setDesktopClipboard,
    setDesktopItems,
    setDesktopTrashPosition,
    setEditingDesktopItemId,
    setEditingDesktopItemName,
    trashItems,
  } = useFinder({ windows })
  const {
    appearanceMode,
    desktopWallpaper,
    deviceInfo,
    initialLowEndDevice,
    installedApps,
    loadingSystem,
    loadingVolumeMounts,
    loadVolumeEntriesPage,
    loginWallpaper,
    performanceMode,
    resolvedPerformanceProfile,
    setAppearanceMode,
    setDesktopWallpaper,
    setLoginWallpaper,
    setLoadingVolumeMounts,
    setPerformanceMode,
    setSystemControls,
    setSystemError,
    setVisibleEntryCountsByPath,
    setVisibleInstalledAppsCount,
    setVolumeEntriesByMount,
    systemControls,
    systemError,
    visibleEntryCountsByPath,
    visibleInstalledAppsCount,
    volumeEntriesByMount,
    volumeEntryMetaByPath,
  } = useSystemData({
    hasApplicationsFinderOpen,
    launcherOpen,
    loggedIn,
    prefersReducedMotion,
    progressiveEntryPaths,
  })
  const {
    customDockItems,
    dockHoverAnimationEnabled,
    dockItems,
    openAppIds,
    resolvedApps,
    setAppVisualOverrides,
    setCustomDockItems,
    setDockHoverAnimationEnabled,
    setDockItems,
    visibleDockAppIds,
    visibleVolumeDockItems,
  } = useDock({ windows, deviceInfo })
  const [dockPinnedOrder, setDockPinnedOrder] = useState<string[]>(() => loadDockPinnedOrder(dockItems, customDockItems))
  const [runtimeDockItems, setRuntimeDockItems] = useState<CustomDockItem[]>([])
  const notificationUnreadCount = useMemo(
    () => notificationHistory.filter((item) => !item.read).length,
    [notificationHistory],
  )
  const connectionInfo = typeof navigator !== 'undefined' && 'connection' in navigator
    ? (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; saveData?: boolean } }).connection
    : undefined
  const wifiStatusSummary = networkOnline
    ? connectionInfo?.effectiveType
      ? `${String(connectionInfo.effectiveType).toUpperCase()}${connectionInfo.downlink ? ` · ${connectionInfo.downlink.toFixed(1)} Mb/s` : ''}`
      : 'Conectado'
    : 'Sin conexion'
  const bluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator
  const bluetoothStatusSummary = bluetoothSupported ? 'Disponible en este equipo' : 'No detectado'
  const desktopWallpaperBackground = getWallpaperBackground(desktopWallpaper)
  const loginWallpaperBackground = getWallpaperBackground(loginWallpaper)
  const maximizeAnimationDurationMs =
    resolvedPerformanceProfile === 'high' ? 320 : resolvedPerformanceProfile === 'balanced' ? 240 : 0
  const activeNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null
  const videoElementRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const visibleWindowCount = useMemo(
    () => windows.filter((item) => !item.minimized && !item.genie?.removeOnFinish).length,
    [windows],
  )
  const activeWindow = useMemo(
    () =>
      [...windows]
        .filter((item) => !item.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0],
    [windows],
  )
  const activeSafariWindow = useMemo(
    () =>
      [...windows]
        .filter((item) => item.appId === 'safari' && !item.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0],
    [windows],
  )
  const visibleWindows = useMemo(
    () =>
      windows
        .filter((item) => !item.minimized)
        .sort((left, right) => left.zIndex - right.zIndex),
    [windows],
  )
  const altTabCandidates = useMemo(
    () =>
      [...windows]
        .filter((item) => !item.minimized && !item.genie?.removeOnFinish)
        .sort((left, right) => right.zIndex - left.zIndex),
    [windows],
  )
  const missionControlCandidates = useMemo(
    () =>
      [...windows]
        .filter((item) => !item.minimized && !item.genie?.removeOnFinish)
        .sort((left, right) => right.zIndex - left.zIndex),
    [windows],
  )
  const orderedDockAppIds = useMemo(() => {
    const pinnedAppIds = new Set(dockItems)
    const orderedPinnedAppIds = dockPinnedOrder
      .filter((item) => item.startsWith('app:'))
      .map((item) => item.slice('app:'.length) as AppId)
      .filter((item) => pinnedAppIds.has(item))
    const runningOnlyAppIds = visibleDockAppIds.filter((item) => !pinnedAppIds.has(item))

    return [...orderedPinnedAppIds, ...runningOnlyAppIds]
  }, [dockItems, dockPinnedOrder, visibleDockAppIds])
  const orderedCustomDockItems = useMemo(() => {
    const itemById = new Map(customDockItems.map((item) => [item.id, item]))
    return dockPinnedOrder
      .filter((item) => item.startsWith('custom:'))
      .map((item) => itemById.get(item.slice('custom:'.length)))
      .filter((item): item is CustomDockItem => !!item)
  }, [customDockItems, dockPinnedOrder])
  const pinnedCustomTargets = useMemo(
    () => new Set(customDockItems.map((item) => `${item.kind}::${item.target}`)),
    [customDockItems],
  )
  const windowDockItems = useMemo(() => {
    const next = new Map<string, CustomDockItem>()

    windows.forEach((windowItem) => {
      if (windowItem.genie?.removeOnFinish) {
        return
      }

      if (windowItem.appId === 'finder' && windowItem.finderState) {
        const route = getActiveFinderRoute(windowItem.finderState)
        if (route.startsWith('desktop-folder:')) {
          const itemId = route.slice('desktop-folder:'.length)
          const folder = desktopItems.find((item) => item.id === itemId && item.kind === 'folder')
          if (folder) {
            next.set(route, {
              id: createDockItemId('route', route),
              name: folder.name,
              target: route,
              kind: 'finder-route',
              icon: { kind: 'glyph', value: '📁' },
              accent: 'transparent',
            })
          }
          return
        }

        if (route.startsWith('volume:')) {
          const targetPath = getVolumePathFromRoute(route)
          const mount = getVolumeMountFromRoute(route)
          if (targetPath && mount && targetPath.replace(/[\\/]+$/, '').toLowerCase() !== mount.replace(/[\\/]+$/, '').toLowerCase()) {
            next.set(route, {
              id: createDockItemId('route', route),
              name: getPathLeaf(targetPath),
              target: route,
              kind: 'finder-route',
              icon: { kind: 'glyph', value: '📁' },
              accent: 'transparent',
            })
          }
        }
        return
      }

      if ((windowItem.appId === 'photos' || windowItem.appId === 'videos') && windowItem.mediaPath) {
        const dockItem = createPathDockItem(windowItem.mediaPath, windowItem.title)
        next.set(dockItem.id, dockItem)
        return
      }

      if (windowItem.appId === 'textedit' && windowItem.textDocumentId) {
        const target = desktopItems.find((item) => item.id === windowItem.textDocumentId && item.kind === 'text')
        if (target) {
          next.set(target.id, {
            id: createDockItemId('document', target.id),
            name: target.name,
            target: target.id,
            kind: 'desktop-document',
            icon: { kind: 'image', value: getDocumentPreviewIcon(target.name, target.extension) },
            accent: 'transparent',
          })
        }
      }
    })

    return [...next.values()]
      .filter((item) => !pinnedCustomTargets.has(`${item.kind}::${item.target}`))
  }, [desktopItems, pinnedCustomTargets, windows])
  const visibleTransientDockItems = useMemo(() => {
    const runtimeOnlyItems = runtimeDockItems.filter((item) => !pinnedCustomTargets.has(`${item.kind}::${item.target}`))
    return [...windowDockItems, ...runtimeOnlyItems].filter(
      (item, index, current) => current.findIndex((entry) => entry.id === item.id) === index,
    )
  }, [pinnedCustomTargets, runtimeDockItems, windowDockItems])
  const spotlightResults = useMemo(() => {
    const query = spotlightQuery.trim()
    const results: Array<{
      id: string
      kind: 'app' | 'installed-app' | 'note' | 'document' | 'volume' | 'route' | 'path' | 'action'
      title: string
      subtitle: string
      score: number
      appId?: AppId
      app?: InstalledApp
      noteId?: string
      itemId?: string
      route?: FinderRoute
      mount?: string
      path?: string
      actionId?: 'new-note' | 'open-apps' | 'open-dock' | 'open-device' | 'toggle-dark' | 'toggle-light'
      icon?: DockIconSpec
    }> = []

    const pushResult = (entry: Omit<(typeof results)[number], 'score'>, sources: string[], defaultScore = 48) => {
      const score = query ? getSearchScore(query, ...sources) : defaultScore
      if (query && score < 0) {
        return
      }
      results.push({ ...entry, score })
    }

    recentItems.forEach((item, index) => {
      if (item.kind === 'installed-app') {
        const app = installedApps.find((entry) => entry.id === item.installedAppId)
        if (!app) {
          return
        }

        pushResult(
          {
            id: `recent-installed:${item.installedAppId}`,
            kind: 'installed-app',
            title: item.title,
            subtitle: `Reciente · ${item.subtitle}`,
            app,
          },
          [item.title, item.subtitle, 'reciente recientes'],
          140 - index,
        )
        return
      }

      pushResult(
        {
          id: `recent:${item.key}`,
          kind: item.kind,
          title: item.title,
          subtitle: `Reciente · ${item.subtitle}`,
          appId: item.appId,
          noteId: item.noteId,
          itemId: item.itemId,
          route: item.route,
          mount: item.mount,
          path: item.path,
          icon: item.icon,
        },
        [item.title, item.subtitle, item.path ?? '', 'reciente recientes'],
        140 - index,
      )
    })

    APPS
      .filter((app) => app.id !== 'launcher')
      .forEach((app) => {
        const resolved = resolvedApps[app.id]
        pushResult(
          {
            id: `app:${app.id}`,
            kind: 'app',
            title: resolved.name,
            subtitle: 'App integrada',
            appId: app.id,
            icon: resolved.iconSpec,
          },
          [resolved.name, app.id, resolved.menu.join(' ')],
        )
      })

    installedApps.forEach((app) => {
      pushResult(
        {
          id: `installed:${app.id}`,
          kind: 'installed-app',
          title: app.name,
          subtitle: `Sistema · ${app.source}`,
          app,
        },
        [app.name, app.source, app.target, app.launchTarget ?? ''],
      )
    })

    notes.forEach((note) => {
      pushResult(
        {
          id: `note:${note.id}`,
          kind: 'note',
          title: note.title || 'Sin titulo',
          subtitle: note.body.trim() || 'Nota',
          noteId: note.id,
          icon: { kind: 'glyph', value: '📝' },
        },
        [note.title, note.body, 'nota notas'],
      )
    })

    desktopItems
      .filter((item) => item.kind === 'text' && item.trashedAt === null)
      .forEach((item) => {
        pushResult(
          {
            id: `document:${item.id}`,
            kind: 'document',
            title: item.name,
            subtitle: item.content.trim() || 'Documento de texto',
            itemId: item.id,
            icon: item.iconDataUrl ? { kind: 'image', value: item.iconDataUrl } : { kind: 'glyph', value: '📄' },
          },
          [item.name, item.content, 'documento texto'],
        )
      })

    ;(deviceInfo?.volumes ?? []).forEach((volume) => {
      pushResult(
        {
          id: `volume:${volume.mount}`,
          kind: 'volume',
          title: volume.name,
          subtitle: `${volume.mount} · ${volume.freeGb} GB libres`,
          mount: volume.mount,
          icon: { kind: 'image', value: getDesktopVolumeIconSrc(volume) },
        },
        [volume.name, volume.mount, 'volumen disco unidad almacenamiento'],
      )
    })

    ;([
      {
        id: 'route:applications',
        title: 'Aplicaciones',
        subtitle: 'Abrir Finder en Aplicaciones',
        route: 'applications' as const,
        icon: { kind: 'glyph' as const, value: 'A' },
      },
      {
        id: 'route:dock',
        title: 'Dock',
        subtitle: 'Abrir Finder en la configuracion del dock',
        route: 'dock' as const,
        icon: { kind: 'glyph' as const, value: '⚓' },
      },
      {
        id: 'route:device',
        title: 'Este dispositivo',
        subtitle: 'Abrir informacion del equipo',
        route: 'device' as const,
        icon: { kind: 'glyph' as const, value: '💻' },
      },
      {
        id: 'route:trash',
        title: 'Papelera',
        subtitle: 'Abrir la papelera',
        route: 'trash' as const,
        icon: { kind: 'glyph' as const, value: '🗑' },
      },
      {
        id: 'route:recents',
        title: 'Recientes',
        subtitle: 'Abrir Finder en Recientes',
        route: 'recents' as const,
        icon: { kind: 'glyph' as const, value: '◷' },
      },
    ]).forEach((item) => {
      pushResult(
        {
          id: item.id,
          kind: 'route',
          title: item.title,
          subtitle: item.subtitle,
          route: item.route,
          icon: item.icon,
        },
        [item.title, item.subtitle],
      )
    })

    ;([
      {
        id: 'action:new-note',
        title: 'Crear nota nueva',
        subtitle: 'Abrir Notas y crear una nota',
        actionId: 'new-note' as const,
        icon: { kind: 'glyph' as const, value: '✎' },
      },
      {
        id: 'action:toggle-dark',
        title: 'Modo oscuro',
        subtitle: 'Cambiar la apariencia a oscuro',
        actionId: 'toggle-dark' as const,
        icon: { kind: 'glyph' as const, value: '☾' },
      },
      {
        id: 'action:toggle-light',
        title: 'Modo claro',
        subtitle: 'Cambiar la apariencia a claro',
        actionId: 'toggle-light' as const,
        icon: { kind: 'glyph' as const, value: '☀' },
      },
    ]).forEach((item) => {
      pushResult(
        {
          id: item.id,
          kind: 'action',
          title: item.title,
          subtitle: item.subtitle,
          actionId: item.actionId,
          icon: item.icon,
        },
        [item.title, item.subtitle],
      )
    })

    return results
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'es'))
      .slice(0, query ? 14 : 10)
  }, [desktopItems, deviceInfo?.volumes, installedApps, notes, recentItems, resolvedApps, spotlightQuery])
  const desktopItemNodes = useMemo(() => rootDesktopItems.map((item) => (
    <button
      key={item.id}
      type="button"
      className={`desktop-item-icon${quickLookCandidate?.key === `desktop:${item.id}` ? ' selected' : ''}`}
      data-desktop-folder-id={item.kind === 'folder' ? item.id : undefined}
      style={{ left: item.x, top: item.y }}
      onPointerDown={(event) => {
        updateQuickLookCandidate(createQuickLookTargetFromDesktopItem(item))
        startDesktopItemDrag(event, item.id)
      }}
      onClick={(event) => {
        if (editingDesktopItemId === item.id) {
          return
        }
        if (event.detail < 2) {
          return
        }
        if (item.kind === 'folder') {
          openDesktopFolder(item.id)
        } else if (item.kind === 'text') {
          openDesktopDocument(item.id)
        } else {
          openDesktopFileItem(item.id)
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        updateQuickLookCandidate(createQuickLookTargetFromDesktopItem(item))
        openContextMenuAt({
          type: 'desktop-item',
          itemId: item.id,
          label: item.name,
          kind: item.kind,
        }, event.clientX, event.clientY)
      }}
      onDragOver={(event) => {
        if (item.kind !== 'folder') {
          return
        }
        handleDesktopItemFolderDragOver(event)
      }}
      onDrop={(event) => {
        if (item.kind !== 'folder') {
          return
        }
        handleDesktopItemFolderDrop(event, item.id)
      }}
    >
      {item.kind === 'folder' ? (
        <span
          className="desktop-item-art folder"
          style={{ backgroundImage: `url("${resolvePublicAssetPath('/carp.png')}")` }}
          aria-hidden="true"
        />
      ) : item.kind === 'file' && item.sourcePath && isImageEntry({
        name: item.name,
        path: item.sourcePath,
        kind: 'file',
        extension: item.extension,
        sizeBytes: null,
      }) ? (
        <img className="desktop-item-art image-preview" src={getMediaSource(item.sourcePath)} alt="" draggable={false} />
      ) : item.kind === 'file' && item.sourcePath && isVideoEntry({
        name: item.name,
        path: item.sourcePath,
        kind: 'file',
        extension: item.extension,
        sizeBytes: null,
      }) ? (
        <VideoThumbnail
          className="desktop-item-art video-preview"
          src={getMediaSource(item.sourcePath)}
          fallbackSrc={getDocumentPreviewIcon(item.name, item.extension ?? '')}
        />
      ) : item.kind === 'file' && item.iconDataUrl ? (
        <img className="desktop-item-art custom-icon" src={item.iconDataUrl} alt="" draggable={false} />
      ) : item.kind === 'file' && item.extension ? (
        <img
          className="desktop-item-art custom-icon"
          src={getDocumentPreviewIcon(item.name, item.extension)}
          alt=""
          draggable={false}
        />
      ) : (
        <img className="desktop-item-art text" src={resolvePublicAssetPath('/texto.png')} alt="" draggable={false} />
      )}
      {editingDesktopItemId === item.id ? (
        <input
          className="desktop-item-name-input"
          value={editingDesktopItemName}
          autoFocus
          onChange={(event) => setEditingDesktopItemName(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={() => commitDesktopItemRename(item.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitDesktopItemRename(item.id)
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelDesktopItemRename()
            }
          }}
        />
      ) : (
        <strong>{item.name}</strong>
      )}
      <span>{item.kind === 'folder' ? 'Carpeta' : item.kind === 'text' ? 'Documento' : item.extension || 'Archivo'}</span>
    </button>
  )), [editingDesktopItemId, editingDesktopItemName, quickLookCandidate?.key, rootDesktopItems])
  const desktopVolumeNodes = useMemo(() => (deviceInfo?.volumes ?? []).map((volume, index) => {
    const position = getDesktopVolumePosition(volume, index)
    return (
      <button
        key={volume.mount}
        type="button"
        className="desktop-volume-icon"
        style={{ left: position.x, top: position.y }}
        onPointerDown={(event) => startDesktopVolumeDrag(event, volume.mount)}
        onClick={() => openDesktopVolume(volume.mount)}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          openContextMenuAt({
            type: 'dock-volume',
            mount: volume.mount,
            label: volume.name,
          }, event.clientX, event.clientY)
        }}
      >
        <img
          className={`desktop-volume-art ${getDesktopVolumeKind(volume)}`}
          src={resolvePublicAssetPath(getDesktopVolumeIconSrc(volume))}
          alt=""
          draggable={false}
        />
        <strong>{volume.name}</strong>
        <span>{formatVolumeLabel(volume.mount)}</span>
      </button>
    )
  }), [desktopVolumePositions, deviceInfo?.volumes])
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

  function getNextDesktopItemPosition(itemCount: number) {
    const desktop = getDesktopBounds()
    const columnWidth = 104
    const itemHeight = 102
    const leftInset = 18
    const topInset = 18
    const itemsPerColumn = Math.max(1, Math.floor((desktop.height - topInset) / itemHeight))
    const column = Math.floor(itemCount / itemsPerColumn)
    const row = itemCount % itemsPerColumn
    const maxX = desktop.x + desktop.width - 88
    const maxY = desktop.y + desktop.height - 92

    return {
      x: clamp(desktop.x + leftInset + column * columnWidth, desktop.x, maxX),
      y: clamp(desktop.y + topInset + row * itemHeight, desktop.y, maxY),
    }
  }

  function getDesktopTrashPosition() {
    if (desktopTrashPosition) {
      return {
        left: desktopTrashPosition.x,
        top: desktopTrashPosition.y,
      }
    }

    return {
      left: Math.max(DESKTOP_SIDE_MARGIN + 16, window.innerWidth - DESKTOP_SIDE_MARGIN - 84),
      top: Math.max(MENU_BAR_HEIGHT + 24, window.innerHeight - DOCK_HEIGHT - 132),
    }
  }

  function getFinderRouteLabel(route: FinderRoute) {
    if (route === 'desktop') {
      return 'Escritorio'
    }

    if (route === 'trash') {
      return 'Papelera'
    }

    const desktopFolderId = getDesktopFolderIdFromRoute(route)
    if (desktopFolderId) {
      return desktopItems.find((item) => item.id === desktopFolderId)?.name ?? 'Carpeta'
    }

    return getFinderLabel(route) ?? 'Finder'
  }

  function sortDesktopEntries(items: DesktopItem[], sortMode: FinderSortMode) {
    return [...items].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'folder' ? -1 : 1
      }

      if (sortMode === 'date') {
        return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name, 'es')
      }

      if (sortMode === 'type') {
        const leftType = left.kind === 'folder' ? 'Carpeta' : left.kind === 'text' ? 'Documento' : left.extension || 'Archivo'
        const rightType = right.kind === 'folder' ? 'Carpeta' : right.kind === 'text' ? 'Documento' : right.extension || 'Archivo'
        return leftType.localeCompare(rightType, 'es') || left.name.localeCompare(right.name, 'es')
      }

      return left.name.localeCompare(right.name, 'es')
    })
  }

  function sortVolumeEntries(entries: VolumeEntry[], sortMode: FinderSortMode) {
    return [...entries].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1
      }

      if (sortMode === 'size') {
        return (right.sizeBytes ?? -1) - (left.sizeBytes ?? -1) || left.name.localeCompare(right.name, 'es')
      }

      if (sortMode === 'type') {
        const leftType = left.kind === 'directory' ? 'Carpeta' : left.extension || 'Archivo'
        const rightType = right.kind === 'directory' ? 'Carpeta' : right.extension || 'Archivo'
        return leftType.localeCompare(rightType, 'es') || left.name.localeCompare(right.name, 'es')
      }

      return left.name.localeCompare(right.name, 'es')
    })
  }

  function createQuickLookTargetFromDesktopItem(item: DesktopItem): QuickLookTarget {
    if (item.kind === 'folder') {
      return {
        key: `desktop:${item.id}`,
        name: item.name,
        subtitle: item.sourcePath ? 'Carpeta enlazada' : 'Carpeta',
        kind: 'folder',
        iconSrc: resolvePublicAssetPath('/carp.png'),
        location: item.sourcePath ?? 'Escritorio',
      }
    }

    if (item.kind === 'text') {
      return {
        key: `desktop:${item.id}`,
        name: item.name,
        subtitle: 'Documento de texto',
        kind: 'text',
        iconSrc: resolvePublicAssetPath('/texto.png'),
        textContent: item.content,
        location: 'Escritorio',
      }
    }

    const entry: VolumeEntry = {
      name: item.name,
      path: item.sourcePath ?? '',
      kind: 'file',
      extension: item.extension,
      sizeBytes: null,
      icon: item.iconDataUrl,
    }

    return {
      key: `desktop:${item.id}`,
      name: item.name,
      subtitle: item.extension || 'Archivo',
      kind: item.sourcePath && isImageEntry(entry) ? 'image' : item.sourcePath && isVideoEntry(entry) ? 'video' : 'file',
      path: item.sourcePath,
      extension: item.extension,
      iconSrc: item.iconDataUrl ?? getDocumentPreviewIcon(item.name, item.extension || ''),
      location: item.sourcePath ? getPathLeaf(item.sourcePath) : 'Escritorio',
    }
  }

  function createQuickLookTargetFromVolumeEntry(entry: VolumeEntry): QuickLookTarget {
    return {
      key: `path:${entry.path}`,
      name: entry.name,
      subtitle:
        entry.kind === 'directory'
          ? 'Carpeta'
          : entry.sizeBytes === null
            ? entry.extension || 'Archivo'
            : `${entry.extension || 'Archivo'} · ${entry.sizeBytes} B`,
      kind: entry.kind === 'directory' ? 'folder' : isImageEntry(entry) ? 'image' : isVideoEntry(entry) ? 'video' : 'file',
      path: entry.path,
      extension: entry.extension,
      iconSrc: entry.kind === 'directory'
        ? resolvePublicAssetPath('/carp.png')
        : entry.icon ?? getDocumentPreviewIcon(entry.name, entry.extension || ''),
      location: entry.path,
    }
  }

  function updateQuickLookCandidate(target: QuickLookTarget | null) {
    setQuickLookCandidate(target)
  }

  function getWindowDisplayTitle(windowItem: WindowState) {
    return windowItem.appId === 'finder'
      ? `Finder · ${getFinderRouteLabel(getActiveFinderRoute(windowItem.finderState))}`
      : windowItem.title
  }

  function getDockFolderStackEntries(item: CustomDockItem): DockFolderStackEntry[] | null {
    if (item.kind !== 'finder-route') {
      return null
    }

    const route = item.target as FinderRoute
    const openDesktopItem = (target: DesktopItem) => () => {
      setDockFolderStackItemId(null)
      if (target.kind === 'folder') {
        openOrFocusFinderRoute(createDesktopFolderRoute(target.id), item.id)
        return
      }
      if (target.kind === 'text') {
        openDesktopDocument(target.id)
        return
      }
      openDesktopFileItem(target.id)
    }
    const openVolumeEntry = (mount: string, entry: VolumeEntry) => () => {
      setDockFolderStackItemId(null)
      if (entry.kind === 'directory') {
        openOrFocusFinderRoute(createVolumeSubRoute(mount, entry.path), item.id)
        return
      }
      if (isImageEntry(entry)) {
        openMediaWindow('photos', entry)
        return
      }
      if (isVideoEntry(entry)) {
        openMediaWindow('videos', entry)
        return
      }
      void openTrackedSystemPath(entry.path, entry.name, entry.icon ?? null)
    }
    const desktopItemToEntry = (target: DesktopItem): DockFolderStackEntry => ({
      key: `desktop:${target.id}`,
      title: target.name,
      subtitle: target.kind === 'folder' ? 'Carpeta' : target.kind === 'text' ? 'Documento de texto' : target.extension || 'Archivo',
      icon: target.kind === 'folder'
        ? { kind: 'image', value: resolvePublicAssetPath('/carp.png') }
        : target.iconDataUrl
          ? { kind: 'image', value: target.iconDataUrl }
          : target.extension
            ? { kind: 'image', value: getDocumentPreviewIcon(target.name, target.extension) }
            : { kind: 'glyph', value: '📄' },
      action: openDesktopItem(target),
    })
    const volumeEntryToEntry = (mount: string, entry: VolumeEntry): DockFolderStackEntry => ({
      key: `volume:${entry.path}`,
      title: entry.name,
      subtitle: entry.kind === 'directory' ? 'Carpeta' : entry.sizeBytes === null ? 'Archivo' : `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB`,
      icon: entry.kind === 'directory'
        ? { kind: 'image', value: resolvePublicAssetPath('/carp.png') }
        : entry.icon
          ? { kind: 'image', value: entry.icon }
          : entry.extension
            ? { kind: 'image', value: getDocumentPreviewIcon(entry.name, entry.extension) }
            : { kind: 'glyph', value: '📄' },
      action: openVolumeEntry(mount, entry),
    })

    if (route === 'desktop') {
      return sortDesktopEntries(rootDesktopItems, 'name').slice(0, 12).map(desktopItemToEntry)
    }

    const desktopFolderId = getDesktopFolderIdFromRoute(route)
    if (desktopFolderId) {
      const folder = desktopItems.find((entry) => entry.id === desktopFolderId && entry.kind === 'folder' && entry.trashedAt === null)
      if (!folder) {
        return null
      }

      if (folder.sourcePath) {
        const entries = sortVolumeEntries(getVisibleEntries(folder.sourcePath, volumeEntriesByMount[folder.sourcePath] ?? []), 'name')
        return entries.slice(0, 12).map((entry) => ({
          key: `imported:${entry.path}`,
          title: entry.name,
          subtitle: entry.kind === 'directory' ? 'Carpeta' : entry.sizeBytes === null ? 'Archivo' : `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB`,
          icon: entry.kind === 'directory'
            ? { kind: 'image', value: resolvePublicAssetPath('/carp.png') }
            : entry.icon
              ? { kind: 'image', value: entry.icon }
              : entry.extension
                ? { kind: 'image', value: getDocumentPreviewIcon(entry.name, entry.extension) }
                : { kind: 'glyph', value: '📄' },
          action: () => {
            setDockFolderStackItemId(null)
            if (entry.kind === 'directory') {
              openFinderWindow(createFinderRouteForFilePath(entry.path))
              return
            }
            if (isImageEntry(entry)) {
              openMediaWindow('photos', entry)
              return
            }
            if (isVideoEntry(entry)) {
              openMediaWindow('videos', entry)
              return
            }
            void openTrackedSystemPath(entry.path, entry.name, entry.icon ?? null)
          },
        }))
      }

      const children = desktopItems.filter((entry) => entry.parentId === desktopFolderId && entry.trashedAt === null)
      return sortDesktopEntries(children, 'name').slice(0, 12).map(desktopItemToEntry)
    }

    if (isVolumeRoute(route)) {
      const mount = getVolumeMountFromRoute(route)
      const targetPath = getVolumePathFromRoute(route)
      if (!mount || !targetPath) {
        return null
      }
      const entries = sortVolumeEntries(getVisibleEntries(targetPath, volumeEntriesByMount[targetPath] ?? []), 'name')
      return entries.slice(0, 12).map((entry) => volumeEntryToEntry(mount, entry))
    }

    return null
  }

  function renderDockFolderStack() {
    if (!dockFolderStackItemId) {
      return null
    }

    const dockItem = [...orderedCustomDockItems, ...visibleTransientDockItems].find((entry) => entry.id === dockFolderStackItemId)
    if (!dockItem) {
      return null
    }

    const entries = getDockFolderStackEntries(dockItem)
    if (!entries?.length) {
      return null
    }

      const anchor = dockItemRefs.current[dockItem.id]?.getBoundingClientRect()
      const estimatedStackHeight = entries.length * 59 + 82
      const availableHeight = anchor ? Math.max(anchor.top - 28, 220) : window.innerHeight - 180
      const shouldUseWindowStack = estimatedStackHeight > availableHeight
      const stackStyle: CSSProperties = anchor
        ? {
            left: anchor.left + anchor.width / 2,
            bottom: Math.max(window.innerHeight - anchor.top + 14, 108),
          }
        : { left: '50%', bottom: 108 }

        return (
        <div
          ref={dockFolderStackRef}
          className={`dock-folder-stack${shouldUseWindowStack ? ' dock-folder-stack-window' : ''}`}
          style={stackStyle}
        >
          <div className="dock-folder-stack-list">
            {shouldUseWindowStack ? (
              <div className="dock-folder-stack-header">
                <span className="dock-folder-stack-header-icon">{renderDockIconContent(dockItem.icon)}</span>
                <div className="dock-folder-stack-header-copy">
                  <strong>{dockItem.name}</strong>
                  <span>{entries.length} elemento{entries.length === 1 ? '' : 's'}</span>
                </div>
              </div>
            ) : null}
            {entries.map((entry, index) => (
                (() => {
                  const visualIndex = entries.length - index - 1
                  return (
                <button
                  key={entry.key}
                  type="button"
                  className={`dock-folder-stack-item${shouldUseWindowStack ? ' windowed' : ''}`}
                  style={{
                  '--stack-tilt': shouldUseWindowStack ? '0deg' : `${4 + visualIndex * 3}deg`,
                  '--stack-shift': shouldUseWindowStack ? '0px' : `${visualIndex * 7}px`,
                  '--stack-delay': shouldUseWindowStack ? '0ms' : `${visualIndex * 52}ms`,
                  } as CSSProperties}
                  onClick={entry.action}
                >
                <span className="dock-folder-stack-icon">{renderDockIconContent(entry.icon)}</span>
                <span className="dock-folder-stack-copy">
                  <strong>{entry.title}</strong>
                  <span>{entry.subtitle}</span>
                </span>
              </button>
                )
              })()
            ))}
          </div>
        </div>
      )
    }

  function openQuickLook(target = quickLookCandidate) {
    if (!target) {
      return
    }

    setLauncherOpen(false)
    setContextMenu(null)
    setControlCenterOpen(false)
    setOpenAppMenu(null)
    setPowerMenuOpen(false)
    setSpotlightOpen(false)
    setQuickLookTarget(target)
  }

  function closeQuickLook() {
    setQuickLookTarget(null)
  }

  function openMissionControl(initialIndex = 0) {
    if (missionControlCandidates.length === 0) {
      return
    }

    setLauncherOpen(false)
    setContextMenu(null)
    setControlCenterOpen(false)
    setOpenAppMenu(null)
    setPowerMenuOpen(false)
    setSpotlightOpen(false)
    setQuickLookTarget(null)
    setAltTabState({ open: false, selectedIndex: 0 })
    setMissionControlState({
      open: true,
      selectedIndex: clamp(initialIndex, 0, Math.max(0, missionControlCandidates.length - 1)),
    })
  }

  function closeMissionControl() {
    setMissionControlState({ open: false, selectedIndex: 0 })
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
    const anchorWidth = clamp(rect.width * 0.24, 10, 14)
    const anchorHeight = Math.max(10, rect.height * 0.22)
    const anchorX = rect.left + rect.width / 2 - anchorWidth / 2
    return {
      x: anchorX,
      y: rect.bottom - anchorHeight,
      width: anchorWidth,
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
    if (!dockHoverAnimationEnabled) {
      dockMouseX.set(Infinity)
      return
    }

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
    return resolvedApps[appId]
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
    if (!loginTransitioning) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setLoggedIn(true)
      setLoginTransitioning(false)
    }, 280)

    return () => window.clearTimeout(timer)
  }, [loginTransitioning])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date()
      setClock({
        menu: formatTime(now),
        loginDate: formatLoginDate(now),
        loginTime: formatLoginTime(now),
      })
    }, 30_000)
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
    function handleDockStackPointerDown(event: MouseEvent) {
      if (!dockFolderStackRef.current?.contains(event.target as Node | null)) {
        setDockFolderStackItemId(null)
      }
    }

    window.addEventListener('mousedown', handleDockStackPointerDown)
    return () => window.removeEventListener('mousedown', handleDockStackPointerDown)
  }, [])

  useEffect(() => {
    function closePowerMenu(event: MouseEvent) {
      const target = event.target as Node | null
      if (powerMenuRef.current?.contains(target ?? null)) {
        return
      }
      setPowerMenuOpen(false)
    }

    window.addEventListener('mousedown', closePowerMenu)
    return () => window.removeEventListener('mousedown', closePowerMenu)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(DESKTOP_VOLUME_POSITIONS_STORAGE_KEY, JSON.stringify(desktopVolumePositions))
  }, [desktopVolumePositions])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches)
    syncPreference()
    mediaQuery.addEventListener('change', syncPreference)
    return () => mediaQuery.removeEventListener('change', syncPreference)
  }, [])

  useEffect(() => {
    return () => {
      Object.values(windowMorphTimersRef.current).forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

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
    window.localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, JSON.stringify(recentItems))
  }, [recentItems])

  useEffect(() => {
    if (!loggedIn || sessionHydratedRef.current) {
      return
    }

    sessionHydratedRef.current = true
    const saved = loadWindowSession()
    if (!saved.length) {
      return
    }

    const restored = saved.map((entry, index) => {
      const route = entry.finderState
        ? entry.finderState.tabs.find((tab) => tab.id === entry.finderState?.activeTabId)?.history[
          entry.finderState.tabs.find((tab) => tab.id === entry.finderState?.activeTabId)?.historyIndex ?? 0
        ] ?? 'computer'
        : undefined
      const nextWindow = createWindow(entry.appId, route)
      return {
        ...nextWindow,
        ...entry,
        genie: null,
        zIndex: index + 1,
      }
    })

    setWindows(restored)
    const maxWindowSequence = restored.reduce((maxValue, item) => {
      const parts = item.id.split('-')
      const suffix = Number(parts[parts.length - 1])
      return Number.isFinite(suffix) ? Math.max(maxValue, suffix) : maxValue
    }, 1)
    nextWindowId.current = maxWindowSequence + 1
    pushToast('Sesion restaurada', `${restored.length} ventana${restored.length === 1 ? '' : 's'} recuperada${restored.length === 1 ? '' : 's'}.`)
  }, [loggedIn])

  useEffect(() => {
    if (!loggedIn || !sessionHydratedRef.current) {
      return
    }

    const serialized = windows
      .map((item) => serializeWindowForSession(item))
      .filter((item): item is WindowSessionEntry => !!item)
      .sort((left, right) => left.zIndex - right.zIndex)

    window.localStorage.setItem(WINDOW_SESSION_STORAGE_KEY, JSON.stringify(serialized))
  }, [loggedIn, windows])

  useEffect(() => {
    if (!drag) {
      return undefined
    }

    const activeDrag = drag
    const targetWindow = windows.find((item) => item.id === activeDrag.id)
    if (!targetWindow) {
      return undefined
    }

    const targetWindowWidth = targetWindow.width
    const targetWindowHeight = targetWindow.height
    const windowNode = windowRefs.current[activeDrag.id]
    function onPointerMove(event: PointerEvent) {
      const maxX = Math.max(24, window.innerWidth - targetWindowWidth - 24)
      const maxY = Math.max(84, window.innerHeight - targetWindowHeight - 120)
      const nextX = clamp(event.clientX - activeDrag.offsetX, 24, maxX)
      const nextY = clamp(event.clientY - activeDrag.offsetY, 52, maxY)

      dragPreviewRef.current = { id: activeDrag.id, x: nextX, y: nextY }
      if (windowNode) {
        windowNode.style.transform = `translate(${nextX}px, ${nextY}px)`
      }
    }

    function onPointerUp() {
      const preview = dragPreviewRef.current
      if (preview?.id === activeDrag.id) {
        setWindows((current) =>
          current.map((item) =>
            item.id === activeDrag.id
              ? { ...item, x: preview.x, y: preview.y }
              : item,
          ),
        )
      }
      dragPreviewRef.current = null
      setDrag(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag, windows])

  useEffect(() => {
    if (!resize) {
      return undefined
    }

    const activeResize = resize
    const targetWindow = windows.find((item) => item.id === activeResize.id)
    if (!targetWindow) {
      return undefined
    }

    const targetWindowX = targetWindow.x
    const targetWindowY = targetWindow.y
    const windowNode = windowRefs.current[activeResize.id]
    function onPointerMove(event: PointerEvent) {
      const desktop = getDesktopBounds()
      const maxWidth = desktop.x + desktop.width - targetWindowX
      const maxHeight = desktop.y + desktop.height - targetWindowY
      const nextWidth = clamp(activeResize.startWidth + (event.clientX - activeResize.startX), MIN_WINDOW_WIDTH, maxWidth)
      const nextHeight = clamp(activeResize.startHeight + (event.clientY - activeResize.startY), MIN_WINDOW_HEIGHT, maxHeight)

      resizePreviewRef.current = { id: activeResize.id, width: nextWidth, height: nextHeight }
      if (windowNode) {
        windowNode.style.width = `${nextWidth}px`
        windowNode.style.height = `${nextHeight}px`
      }
    }

    function onPointerUp() {
      const preview = resizePreviewRef.current
      if (preview?.id === activeResize.id) {
        setWindows((current) =>
          current.map((item) =>
            item.id === activeResize.id
              ? { ...item, width: preview.width, height: preview.height }
              : item,
          ),
        )
      }
      resizePreviewRef.current = null
      setResize(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [resize, windows])

  useEffect(() => {
    setDockPinnedOrder((current) => syncDockPinnedOrder(current, dockItems, customDockItems))
  }, [dockItems, customDockItems, visibleTransientDockItems, visibleVolumeDockItems])

  useEffect(() => {
    if (!installedApps.length) {
      return
    }

    setCustomDockItems((current) => {
      const appsByTarget = new Map<string, InstalledApp>()
      const appsByName = new Map<string, InstalledApp>()

      installedApps.forEach((app) => {
        const launchTarget = (app.launchTarget || app.target || '').trim().toLowerCase()
        const target = (app.target || '').trim().toLowerCase()
        const normalizedName = app.name.trim().toLowerCase()

        if (launchTarget && !appsByTarget.has(launchTarget)) {
          appsByTarget.set(launchTarget, app)
        }
        if (target && !appsByTarget.has(target)) {
          appsByTarget.set(target, app)
        }
        if (normalizedName && !appsByName.has(normalizedName)) {
          appsByName.set(normalizedName, app)
        }
      })

      let changed = false
      const next = current.map((item) => {
        if (item.kind !== 'app') {
          return item
        }

        const currentTarget = item.target.trim().toLowerCase()
        const currentName = item.name.trim().toLowerCase()
        const match = appsByTarget.get(currentTarget) ?? appsByName.get(currentName)
        if (!match?.icon) {
          return item
        }

        const shouldReplaceIcon =
          item.icon.kind !== 'image' ||
          !item.icon.value ||
          item.icon.value === '/app.png' ||
          item.icon.value.startsWith('data:') === false

        if (!shouldReplaceIcon || item.icon.value === match.icon) {
          return item
        }

        changed = true
        return {
          ...item,
          icon: { kind: 'image' as const, value: match.icon },
        }
      })

      return changed ? next : current
    })
  }, [installedApps, setCustomDockItems])

  useEffect(() => {
    window.localStorage.setItem(DOCK_PINNED_ORDER_STORAGE_KEY, JSON.stringify(dockPinnedOrder))
  }, [dockPinnedOrder])

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
    function closeStatusMenus(event: MouseEvent) {
      const target = event.target as Node | null
      if (statusMenusRef.current?.contains(target ?? null)) {
        return
      }
      setStatusMenuOpen(null)
    }

    window.addEventListener('mousedown', closeStatusMenus)
    return () => window.removeEventListener('mousedown', closeStatusMenus)
  }, [])

  useEffect(() => {
    if (!launcherOpen) {
      setLauncherPage(0)
    }
  }, [launcherOpen])

  useEffect(() => {
    if (!spotlightOpen) {
      return
    }

    setSpotlightSelectionIndex(0)
    window.setTimeout(() => {
      spotlightInputRef.current?.focus()
      spotlightInputRef.current?.select()
    }, 0)
  }, [spotlightOpen, spotlightQuery])

  useEffect(() => {
    if (!controlCenterOpen) {
      return
    }

    setNotificationHistory((current) => current.map((item) => (item.read ? item : { ...item, read: true })))
  }, [controlCenterOpen])

  useEffect(() => {
    function syncNetworkStatus() {
      setNetworkOnline(navigator.onLine)
    }

    window.addEventListener('online', syncNetworkStatus)
    window.addEventListener('offline', syncNetworkStatus)
    return () => {
      window.removeEventListener('online', syncNetworkStatus)
      window.removeEventListener('offline', syncNetworkStatus)
    }
  }, [])

  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const targetTag = target?.tagName ?? ''
      const isEditable =
        !!target &&
        (target.isContentEditable || targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT')
      const primaryModifier = event.ctrlKey || event.metaKey
      const activeWindowId = activeWindow?.id

      if (systemDialog) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeSystemDialog()
        } else if (event.key === 'Enter' && !isEditable) {
          event.preventDefault()
          confirmSystemDialog()
        }
        return
      }

      if (missionControlState.open) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeMissionControl()
          return
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activateMissionControlSelection(missionControlState.selectedIndex)
          return
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          setMissionControlState((current) => ({
            ...current,
            selectedIndex: (current.selectedIndex - 1 + missionControlCandidates.length) % missionControlCandidates.length,
          }))
          return
        }

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Tab') {
          event.preventDefault()
          const step = event.shiftKey ? -1 : 1
          setMissionControlState((current) => ({
            ...current,
            selectedIndex: (current.selectedIndex + step + missionControlCandidates.length) % missionControlCandidates.length,
          }))
          return
        }
      }

      if (event.altKey && event.key === 'Tab' && altTabCandidates.length > 0) {
        event.preventDefault()
        setLauncherOpen(false)
        setContextMenu(null)
        setControlCenterOpen(false)
        setOpenAppMenu(null)
        setPowerMenuOpen(false)
        setSpotlightOpen(false)
        setAltTabState((current) => {
          const step = event.shiftKey ? -1 : 1
          if (!current.open) {
            const initialIndex = altTabCandidates.length > 1 ? 1 : 0
            return { open: true, selectedIndex: initialIndex }
          }
          const nextIndex = (current.selectedIndex + step + altTabCandidates.length) % altTabCandidates.length
          return { open: true, selectedIndex: nextIndex }
        })
        return
      }

      if (!isEditable && !event.altKey && (event.key === 'F3' || (primaryModifier && event.key === 'ArrowUp'))) {
        event.preventDefault()
        openMissionControl()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
        event.preventDefault()
        setLauncherOpen(false)
        setContextMenu(null)
        setControlCenterOpen(false)
        setOpenAppMenu(null)
        setPowerMenuOpen(false)
        setSpotlightOpen((current) => !current)
        return
      }

      if (event.key === 'Escape') {
        if (missionControlState.open) {
          event.preventDefault()
          closeMissionControl()
          return
        }
        if (quickLookTarget) {
          event.preventDefault()
          closeQuickLook()
          return
        }
        if (spotlightOpen) {
          event.preventDefault()
          setSpotlightOpen(false)
          return
        }
        if (contextMenu || launcherOpen || controlCenterOpen || openAppMenu || powerMenuOpen) {
          event.preventDefault()
          setContextMenu(null)
          setLauncherOpen(false)
          setControlCenterOpen(false)
          setOpenAppMenu(null)
          setPowerMenuOpen(false)
          setStatusMenuOpen(null)
          return
        }
      }

      if (!spotlightOpen) {
        if (!isEditable && !event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'Space' && quickLookCandidate) {
          event.preventDefault()
          openQuickLook()
          return
        }

        if (!isEditable && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === '/') {
          event.preventDefault()
          setSpotlightOpen(true)
        }

        if (!activeWindowId) {
          return
        }

        if (primaryModifier && !event.shiftKey && event.key.toLowerCase() === 'w') {
          event.preventDefault()
          closeWindow(activeWindowId)
          return
        }

        if (primaryModifier && !event.shiftKey && event.key.toLowerCase() === 'm') {
          event.preventDefault()
          minimizeWindow(activeWindowId)
          pushToast('Ventana minimizada', activeWindow?.title)
          return
        }

        if (primaryModifier && !event.shiftKey && event.key.toLowerCase() === 'n') {
          event.preventDefault()
          if (activeWindow?.appId === 'finder') {
            openFinderWindow(activeWindow.finderState ? getActiveFinderRoute(activeWindow.finderState) : 'computer')
            pushToast('Nueva ventana de Finder')
            return
          }
          if (activeWindow?.appId === 'notes') {
            createNote()
            openApp('notes')
            return
          }
          if (activeWindow?.appId === 'terminal') {
            const nextWindow = createWindow('terminal')
            const dockRect = getDockRect('terminal')
            nextWindow.genie = dockRect ? { mode: 'opening', dockRect } : null
            setWindows((current) => [...current, nextWindow])
            pushToast('Nueva ventana de Terminal')
            return
          }
          if (activeWindow?.appId === 'safari') {
            openSafariWindow()
            pushToast('Nueva ventana de Safari')
            return
          }
        }

        if (activeWindow?.appId === 'safari' && primaryModifier && !event.shiftKey && event.key.toLowerCase() === 'r') {
          event.preventDefault()
          reloadBrowser(activeWindowId)
          pushToast('Safari', 'Recargando pagina actual.')
          return
        }

        if (event.altKey && !primaryModifier && !event.shiftKey && event.key === 'ArrowLeft') {
          if (activeWindow?.appId === 'safari') {
            event.preventDefault()
            moveBrowserHistory(activeWindowId, -1)
            return
          }
          if (activeWindow?.appId === 'finder' && activeWindow.finderState) {
            event.preventDefault()
            moveFinderHistory(activeWindowId, -1)
            return
          }
        }

        if (event.altKey && !primaryModifier && !event.shiftKey && event.key === 'ArrowRight') {
          if (activeWindow?.appId === 'safari') {
            event.preventDefault()
            moveBrowserHistory(activeWindowId, 1)
            return
          }
          if (activeWindow?.appId === 'finder' && activeWindow.finderState) {
            event.preventDefault()
            moveFinderHistory(activeWindowId, 1)
            return
          }
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setSpotlightOpen(false)
      }
    }

    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  }, [activeWindow, altTabCandidates, contextMenu, controlCenterOpen, launcherOpen, missionControlCandidates, missionControlState, openAppMenu, powerMenuOpen, quickLookCandidate, quickLookTarget, spotlightOpen, statusMenuOpen, systemDialog, windows])

  useEffect(() => {
    function handleAltTabKeyup(event: KeyboardEvent) {
      if (event.key !== 'Alt' || !altTabState.open) {
        return
      }

      event.preventDefault()
      activateAltTabSelection(altTabState.selectedIndex)
      setAltTabState({ open: false, selectedIndex: 0 })
    }

    window.addEventListener('keyup', handleAltTabKeyup)
    return () => window.removeEventListener('keyup', handleAltTabKeyup)
  }, [altTabState, altTabCandidates])

  useEffect(() => {
    if (!altTabState.open) {
      return
    }

    if (altTabCandidates.length === 0) {
      setAltTabState({ open: false, selectedIndex: 0 })
      return
    }

    if (altTabState.selectedIndex >= altTabCandidates.length) {
      setAltTabState((current) => ({
        ...current,
        selectedIndex: Math.max(0, altTabCandidates.length - 1),
      }))
    }
  }, [altTabCandidates, altTabState])

  useEffect(() => {
    if (!missionControlState.open) {
      return
    }

    if (missionControlCandidates.length === 0) {
      closeMissionControl()
      return
    }

    if (missionControlState.selectedIndex >= missionControlCandidates.length) {
      setMissionControlState((current) => ({
        ...current,
        selectedIndex: Math.max(0, missionControlCandidates.length - 1),
      }))
    }
  }, [missionControlCandidates, missionControlState])

  function dismissToast(id: string) {
    const timer = toastTimersRef.current[id]
    if (timer !== undefined) {
      window.clearTimeout(timer)
      delete toastTimersRef.current[id]
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  function closeSystemDialog() {
    dialogConfirmActionRef.current = null
    setSystemDialog(null)
  }

  function openSystemDialog(dialog: SystemDialogState, onConfirm?: () => void) {
    dialogConfirmActionRef.current = onConfirm ?? null
    setSystemDialog(dialog)
  }

  function confirmSystemDialog() {
    const action = dialogConfirmActionRef.current
    closeSystemDialog()
    action?.()
  }

  function pushToast(title: string, detail?: string) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const nextToast = { id, title, detail, createdAt: Date.now(), read: false }
    setToasts((current) => [...current.slice(-2), nextToast])
    setNotificationHistory((current) => [nextToast, ...current].slice(0, 30))
    toastTimersRef.current[id] = window.setTimeout(() => dismissToast(id), 3200)
  }

  function clearNotificationHistory() {
    setNotificationHistory([])
  }

  function rememberRecent(item: Omit<RecentItem, 'id' | 'createdAt'>) {
    setRecentItems((current) => {
      const nextItem: RecentItem = {
        ...item,
        id: `recent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
      }
      const withoutDuplicate = current.filter((entry) => entry.key !== item.key)
      return [nextItem, ...withoutDuplicate].slice(0, 14)
    })
  }

  function activateRecentItem(item: RecentItem) {
    switch (item.kind) {
      case 'app':
        if (item.appId) {
          openApp(item.appId)
        }
        return
      case 'installed-app': {
        const app = installedApps.find((entry) => entry.id === item.installedAppId)
        if (app) {
          void launchInstalledSystemApp(app)
        }
        return
      }
      case 'note':
        if (item.noteId) {
          setSelectedNoteId(item.noteId)
          openApp('notes')
        }
        return
      case 'document':
        if (item.itemId) {
          openDesktopDocument(item.itemId)
        }
        return
      case 'volume':
        if (item.mount) {
          openDesktopVolume(item.mount)
        }
        return
      case 'route':
        if (item.route) {
          openOrFocusFinderRoute(item.route)
        }
        return
      case 'path':
        if (item.path) {
          void openTrackedSystemPath(item.path, item.title, item.icon?.kind === 'image' ? item.icon.value : null)
        }
        return
    }
  }

  function activateAltTabSelection(index: number) {
    const target = altTabCandidates[index]
    if (!target) {
      return
    }
    focusWindow(target.id)
    pushToast('Ventana activa', target.title)
  }

  function activateMissionControlSelection(index: number) {
    const target = missionControlCandidates[index]
    if (!target) {
      return
    }

    focusWindow(target.id)
    closeMissionControl()
    pushToast('Mission Control', getWindowDisplayTitle(target))
  }

  function logoutToLogin() {
    setPowerMenuOpen(false)
    setOpenAppMenu(null)
    setControlCenterOpen(false)
    setLauncherOpen(false)
    setSpotlightOpen(false)
    setContextMenu(null)
    setLoginTransitioning(false)
    setLoggedIn(false)
    window.electronDesktop?.browser.hide()
  }

  async function quitDesktopApp() {
    setPowerMenuOpen(false)
    if (window.electronDesktop) {
      await window.electronDesktop.quitApp()
      return
    }
    window.close()
  }

  async function reloadDesktopApp() {
    setPowerMenuOpen(false)
    if (window.electronDesktop) {
      await window.electronDesktop.reloadApp()
      return
    }
    window.location.reload()
  }

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
    function handlePointerMove(event: PointerEvent) {
      const activeDrag = desktopItemDragRef.current
      if (!activeDrag) {
        return
      }

      const nextX = clamp(event.clientX - activeDrag.offsetX, 12, Math.max(12, window.innerWidth - 108))
      const nextY = clamp(event.clientY - activeDrag.offsetY, MENU_BAR_HEIGHT + 12, Math.max(MENU_BAR_HEIGHT + 12, window.innerHeight - 132))

      desktopItemDragRef.current = {
        ...activeDrag,
        moved: activeDrag.moved || Math.abs(event.movementX) > 0 || Math.abs(event.movementY) > 0,
      }

      setDesktopItems((current) =>
        current.map((item) =>
          item.id === activeDrag.id
            ? { ...item, x: nextX, y: nextY }
            : item,
        ),
      )
    }

    function handlePointerUp(event: PointerEvent) {
      const activeDrag = desktopItemDragRef.current
      if (activeDrag?.moved) {
        skipDesktopItemClickRef.current = activeDrag.id
        const dropTarget = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
        const folderTarget = dropTarget?.closest<HTMLElement>('[data-desktop-folder-id]')
        const trashTarget = dropTarget?.closest<HTMLElement>('[data-trash-drop-target]')

        if (trashTarget) {
          moveDesktopItemToTrashRef.current(activeDrag.id)
        } else if (folderTarget) {
          const folderId = folderTarget.dataset.desktopFolderId
          if (folderId) {
            moveDesktopItemToFolderRef.current(activeDrag.id, folderId)
          }
        }
      }
      desktopItemDragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const activeDrag = desktopTrashDragRef.current
      if (!activeDrag) {
        return
      }

      const nextX = clamp(event.clientX - activeDrag.offsetX, 12, Math.max(12, window.innerWidth - 108))
      const nextY = clamp(event.clientY - activeDrag.offsetY, MENU_BAR_HEIGHT + 12, Math.max(MENU_BAR_HEIGHT + 12, window.innerHeight - 132))

      desktopTrashDragRef.current = {
        ...activeDrag,
        moved: activeDrag.moved || Math.abs(event.movementX) > 0 || Math.abs(event.movementY) > 0,
      }

      setDesktopTrashPosition({ x: nextX, y: nextY })
    }

    function handlePointerUp() {
      if (desktopTrashDragRef.current?.moved) {
        skipDesktopTrashClickRef.current = true
      }
      desktopTrashDragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    const resetTimers = browserProgressResetTimersRef.current
    const showTimers = browserProgressShowTimersRef.current
    return () => {
      if (systemControlsFlushTimerRef.current !== null) {
        window.clearTimeout(systemControlsFlushTimerRef.current)
      }
      if (dockMouseFrameRef.current !== null) {
        window.cancelAnimationFrame(dockMouseFrameRef.current)
      }
      Object.values(resetTimers).forEach((timer) => window.clearTimeout(timer))
      Object.values(showTimers).forEach((timer) => window.clearTimeout(timer))
      Object.values(toastTimersRef.current).forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWindows((current) => {
        let changed = false
        const next = current.map((item) => {
          if (!item.browserState?.loading || item.browserState.progress <= 0 || item.browserState.progress >= 85) {
            return item
          }

          const increment = item.browserState.progress < 35 ? 9 : item.browserState.progress < 60 ? 5 : 2
          const progress = Math.min(85, item.browserState.progress + increment)
          changed = true
          return {
            ...item,
            browserState: {
              ...item.browserState,
              progress,
            },
          }
        })

        return changed ? next : current
      })
    }, 120)

    return () => window.clearInterval(timer)
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
    function syncBrowserHostNow() {
      const currentWindows = windowsRef.current
      const currentActiveWindow = [...currentWindows]
        .filter((item) => !item.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0]
      const safariWindow = [...currentWindows]
        .filter((item) => item.appId === 'safari' && !item.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0]

      if (
        !safariWindow ||
        safariWindow.id !== currentActiveWindow?.id ||
        !safariWindow.browserState ||
        isSafariHomeUrl(safariWindow.browserState.history[safariWindow.browserState.historyIndex])
      ) {
        if (lastBrowserSyncSignatureRef.current !== 'hidden') {
          lastBrowserSyncSignatureRef.current = 'hidden'
          api.browser.hide()
        }
        return
      }

      const host = browserHostRefs.current[safariWindow.id]
      if (!host) {
        if (lastBrowserSyncSignatureRef.current !== 'hidden') {
          lastBrowserSyncSignatureRef.current = 'hidden'
          api.browser.hide()
        }
        return
      }

      const rect = host.getBoundingClientRect()
      const url = safariWindow.browserState.history[safariWindow.browserState.historyIndex]
      const signature = `${safariWindow.id}:${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${url}`
      if (signature === lastBrowserSyncSignatureRef.current) {
        return
      }

      lastBrowserSyncSignatureRef.current = signature
      api.browser.syncHost({
        visible: true,
        bounds: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
        url,
      })
    }

    function scheduleBrowserHostSync() {
      if (browserSyncFrameRef.current !== null) {
        return
      }

      browserSyncFrameRef.current = window.requestAnimationFrame(() => {
        browserSyncFrameRef.current = null
        syncBrowserHostNow()
      })
    }

    scheduleBrowserHostSyncRef.current = scheduleBrowserHostSync
    const unsubscribe = api.onBrowserSyncRequest(scheduleBrowserHostSync)
    scheduleBrowserHostSync()
    window.addEventListener('resize', scheduleBrowserHostSync)

    return () => {
      unsubscribe()
      window.removeEventListener('resize', scheduleBrowserHostSync)
      if (browserSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(browserSyncFrameRef.current)
        browserSyncFrameRef.current = null
      }
      scheduleBrowserHostSyncRef.current = null
      lastBrowserSyncSignatureRef.current = ''
      api.browser.hide()
    }
  }, [])

  useEffect(() => {
    windowsRef.current = windows
    activeSafariWindowIdRef.current = activeSafariWindow?.id ?? null
  }, [activeSafariWindow?.id, windows])

  useEffect(() => {
    lastBrowserSyncSignatureRef.current = ''
    scheduleBrowserHostSyncRef.current?.()
  }, [
    activeSafariWindow?.browserState?.historyIndex,
    activeSafariWindow?.height,
    activeSafariWindow?.id,
    activeSafariWindow?.minimized,
    activeSafariWindow?.width,
    activeSafariWindow?.x,
    activeSafariWindow?.y,
    activeWindow?.id,
  ])

  useEffect(() => {
    const desktopApi = window.electronDesktop
    if (!desktopApi) {
      return undefined
    }

    return desktopApi.onBrowserState((payload) => {
      const targetWindowId = activeSafariWindowIdRef.current
      if (!targetWindowId) {
        return
      }

      const completedWindowIds: string[] = []
      setWindows((current) => {
        let changed = false
        const next = current.map((item) => {
          if (item.id !== targetWindowId || item.appId !== 'safari' || !item.browserState) {
            return item
          }

          const currentState = item.browserState
          const activeTab = getActiveBrowserTab(currentState)
          if (!activeTab) {
            return item
          }
          const nextTab = { ...activeTab }
          let tabChanged = false
          const nextState = { ...currentState }

          if (payload.url && payload.url !== activeTab.history[activeTab.historyIndex]) {
            const nextHistory = [...activeTab.history.slice(0, activeTab.historyIndex + 1), payload.url]
            nextTab.history = nextHistory
            nextTab.historyIndex = nextHistory.length - 1
            nextTab.inputValue = payload.url
            tabChanged = true
            changed = true
          }

          if (payload.loading) {
            if (!activeTab.loading) {
              nextTab.loading = true
              tabChanged = true
              changed = true
            }
          } else {
            const wasLoading = activeTab.loading
            if (wasLoading) {
              nextTab.loading = false
              tabChanged = true
              changed = true
            }
            if (wasLoading || activeTab.progress > 0) {
              nextTab.progress = 100
              tabChanged = true
              completedWindowIds.push(item.id)
              changed = true
            }
          }

          const nextTitle = payload.title ?? activeTab.title
          if (nextTitle !== activeTab.title) {
            nextTab.title = nextTitle
            tabChanged = true
            changed = true
          }

          const nextError = payload.lastError ?? null
          if (nextError !== activeTab.lastError) {
            nextTab.lastError = nextError
            tabChanged = true
            changed = true
          }

          if (tabChanged) {
            nextState.tabs = currentState.tabs.map((tab) => tab.id === nextTab.id ? nextTab : tab)
          }

          return changed ? { ...item, browserState: syncBrowserState(nextState) } : item
        })

        return changed ? next : current
      })

      completedWindowIds.forEach((windowId) => completeBrowserProgressRef.current(windowId, !!payload.lastError))
    })
  }, [])

  useEffect(() => {
    const requestedTargets = new Set<string>()

    windows.forEach((windowItem) => {
      const route = getActiveFinderRoute(windowItem.finderState)
      const targetPath = getVolumePathFromRoute(route)
      if (targetPath) {
        requestedTargets.add(targetPath)
        return
      }

      const desktopFolderId = getDesktopFolderIdFromRoute(route)
      if (desktopFolderId) {
        const desktopFolder = desktopItems.find((item) => item.id === desktopFolderId && item.kind === 'folder' && item.sourcePath)
        if (desktopFolder?.sourcePath) {
          requestedTargets.add(desktopFolder.sourcePath)
        }
      }
    })

    requestedTargets.forEach((targetPath) => {
      if (volumeEntriesByMount[targetPath] || loadingVolumeMounts[targetPath]) {
        return
      }

      void loadVolumeEntriesPage(targetPath, { reset: true })
    })
  }, [desktopItems, loadVolumeEntriesPage, loadingVolumeMounts, volumeEntriesByMount, windows])

  useEffect(() => {
    if (!initialLowEndDevice || !window.electronDesktop) {
      return
    }

    progressiveEntryPaths.forEach((targetPath) => {
      const loadedCount = volumeEntriesByMount[targetPath]?.length ?? 0
      const visibleCount = visibleEntryCountsByPath[targetPath] ?? 0
      const meta = volumeEntryMetaByPath[targetPath]

      if (!meta?.hasMore || loadingVolumeMounts[targetPath]) {
        return
      }

      if (visibleCount >= Math.max(0, loadedCount - 8)) {
        void loadVolumeEntriesPage(targetPath)
      }
    })
  }, [
    initialLowEndDevice,
    loadVolumeEntriesPage,
    loadingVolumeMounts,
    progressiveEntryPaths,
    visibleEntryCountsByPath,
    volumeEntriesByMount,
    volumeEntryMetaByPath,
  ])

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
                resolvedPerformanceProfile === 'compatibility'
                  ? item.genie.mode === 'opening'
                    ? [
                        { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, opacity: '0.78', offset: 0 },
                        { transform: `translate(${deltaX * 0.42}px, ${deltaY * 0.5}px) scale(${Math.max(0.74, scaleX + 0.18)}, ${Math.max(0.82, scaleY + 0.12)})`, opacity: '0.94', offset: 0.6 },
                        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: '1', offset: 1 },
                      ]
                    : [
                        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: '1', offset: 0 },
                        { transform: `translate(${deltaX * 0.42}px, ${deltaY * 0.5}px) scale(${Math.max(0.74, scaleX + 0.18)}, ${Math.max(0.82, scaleY + 0.12)})`, opacity: '0.94', offset: 0.4 },
                        { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, opacity: '0.78', offset: 1 },
                      ]
                  : resolvedPerformanceProfile === 'balanced'
                    ? item.genie.mode === 'opening'
                      ? [
                          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, clipPath: createLampClipPath(anchorX, 46, 4, narrowTip, bias), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.84', offset: 0 },
                          { transform: `translate(${deltaX * 0.7}px, ${deltaY * 0.76}px) scale(${Math.min(0.22, scaleX + 0.04)}, ${Math.min(0.46, scaleY + 0.1)})`, clipPath: createLampClipPath(anchorX, 34, 8, mediumTip, bias * 0.7), borderRadius: `${WINDOW_RADIUS + 7}px`, opacity: '0.89', offset: 0.2 },
                          { transform: `translate(${deltaX * 0.44}px, ${deltaY * 0.52}px) scale(${Math.min(0.58, scaleX + 0.18)}, ${Math.min(0.76, scaleY + 0.15)})`, clipPath: createLampClipPath(anchorX, 18, 11, wideTip, bias * 0.44), borderRadius: `${WINDOW_RADIUS + 4}px`, opacity: '0.96', offset: 0.56 },
                          { transform: `translate(${deltaX * 0.1}px, ${deltaY * 0.14}px) scale(1.01, 0.995)`, clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0.84 },
                          { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 1 },
                        ]
                      : [
                          { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0 },
                          { transform: `translate(${deltaX * 0.12}px, ${deltaY * 0.16}px) scale(1.01, 0.995)`, clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0.12 },
                          { transform: `translate(${deltaX * 0.44}px, ${deltaY * 0.52}px) scale(${Math.max(0.42, scaleX + 0.16)}, ${Math.max(0.62, scaleY + 0.14)})`, clipPath: createLampClipPath(anchorX, 18, 11, wideTip, bias * 0.44), borderRadius: `${WINDOW_RADIUS + 4}px`, opacity: '0.95', offset: 0.5 },
                          { transform: `translate(${deltaX * 0.78}px, ${deltaY * 0.84}px) scale(${Math.max(0.16, scaleX + 0.03)}, ${Math.max(0.28, scaleY + 0.07)})`, clipPath: createLampClipPath(anchorX, 36, 8, mediumTip, bias * 0.78), borderRadius: `${WINDOW_RADIUS + 7}px`, opacity: '0.88', offset: 0.82 },
                          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, clipPath: createLampClipPath(anchorX, 46, 4, narrowTip, bias), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.84', offset: 1 },
                        ]
                    : item.genie.mode === 'opening'
                      ? [
                          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, clipPath: createLampClipPath(anchorX, 50, 2.5, narrowTip, bias), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.84', offset: 0 },
                          { transform: `translate(${deltaX * 0.92}px, ${deltaY * 0.95}px) scale(${Math.min(0.13, scaleX + 0.01)}, ${Math.min(0.28, scaleY + 0.03)})`, clipPath: createLampClipPath(anchorX, 43, 5.5, Math.max(3, narrowTip * 1.08), bias * 0.92), borderRadius: `${WINDOW_RADIUS + 9}px`, opacity: '0.85', offset: 0.08 },
                          { transform: `translate(${deltaX * 0.78}px, ${deltaY * 0.86}px) scale(${Math.min(0.18, scaleX + 0.015)}, ${Math.min(0.42, scaleY + 0.08)})`, clipPath: createLampClipPath(anchorX, 36, 8.5, mediumTip, bias * 0.78), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.88', offset: 0.22 },
                          { transform: `translate(${deltaX * 0.56}px, ${deltaY * 0.68}px) scale(${Math.min(0.4, scaleX + 0.11)}, ${Math.min(0.64, scaleY + 0.14)})`, clipPath: createLampClipPath(anchorX, 24, 11, Math.max(10, wideTip * 0.84), bias * 0.56), borderRadius: `${WINDOW_RADIUS + 6}px`, opacity: '0.92', offset: 0.42 },
                          { transform: `translate(${deltaX * 0.32}px, ${deltaY * 0.42}px) scale(${Math.min(0.74, scaleX + 0.28)}, ${Math.min(0.88, scaleY + 0.18)})`, clipPath: createLampClipPath(anchorX, 14, 12, wideTip, bias * 0.32), borderRadius: `${WINDOW_RADIUS + 4}px`, opacity: '0.97', offset: 0.68 },
                          { transform: `translate(${deltaX * 0.1}px, ${deltaY * 0.14}px) scale(1.02, 0.99)`, clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0.88 },
                          { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 1 },
                        ]
                      : [
                          { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0 },
                          { transform: `translate(${deltaX * 0.1}px, ${deltaY * 0.14}px) scale(1.02, 0.99)`, clipPath: `inset(0 round ${WINDOW_RADIUS}px)`, borderRadius: `${WINDOW_RADIUS}px`, opacity: '1', offset: 0.08 },
                          { transform: `translate(${deltaX * 0.32}px, ${deltaY * 0.42}px) scale(${Math.max(0.56, 1 - (1 - scaleX) * 0.18)}, ${Math.max(0.74, 1 - (1 - scaleY) * 0.08)})`, clipPath: createLampClipPath(anchorX, 14, 12, wideTip, bias * 0.32), borderRadius: `${WINDOW_RADIUS + 4}px`, opacity: '0.97', offset: 0.24 },
                          { transform: `translate(${deltaX * 0.56}px, ${deltaY * 0.68}px) scale(${Math.max(0.32, scaleX + 0.12)}, ${Math.max(0.54, scaleY + 0.14)})`, clipPath: createLampClipPath(anchorX, 24, 11, Math.max(10, wideTip * 0.84), bias * 0.56), borderRadius: `${WINDOW_RADIUS + 6}px`, opacity: '0.92', offset: 0.46 },
                          { transform: `translate(${deltaX * 0.78}px, ${deltaY * 0.86}px) scale(${Math.max(0.16, scaleX + 0.02)}, ${Math.max(0.28, scaleY + 0.08)})`, clipPath: createLampClipPath(anchorX, 36, 8.5, mediumTip, bias * 0.78), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.88', offset: 0.7 },
                          { transform: `translate(${deltaX * 0.92}px, ${deltaY * 0.95}px) scale(${Math.max(0.095, scaleX + 0.01)}, ${Math.max(0.16, scaleY + 0.03)})`, clipPath: createLampClipPath(anchorX, 43, 5.5, Math.max(3, narrowTip * 1.08), bias * 0.92), borderRadius: `${WINDOW_RADIUS + 9}px`, opacity: '0.85', offset: 0.88 },
                          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`, clipPath: createLampClipPath(anchorX, 50, 2.5, narrowTip, bias), borderRadius: `${WINDOW_RADIUS + 8}px`, opacity: '0.84', offset: 1 },
                        ]

              return frameNode.animate(frames, {
                duration: resolvedPerformanceProfile === 'compatibility' ? 240 : resolvedPerformanceProfile === 'balanced' ? 520 : 940,
                easing: 'cubic-bezier(0.22, 0.78, 0.2, 1)',
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
  }, [resolvedPerformanceProfile, windows])

  const activeApp = activeWindow ? getResolvedApp(activeWindow.appId) : getResolvedApp('finder')
  const topZIndex = useMemo(() => windows.reduce((max, item) => Math.max(max, item.zIndex), 0), [windows])

  useEffect(() => {
    if (!initialLowEndDevice) {
      return
    }

    Object.entries(videoElementRefs.current).forEach(([windowId, video]) => {
      if (!video || activeWindow?.id === windowId) {
        return
      }

      if (!video.paused) {
        video.pause()
      }
      updateVideoPlaybackMeta(windowId)
    })
  }, [activeWindow?.id, initialLowEndDevice])

  function getAppMenuActions(windowItem: WindowState | undefined, menuLabel: string): Array<{ id: AppMenuAction; label: string }> {
    if (!windowItem) {
      switch (menuLabel) {
        case 'Archivo':
          return [{ id: 'finder-new-window', label: 'Nueva ventana de Finder' }]
        case 'Edicion':
          return desktopClipboard ? [{ id: 'finder-paste', label: 'Pegar' }] : []
        case 'Ver':
          return [{ id: 'finder-refresh', label: 'Actualizar escritorio' }]
        case 'Ir':
          return [
            { id: 'finder-go-desktop', label: 'Escritorio' },
            { id: 'finder-go-computer', label: 'Equipo' },
            { id: 'finder-go-trash', label: 'Papelera' },
            { id: 'finder-go-device', label: 'Dispositivo' },
            { id: 'finder-go-applications', label: 'Aplicaciones' },
            { id: 'finder-go-dock', label: 'Dock' },
            { id: 'finder-go-display', label: 'Pantalla' },
          ]
        case 'Ventana':
          return [{ id: 'finder-new-window', label: 'Nueva ventana' }]
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
        default:
          return []
      }
    }

    const defaultWindowActions = [
      { id: 'window-minimize' as const, label: 'Minimizar ventana' },
      { id: 'window-close' as const, label: 'Cerrar ventana' },
    ]

    if (windowItem.appId === 'notes') {
      switch (menuLabel) {
        case 'Archivo':
          return [{ id: 'note-new', label: 'Nueva nota' }, { id: 'window-close', label: 'Cerrar ventana' }]
        case 'Ventana':
          return defaultWindowActions
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
        default:
          return []
      }
    }

    if (windowItem.appId === 'textedit') {
      switch (menuLabel) {
        case 'Ventana':
          return defaultWindowActions
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
        default:
          return []
      }
    }

    if (windowItem.appId === 'safari' && windowItem.browserState) {
      const canGoBack = windowItem.browserState.historyIndex > 0
      const canGoForward = windowItem.browserState.historyIndex < windowItem.browserState.history.length - 1
      const currentUrl = windowItem.browserState.history[windowItem.browserState.historyIndex] ?? getInitialBrowserUrl(isElectronDesktop)
      switch (menuLabel) {
        case 'Archivo':
          return [
            { id: 'safari-new-window', label: 'Nueva ventana' },
            { id: 'browser-open-external', label: 'Abrir pagina en navegador externo' },
          ]
        case 'Visualizacion':
          return [
            { id: 'browser-reload', label: 'Recargar pagina' },
            { id: 'browser-home', label: isSafariHomeUrl(currentUrl) ? 'Inicio de Safari' : 'Ir a inicio' },
          ]
        case 'Historial':
          return [
            ...(canGoBack ? [{ id: 'browser-go-back' as const, label: 'Atras' }] : []),
            ...(canGoForward ? [{ id: 'browser-go-forward' as const, label: 'Adelante' }] : []),
          ]
        case 'Marcadores':
          return [{ id: 'browser-home', label: 'Pagina de inicio' }]
        default:
          return []
      }
    }

    if (windowItem.appId === 'calculator') {
      switch (menuLabel) {
        case 'Archivo':
        case 'Ver':
          return [{ id: 'calculator-clear', label: 'Limpiar calculadora' }]
        case 'Ventana':
          return defaultWindowActions
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
        default:
          return []
      }
    }

    if (windowItem.appId === 'finder' && windowItem.finderState) {
      const activeRoute = getActiveFinderRoute(windowItem.finderState)
      const activeDesktopFolderId = getDesktopFolderIdFromRoute(activeRoute)
      const canCreateVirtualContent = activeRoute === 'desktop' || !!activeDesktopFolderId
      const activeTab = getActiveFinderTab(windowItem.finderState)
      const canGoBack = !!activeTab && activeTab.historyIndex > 0
      const canGoForward = !!activeTab && activeTab.historyIndex < activeTab.history.length - 1

      switch (menuLabel) {
        case 'Archivo':
          return [
            ...(canCreateVirtualContent ? [{ id: 'finder-new-folder' as const, label: 'Nueva carpeta' }] : []),
            ...(canCreateVirtualContent ? [{ id: 'finder-new-text' as const, label: 'Nuevo documento de texto' }] : []),
            { id: 'finder-new-window', label: 'Nueva ventana de Finder' },
            { id: 'finder-new-tab', label: 'Nueva pestana' },
            { id: 'window-close', label: 'Cerrar ventana' },
          ]
        case 'Edicion':
          return [
            ...(desktopClipboard ? [{ id: 'finder-paste' as const, label: 'Pegar' }] : []),
            { id: 'finder-refresh', label: 'Actualizar' },
          ]
        case 'Ver':
          return [
            { id: 'finder-refresh', label: 'Actualizar' },
          ]
        case 'Ir':
          return [
            ...(canGoBack ? [{ id: 'finder-go-back' as const, label: 'Atras' }] : []),
            ...(canGoForward ? [{ id: 'finder-go-forward' as const, label: 'Adelante' }] : []),
            { id: 'finder-go-desktop', label: 'Escritorio' },
            { id: 'finder-go-computer', label: 'Equipo' },
            { id: 'finder-go-trash', label: 'Papelera' },
            { id: 'finder-go-device', label: 'Dispositivo' },
            { id: 'finder-go-applications', label: 'Aplicaciones' },
            { id: 'finder-go-dock', label: 'Dock' },
            { id: 'finder-go-display', label: 'Pantalla' },
          ]
        case 'Ventana':
          return [
            { id: 'window-minimize', label: 'Minimizar ventana' },
            { id: 'finder-new-window', label: 'Nueva ventana' },
            { id: 'finder-new-tab', label: 'Nueva pestana' },
            { id: 'window-close', label: 'Cerrar ventana' },
          ]
        case 'Ayuda':
          return [
            { id: 'about-open', label: 'Acerca de Mactorno' },
          ]
        default:
          return []
      }
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
          return defaultWindowActions
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
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
          return defaultWindowActions
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
        default:
          return []
      }
    }

    if (windowItem.appId === 'terminal') {
      switch (menuLabel) {
        case 'Shell':
          return [{ id: 'terminal-new-window', label: 'Nueva ventana de Terminal' }]
        case 'Ventana':
          return defaultWindowActions
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
        default:
          return []
      }
    }

    if (windowItem.appId === 'launcher' || windowItem.appId === 'docksettings' || windowItem.appId === 'display' || windowItem.appId === 'about') {
      switch (menuLabel) {
        case 'Ventana':
          return defaultWindowActions
        case 'Ayuda':
          return [{ id: 'about-open', label: 'Acerca de Mactorno' }]
        default:
          return []
      }
    }

    return []
  }

  async function runAppMenuAction(action: AppMenuAction) {
    setOpenAppMenu(null)

    if (!activeWindow) {
      switch (action) {
        case 'finder-new-window':
          openFinderWindow('desktop')
          return
        case 'finder-paste':
          pasteDesktopClipboard()
          return
        case 'finder-refresh':
          return
        case 'finder-go-desktop':
          openOrFocusFinderRoute('desktop')
          return
        case 'finder-go-computer':
          openOrFocusFinderRoute('computer')
          return
        case 'finder-go-trash':
          openOrFocusFinderRoute('trash')
          return
        case 'finder-go-device':
          openOrFocusFinderRoute('device')
          return
        case 'finder-go-applications':
          openOrFocusFinderRoute('applications')
          return
        case 'finder-go-dock':
          openOrFocusFinderRoute('dock')
          return
        case 'finder-go-display':
          openOrFocusFinderRoute('display')
          return
        case 'about-open':
          openApp('about')
          return
        default:
          return
      }
    }

    const activeFinderRoute = activeWindow.finderState ? getActiveFinderRoute(activeWindow.finderState) : null
    const activeDesktopFolderId = activeFinderRoute ? getDesktopFolderIdFromRoute(activeFinderRoute) : null

    switch (action) {
      case 'note-new':
        createNote()
        if (activeWindow.appId !== 'notes') {
          openApp('notes')
        }
        return
      case 'calculator-clear':
        clearCalculator(activeWindow.id)
        return
      case 'safari-new-window':
        openSafariWindow()
        return
      case 'browser-go-back':
        moveBrowserHistory(activeWindow.id, -1)
        return
      case 'browser-go-forward':
        moveBrowserHistory(activeWindow.id, 1)
        return
      case 'browser-reload':
        reloadBrowser(activeWindow.id)
        return
      case 'browser-open-external':
        if (activeWindow.browserState) {
          openBrowserExternally(activeWindow.browserState.history[activeWindow.browserState.historyIndex] ?? '')
        }
        return
      case 'browser-home':
        commitBrowserNavigation(activeWindow.id, getInitialBrowserUrl(isElectronDesktop))
        return
      case 'terminal-new-window': {
        const nextWindow = createWindow('terminal')
        const dockRect = getDockRect('terminal')
        nextWindow.genie = dockRect ? { mode: 'opening', dockRect } : null
        setWindows((current) => [...current, nextWindow])
        return
      }
      case 'finder-new-folder':
        createDesktopItem('folder', undefined, activeDesktopFolderId ?? null)
        return
      case 'finder-new-text':
        createDesktopItem('text', undefined, activeDesktopFolderId ?? null)
        return
      case 'finder-paste':
        pasteDesktopClipboard(undefined, activeDesktopFolderId ?? null)
        return
      case 'finder-refresh':
        if (activeFinderRoute) {
          const targetPath = getVolumePathFromRoute(activeFinderRoute)
          if (targetPath) {
            setVolumeEntriesByMount((current) => {
              const next = { ...current }
              delete next[targetPath]
              return next
            })
            setLoadingVolumeMounts((current) => {
              const next = { ...current }
              delete next[targetPath]
              return next
            })
          }
        }
        return
      case 'finder-go-back':
        moveFinderHistory(activeWindow.id, -1)
        return
      case 'finder-go-forward':
        moveFinderHistory(activeWindow.id, 1)
        return
      case 'finder-go-desktop':
        navigateFinder(activeWindow.id, 'desktop')
        return
      case 'finder-go-computer':
        navigateFinder(activeWindow.id, 'computer')
        return
      case 'finder-go-trash':
        navigateFinder(activeWindow.id, 'trash')
        return
      case 'finder-go-device':
        navigateFinder(activeWindow.id, 'device')
        return
      case 'finder-go-applications':
        navigateFinder(activeWindow.id, 'applications')
        return
      case 'finder-go-dock':
        navigateFinder(activeWindow.id, 'dock')
        return
      case 'finder-go-display':
        navigateFinder(activeWindow.id, 'display')
        return
      case 'finder-new-window':
        openFinderWindow(activeFinderRoute ?? 'computer')
        return
      case 'finder-new-tab':
        openFinderTab(activeWindow.id, activeFinderRoute ?? 'computer')
        return
      case 'about-open':
        openApp('about')
        return
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
          await openTrackedSystemPath(activeWindow.mediaPath, activeWindow.title)
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
      width: appId === 'finder' ? 780 : appId === 'launcher' ? 700 : appId === 'about' ? 520 : appId === 'calculator' ? 292 : appId === 'display' ? 620 : appId === 'textedit' ? 620 : 460,
      height: appId === 'finder' ? 500 : appId === 'launcher' ? 460 : appId === 'about' ? 420 : appId === 'calculator' ? 430 : appId === 'display' ? 520 : appId === 'textedit' ? 460 : 340,
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
      textDocumentId: null,
    }
  }

  function serializeWindowForSession(windowItem: WindowState): WindowSessionEntry | null {
    if (windowItem.genie?.removeOnFinish) {
      return null
    }

    return {
      id: windowItem.id,
      appId: windowItem.appId,
      title: windowItem.title,
      x: windowItem.x,
      y: windowItem.y,
      width: windowItem.width,
      height: windowItem.height,
      zIndex: windowItem.zIndex,
      minimized: windowItem.minimized,
      maximized: windowItem.maximized,
      restoreBounds: windowItem.restoreBounds,
      finderState: windowItem.finderState,
      browserState: windowItem.browserState,
      calculatorState: windowItem.calculatorState,
      terminalState: windowItem.terminalState,
      mediaPath: windowItem.mediaPath,
      textDocumentId: windowItem.textDocumentId,
    }
  }

  function openApp(appId: AppId) {
    setSpotlightOpen(false)
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
    rememberRecent({
      key: `app:${appId}`,
      kind: 'app',
      title: getResolvedApp(appId).name,
      subtitle: 'App integrada',
      appId,
      icon: getResolvedApp(appId).iconSpec,
    })

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
    setSpotlightOpen(false)
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

  function createDesktopItem(kind: DesktopItem['kind'], position?: { x: number; y: number }, parentId: string | null = null) {
    const nextName = getNextDesktopItemName(kind, parentId)

    const fallbackPosition = getNextDesktopItemPosition(rootDesktopItems.length)
    const desktop = getDesktopBounds()
    const nextPosition = position
      ? {
          x: clamp(position.x, desktop.x, desktop.x + desktop.width - 88),
          y: clamp(position.y, desktop.y, desktop.y + desktop.height - 92),
        }
      : fallbackPosition

    const nextItem: DesktopItem = {
      id: `desktop-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      name: nextName,
      parentId,
      content: kind === 'text' ? '' : '',
      sourcePath: null,
      extension: '',
      iconDataUrl: null,
      x: nextPosition.x,
      y: nextPosition.y,
      updatedAt: Date.now(),
      trashedAt: null,
    }

    setDesktopItems((current) => [...current, nextItem])
    setEditingDesktopItemId(nextItem.id)
    setEditingDesktopItemName(nextItem.name)
    setContextMenu(null)
    pushToast(kind === 'folder' ? 'Nueva carpeta' : kind === 'text' ? 'Nuevo documento' : 'Nuevo archivo', nextItem.name)

    if (kind === 'text') {
      window.setTimeout(() => {
        openDesktopDocument(nextItem.id)
      }, 0)
    }
  }

  function renameDesktopItem(itemId: string) {
    const target = desktopItems.find((item) => item.id === itemId)
    if (!target) {
      setContextMenu(null)
      return
    }

    setEditingDesktopItemId(itemId)
    setEditingDesktopItemName(target.name)
    setContextMenu(null)
  }

  function commitDesktopItemRename(itemId: string) {
    const target = desktopItems.find((item) => item.id === itemId)
    if (!target) {
      setEditingDesktopItemId(null)
      setEditingDesktopItemName('')
      return
    }

    const nextName = editingDesktopItemName.trim() || target.name
    const conflictingItem = desktopItems.find((item) =>
      item.id !== itemId &&
      item.parentId === target.parentId &&
      item.trashedAt === null &&
      item.name.trim().toLowerCase() === nextName.trim().toLowerCase())

    if (conflictingItem) {
      openSystemDialog({
        title: 'Nombre en uso',
        message: `Ya existe un elemento llamado "${nextName}" en esta ubicacion.`,
        confirmLabel: 'Entendido',
      })
      setEditingDesktopItemId(null)
      setEditingDesktopItemName('')
      return
    }

    setDesktopItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, name: nextName, updatedAt: Date.now() }
          : item,
      ),
    )

    setWindows((current) =>
      current.map((item) =>
        item.textDocumentId === itemId
          ? { ...item, title: nextName }
          : item,
      ),
    )

    setEditingDesktopItemId(null)
    setEditingDesktopItemName('')
  }

  function cancelDesktopItemRename() {
    setEditingDesktopItemId(null)
    setEditingDesktopItemName('')
  }

  function deleteDesktopItem(itemId: string) {
    const descendants = new Set<string>([itemId])
    let changed = true

    while (changed) {
      changed = false
      desktopItems.forEach((item) => {
        if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
        }
      })
    }

    const trashedAt = Date.now()

    setDesktopItems((current) =>
      current.map((item) =>
        descendants.has(item.id)
          ? { ...item, trashedAt, updatedAt: trashedAt }
          : item,
      ),
    )
    setWindows((current) =>
      current
        .filter((item) => !item.textDocumentId || !descendants.has(item.textDocumentId))
        .map((item) => {
          if (item.finderState && isDesktopFolderRoute(getActiveFinderRoute(item.finderState))) {
            const folderId = getDesktopFolderIdFromRoute(getActiveFinderRoute(item.finderState))
            if (folderId && descendants.has(folderId)) {
              return {
                ...item,
                finderState: createFinderState('desktop'),
              }
            }
          }
          return item
        }),
    )
    setContextMenu(null)
  }

  function restoreDesktopItem(itemId: string) {
    const descendants = new Set<string>([itemId])
    let changed = true

    while (changed) {
      changed = false
      desktopItems.forEach((item) => {
        if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
        }
      })
    }

    setDesktopItems((current) =>
      current.map((item) =>
        descendants.has(item.id)
          ? { ...item, trashedAt: null, updatedAt: Date.now() }
          : item,
      ),
    )
  }

  function isDesktopItemDescendant(itemId: string, potentialAncestorId: string) {
    let current = desktopItems.find((item) => item.id === itemId) ?? null
    while (current?.parentId) {
      if (current.parentId === potentialAncestorId) {
        return true
      }
      current = desktopItems.find((item) => item.id === current!.parentId) ?? null
    }
    return false
  }

  function moveDesktopItemToFolder(itemId: string, folderId: string) {
    if (itemId === folderId || isDesktopItemDescendant(folderId, itemId)) {
      return
    }

    setDesktopItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, parentId: folderId, trashedAt: null, updatedAt: Date.now() }
          : item,
      ),
    )
  }

  function moveDesktopItemToDesktop(itemId: string, position?: { x: number; y: number }) {
    const sourceItem = desktopItems.find((item) => item.id === itemId && item.trashedAt === null)
    if (!sourceItem) {
      return
    }

    const desktop = getDesktopBounds()
    const fallbackPosition = getNextDesktopItemPosition(rootDesktopItems.length)
    const nextPosition = position
      ? {
          x: clamp(position.x, desktop.x, desktop.x + desktop.width - 88),
          y: clamp(position.y, desktop.y, desktop.y + desktop.height - 92),
        }
      : sourceItem.parentId === null
        ? { x: sourceItem.x, y: sourceItem.y }
        : fallbackPosition

    if (
      sourceItem.parentId === null &&
      sourceItem.x === nextPosition.x &&
      sourceItem.y === nextPosition.y
    ) {
      return
    }

    setDesktopItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, parentId: null, x: nextPosition.x, y: nextPosition.y, trashedAt: null, updatedAt: Date.now() }
          : item,
      ),
    )
  }

  function moveDesktopItemToTrash(itemId: string) {
    deleteDesktopItem(itemId)
  }

  moveDesktopItemToFolderRef.current = moveDesktopItemToFolder
  moveDesktopItemToTrashRef.current = moveDesktopItemToTrash

  function importVolumeEntryToDesktop(entry: VolumeEntry, destinationParentId: string | null, position?: { x: number; y: number }) {
    const fallbackPosition = getNextDesktopItemPosition(rootDesktopItems.length)
    const desktop = getDesktopBounds()
    const nextPosition = position
      ? {
          x: clamp(position.x, desktop.x, desktop.x + desktop.width - 88),
          y: clamp(position.y, desktop.y, desktop.y + desktop.height - 92),
        }
      : fallbackPosition

    const nextItem: DesktopItem = {
      id: `desktop-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: entry.kind === 'directory' ? 'folder' : 'file',
      name: entry.name,
      parentId: destinationParentId,
      content: '',
      sourcePath: entry.path,
      extension: entry.extension,
      iconDataUrl: entry.icon ?? null,
      x: nextPosition.x,
      y: nextPosition.y,
      updatedAt: Date.now(),
      trashedAt: null,
    }

    setDesktopItems((current) => [...current, nextItem])
    pushToast(nextItem.kind === 'folder' ? 'Nueva carpeta' : nextItem.kind === 'text' ? 'Nuevo documento' : 'Nuevo archivo', nextItem.name)
  }

  function openDesktopFileItem(itemId: string) {
    if (skipDesktopItemClickRef.current === itemId) {
      skipDesktopItemClickRef.current = null
      return
    }

    const target = desktopItems.find((item) => item.id === itemId && item.kind === 'file' && item.sourcePath)
    if (!target?.sourcePath) {
      return
    }

    const entry: VolumeEntry = {
      name: target.name,
      path: target.sourcePath,
      kind: 'file',
      extension: target.extension,
      sizeBytes: null,
      icon: target.iconDataUrl,
    }

    if (isImageEntry(entry)) {
      rememberRecent({
        key: `path:${entry.path}`,
        kind: 'path',
        title: entry.name,
        subtitle: entry.path,
        path: entry.path,
        icon: target.iconDataUrl ? { kind: 'image', value: target.iconDataUrl } : { kind: 'glyph', value: '🖼' },
      })
      openMediaWindow('photos', entry)
      return
    }

    if (isVideoEntry(entry)) {
      rememberRecent({
        key: `path:${entry.path}`,
        kind: 'path',
        title: entry.name,
        subtitle: entry.path,
        path: entry.path,
        icon: target.iconDataUrl ? { kind: 'image', value: target.iconDataUrl } : { kind: 'glyph', value: '🎬' },
      })
      openMediaWindow('videos', entry)
      return
    }

    void openTrackedSystemPath(target.sourcePath, target.name, target.iconDataUrl)
  }

  function collectDesktopItemTree(sourceId: string) {
    const nodes: DesktopItem[] = []
    const visit = (itemId: string) => {
      const item = desktopItems.find((entry) => entry.id === itemId)
      if (!item) {
        return
      }
      nodes.push(item)
      desktopItems
        .filter((entry) => entry.parentId === itemId && entry.trashedAt === null)
        .forEach((child) => visit(child.id))
    }
    visit(sourceId)
    return nodes
  }

  function cloneDesktopItemTree(sourceId: string, destinationParentId: string | null, position?: { x: number; y: number }) {
    const sourceRoot = desktopItems.find((item) => item.id === sourceId && item.trashedAt === null)
    if (!sourceRoot) {
      return
    }

    const tree = collectDesktopItemTree(sourceId)
    if (tree.length === 0) {
      return
    }

    const idMap = new Map<string, string>()
    const pastedRootName = getNextDesktopItemName(sourceRoot.kind, destinationParentId)
    const fallbackPosition = getNextDesktopItemPosition(rootDesktopItems.length)
    const desktop = getDesktopBounds()
    const nextPosition = position
      ? {
          x: clamp(position.x, desktop.x, desktop.x + desktop.width - 88),
          y: clamp(position.y, desktop.y, desktop.y + desktop.height - 92),
        }
      : fallbackPosition

    const clones = tree.map((item) => {
      const nextId = `desktop-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      idMap.set(item.id, nextId)
      return {
        ...item,
        id: nextId,
        name: item.id === sourceRoot.id ? pastedRootName : item.name,
        parentId: item.id === sourceRoot.id
          ? destinationParentId
          : (item.parentId ? idMap.get(item.parentId) ?? item.parentId : null),
        x: item.id === sourceRoot.id ? nextPosition.x : item.x,
        y: item.id === sourceRoot.id ? nextPosition.y : item.y,
        updatedAt: Date.now(),
        trashedAt: null,
      }
    })

    setDesktopItems((current) => [...current, ...clones])
  }

  function copyDesktopItem(itemId: string) {
    const item = desktopItems.find((entry) => entry.id === itemId && entry.trashedAt === null)
    if (!item) {
      return
    }
    setDesktopClipboard({ type: 'desktop-item', itemId })
    setContextMenu(null)
  }

  function copyVolumeEntry(entry: VolumeEntry) {
    setDesktopClipboard({ type: 'volume-entry', entry })
    setContextMenu(null)
  }

  function duplicateDesktopItem(itemId: string) {
    cloneDesktopItemTree(itemId, null)
    setContextMenu(null)
  }

  function pasteDesktopClipboard(position?: { x: number; y: number }, parentId: string | null = null) {
    if (!desktopClipboard) {
      setContextMenu(null)
      return
    }

    if (desktopClipboard.type === 'desktop-item') {
      cloneDesktopItemTree(desktopClipboard.itemId, parentId, position)
    } else {
      importVolumeEntryToDesktop(desktopClipboard.entry, parentId, position)
    }
    setContextMenu(null)
  }

  function handleDesktopItemDragStart(event: DragEvent<HTMLElement>, itemId: string) {
    event.dataTransfer.setData(DESKTOP_ITEM_DRAG_MIME, serializeDesktopItemDragPayload(itemId))
    event.dataTransfer.effectAllowed = 'move'
    const item = desktopItems.find((entry) => entry.id === itemId)
    if (item) {
      updateQuickLookCandidate(createQuickLookTargetFromDesktopItem(item))
    }
  }

  function handleDesktopItemRootDragOver(event: DragEvent<HTMLElement>) {
    if (!parseDesktopItemDragPayload(event.dataTransfer.getData(DESKTOP_ITEM_DRAG_MIME))) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handleDesktopItemRootDrop(event: DragEvent<HTMLElement>, destinationParentId: string | null, position?: { x: number; y: number }) {
    const draggedItemId = parseDesktopItemDragPayload(event.dataTransfer.getData(DESKTOP_ITEM_DRAG_MIME))
    if (!draggedItemId) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (destinationParentId === null) {
      moveDesktopItemToDesktop(draggedItemId, position)
      return
    }
    moveDesktopItemToFolder(draggedItemId, destinationParentId)
  }

  function handleDesktopItemFolderDragOver(event: DragEvent<HTMLElement>) {
    const hasVirtualItem = !!parseDesktopItemDragPayload(event.dataTransfer.getData(DESKTOP_ITEM_DRAG_MIME))
    const hasVolumeEntry = !!parseVolumeEntryPayload(event.dataTransfer.getData('application/x-mactorno-volume-entry'))
    if (!hasVirtualItem && !hasVolumeEntry) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = hasVirtualItem ? 'move' : 'copy'
  }

  function handleDesktopItemFolderDrop(event: DragEvent<HTMLElement>, folderId: string) {
    const draggedItemId = parseDesktopItemDragPayload(event.dataTransfer.getData(DESKTOP_ITEM_DRAG_MIME))
    if (draggedItemId) {
      event.preventDefault()
      event.stopPropagation()
      moveDesktopItemToFolder(draggedItemId, folderId)
      return
    }

    const volumeEntry = parseVolumeEntryPayload(event.dataTransfer.getData('application/x-mactorno-volume-entry'))
    if (!volumeEntry) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    importVolumeEntryToDesktop(volumeEntry, folderId)
  }

  function permanentlyDeleteDesktopItem(itemId: string) {
    const target = desktopItems.find((item) => item.id === itemId)
    if (!target) {
      return
    }

    setContextMenu(null)
    openSystemDialog(
      {
        title: 'Eliminar permanentemente',
        message: `Se eliminara "${target.name}" de forma permanente y no podras recuperarlo desde la papelera.`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      },
      () => permanentlyDeleteDesktopItemNow(itemId),
    )
  }

  function permanentlyDeleteDesktopItemNow(itemId: string) {
    const descendants = new Set<string>([itemId])
    let changed = true

    while (changed) {
      changed = false
      desktopItems.forEach((item) => {
        if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
        }
      })
    }

    setDesktopItems((current) => current.filter((item) => !descendants.has(item.id)))
    setWindows((current) => current.filter((item) => !item.textDocumentId || !descendants.has(item.textDocumentId)))
    pushToast('Elemento eliminado', 'Se borro de forma permanente.')
  }

  function emptyTrash() {
    const trashedIds = new Set(desktopItems.filter((item) => item.trashedAt !== null).map((item) => item.id))
    if (trashedIds.size === 0) {
      setContextMenu(null)
      return
    }

    setContextMenu(null)
    openSystemDialog(
      {
        title: 'Vaciar papelera',
        message: `Se eliminaran ${trashedIds.size} elemento${trashedIds.size === 1 ? '' : 's'} de forma permanente.`,
        confirmLabel: 'Vaciar',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      },
      () => emptyTrashNow(trashedIds),
    )
  }

  function emptyTrashNow(trashedIds: Set<string>) {
    setDesktopItems((current) => current.filter((item) => !trashedIds.has(item.id)))
    setWindows((current) => current.filter((item) => !item.textDocumentId || !trashedIds.has(item.textDocumentId)))
    setContextMenu(null)
    pushToast('Papelera vaciada', `${trashedIds.size} elemento${trashedIds.size === 1 ? '' : 's'} eliminado${trashedIds.size === 1 ? '' : 's'}.`)
  }

  function openDesktopDocument(itemId: string) {
    if (skipDesktopItemClickRef.current === itemId) {
      skipDesktopItemClickRef.current = null
      return
    }

    const target = desktopItems.find((item) => item.id === itemId && item.kind === 'text')
    if (!target) {
      return
    }

    rememberRecent({
      key: `document:${itemId}`,
      kind: 'document',
      title: target.name,
      subtitle: target.content.trim() || 'Documento de texto',
      itemId,
      icon: target.iconDataUrl ? { kind: 'image', value: target.iconDataUrl } : { kind: 'glyph', value: '📄' },
    })

    const existing = windows.find((item) => item.appId === 'textedit' && item.textDocumentId === itemId)
    if (existing) {
      if (existing.minimized) {
        setWindows((current) =>
          current.map((item) =>
            item.id === existing.id
              ? { ...item, minimized: false, zIndex: topZIndex + 1, genie: null, title: target.name }
              : item,
          ),
        )
      } else {
        focusWindow(existing.id)
      }
      return
    }

    const nextWindow = createWindow('textedit')
    nextWindow.textDocumentId = itemId
    nextWindow.title = target.name
    setWindows((current) => [...current, nextWindow])
  }

  function openDesktopFolder(itemId: string) {
    if (skipDesktopItemClickRef.current === itemId) {
      skipDesktopItemClickRef.current = null
      return
    }

    const target = desktopItems.find((item) => item.id === itemId && item.kind === 'folder')
    rememberRecent({
      key: `route:${createDesktopFolderRoute(itemId)}`,
      kind: 'route',
      title: target?.name ?? 'Carpeta',
      subtitle: 'Carpeta del escritorio',
      route: createDesktopFolderRoute(itemId),
      icon: { kind: 'glyph', value: '📁' },
    })
    openOrFocusFinderRoute(createDesktopFolderRoute(itemId))
  }

  function startDesktopItemDrag(event: React.PointerEvent<HTMLButtonElement>, itemId: string) {
    if (event.button !== 0) {
      return
    }

    if (editingDesktopItemId === itemId) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    desktopItemDragRef.current = {
      id: itemId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    }
  }

  function startDesktopTrashDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    desktopTrashDragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    }
  }

  function sortDesktopRootItems() {
    const sortedRootItems = [...rootDesktopItems].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'folder' ? -1 : 1
      }
      return left.name.localeCompare(right.name, 'es')
    })

    setDesktopItems((current) => {
      const rootUpdates = new Map(
        sortedRootItems.map((item, index) => [item.id, getNextDesktopItemPosition(index)]),
      )

      return current.map((item) =>
        item.parentId === null && rootUpdates.has(item.id)
          ? { ...item, ...rootUpdates.get(item.id)! }
          : item,
      )
    })

    setContextMenu(null)
  }

  function getNextDesktopItemName(kind: DesktopItem['kind'], parentId: string | null) {
    const siblings = desktopItems.filter((item) => item.parentId === parentId && item.kind === kind && item.trashedAt === null)
    const baseName =
      kind === 'folder'
        ? 'Nueva carpeta'
        : kind === 'text'
          ? 'Nuevo documento de texto'
          : 'Archivo importado'
    const existingNames = new Set(siblings.map((item) => item.name.trim().toLowerCase()))

    if (!existingNames.has(baseName.toLowerCase())) {
      return baseName
    }

    let index = 2
    while (existingNames.has(`${baseName} ${index}`.toLowerCase())) {
      index += 1
    }

    return `${baseName} ${index}`
  }

  function updateDesktopDocument(itemId: string, patch: Partial<Pick<DesktopItem, 'name' | 'content'>>) {
    setDesktopItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch,
              updatedAt: Date.now(),
            }
          : item,
      ),
    )

    if (patch.name) {
      setWindows((current) =>
        current.map((item) =>
          item.textDocumentId === itemId
            ? { ...item, title: patch.name! }
            : item,
        ),
      )
    }
  }

  function openSafariWindow(url?: string) {
    setLauncherOpen(false)
    rememberRecent({
      key: 'app:safari',
      kind: 'app',
      title: getResolvedApp('safari').name,
      subtitle: url ? normalizeBrowserUrl(url) : 'Navegador',
      appId: 'safari',
      icon: getResolvedApp('safari').iconSpec,
    })
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
    rememberRecent({
      key: `path:${entry.path}`,
      kind: 'path',
      title: entry.name,
      subtitle: entry.path,
      path: entry.path,
      icon: entry.icon ? { kind: 'image', value: entry.icon } : { kind: 'glyph', value: appId === 'photos' ? '🖼' : '🎬' },
    })
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
    const targetWindow = windows.find((item) => item.id === id)
    if (!targetWindow) {
      return
    }

    const linkedDocument = targetWindow.textDocumentId
      ? desktopItems.find((item) => item.id === targetWindow.textDocumentId && item.kind === 'text')
      : null
    const needsConfirmation = targetWindow.appId === 'textedit' && !!linkedDocument?.content.trim()

    if (needsConfirmation) {
      openSystemDialog(
        {
          title: 'Cerrar documento',
          message: `Cerrar "${targetWindow.title}" quitara esta ventana del escritorio actual.`,
          confirmLabel: 'Cerrar',
          cancelLabel: 'Cancelar',
          tone: 'danger',
        },
        () => closeWindowNow(id),
      )
      return
    }

    closeWindowNow(id)
  }

  function closeWindowNow(id: string) {
    const closingWindow = windows.find((item) => item.id === id)
    setWindows((current) =>
      current.flatMap((item) => {
        if (item.id !== id) {
          return [item]
        }
        return [{ ...item, genie: { mode: 'closing-fade', removeOnFinish: true } }]
      }),
    )
    pushToast('Ventana cerrada', closingWindow?.title)
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
    const shouldAnimateWindowMorph = !prefersReducedMotion && maximizeAnimationDurationMs > 0
    if (shouldAnimateWindowMorph) {
      const existingTimer = windowMorphTimersRef.current[id]
      if (existingTimer) {
        window.clearTimeout(existingTimer)
      }
      setWindowMorphIds((current) => (current.includes(id) ? current : [...current, id]))
      windowMorphTimersRef.current[id] = window.setTimeout(() => {
        setWindowMorphIds((current) => current.filter((windowId) => windowId !== id))
        delete windowMorphTimersRef.current[id]
      }, maximizeAnimationDurationMs + 80)
    }

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

  function updateFinderViewMode(windowId: string, viewMode: FinderViewMode) {
    updateFinderWindow(windowId, (finderState) => ({ ...finderState, viewMode }))
  }

  function updateFinderSortMode(windowId: string, sortMode: FinderSortMode) {
    updateFinderWindow(windowId, (finderState) => ({ ...finderState, sortMode }))
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
      return { ...finderState, tabs: [...finderState.tabs, nextTab], activeTabId: nextTab.id }
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

  function applyDockPinnedOrder(nextOrder: string[]) {
    setDockPinnedOrder(nextOrder)
    setDockItems((current) => {
      const currentSet = new Set(current)
      const ordered = nextOrder
        .filter((item) => item.startsWith('app:'))
        .map((item) => item.slice('app:'.length) as AppId)
        .filter((item) => currentSet.has(item))

      current.forEach((item) => {
        if (!ordered.includes(item)) {
          ordered.push(item)
        }
      })

      return ordered
    })
    setCustomDockItems((current) => {
      const itemById = new Map(current.map((item) => [item.id, item]))
      const ordered = nextOrder
        .filter((item) => item.startsWith('custom:'))
        .map((item) => itemById.get(item.slice('custom:'.length)))
        .filter((item): item is CustomDockItem => !!item)

      current.forEach((item) => {
        if (!ordered.some((entry) => entry.id === item.id)) {
          ordered.push(item)
        }
      })

      return ordered
    })
  }

  function reorderDockPinnedItems(targetId: string) {
    const draggedId = dockDragItemIdRef.current
    if (!draggedId) {
      return
    }

    const nextOrder = moveDockPinnedItem(dockPinnedOrder, draggedId, targetId)
    if (nextOrder === dockPinnedOrder) {
      return
    }

    applyDockPinnedOrder(nextOrder)
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

  function updateCustomDockItem(id: string, patch: Partial<Pick<CustomDockItem, 'icon' | 'accent'>>) {
    setCustomDockItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    )
  }

  function handleDockIconDragEnd(event: React.DragEvent<HTMLButtonElement>, id: string, removable: boolean) {
    dockDragItemIdRef.current = null

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
    pushToast('Dock actualizado', `${name} se agrego al dock.`)
  }

  function pinInstalledAppToDock(app: InstalledApp) {
    addCustomDockItem({
      id: `app-${app.id}`,
      name: app.name,
      target: app.launchTarget || app.target,
      kind: 'app',
      icon: app.icon ? { kind: 'image', value: app.icon } : { kind: 'glyph', value: '💻' },
      accent: 'linear-gradient(135deg, #6ec3ff 0%, #4361ff 100%)',
    })
    pushToast('Dock actualizado', `${app.name} se fijo en el dock.`)
  }

  function pinBuiltInAppToDock(appId: AppId) {
    if (!getApp(appId).dockable) {
      return
    }

    setDockItems((current) => current.includes(appId) ? current : [...current, appId])
    pushToast('Dock actualizado', `${getApp(appId).name} se fijo en el dock.`)
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
    pushToast('Dock actualizado', `${volume.name} se fijo en el dock.`)
  }

  function rememberRuntimeDockItem(item: CustomDockItem) {
    setRuntimeDockItems((current) => {
      const withoutMatch = current.filter((entry) => !(entry.kind === item.kind && entry.target === item.target))
      return [...withoutMatch, item]
    })
  }

  function dismissRuntimeDockItem(itemId: string) {
    setRuntimeDockItems((current) => current.filter((item) => item.id !== itemId))
  }

  function pinTransientDockItem(itemId: string) {
    const target = visibleTransientDockItems.find((item) => item.id === itemId)
    if (!target) {
      return
    }

    addCustomDockItem({
      ...target,
      id: `${target.kind}-${encodeURIComponent(target.target)}`,
    })
    dismissRuntimeDockItem(itemId)
    pushToast('Dock actualizado', `${target.name} queda fijado en el dock.`)
  }

  function openOrFocusFinderRoute(route: FinderRoute, dockItemId?: string) {
    const desktopFolderId = getDesktopFolderIdFromRoute(route)
    const routeVolumeMount = getVolumeMountFromRoute(route)
    const routeTitle = desktopFolderId
      ? desktopItems.find((item) => item.id === desktopFolderId)?.name ?? getFinderLabel(route)
      : routeVolumeMount
        ? deviceInfo?.volumes.find((item) => item.mount === routeVolumeMount)?.name ?? getFinderLabel(route)
        : getFinderLabel(route)

    rememberRecent({
      key: `route:${route}`,
      kind: 'route',
      title: routeTitle,
      subtitle: `Finder · ${routeTitle}`,
      route,
      icon: { kind: 'glyph', value: '📁' },
    })
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
    setSpotlightOpen(false)
    setDockFolderStackItemId(null)
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

    if (item.kind === 'desktop-document') {
      openDesktopDocument(item.target)
      return
    }

    if (item.kind === 'path') {
      const entry = getDockPathEntry(item.target, item.name)
      if (isImageEntry(entry)) {
        openMediaWindow('photos', entry)
        return
      }
      if (isVideoEntry(entry)) {
        openMediaWindow('videos', entry)
        return
      }
      await openSystemPath(item.target)
      return
    }

    await launchSystemApp(item.target)
  }

  async function launchInstalledSystemApp(app: InstalledApp) {
    rememberRecent({
      key: `installed:${app.id}`,
      kind: 'installed-app',
      title: app.name,
      subtitle: `${app.source} · ${app.target}`,
      installedAppId: app.id,
    })
    rememberRuntimeDockItem({
      id: createDockItemId('runtime-app', app.id),
      name: app.name,
      target: app.launchTarget || app.target,
      kind: 'app',
      icon: app.icon ? { kind: 'image', value: app.icon } : { kind: 'glyph', value: '💻' },
      accent: 'transparent',
    })
    await launchSystemApp(app.launchTarget || app.target)
  }

  async function launchSystemApp(target: string) {
    setLauncherOpen(false)
    setSpotlightOpen(false)
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

  async function openTrackedSystemPath(target: string, label?: string, icon?: string | null) {
    rememberRecent({
      key: `path:${target}`,
      kind: 'path',
      title: label || getPathLeaf(target),
      subtitle: target,
      path: target,
      icon: icon ? { kind: 'image', value: icon } : { kind: 'glyph', value: '📄' },
    })
    rememberRuntimeDockItem(createPathDockItem(target, label, icon))
    await openSystemPath(target)
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
        ? '.mp4,.m4v,.webm,.mov,.mkv,.avi,.ogv,.ogm,.mpeg,.mpg,.mpe,.mpv,.m2v,.ts,.mts,.m2ts,.3gp,.3g2,video/*'
        : '.png,.jpg,.jpeg,.jfif,.pjpeg,.pjp,.gif,.webp,.bmp,.svg,.avif,.apng,.ico,image/*'

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
        item.id === windowId && item.browserState
          ? { ...item, browserState: syncBrowserState(updater(item.browserState)) }
          : item,
      ),
    )
  }

  function clearBrowserProgressReset(windowId: string) {
    const timer = browserProgressResetTimersRef.current[windowId]
    if (timer !== undefined) {
      window.clearTimeout(timer)
      delete browserProgressResetTimersRef.current[windowId]
    }
  }

  function clearBrowserProgressShow(windowId: string) {
    const timer = browserProgressShowTimersRef.current[windowId]
    if (timer !== undefined) {
      window.clearTimeout(timer)
      delete browserProgressShowTimersRef.current[windowId]
    }
  }

  function beginBrowserProgress(windowId: string) {
    clearBrowserProgressReset(windowId)
    clearBrowserProgressShow(windowId)
    delete browserProgressVisibleSinceRef.current[windowId]
    updateBrowserWindow(windowId, (browserState) => ({
      ...browserState,
      tabs: browserState.tabs.map((tab) =>
        tab.id === browserState.activeTabId
          ? { ...tab, loading: true, progress: 0, lastError: null }
          : tab,
      ),
    }))

    browserProgressShowTimersRef.current[windowId] = window.setTimeout(() => {
      delete browserProgressShowTimersRef.current[windowId]
      browserProgressVisibleSinceRef.current[windowId] = Date.now()
      updateBrowserWindow(windowId, (browserState) => {
        if (!browserState.loading) {
          return browserState
        }

          return {
            ...browserState,
            tabs: browserState.tabs.map((tab) =>
              tab.id === browserState.activeTabId
                ? { ...tab, progress: Math.max(tab.progress, 14) }
                : tab,
            ),
          }
        })
    }, BROWSER_PROGRESS_SHOW_DELAY_MS)
  }

  function completeBrowserProgress(windowId: string, hasError = false) {
    clearBrowserProgressReset(windowId)
    const showTimer = browserProgressShowTimersRef.current[windowId]
    const visibleSince = browserProgressVisibleSinceRef.current[windowId]

    if (showTimer !== undefined && visibleSince === undefined) {
      clearBrowserProgressShow(windowId)
      updateBrowserWindow(windowId, (browserState) => ({
        ...browserState,
        tabs: browserState.tabs.map((tab) =>
          tab.id === browserState.activeTabId
            ? { ...tab, loading: false, progress: 0 }
            : tab,
        ),
      }))
      return
    }

    const finalize = () => {
      browserProgressVisibleSinceRef.current[windowId] = Date.now()
      updateBrowserWindow(windowId, (browserState) => ({
        ...browserState,
        tabs: browserState.tabs.map((tab) =>
          tab.id === browserState.activeTabId
            ? { ...tab, loading: false, progress: 100 }
            : tab,
        ),
      }))

      browserProgressResetTimersRef.current[windowId] = window.setTimeout(() => {
        delete browserProgressResetTimersRef.current[windowId]
        delete browserProgressVisibleSinceRef.current[windowId]
        updateBrowserWindow(windowId, (browserState) => ({
          ...browserState,
          tabs: browserState.tabs.map((tab) =>
            tab.id === browserState.activeTabId
              ? { ...tab, progress: tab.loading ? tab.progress : 0 }
              : tab,
          ),
        }))
      }, hasError ? BROWSER_PROGRESS_HIDE_DELAY_MS + 120 : BROWSER_PROGRESS_HIDE_DELAY_MS)
    }

    const elapsedVisible = visibleSince ? Date.now() - visibleSince : BROWSER_PROGRESS_MIN_VISIBLE_MS
    const remainingVisible = Math.max(0, BROWSER_PROGRESS_MIN_VISIBLE_MS - elapsedVisible)
    if (remainingVisible > 0) {
      browserProgressResetTimersRef.current[windowId] = window.setTimeout(() => {
        delete browserProgressResetTimersRef.current[windowId]
        finalize()
      }, remainingVisible)
      return
    }

    finalize()
  }

  completeBrowserProgressRef.current = completeBrowserProgress

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
    updateBrowserWindow(windowId, (browserState) => ({
      ...browserState,
      tabs: browserState.tabs.map((tab) =>
        tab.id === browserState.activeTabId
          ? { ...tab, inputValue: value }
          : tab,
      ),
    }))
  }

  function commitBrowserNavigation(windowId: string, rawValue: string) {
    const nextUrl = normalizeBrowserUrl(rawValue)
    beginBrowserProgress(windowId)
    updateBrowserWindow(windowId, (browserState) => {
      const activeTab = getActiveBrowserTab(browserState)
      if (!activeTab) {
        return browserState
      }
      const nextHistory = [...activeTab.history.slice(0, activeTab.historyIndex + 1), nextUrl]
      return {
        ...browserState,
        tabs: browserState.tabs.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                history: nextHistory,
                historyIndex: nextHistory.length - 1,
                inputValue: nextUrl,
              }
            : tab,
        ),
      }
    })
    window.electronDesktop?.browser.navigate(nextUrl)
  }

  function moveBrowserHistory(windowId: string, direction: -1 | 1) {
    beginBrowserProgress(windowId)
    updateBrowserWindow(windowId, (browserState) => {
      const activeTab = getActiveBrowserTab(browserState)
      if (!activeTab) {
        return browserState
      }
      const nextIndex = clamp(activeTab.historyIndex + direction, 0, activeTab.history.length - 1)
      return {
        ...browserState,
        tabs: browserState.tabs.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                historyIndex: nextIndex,
                inputValue: activeTab.history[nextIndex],
              }
            : tab,
        ),
      }
    })

    if (direction === -1) {
      window.electronDesktop?.browser.goBack()
    } else {
      window.electronDesktop?.browser.goForward()
    }
  }

  function reloadBrowser(windowId: string) {
    beginBrowserProgress(windowId)
    updateBrowserWindow(windowId, (browserState) => ({
      ...browserState,
      tabs: browserState.tabs.map((tab) =>
        tab.id === browserState.activeTabId
          ? { ...tab, reloadKey: tab.reloadKey + 1 }
          : tab,
      ),
    }))
    window.electronDesktop?.browser.reload()
  }

  function openBrowserTab(windowId: string, initialUrl = SAFARI_HOME_URL) {
    const normalized = normalizeBrowserUrl(initialUrl)
    updateBrowserWindow(windowId, (browserState) => {
      const nextTab: BrowserTab = {
        id: `browser-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        history: [normalized],
        historyIndex: 0,
        inputValue: normalized,
        reloadKey: 0,
        loading: false,
        progress: 0,
        title: '',
        lastError: null,
      }

      return {
        ...browserState,
        tabs: [...browserState.tabs, nextTab],
        activeTabId: nextTab.id,
      }
    })
    window.electronDesktop?.browser.navigate(normalized)
    beginBrowserProgress(windowId)
  }

  function selectBrowserTab(windowId: string, tabId: string) {
    const targetWindow = windows.find((item) => item.id === windowId && item.browserState)
    const targetTab = targetWindow?.browserState?.tabs.find((tab) => tab.id === tabId)
    updateBrowserWindow(windowId, (browserState) => ({
      ...browserState,
      activeTabId: tabId,
    }))
    if (targetTab) {
      window.electronDesktop?.browser.navigate(targetTab.history[targetTab.historyIndex] ?? SAFARI_HOME_URL)
      beginBrowserProgress(windowId)
    }
  }

  function closeBrowserTab(windowId: string, tabId: string) {
    const targetWindow = windows.find((item) => item.id === windowId && item.browserState)
    if (targetWindow?.browserState && targetWindow.browserState.tabs.length <= 1) {
      closeWindow(windowId)
      return
    }

    updateBrowserWindow(windowId, (browserState) => {
      const closingIndex = browserState.tabs.findIndex((tab) => tab.id === tabId)
      const nextTabs = browserState.tabs.filter((tab) => tab.id !== tabId)
      const nextActiveTabId = browserState.activeTabId === tabId
        ? nextTabs[Math.max(0, closingIndex - 1)]?.id ?? nextTabs[0]?.id ?? browserState.activeTabId
        : browserState.activeTabId

      return {
        ...browserState,
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
      }
    })

    const currentTabs = targetWindow?.browserState?.tabs ?? []
    const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId)
    const nextTabs = currentTabs.filter((tab) => tab.id !== tabId)
    const nextActiveTab = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0]
    if (nextActiveTab) {
      window.electronDesktop?.browser.navigate(nextActiveTab.history[nextActiveTab.historyIndex] ?? SAFARI_HOME_URL)
      beginBrowserProgress(windowId)
    }
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
      <FinderCard
        route={route}
        label={getFinderRouteLabel(route)}
        subtitle={subtitle}
        onClick={() => navigateFinder(windowId, route)}
        onContextMenu={(event) => {
          event.preventDefault()
          setContextMenu({ type: 'finder', x: event.clientX, y: event.clientY, windowId, route, label: getFinderRouteLabel(route) })
        }}
      />
    )
  }

  function renderFinderFileTile(options: {
    keyId: string
    name: string
    subtitle: string
    sourcePath?: string | null
    extension?: string
    iconSrc?: string | null
    onClick: () => void
    onFocus?: () => void
    onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
    draggable?: boolean
    onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  }) {
    return <FinderFileTile {...options} />
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

  function getVisibleEntries(targetPath: string | null, entries: VolumeEntry[]) {
    if (!targetPath || !initialLowEndDevice) {
      return entries
    }

    const visibleCount = visibleEntryCountsByPath[targetPath]
    return typeof visibleCount === 'number' ? entries.slice(0, visibleCount) : entries
  }

  function renderProgressiveStatus(visibleCount: number, totalCount: number, onShowMore: () => void) {
    if (visibleCount >= totalCount) {
      return null
    }

    return (
      <div className="progressive-load-note">
        <span>Mostrando {visibleCount} de {totalCount} elementos.</span>
        <button type="button" onClick={onShowMore}>Cargar mas ahora</button>
      </div>
    )
  }

  function renderFinderContent(windowItem: WindowState) {
    const finderState = windowItem.finderState
    const activeRoute = getActiveFinderRoute(finderState)
    const activeDesktopFolderId = getDesktopFolderIdFromRoute(activeRoute)
    const activeDesktopFolder = activeDesktopFolderId
      ? desktopItems.find((item) => item.id === activeDesktopFolderId && item.kind === 'folder') ?? null
      : null
    const activeDesktopItems =
      activeRoute === 'desktop' || activeDesktopFolderId
        ? activeDesktopFolder?.sourcePath
          ? []
          : desktopItems.filter((item) => item.parentId === (activeDesktopFolderId ?? null) && item.trashedAt === null)
        : []
    const sortMode = finderState?.sortMode ?? 'name'
    const sortedDesktopItems = sortDesktopEntries(activeDesktopItems, sortMode)
    const activeDesktopFolders = sortedDesktopItems.filter((item) => item.kind === 'folder')
    const activeDesktopFiles = sortedDesktopItems.filter((item) => item.kind !== 'folder')
    const activeImportedEntries = activeDesktopFolder?.sourcePath ? volumeEntriesByMount[activeDesktopFolder.sourcePath] ?? [] : []
    const activeImportedMeta = activeDesktopFolder?.sourcePath ? volumeEntryMetaByPath[activeDesktopFolder.sourcePath] : undefined
    const visibleImportedEntries = getVisibleEntries(activeDesktopFolder?.sourcePath ?? null, activeImportedEntries)
    const sortedImportedEntries = sortVolumeEntries(visibleImportedEntries, sortMode)
    const activeImportedFolders = sortedImportedEntries.filter((entry) => entry.kind === 'directory')
    const activeImportedFiles = sortedImportedEntries.filter((entry) => entry.kind !== 'directory')
    const activeImportedLoading = activeDesktopFolder?.sourcePath ? !!loadingVolumeMounts[activeDesktopFolder.sourcePath] : false
    const activeVolumeMount = getVolumeMountFromRoute(activeRoute)
    const activeVolumePath = getVolumePathFromRoute(activeRoute)
    const activeVolume = activeVolumeMount
      ? deviceInfo?.volumes.find((volume) => volume.mount === activeVolumeMount) ?? null
      : null
    const activeVolumeEntries = activeVolumePath ? volumeEntriesByMount[activeVolumePath] ?? [] : []
    const activeVolumeMeta = activeVolumePath ? volumeEntryMetaByPath[activeVolumePath] : undefined
    const visibleVolumeEntries = getVisibleEntries(activeVolumePath, activeVolumeEntries)
    const sortedVolumeEntries = sortVolumeEntries(visibleVolumeEntries, sortMode)
    const activeVolumeFolders = sortedVolumeEntries.filter((entry) => entry.kind === 'directory')
    const activeVolumeFiles = sortedVolumeEntries.filter((entry) => entry.kind !== 'directory')
    const activeVolumeLoading = activeVolumePath ? !!loadingVolumeMounts[activeVolumePath] : false
    const finderSidebarVolumes = (deviceInfo?.volumes ?? []).map((volume) => ({
      ...volume,
      route: createVolumeRoute(volume.mount),
    }))
    const finderRecentItems = recentItems.slice(0, 18)
    const viewMode = finderState?.viewMode ?? 'icons'
    const renderFinderListHeader = (secondaryLabel: string) => <FinderListHeader secondaryLabel={secondaryLabel} />

    return (
      <div className="finder-shell finder-inline-toolbar">
        <div className="finder-breadcrumbs" aria-label="Pestañas del Finder">
          {finderState?.tabs.map((tab) => {
            const tabRoute = tab.history[tab.historyIndex]
            const tabLabel = getFinderRouteLabel(tabRoute)
            return (
              <div
                key={tab.id}
                className={`finder-compact-tab${tab.id === finderState.activeTabId ? ' active' : ''}`}
              >
                <button type="button" className="finder-compact-tab-label" onClick={() => selectFinderTab(windowItem.id, tab.id)}>
                  {tabLabel}
                </button>
                <button
                  type="button"
                  className="finder-compact-tab-close"
                  aria-label={`Cerrar pestaña ${tabLabel}`}
                  onClick={() => closeFinderTab(windowItem.id, tab.id)}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>

        <div className="finder-layout">
          <FinderSidebar
            activeRoute={activeRoute}
            activeVolumeMount={activeVolumeMount}
            volumes={finderSidebarVolumes}
            onNavigate={(route) => navigateFinder(windowItem.id, route)}
            renderRouteIcon={(route) => getFinderRouteIcon(route)}
          />

          <div className="finder-panel">
            <div className="finder-panel-toolbar">
              <div className="finder-panel-toolbar-copy">
                <strong>{getFinderRouteLabel(activeRoute)}</strong>
                <span>
                  {activeRoute === 'recents'
                    ? `${finderRecentItems.length} elemento${finderRecentItems.length === 1 ? '' : 's'} reciente${finderRecentItems.length === 1 ? '' : 's'}`
                    : sortMode === 'name'
                      ? 'Ordenado por nombre'
                      : sortMode === 'type'
                        ? 'Ordenado por tipo'
                        : sortMode === 'date'
                          ? 'Ordenado por fecha'
                          : 'Ordenado por tamano'}
                </span>
              </div>
              <label className="finder-sort-field">
                <span>Ordenar</span>
                <select value={sortMode} onChange={(event) => updateFinderSortMode(windowItem.id, event.target.value as FinderSortMode)}>
                  <option value="name">Nombre</option>
                  <option value="type">Tipo</option>
                  <option value="date">Fecha</option>
                  <option value="size">Tamano</option>
                </select>
              </label>
            </div>

            {activeRoute === 'computer' ? (
              <>
                <h2>Equipo</h2>
                <p>Entrada principal del dispositivo local.</p>
                <div className="finder-card-grid">
                  {renderFinderCard(windowItem.id, 'desktop', 'Carpetas y documentos virtuales del escritorio')}
                  {renderFinderCard(windowItem.id, 'trash', 'Elementos eliminados del escritorio virtual')}
                  {renderFinderCard(windowItem.id, 'device', 'CPU, RAM, sistema operativo y discos')}
                  {renderFinderCard(windowItem.id, 'applications', 'Apps detectadas segun el sistema operativo')}
                  {renderFinderCard(windowItem.id, 'recents', 'Archivos, apps y carpetas usados recientemente')}
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

            {activeRoute === 'desktop' || activeDesktopFolderId ? (
              <div
                onContextMenu={(event) => {
                  const target = event.target as HTMLElement
                  if (
                    target.closest('.finder-folder-tile, .finder-file-row, .context-menu') ||
                    !desktopClipboard
                  ) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  openContextMenuAt({
                    type: 'finder-virtual',
                    windowId: windowItem.id,
                    parentId: activeDesktopFolderId ?? null,
                  }, event.clientX, event.clientY)
                }}
              >
                <FinderDesktopPanel
                  title={getFinderRouteLabel(activeRoute)}
                  subtitle={activeRoute === 'desktop' ? 'Elementos virtuales del escritorio de Mactorno.' : activeDesktopFolder?.sourcePath ? activeDesktopFolder.sourcePath : 'Contenido de la carpeta virtual.'}
                  activeImportedLoading={activeImportedLoading}
                  activeDesktopItemsLength={activeDesktopItems.length}
                  activeImportedEntriesLength={activeImportedEntries.length}
                  activeDesktopFolders={activeDesktopFolders}
                  activeDesktopFiles={activeDesktopFiles}
                  activeImportedFolders={activeImportedFolders}
                  activeImportedFiles={activeImportedFiles}
                  viewMode={viewMode}
                  renderFinderListHeader={renderFinderListHeader}
                  renderFinderFileTile={renderFinderFileTile}
                  onDesktopFolderOpen={(item) => navigateFinder(windowItem.id, createDesktopFolderRoute(item.id))}
                  onDesktopItemDragStart={(event, item) => handleDesktopItemDragStart(event, item.id)}
                  onDesktopFolderDragOver={(event, item) => {
                    if (item.kind !== 'folder') {
                      return
                    }
                    handleDesktopItemFolderDragOver(event)
                  }}
                  onDesktopFolderDrop={(event, item) => {
                    if (item.kind !== 'folder') {
                      return
                    }
                    handleDesktopItemFolderDrop(event, item.id)
                  }}
                  onDesktopRootDragOver={handleDesktopItemRootDragOver}
                  onDesktopRootDrop={(event) => handleDesktopItemRootDrop(event, activeDesktopFolderId ?? null)}
                  onDesktopItemFocus={(item) => updateQuickLookCandidate(createQuickLookTargetFromDesktopItem(item))}
                  onDesktopFileOpen={(item) => {
                    if (item.kind === 'text') {
                      openDesktopDocument(item.id)
                    } else {
                      openDesktopFileItem(item.id)
                    }
                  }}
                  onImportedFolderImport={(entry) => {
                    importVolumeEntryToDesktop(entry, activeDesktopFolderId ?? null)
                  }}
                  onImportedEntryFocus={(entry) => updateQuickLookCandidate(createQuickLookTargetFromVolumeEntry(entry))}
                  onImportedEntryOpen={(entry) => {
                    void (async () => {
                      if (isImageEntry(entry)) {
                        openMediaWindow('photos', entry)
                        return
                      }
                      if (isVideoEntry(entry)) {
                        openMediaWindow('videos', entry)
                        return
                      }
                      await openTrackedSystemPath(entry.path, entry.name, entry.icon ?? null)
                    })()
                  }}
                  onImportedEntryContextMenu={(event, entry) => {
                    event.preventDefault()
                    openContextMenuAt({
                      type: 'volume-entry',
                      label: entry.name,
                      entry,
                    }, event.clientX, event.clientY)
                  }}
                  progressiveStatus={renderProgressiveStatus(
                    visibleImportedEntries.length,
                    activeImportedMeta?.total ?? activeImportedEntries.length,
                    () => {
                      if (!activeDesktopFolder?.sourcePath) {
                        return
                      }
                      void loadVolumeEntriesPage(activeDesktopFolder.sourcePath, { forceFullIcons: true })
                      setVisibleEntryCountsByPath((current) => ({
                        ...current,
                        [activeDesktopFolder.sourcePath!]: activeImportedMeta?.total ?? activeImportedEntries.length,
                      }))
                    },
                  )}
                />
              </div>
            ) : null}

            {activeRoute === 'trash' ? (
              <div className="device-panel">
                <div className="trash-header">
                  <div>
                    <h2>Papelera</h2>
                    <p>Los elementos eliminados del escritorio virtual quedan aqui hasta vaciarla.</p>
                  </div>
                  <button type="button" onClick={emptyTrash}>Vaciar papelera</button>
                </div>
                {trashItems.length === 0 ? <p>La papelera esta vacia.</p> : null}
                {trashItems.length ? (
                  <>
                    {renderFinderListHeader('Tipo')}
                    <div className="finder-file-list">
                    {trashItems.map((item) => (
                      <div key={item.id} className="finder-file-row finder-trash-row">
                        <div className="finder-trash-meta">
                          <strong>{item.name}</strong>
                          <span>{item.kind === 'folder' ? 'Carpeta' : 'Documento de texto'}</span>
                        </div>
                        <div className="finder-trash-actions">
                          <button type="button" onClick={() => restoreDesktopItem(item.id)}>Restaurar</button>
                          <button type="button" onClick={() => permanentlyDeleteDesktopItem(item.id)}>Eliminar</button>
                        </div>
                      </div>
                    ))}
                    </div>
                  </>
                ) : null}
              </div>
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
                      <article><strong>GPU</strong><span>{deviceInfo.gpuModel ?? 'No detectada'}</span></article>
                      <article><strong>VRAM</strong><span>{deviceInfo.videoMemoryMb ? `${deviceInfo.videoMemoryMb} MB` : 'Compartida / no disponible'}</span></article>
                      <article><strong>RAM total</strong><span>{deviceInfo.totalMemoryGb} GB</span></article>
                      <article><strong>RAM libre</strong><span>{deviceInfo.freeMemoryGb} GB</span></article>
                      <article><strong>Perfil visual</strong><span>{resolvedPerformanceProfile}</span></article>
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
              <FinderApplicationsPanel
                osName={deviceInfo?.osName}
                installedApps={installedApps}
                visibleInstalledAppsCount={visibleInstalledAppsCount}
                renderAppIcon={(app) => renderInstalledAppIcon(app)}
                onLaunch={(app) => void launchInstalledSystemApp(app)}
                onAppContextMenu={(event, app) => {
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
                onShowAll={() => setVisibleInstalledAppsCount(installedApps.length)}
                renderProgressiveStatus={renderProgressiveStatus}
              />
            ) : null}

            {activeRoute === 'recents' ? (
              <div className="device-panel">
                <h2>Recientes</h2>
                <p>Accesos recientes para archivos, apps, rutas del Finder y elementos externos.</p>
                {finderRecentItems.length ? (
                  <>
                    {renderFinderListHeader('Lugar')}
                    <div className="finder-file-list">
                      {finderRecentItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="finder-file-row interactive"
                          onClick={() => activateRecentItem(item)}
                        >
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>Aun no hay elementos recientes en esta sesion.</p>
                )}
              </div>
            ) : null}

            {activeRoute === 'dock' ? (
              <div className="device-panel">
                <h2>Dock</h2>
                <p>Activa o desactiva iconos y personaliza su apariencia. Finder se mantiene fijo.</p>
                <div className="dock-settings-list">
                  <div className="dock-setting">
                    <label className="dock-toggle-row">
                      <input
                        type="checkbox"
                        checked={dockHoverAnimationEnabled}
                        onChange={(event) => setDockHoverAnimationEnabled(event.target.checked)}
                      />
                      <span>Animacion del dock al pasar el cursor</span>
                    </label>
                  </div>
                </div>
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
                      <div key={item.id} className="dock-setting dock-setting-editor">
                        <div className="custom-dock-meta">
                          <strong>{item.name}</strong>
                          <span>{item.target}</span>
                        </div>
                        {renderIconEditor({
                          label: `Icono de ${item.name}`,
                          icon: item.icon,
                          accent: item.accent,
                          onIconChange: (icon) => updateCustomDockItem(item.id, { icon }),
                          onAccentChange: (accent) => updateCustomDockItem(item.id, { accent }),
                        })}
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
              <FinderVolumePanel
                title={activeVolume?.name ?? formatVolumeLabel(activeVolumeMount)}
                subtitle={activeVolumePath ?? activeVolume?.mount ?? activeVolumeMount}
                capacity={activeVolume?.totalGb}
                free={activeVolume?.freeGb}
                activeVolumeLoading={activeVolumeLoading}
                activeVolumeEntriesLength={activeVolumeEntries.length}
                activeVolumeFolders={activeVolumeFolders}
                activeVolumeFiles={activeVolumeFiles}
                viewMode={viewMode}
                renderFinderListHeader={renderFinderListHeader}
                renderFinderFileTile={renderFinderFileTile}
                onEntryFocus={(entry) => updateQuickLookCandidate(createQuickLookTargetFromVolumeEntry(entry))}
                onFolderOpen={(entry) => navigateFinder(windowItem.id, createVolumeSubRoute(activeVolumeMount, entry.path))}
                onEntryOpen={(entry) => {
                  void (async () => {
                    if (isImageEntry(entry)) {
                      openMediaWindow('photos', entry)
                      return
                    }
                    if (isVideoEntry(entry)) {
                      openMediaWindow('videos', entry)
                      return
                    }
                      await openTrackedSystemPath(entry.path, entry.name, entry.icon ?? null)
                  })()
                }}
                onEntryContextMenu={(event, entry) => {
                  event.preventDefault()
                  openContextMenuAt({
                    type: 'volume-entry',
                    label: entry.name,
                    entry,
                  }, event.clientX, event.clientY)
                }}
                onEntryDragStart={(event, entry) => {
                  event.dataTransfer.setData('application/x-mactorno-volume-entry', serializeVolumeEntryPayload(entry))
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                progressiveStatus={renderProgressiveStatus(
                  visibleVolumeEntries.length,
                  activeVolumeMeta?.total ?? activeVolumeEntries.length,
                  () => {
                    if (!activeVolumePath) {
                      return
                    }
                    void loadVolumeEntriesPage(activeVolumePath, { forceFullIcons: true })
                    setVisibleEntryCountsByPath((current) => ({
                      ...current,
                      [activeVolumePath]: activeVolumeMeta?.total ?? activeVolumeEntries.length,
                    }))
                  },
                )}
              />
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  function renderAboutContent() {
    return <AboutPanel deviceInfo={deviceInfo} loadingSystem={loadingSystem} resolvedPerformanceProfile={resolvedPerformanceProfile} systemError={systemError} />
  }

  function renderLauncherContent() {
    return (
      <LauncherPanel
        deviceInfo={deviceInfo}
        installedApps={installedApps}
        visibleInstalledAppsCount={visibleInstalledAppsCount}
        onLaunch={(app) => void launchInstalledSystemApp(app)}
        onPin={pinInstalledAppToDock}
        onShowAll={() => setVisibleInstalledAppsCount(installedApps.length)}
        renderProgressiveStatus={renderProgressiveStatus}
      />
    )
  }

  function renderLauncherPopup() {
    const filteredApps = installedApps
      .filter((app) => app.name.toLowerCase().includes(launcherSearch.trim().toLowerCase()))
    return (
      <LauncherPopup
        filteredApps={filteredApps}
        launcherOpen={launcherOpen}
        launcherPage={launcherPage}
        launcherSearch={launcherSearch}
        loadingSystem={loadingSystem}
        panelRef={launcherPanelRef}
        setLauncherPage={setLauncherPage}
        setLauncherSearch={setLauncherSearch}
        systemError={systemError}
        onLaunch={(app) => void launchInstalledSystemApp(app)}
      />
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
      <DisplayPanel
        appearanceMode={appearanceMode}
        desktopWallpaper={desktopWallpaper}
        loginWallpaper={loginWallpaper}
        performanceMode={performanceMode}
        resolvedPerformanceProfile={resolvedPerformanceProfile}
        setAppearanceMode={setAppearanceMode}
        setDesktopWallpaper={setDesktopWallpaper}
        setLoginWallpaper={setLoginWallpaper}
        setPerformanceMode={setPerformanceMode}
        systemWallpapers={deviceInfo?.systemWallpapers ?? []}
      />
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
    rememberRecent({
      key: `note:${nextNote.id}`,
      kind: 'note',
      title: nextNote.title,
      subtitle: 'Nota recien creada',
      noteId: nextNote.id,
      icon: { kind: 'glyph', value: '📝' },
    })
    pushToast('Nueva nota', 'La nota ya esta lista para editar.')
  }

  function activateSpotlightResult(result: (typeof spotlightResults)[number]) {
    setSpotlightOpen(false)

    switch (result.kind) {
      case 'app':
        if (result.appId) {
          openApp(result.appId)
        }
        return
      case 'installed-app':
        if (result.app) {
          void launchInstalledSystemApp(result.app)
        }
        return
      case 'note':
        if (result.noteId) {
          setSelectedNoteId(result.noteId)
          openApp('notes')
        }
        return
      case 'document':
        if (result.itemId) {
          openDesktopDocument(result.itemId)
        }
        return
      case 'volume':
        if (result.mount) {
          openDesktopVolume(result.mount)
        }
        return
      case 'route':
        if (result.route) {
          openOrFocusFinderRoute(result.route)
        }
        return
      case 'path':
        if (result.path) {
          void openTrackedSystemPath(result.path, result.title, result.icon?.kind === 'image' ? result.icon.value : null)
        }
        return
      case 'action':
        switch (result.actionId) {
          case 'new-note':
            createNote()
            openApp('notes')
            return
          case 'open-apps':
            openOrFocusFinderRoute('applications')
            return
          case 'open-dock':
            openOrFocusFinderRoute('dock')
            return
          case 'open-device':
            openOrFocusFinderRoute('device')
            return
          case 'toggle-dark':
            setAppearanceMode('dark')
            return
          case 'toggle-light':
            setAppearanceMode('classic')
            return
        }
    }
  }

  function renderQuickLook() {
    return (
      <AnimatePresence>
        {quickLookTarget ? (
          <div className="quick-look-backdrop" onMouseDown={closeQuickLook}>
            <motion.div
              className="quick-look-panel"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.985 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="quick-look-head">
                <div className="quick-look-copy">
                  <strong>{quickLookTarget.name}</strong>
                  <span>{quickLookTarget.subtitle}</span>
                </div>
                <span className="quick-look-hint">Barra espaciadora · Esc</span>
              </div>
              <div className="quick-look-body">
                {quickLookTarget.kind === 'image' && quickLookTarget.path ? (
                  <PhotoViewer src={getMediaSource(quickLookTarget.path)} alt={quickLookTarget.name} />
                ) : null}
                {quickLookTarget.kind === 'video' && quickLookTarget.path ? (
                  <VideoPlayer src={getMediaSource(quickLookTarget.path)} />
                ) : null}
                {quickLookTarget.kind === 'text' ? (
                  <article className="quick-look-document">
                    <img
                      className="quick-look-document-icon"
                      src={quickLookTarget.iconSrc ?? resolvePublicAssetPath('/texto.png')}
                      alt=""
                      draggable={false}
                    />
                    <pre>{quickLookTarget.textContent?.trim() || 'Documento vacio.'}</pre>
                  </article>
                ) : null}
                {quickLookTarget.kind === 'folder' ? (
                  <article className="quick-look-generic">
                    <img
                      className="quick-look-generic-icon folder"
                      src={quickLookTarget.iconSrc ?? resolvePublicAssetPath('/carp.png')}
                      alt=""
                      draggable={false}
                    />
                    <div className="quick-look-generic-copy">
                      <strong>{quickLookTarget.name}</strong>
                      <span>Carpeta lista para abrir o importar.</span>
                    </div>
                  </article>
                ) : null}
                {quickLookTarget.kind === 'file' ? (
                  <article className="quick-look-generic">
                    <img
                      className="quick-look-generic-icon"
                      src={quickLookTarget.iconSrc ?? getDocumentPreviewIcon(quickLookTarget.name, quickLookTarget.extension || '')}
                      alt=""
                      draggable={false}
                    />
                    <div className="quick-look-generic-copy">
                      <strong>{quickLookTarget.name}</strong>
                      <span>Vista rapida disponible para archivos, imagenes, videos y documentos de texto.</span>
                    </div>
                  </article>
                ) : null}
              </div>
              <div className="quick-look-meta">
                <span>{quickLookTarget.location ?? 'Mactorno'}</span>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    )
  }

  function renderMissionControl() {
    return (
      <AnimatePresence>
        {missionControlState.open && missionControlCandidates.length > 0 ? (
          <div className="mission-control-overlay" onMouseDown={closeMissionControl}>
            <motion.div
              className="mission-control-panel"
              initial={{ opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.985 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="mission-control-head">
                <div className="mission-control-copy">
                  <strong>Mission Control</strong>
                  <span>{missionControlCandidates.length} ventanas visibles</span>
                </div>
                <span className="mission-control-hint">F3 · Ctrl/Cmd + ↑ · Enter</span>
              </div>
              <div className="mission-control-grid">
                {missionControlCandidates.map((item, index) => {
                  const app = getResolvedApp(item.appId)
                  const isSelected = missionControlState.selectedIndex === index
                  const title = getWindowDisplayTitle(item)

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`mission-control-card${isSelected ? ' active' : ''}`}
                      onMouseEnter={() => setMissionControlState((current) => ({ ...current, selectedIndex: index }))}
                      onFocus={() => setMissionControlState((current) => ({ ...current, selectedIndex: index }))}
                      onClick={() => activateMissionControlSelection(index)}
                    >
                      <div className="mission-control-preview">
                        <div className="mission-control-preview-toolbar">
                          <span className="mission-control-preview-dots" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                          <span>{app.name}</span>
                        </div>
                        <div className={`mission-control-preview-body preview-${item.appId}`}>
                          <div className="mission-control-preview-icon" style={{ background: app.accent }}>
                            {renderDockIconContent(app.iconSpec)}
                          </div>
                          <strong>{title}</strong>
                          <span>{item.appId === 'finder' ? 'Explorador activo' : 'Ventana lista para activar'}</span>
                        </div>
                      </div>
                      <div className="mission-control-card-copy">
                        <strong>{app.name}</strong>
                        <span>{title}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    )
  }

  function renderSpotlight() {
    return (
      <AnimatePresence>
        {spotlightOpen ? (
          <div className="spotlight-backdrop" onMouseDown={() => setSpotlightOpen(false)}>
            <motion.div
              ref={spotlightPanelRef}
              className="spotlight-panel"
              initial={{ opacity: 0, y: -22, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.985 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="spotlight-head">
                <span className="spotlight-chip">Spotlight</span>
                <span className="spotlight-hint">Ctrl/Cmd + Space</span>
              </div>
              <input
                ref={spotlightInputRef}
                className="spotlight-input"
                value={spotlightQuery}
                onChange={(event) => {
                  setSpotlightQuery(event.target.value)
                  setSpotlightSelectionIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setSpotlightSelectionIndex((current) => Math.min(spotlightResults.length - 1, current + 1))
                    return
                  }

                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setSpotlightSelectionIndex((current) => Math.max(0, current - 1))
                    return
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault()
                    const selected = spotlightResults[spotlightSelectionIndex] ?? spotlightResults[0]
                    if (selected) {
                      activateSpotlightResult(selected)
                    }
                  }
                }}
                placeholder="Buscar apps, notas, discos o acciones"
              />
              <div className="spotlight-results">
                {spotlightResults.length ? (
                  spotlightResults.map((result, index) => (
                    <button
                      key={result.id}
                      type="button"
                      className={`spotlight-result${index === spotlightSelectionIndex ? ' active' : ''}`}
                      onMouseEnter={() => setSpotlightSelectionIndex(index)}
                      onClick={() => activateSpotlightResult(result)}
                    >
                      <span className="spotlight-result-icon">
                        {result.kind === 'installed-app' && result.app
                          ? renderInstalledAppIcon(result.app, 'icon-preview-chip small')
                          : result.icon
                            ? <span className="icon-preview-chip small">{renderDockIconContent(result.icon)}</span>
                            : <span className="icon-preview-chip small">{result.title[0] ?? '?'}</span>}
                      </span>
                      <span className="spotlight-result-copy">
                        <strong>{result.title}</strong>
                        <span>{result.subtitle}</span>
                      </span>
                      <span className="spotlight-result-kind">
                        {result.kind === 'installed-app'
                          ? 'Sistema'
                          : result.kind === 'app'
                            ? 'Integrada'
                          : result.kind === 'note'
                              ? 'Nota'
                              : result.kind === 'document'
                                ? 'Documento'
                                : result.kind === 'path'
                                  ? 'Archivo'
                                : result.kind === 'volume'
                                  ? 'Disco'
                                  : result.kind === 'route'
                                    ? 'Finder'
                                    : 'Accion'}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="spotlight-empty">
                    <strong>Sin resultados</strong>
                    <span>Prueba con el nombre de una app, nota, volumen o accion del sistema.</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    )
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

  function requestDeleteNote(noteId: string) {
    const target = notes.find((note) => note.id === noteId)
    if (!target) {
      return
    }

    openSystemDialog(
      {
        title: 'Eliminar nota',
        message: `La nota "${target.title || 'Sin titulo'}" se quitara de la biblioteca local.`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      },
      () => {
        deleteNote(noteId)
        pushToast('Nota eliminada', target.title || 'Sin titulo')
      },
    )
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
                <button type="button" onClick={() => requestDeleteNote(activeNote.id)}>Eliminar</button>
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

  function renderTextEditContent(windowItem: WindowState) {
    const documentItem = desktopItems.find((item) => item.id === windowItem.textDocumentId && item.kind === 'text') ?? null

    if (!documentItem) {
      return (
        <div className="textedit-view textedit-empty">
          <p>Este documento ya no existe en el escritorio virtual.</p>
        </div>
      )
    }

    return (
      <div className="textedit-view">
        <input
          className="textedit-title-input"
          value={documentItem.name}
          onChange={(event) => updateDesktopDocument(documentItem.id, { name: event.target.value })}
          placeholder="Nombre del documento"
        />
        <textarea
          className="textedit-body-input"
          value={documentItem.content}
          onChange={(event) => updateDesktopDocument(documentItem.id, { content: event.target.value })}
          placeholder="Escribe aqui..."
        />
      </div>
    )
  }

  function renderSystemDialog() {
    return (
      <AnimatePresence>
        {systemDialog ? (
          <motion.div
            className="system-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={`system-dialog-panel${systemDialog.tone === 'danger' ? ' danger' : ''}`}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="system-dialog-copy">
                <strong>{systemDialog.title}</strong>
                <p>{systemDialog.message}</p>
              </div>
              <div className="system-dialog-actions">
                {systemDialog.cancelLabel ? (
                  <button type="button" className="secondary" onClick={closeSystemDialog}>
                    {systemDialog.cancelLabel}
                  </button>
                ) : null}
                <button type="button" className={systemDialog.tone === 'danger' ? 'danger' : ''} onClick={confirmSystemDialog}>
                  {systemDialog.confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    )
  }

  function renderWifiIcon() {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.2 6.1a9.5 9.5 0 0 1 11.6 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M4.4 8.6a6.1 6.1 0 0 1 7.2 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M6.6 11.1a2.8 2.8 0 0 1 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="13" r="1.1" fill="currentColor" />
      </svg>
    )
  }

  function renderBluetoothIcon() {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M7.3 1.8v12.4l4.9-4.2-3.5-2 3.5-2.1-4.9-4.1Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M3.7 4.7 8.6 8l-4.9 3.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  function renderStatusMenu(kind: 'wifi' | 'bluetooth') {
    const isWifi = kind === 'wifi'
    return (
      <div className="app-menu-dropdown menu-status-dropdown">
        <div className="menu-status-header">
          <strong>{isWifi ? 'Wi-Fi' : 'Bluetooth'}</strong>
          <span>{isWifi ? (networkOnline ? 'Activo' : 'Sin conexion') : (bluetoothSupported ? 'Disponible' : 'No disponible')}</span>
        </div>
        <div className="menu-status-section">
          <strong>{isWifi ? 'Estado actual' : 'Este equipo'}</strong>
          <span>{isWifi ? wifiStatusSummary : bluetoothStatusSummary}</span>
        </div>
        {isWifi ? (
          <div className="menu-status-section">
            <strong>Conexion</strong>
            <span>{networkOnline ? 'Internet disponible para apps y Finder.' : 'La red esta desconectada o en modo offline.'}</span>
          </div>
        ) : (
          <div className="menu-status-section">
            <strong>Dispositivos</strong>
            <span>{bluetoothSupported ? 'Sin dispositivos reportados en esta sesion.' : 'Tu navegador o entorno no expone Bluetooth.'}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setStatusMenuOpen(null)
            setControlCenterOpen(true)
          }}
        >
          Abrir centro de control
        </button>
      </div>
    )
  }

  function renderControlCenter() {
    const recentNotifications = notificationHistory.slice(0, 6)
    const recentEntries = recentItems.slice(0, 6)

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
            <div className="control-center-section">
              <div className="control-center-section-head">
                <strong>Conectividad</strong>
              </div>
              <div className="control-card-grid">
              <button type="button" className="control-card" onClick={() => {
                setControlCenterOpen(false)
                setStatusMenuOpen('wifi')
              }}>
                <span className="control-pill-icon">Wi</span>
                <strong>Wi-Fi</strong>
                <span className="control-note">{wifiStatusSummary}</span>
              </button>
              <button type="button" className="control-card" onClick={() => {
                setControlCenterOpen(false)
                setStatusMenuOpen('bluetooth')
              }}>
                <span className="control-pill-icon">Bt</span>
                <strong>Bluetooth</strong>
                <span className="control-note">{bluetoothSupported ? 'Disponible' : 'No detectado'}</span>
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
            </div>

            <div className="control-center-section">
              <div className="control-center-section-head">
                <strong>Controles</strong>
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
            </div>

            <div className="control-center-section">
              <div className="control-center-section-head">
                <strong>Centro de notificaciones</strong>
              </div>
              <div className="control-list-card">
              <div className="control-list-head">
                <strong>Notificaciones</strong>
                {notificationHistory.length ? (
                  <button type="button" onClick={clearNotificationHistory}>Limpiar</button>
                ) : null}
              </div>
              <div className="control-list-body">
                {recentNotifications.length ? recentNotifications.map((item) => (
                  <div key={item.id} className={`control-list-item static${item.read ? '' : ' unread'}`}>
                    <span className="control-list-icon">•</span>
                    <span className="control-list-copy">
                      <strong>{item.title}</strong>
                      <span>
                        {item.detail || 'Notificacion del sistema'} · {new Date(item.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                  </div>
                )) : (
                  <div className="control-list-empty">
                    <strong>Sin historial</strong>
                    <span>Las alertas recientes del sistema apareceran aqui.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="control-list-card">
              <div className="control-list-head">
                <strong>Recientes</strong>
                <span>{recentItems.length ? `${Math.min(recentItems.length, 6)} visibles` : 'Sin uso reciente'}</span>
              </div>
              <div className="control-list-body">
                {recentEntries.length ? recentEntries.map((item) => (
                  <button key={item.id} type="button" className="control-list-item" onClick={() => activateRecentItem(item)}>
                    <span className="control-list-icon">
                      {item.kind === 'installed-app'
                        ? (() => {
                            const installedApp = installedApps.find((entry) => entry.id === item.installedAppId)
                            return installedApp
                              ? renderInstalledAppIcon(installedApp, 'icon-preview-chip small')
                              : <span className="icon-preview-chip small">{item.title[0] ?? '?'}</span>
                          })()
                        : item.icon
                          ? <span className="icon-preview-chip small">{renderDockIconContent(item.icon)}</span>
                          : <span className="icon-preview-chip small">{item.title[0] ?? '?'}</span>}
                    </span>
                    <span className="control-list-copy">
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </span>
                  </button>
                )) : (
                  <div className="control-list-empty">
                    <strong>Sin elementos recientes</strong>
                    <span>Las apps, archivos y carpetas que abras se iran acumulando aqui.</span>
                  </div>
                )}
              </div>
            </div>
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

    const activeTab = getActiveBrowserTab(browserState)
    if (!activeTab) {
      return null
    }

    const currentUrl = activeTab.history[activeTab.historyIndex]
    const isActiveHeavyWindow = !initialLowEndDevice || activeWindow?.id === windowItem.id
    const canGoBack = activeTab.historyIndex > 0
    const canGoForward = activeTab.historyIndex < activeTab.history.length - 1
    const isHome = isSafariHomeUrl(currentUrl)
    const isBlocked = isBlockedEmbeddedPage(activeTab.lastError)

    return (
      <div className={`browser-view chrome-view${windowItem.appId === 'safari' ? ' browser-inline-toolbar' : ''}`}>
        {windowItem.appId === 'safari' ? (
          <div className="browser-tab-strip">
            <div className="browser-tab-list">
              {browserState.tabs.map((tab) => {
                const tabUrl = tab.history[tab.historyIndex] ?? SAFARI_HOME_URL
                const tabLabel = tab.title.trim()
                  || (isSafariHomeUrl(tabUrl) ? 'Pagina de inicio' : getPathLeaf(tabUrl.replace(/^https?:\/\//i, '')) || 'Nueva pestana')

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`browser-tab-chip${tab.id === browserState.activeTabId ? ' active' : ''}`}
                    onClick={() => selectBrowserTab(windowItem.id, tab.id)}
                  >
                    <span>{tabLabel}</span>
                    <i
                      role="button"
                      aria-label={`Cerrar pestana ${tabLabel}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        closeBrowserTab(windowItem.id, tab.id)
                      }}
                    >
                      ×
                    </i>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="browser-tab-add"
              onClick={() => openBrowserTab(windowItem.id)}
              aria-label="Nueva pestana"
              title="Nueva pestana"
            >
              +
            </button>
          </div>
        ) : null}
        <div className="browser-controls">
          <div className="browser-actions">
            <button
              type="button"
              className="browser-icon-button"
              disabled={!canGoBack}
              onClick={() => moveBrowserHistory(windowItem.id, -1)}
              aria-label="Atrás"
              title="Atrás"
            >
              ‹
            </button>
            <button
              type="button"
              className="browser-icon-button"
              disabled={!canGoForward}
              onClick={() => moveBrowserHistory(windowItem.id, 1)}
              aria-label="Adelante"
              title="Adelante"
            >
              ›
            </button>
          </div>
          <form
            className="browser-address-form"
            onSubmit={(event) => {
              event.preventDefault()
              commitBrowserNavigation(windowItem.id, activeTab.inputValue)
            }}
          >
            <span className="browser-address-icon" aria-hidden="true">⌕</span>
            {activeTab.progress > 0 ? <span className="browser-loading-spinner" aria-hidden="true" /> : null}
            <input
              className="browser-address-input"
              value={activeTab.inputValue}
              onChange={(event) => setBrowserInput(windowItem.id, event.target.value)}
              placeholder="Buscar o escribir una URL"
            />
          </form>
          <div className="browser-actions browser-actions-end">
            <button
              type="button"
              className={`browser-icon-button${activeTab.progress > 0 ? ' is-loading' : ''}`}
              onClick={() => reloadBrowser(windowItem.id)}
              aria-label={activeTab.progress > 0 ? 'Cargando pagina' : 'Recargar'}
              title={activeTab.progress > 0 ? 'Cargando pagina' : 'Recargar'}
            >
              ↻
            </button>
          </div>
        </div>
        <div className="browser-page browser-page-live">
          {activeTab.progress > 0 && !isHome ? (
            <div className="browser-progress" aria-hidden="true">
              <span
                className={`browser-progress-bar${!activeTab.loading && activeTab.lastError ? ' error' : ''}`}
                style={{ width: `${activeTab.progress}%` }}
              />
            </div>
          ) : null}
          {!isHome && (activeTab.loading || activeTab.lastError) ? (
            <div className="browser-meta">
              {activeTab.loading ? <span>Cargando pagina...</span> : null}
              {activeTab.lastError ? <span className="browser-error">{activeTab.lastError}</span> : null}
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
                <p>Una portada inspirada en Safari con favoritos y busqueda rapida.</p>
              </div>

              <div className="safari-favorites">
                {[
                  { label: 'Apple', value: 'apple.com', glyph: '' },
                  { label: 'Google', value: 'google.com', glyph: 'G' },
                  { label: 'YouTube', value: 'youtube.com', glyph: '▶' },
                  { label: 'Wikipedia', value: 'wikipedia.org', glyph: 'W' },
                  { label: 'GitHub', value: 'github.com', glyph: 'GH' },
                  { label: 'Coffeewaffles', value: 'coffeewaffles.cl', glyph: 'CW' },
                ].map((favorite) => (
                  <button
                    key={favorite.value}
                    type="button"
                    className="safari-favorite-tile"
                    onClick={() => commitBrowserNavigation(windowItem.id, favorite.value)}
                  >
                    <span className="safari-favorite-icon">{favorite.glyph}</span>
                    <strong>{favorite.label}</strong>
                  </button>
                ))}
              </div>

              <form
                className="mactorno-search"
                onSubmit={(event) => {
                  event.preventDefault()
                  commitBrowserNavigation(windowItem.id, activeTab.inputValue)
                }}
              >
                <input
                  className="mactorno-search-input"
                  value={activeTab.inputValue === SAFARI_HOME_URL ? '' : activeTab.inputValue}
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

              <div className="safari-privacy-card">
                <strong>Informe de privacidad</strong>
                <span>Mactorno intenta bloquear rastreadores basicos y mantener una experiencia limpia en la pagina inicial.</span>
              </div>
            </div>
          ) : !isActiveHeavyWindow ? (
            <div className="media-empty-state">
              <strong>Navegador en pausa</strong>
              <p>En equipos lentos solo la ventana activa mantiene el contenido web montado.</p>
              <div className="media-actions">
                <button type="button" onClick={() => focusWindow(windowItem.id)}>
                  Activar ventana
                </button>
                <button type="button" onClick={() => openBrowserExternally(currentUrl)}>
                  Abrir externo
                </button>
              </div>
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
                key={`${currentUrl}-${activeTab.reloadKey}`}
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
    const isActiveHeavyWindow = !initialLowEndDevice || activeWindow?.id === windowItem.id
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
            <button type="button" onClick={() => void openTrackedSystemPath(mediaPath, windowItem.title)}>
              Abrir con el sistema
            </button>
          </div>
          <span className="media-path">{`${Math.round(photoView.zoom * 100)}% · ${photoView.rotation}° · ${mediaPath}`}</span>
        </div>
        {isActiveHeavyWindow ? (
          <PhotoViewer
            src={getMediaSource(mediaPath)}
            alt={windowItem.title}
            zoom={photoView.zoom}
            rotation={photoView.rotation}
          />
        ) : (
          <div className="media-empty-state">
            <strong>Vista suspendida</strong>
            <p>La imagen completa se monta cuando esta ventana vuelve a estar activa.</p>
            <div className="media-actions">
              <button type="button" onClick={() => focusWindow(windowItem.id)}>
                Activar ventana
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderVideoContent(windowItem: WindowState) {
    const mediaPath = windowItem.mediaPath
    const playback = videoPlaybackState[windowItem.id] ?? { playing: false, muted: false, rate: 1 }
    const isActiveHeavyWindow = !initialLowEndDevice || activeWindow?.id === windowItem.id
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
            <button type="button" onClick={() => void openTrackedSystemPath(mediaPath, windowItem.title)}>
              Abrir con el sistema
            </button>
          </div>
          <span className="media-path">{`${playback.playing ? 'Reproduciendo' : 'Pausado'} · ${playback.muted ? 'Mute' : 'Audio'} · x${playback.rate} · ${mediaPath}`}</span>
        </div>
        {isActiveHeavyWindow ? (
          <VideoPlayer
            src={getMediaSource(mediaPath)}
            videoRef={(node) => registerVideoElement(windowItem.id, node)}
            onPlaybackStateChange={() => updateVideoPlaybackMeta(windowItem.id)}
          />
        ) : (
          <div className="media-empty-state">
            <strong>Video en pausa</strong>
            <p>En hardware limitado el reproductor solo se monta en la ventana activa.</p>
            <div className="media-actions">
              <button type="button" onClick={() => focusWindow(windowItem.id)}>
                Activar ventana
              </button>
            </div>
          </div>
        )}
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
      case 'textedit':
        return renderTextEditContent(windowItem)
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
            <div className="terminal-body">
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
          </div>
        )
      default:
        return null
    }
  }

  if (!loggedIn) {
    return (
      <main
        className={`login-screen${loginTransitioning ? ' exiting' : ''}`}
        style={{ '--login-background': loginWallpaperBackground } as CSSProperties}
      >
        <div className="login-clock-block" aria-hidden="true">
          <span className="login-clock-date">{clock.loginDate}</span>
          <strong className="login-clock-time">{clock.loginTime}</strong>
        </div>
        <div className={`login-panel${loginTransitioning ? ' exiting' : ''}`}>
          <button
            type="button"
            className="login-avatar-button"
            onClick={() => setLoginTransitioning(true)}
            disabled={loginTransitioning}
            aria-label={`Entrar como ${deviceInfo?.userName ?? 'Usuario local'}`}
          >
            <span className="avatar-shell">
              {deviceInfo?.userAvatar ? (
                <img className="login-avatar-image" src={deviceInfo.userAvatar} alt={deviceInfo.userName} />
              ) : (
                <span>{(deviceInfo?.userName?.trim()[0] || 'M').toUpperCase()}</span>
              )}
            </span>
          </button>
          <h1>{deviceInfo?.userName ?? 'Usuario local'}</h1>
          <p className="login-access-copy">
            {deviceInfo ? 'Touch ID o presiona el avatar' : 'Haz clic en el avatar para entrar'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main
      className={`desktop-shell appearance-${appearanceMode} performance-${resolvedPerformanceProfile} performance-mode-${performanceMode}${visibleWindowCount > 1 ? ' desktop-heavy-windows' : ''}`}
      style={{ '--desktop-background': desktopWallpaperBackground } as CSSProperties}
    >
      <header className="menu-bar">
        <div className="menu-left" ref={menuBarRef}>
          <button type="button" className="apple-mark apple-button" onClick={() => openApp('about')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.365 12.174c.012 2.864 2.512 3.819 2.54 3.832-.021.067-.399 1.367-1.314 2.71-.791 1.161-1.611 2.319-2.904 2.343-1.271.023-1.68-.753-3.134-.753-1.454 0-1.909.729-3.111.776-1.248.047-2.2-1.252-2.998-2.409-1.629-2.356-2.873-6.657-1.203-9.559.829-1.442 2.312-2.355 3.921-2.378 1.226-.023 2.383.823 3.134.823.752 0 2.164-.998 3.647-.852.621.026 2.366.251 3.486 1.89-.091.056-2.082 1.214-2.07 3.577ZM14.871 4.81c.662-.801 1.108-1.916.986-3.026-.954.038-2.108.636-2.793 1.436-.615.711-1.153 1.847-1.008 2.932 1.064.083 2.153-.541 2.815-1.342Z"
              />
            </svg>
          </button>
          <strong>{activeApp.name}</strong>
          {activeApp.menu.map((item) => {
            const actions = getAppMenuActions(activeWindow, item)
            if (actions.length === 0) {
              return null
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
          <div className="menu-status-group" ref={statusMenusRef}>
            <div className="menu-entry-wrap status-menu-wrap">
            <button
              type="button"
              className={`menu-status-button${statusMenuOpen === 'wifi' ? ' open' : ''}`}
              onMouseDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                setPowerMenuOpen(false)
                setControlCenterOpen(false)
                setStatusMenuOpen((current) => (current === 'wifi' ? null : 'wifi'))
              }}
              aria-label="Estado de Wi-Fi"
              title={wifiStatusSummary}
            >
              {renderWifiIcon()}
            </button>
            {statusMenuOpen === 'wifi' ? renderStatusMenu('wifi') : null}
            </div>
            <div className="menu-entry-wrap status-menu-wrap">
            <button
              type="button"
              className={`menu-status-button${statusMenuOpen === 'bluetooth' ? ' open' : ''}`}
              onMouseDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                setPowerMenuOpen(false)
                setControlCenterOpen(false)
                setStatusMenuOpen((current) => (current === 'bluetooth' ? null : 'bluetooth'))
              }}
              aria-label="Estado de Bluetooth"
              title={bluetoothStatusSummary}
            >
              {renderBluetoothIcon()}
            </button>
            {statusMenuOpen === 'bluetooth' ? renderStatusMenu('bluetooth') : null}
            </div>
          </div>
          <button
            type="button"
            className="control-center-toggle"
            onMouseDown={(event) => {
              event.stopPropagation()
            }}
              onClick={(event) => {
                event.stopPropagation()
                setStatusMenuOpen(null)
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
              {notificationUnreadCount ? <span className="control-center-badge">{notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}</span> : null}
            </button>
          <span>{clock.menu}</span>
          <div className="menu-entry-wrap power-menu-wrap" ref={powerMenuRef}>
            <button
              type="button"
              className={`power-menu-button${powerMenuOpen ? ' open' : ''}`}
              onMouseDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                setStatusMenuOpen(null)
                setPowerMenuOpen((current) => !current)
              }}
              aria-label="Opciones de energía"
            >
              ⏻
            </button>
            {powerMenuOpen ? (
              <div className="app-menu-dropdown power-menu-dropdown">
                <button type="button" onClick={() => void quitDesktopApp()}>Apagar</button>
                <button type="button" onClick={() => void reloadDesktopApp()}>Reiniciar</button>
                <button type="button" onClick={logoutToLogin}>Cerrar sesion</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {renderControlCenter()}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              className="toast-card"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="toast-copy">
                <strong>{toast.title}</strong>
                {toast.detail ? <span>{toast.detail}</span> : null}
              </div>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label={`Cerrar aviso ${toast.title}`}>
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {altTabState.open && altTabCandidates.length > 0 ? (
          <motion.div
            className="alt-tab-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            <motion.div
              className="alt-tab-panel"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              {altTabCandidates.map((item, index) => {
                const app = getResolvedApp(item.appId)
                const isSelected = altTabState.selectedIndex === index
                const title = getWindowDisplayTitle(item)

                return (
                  <div key={item.id} className={`alt-tab-item${isSelected ? ' active' : ''}`}>
                    <div className="alt-tab-icon" style={{ background: app.accent }}>
                      {renderDockIconContent(app.iconSpec)}
                    </div>
                    <strong>{app.name}</strong>
                    <span>{title}</span>
                  </div>
                )
              })}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {renderMissionControl()}

      <section
        className="desktop-canvas"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement
          if (!target.closest('.desktop-item-icon, .desktop-volume-icon, .desktop-trash-icon, .app-window, .finder-file-tile, .finder-file-row, .finder-folder-tile')) {
            updateQuickLookCandidate(null)
          }
        }}
        onDragOver={(event) => {
          if (parseDesktopItemDragPayload(event.dataTransfer.getData(DESKTOP_ITEM_DRAG_MIME))) {
            handleDesktopItemRootDragOver(event)
            return
          }
          if (parseVolumeEntryPayload(event.dataTransfer.getData('application/x-mactorno-volume-entry'))) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(event) => {
          if (parseDesktopItemDragPayload(event.dataTransfer.getData(DESKTOP_ITEM_DRAG_MIME))) {
            handleDesktopItemRootDrop(event, null, { x: event.clientX, y: event.clientY })
            return
          }
          const entry = parseVolumeEntryPayload(event.dataTransfer.getData('application/x-mactorno-volume-entry'))
          if (!entry) {
            return
          }
          event.preventDefault()
          importVolumeEntryToDesktop(entry, null, { x: event.clientX, y: event.clientY })
        }}
        onContextMenu={(event) => {
          const target = event.target as HTMLElement
          if (target.closest('.app-window, .desktop-volume-icon, .desktop-item-icon, .context-menu, .dock-wrap')) {
            return
          }

          event.preventDefault()
          openContextMenuAt({
            type: 'desktop',
            desktopX: event.clientX,
            desktopY: event.clientY,
          }, event.clientX, event.clientY)
        }}
      >
        <div className="wallpaper-glow wallpaper-glow-a" />
        <div className="wallpaper-glow wallpaper-glow-b" />

        <button
          type="button"
          className="desktop-trash-icon"
          data-trash-drop-target="true"
          style={getDesktopTrashPosition()}
          onPointerDown={startDesktopTrashDrag}
          onClick={(event) => {
            if (skipDesktopTrashClickRef.current) {
              skipDesktopTrashClickRef.current = false
              return
            }
            if (event.detail < 2) {
              return
            }
            openOrFocusFinderRoute('trash')
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            openContextMenuAt({ type: 'trash' }, event.clientX, event.clientY)
          }}
        >
          <img className="desktop-item-art trash" src={resolvePublicAssetPath(trashItems.length ? '/trash2.png' : '/trash.png')} alt="" draggable={false} />
          <strong>Papelera</strong>
          <span>{trashItems.length ? `${trashItems.length} item${trashItems.length === 1 ? '' : 's'}` : 'Vacia'}</span>
        </button>

        {desktopItemNodes}

        {desktopVolumeNodes}

        {visibleWindows.map((item) => {
            const app = getResolvedApp(item.appId)
            const isActive = activeWindow?.id === item.id
            const isMorphingWindow = windowMorphIds.includes(item.id)
            const windowStyle: CSSProperties & { '--window-resize-duration': string } = {
              width: item.width,
              height: item.height,
              transform: `translate(${item.x}px, ${item.y}px)`,
              zIndex: item.zIndex,
              borderRadius: item.maximized ? 0 : WINDOW_RADIUS,
              '--window-resize-duration': `${maximizeAnimationDurationMs}ms`,
            }
            const title = getWindowDisplayTitle(item)
            const safariBrowserState = item.appId === 'safari' ? item.browserState : null
            const safariCanGoBack = safariBrowserState ? safariBrowserState.historyIndex > 0 : false
            const safariCanGoForward = safariBrowserState
              ? safariBrowserState.historyIndex < safariBrowserState.history.length - 1
              : false
            const finderState = item.appId === 'finder' ? item.finderState : null
            const activeFinderTab = getActiveFinderTab(finderState)
            const activeFinderRoute = getActiveFinderRoute(finderState)
            const finderCanGoBack = !!activeFinderTab && activeFinderTab.historyIndex > 0
            const finderCanGoForward = !!activeFinderTab && activeFinderTab.historyIndex < activeFinderTab.history.length - 1
            const finderViewMode = finderState?.viewMode ?? 'icons'

            return (
              <article
                key={item.id}
                className={`app-window app-${item.appId}${isActive ? ' active' : ''}${item.genie ? ' is-genie' : ''}${item.maximized ? ' maximized' : ''}${isMorphingWindow ? ' is-morphing' : ''}`}
                style={windowStyle}
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
                    className={`window-toolbar${item.appId === 'safari' ? ' safari-toolbar' : ''}`}
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
                    {item.appId === 'safari' && safariBrowserState ? (
                      <>
                        <div className="window-title safari-title">
                          <span className="window-app-icon" style={{ background: app.accent }}>
                            {renderDockIconContent(app.iconSpec)}
                          </span>
                          <span>{app.name}</span>
                        </div>
                        <div className="browser-actions safari-toolbar-actions">
                          <button
                            type="button"
                            className="browser-icon-button"
                            disabled={!safariCanGoBack}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => moveBrowserHistory(item.id, -1)}
                            aria-label="Atrás"
                            title="Atrás"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className="browser-icon-button"
                            disabled={!safariCanGoForward}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => moveBrowserHistory(item.id, 1)}
                            aria-label="Adelante"
                            title="Adelante"
                          >
                            ›
                          </button>
                        </div>
                        <form
                          className="browser-address-form safari-toolbar-address"
                          onPointerDown={(event) => event.stopPropagation()}
                          onSubmit={(event) => {
                            event.preventDefault()
                            commitBrowserNavigation(item.id, safariBrowserState.inputValue)
                          }}
                        >
                          <span className="browser-address-icon" aria-hidden="true">⌕</span>
                          {safariBrowserState.progress > 0 ? <span className="browser-loading-spinner" aria-hidden="true" /> : null}
                          <input
                            className="browser-address-input"
                            value={safariBrowserState.inputValue}
                            onChange={(event) => setBrowserInput(item.id, event.target.value)}
                            placeholder="Buscar o escribir una URL"
                          />
                        </form>
                        <div className="browser-actions browser-actions-end safari-toolbar-actions">
                          <button
                            type="button"
                            className="browser-icon-button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => openBrowserTab(item.id)}
                            aria-label="Nueva pestana"
                            title="Nueva pestana"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className={`browser-icon-button${safariBrowserState.progress > 0 ? ' is-loading' : ''}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => reloadBrowser(item.id)}
                            aria-label={safariBrowserState.progress > 0 ? 'Cargando pagina' : 'Recargar'}
                            title={safariBrowserState.progress > 0 ? 'Cargando pagina' : 'Recargar'}
                          >
                            ↻
                          </button>
                        </div>
                      </>
                    ) : item.appId === 'finder' && finderState ? (
                      <>
                        <div className="window-title finder-title">
                          <span className="window-app-icon" style={{ background: app.accent }}>
                            {renderDockIconContent(app.iconSpec)}
                          </span>
                          <span>{title}</span>
                        </div>
                        <div className="finder-nav-group finder-toolbar-group">
                          <button
                            type="button"
                            className="finder-toolbar-icon"
                            disabled={!finderCanGoBack}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => moveFinderHistory(item.id, -1)}
                            aria-label="Atrás"
                            title="Atrás"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className="finder-toolbar-icon"
                            disabled={!finderCanGoForward}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => moveFinderHistory(item.id, 1)}
                            aria-label="Adelante"
                            title="Adelante"
                          >
                            ›
                          </button>
                        </div>
                        <div className="finder-toolbar-spacer" />
                        <div className="finder-bar-actions finder-toolbar-actions">
                          <div className="finder-view-toggle" aria-label="Vista del Finder">
                            <button
                              type="button"
                              className={finderViewMode === 'icons' ? 'active' : ''}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => updateFinderViewMode(item.id, 'icons')}
                              aria-label="Vista por iconos"
                              title="Vista por iconos"
                            >
                              ⊞
                            </button>
                            <button
                              type="button"
                              className={finderViewMode === 'list' ? 'active' : ''}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => updateFinderViewMode(item.id, 'list')}
                              aria-label="Vista por lista"
                              title="Vista por lista"
                            >
                              ☰
                            </button>
                          </div>
                          <button
                            type="button"
                            className="finder-toolbar-icon"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => openFinderTab(item.id, activeFinderRoute)}
                            aria-label="Nueva pestaña"
                            title="Nueva pestaña"
                          >
                            +
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="window-title">
                        <span className="window-app-icon" style={{ background: app.accent }}>
                          {renderDockIconContent(app.iconSpec)}
                        </span>
                        <span>{title}</span>
                      </div>
                    )}
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

      {contextMenu?.type === 'finder-virtual' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {desktopClipboard ? (
            <button type="button" onClick={() => pasteDesktopClipboard(undefined, contextMenu.parentId)}>
              Pegar
            </button>
          ) : null}
        </div>
      ) : null}

      {contextMenu?.type === 'volume-entry' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => copyVolumeEntry(contextMenu.entry)}>
            Copiar {contextMenu.label}
          </button>
        </div>
      ) : null}

      {contextMenu?.type === 'desktop' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => createDesktopItem('folder', { x: contextMenu.desktopX, y: contextMenu.desktopY })}
          >
            Nueva carpeta
          </button>
          <button
            type="button"
            onClick={() => createDesktopItem('text', { x: contextMenu.desktopX, y: contextMenu.desktopY })}
          >
            Nuevo documento de texto
          </button>
          <button
            type="button"
            onClick={() => {
              openApp('display')
              setContextMenu(null)
            }}
          >
            Cambiar fondo
          </button>
          {desktopClipboard ? (
            <button
              type="button"
              onClick={() => pasteDesktopClipboard({ x: contextMenu.desktopX, y: contextMenu.desktopY })}
            >
              Pegar
            </button>
          ) : null}
          <button type="button" onClick={sortDesktopRootItems}>
            Ordenar iconos
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null)
            }}
          >
            Actualizar
          </button>
        </div>
      ) : null}

      {contextMenu?.type === 'desktop-item' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              if (contextMenu.kind === 'folder') {
                openDesktopFolder(contextMenu.itemId)
              } else {
                openDesktopDocument(contextMenu.itemId)
              }
              setContextMenu(null)
            }}
          >
            Abrir {contextMenu.label}
          </button>
          <button type="button" onClick={() => renameDesktopItem(contextMenu.itemId)}>
            Renombrar
          </button>
          <button type="button" onClick={() => copyDesktopItem(contextMenu.itemId)}>
            Copiar
          </button>
          <button type="button" onClick={() => duplicateDesktopItem(contextMenu.itemId)}>
            Duplicar
          </button>
          {contextMenu.kind === 'folder' && desktopClipboard ? (
            <button type="button" onClick={() => pasteDesktopClipboard(undefined, contextMenu.itemId)}>
              Pegar dentro
            </button>
          ) : null}
          <button type="button" onClick={() => deleteDesktopItem(contextMenu.itemId)}>
            Mover a papelera
          </button>
        </div>
      ) : null}

      {contextMenu?.type === 'trash' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => {
            openOrFocusFinderRoute('trash')
            setContextMenu(null)
          }}>
            Abrir papelera
          </button>
          <button type="button" onClick={emptyTrash}>
            Vaciar papelera
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

      {contextMenu?.type === 'dock-transient' ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              const item = visibleTransientDockItems.find((entry) => entry.id === contextMenu.itemId)
              if (item) {
                void activateCustomDockItem(item)
              }
              setContextMenu(null)
            }}
          >
            Abrir {contextMenu.label}
          </button>
          <button
            type="button"
            onClick={() => {
              pinTransientDockItem(contextMenu.itemId)
              setContextMenu(null)
            }}
          >
            Mantener en dock
          </button>
          {runtimeDockItems.some((item) => item.id === contextMenu.itemId) ? (
            <button
              type="button"
              onClick={() => {
                dismissRuntimeDockItem(contextMenu.itemId)
                setContextMenu(null)
              }}
            >
              Quitar del dock
            </button>
          ) : null}
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
        {renderQuickLook()}
        {renderSpotlight()}
        {renderSystemDialog()}
        {renderDockFolderStack()}

        <footer className="dock-wrap">
        <motion.div
          className="dock"
          ref={dockRef}
          onMouseEnter={() => {
            measureDockCenters()
            if (!dockHoverAnimationEnabled) {
              dockMouseX.set(Infinity)
            }
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
            event.dataTransfer.dropEffect = dockDragItemIdRef.current ? 'move' : 'copy'
          }}
          onDrop={(event) => {
            event.preventDefault()
            dockDragItemIdRef.current = null
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
          {orderedDockAppIds.map((appId) => {
            const app = getResolvedApp(appId)
            const isOpen = openAppIds.has(app.id)
            const dockPinnedId = getDockPinnedAppKey(app.id)
            const isPinned = dockItems.includes(app.id)
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
                motionProfile={resolvedPerformanceProfile}
                onActivate={() => openApp(app.id)}
                registerRef={registerDockItemRef}
                draggable={isPinned}
                onDragStart={(event) => {
                  if (!isPinned) {
                    return
                  }
                  dockDragItemIdRef.current = dockPinnedId
                  event.dataTransfer.setData('text/plain', dockPinnedId)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (!dockDragItemIdRef.current || !isPinned) {
                    return
                  }
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  reorderDockPinnedItems(dockPinnedId)
                }}
                onDragEnd={(event) => handleDockIconDragEnd(event, app.id, false)}
                onDrop={(event) => {
                  event.preventDefault()
                  reorderDockPinnedItems(dockPinnedId)
                }}
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
          {orderedCustomDockItems.map((item) => {
            const dockPinnedId = getDockPinnedCustomKey(item.id)
            const stackEntries = getDockFolderStackEntries(item)

            return (
            <DockIconButton
              key={item.id}
              id={item.id}
              name={item.name}
              accent={item.accent}
              icon={item.icon}
              isOpen={false}
              mouseX={dockMouseX}
              centerX={dockCenters[item.id] ?? -9999}
              motionProfile={resolvedPerformanceProfile}
              onActivate={() => {
                if (stackEntries?.length) {
                  setDockFolderStackItemId((current) => current === item.id ? null : item.id)
                  return
                }
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
                dockDragItemIdRef.current = dockPinnedId
                event.dataTransfer.setData('text/plain', dockPinnedId)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                if (!dockDragItemIdRef.current) {
                  return
                }
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                reorderDockPinnedItems(dockPinnedId)
              }}
              onDragEnd={(event) => handleDockIconDragEnd(event, item.id, true)}
              onDrop={(event) => {
                event.preventDefault()
                reorderDockPinnedItems(dockPinnedId)
              }}
              />
            )
          })}
          {visibleTransientDockItems.map((item) => (
            <DockIconButton
              key={item.id}
              id={item.id}
              name={item.name}
              accent={item.accent}
              icon={item.icon}
              isOpen
              mouseX={dockMouseX}
              centerX={dockCenters[item.id] ?? -9999}
              motionProfile={resolvedPerformanceProfile}
              onActivate={() => {
                const stackEntries = getDockFolderStackEntries(item)
                if (stackEntries?.length) {
                  setDockFolderStackItemId((current) => current === item.id ? null : item.id)
                  return
                }
                void activateCustomDockItem(item)
              }}
              registerRef={registerDockItemRef}
              onContextMenu={(event) => {
                event.preventDefault()
                openContextMenuAt({
                  type: 'dock-transient',
                  itemId: item.id,
                  label: item.name,
                }, event.clientX, event.clientY)
              }}
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
              motionProfile={resolvedPerformanceProfile}
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

import loginWallpaperSvg from '../assets/login-wallpaper.svg'
import {
  APPEARANCE_MODE_STORAGE_KEY,
  APPS,
  APP_VISUAL_STORAGE_KEY,
  CUSTOM_DOCK_STORAGE_KEY,
  DEFAULT_BROWSER_URL,
  DEFAULT_DOCK_ITEMS,
  DEFAULT_LOGIN_WALLPAPER,
  DEFAULT_WEB_FALLBACK_URL,
  DESKTOP_VOLUME_POSITIONS_STORAGE_KEY,
  DOCK_HOVER_ANIMATION_STORAGE_KEY,
  DOCK_STORAGE_KEY,
  NOTES_STORAGE_KEY,
  PERFORMANCE_MODE_STORAGE_KEY,
  PUBLIC_ASSET_BASE,
  SAFARI_HOME_URL,
  WALLPAPER_PRESETS,
} from './constants'
import type {
  AppId,
  AppVisualOverrides,
  BrowserState,
  CalculatorState,
  CustomDockItem,
  DeviceInfo,
  DockIconSpec,
  FinderRoute,
  FinderState,
  FinderTab,
  InstalledApp,
  NoteItem,
  PerformanceMode,
  ResolvedPerformanceProfile,
  TerminalState,
  VolumeEntry,
  WallpaperSelection,
} from './types'

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function resolvePublicAssetPath(assetPath: string) {
  if (!assetPath) {
    return assetPath
  }

  if (/^(?:[a-z]+:)?\/\//i.test(assetPath) || /^[a-z]:\\/i.test(assetPath) || /^(?:data|blob|mactorno-media):/i.test(assetPath)) {
    return assetPath
  }

  return `${PUBLIC_ASSET_BASE}${assetPath.replace(/^\/+/, '')}`
}

export function clampPercent(value: number) {
  return clamp(value, 0, 100)
}

export function createLampClipPath(anchorX: number, topInset: number, waistInset: number, tipWidth: number, bias = 0) {
  const anchor = clampPercent(anchorX * 100 + bias)
  const topLeft = clampPercent(topInset)
  const topRight = clampPercent(100 - topInset)
  const waistLeft = clampPercent(anchor - tipWidth * 0.5 - waistInset)
  const waistRight = clampPercent(anchor + tipWidth * 0.5 + waistInset)
  const tipLeft = clampPercent(anchor - tipWidth * 0.5)
  const tipRight = clampPercent(anchor + tipWidth * 0.5)

  return `polygon(${topLeft}% 0%, ${topRight}% 0%, ${waistRight}% 72%, ${tipRight}% 100%, ${tipLeft}% 100%, ${waistLeft}% 72%)`
}

export function createVolumeRoute(mount: string): FinderRoute {
  return `volume:${encodeURIComponent(mount)}::${encodeURIComponent(mount)}` as FinderRoute
}

export function createDesktopFolderRoute(itemId: string): FinderRoute {
  return `desktop-folder:${itemId}` as FinderRoute
}

export function isDesktopFolderRoute(route: FinderRoute): route is `desktop-folder:${string}` {
  return route.startsWith('desktop-folder:')
}

export function getDesktopFolderIdFromRoute(route: FinderRoute) {
  return isDesktopFolderRoute(route) ? route.slice('desktop-folder:'.length) : null
}

export function isVolumeRoute(route: FinderRoute): route is `volume:${string}` {
  return route.startsWith('volume:')
}

export function getVolumeRouteParts(route: FinderRoute) {
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

export function getVolumeMountFromRoute(route: FinderRoute) {
  return getVolumeRouteParts(route)?.mount ?? null
}

export function getVolumePathFromRoute(route: FinderRoute) {
  return getVolumeRouteParts(route)?.targetPath ?? null
}

export function createVolumeSubRoute(mount: string, targetPath: string): FinderRoute {
  return `volume:${encodeURIComponent(mount)}::${encodeURIComponent(targetPath)}` as FinderRoute
}

export function formatVolumeLabel(mount: string) {
  return mount.replace(/[\\/]+$/, '')
}

export function getPathLeaf(targetPath: string) {
  const normalized = targetPath.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? normalized
}

export function getDesktopVolumeKind(volume: { kind: 'internal' | 'external'; name: string; mount: string }) {
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

export function getDesktopVolumeIconSrc(volume: { kind: 'internal' | 'external'; name: string; mount: string }) {
  return getDesktopVolumeKind(volume) === 'drive' ? '/hd.png' : '/sd.png'
}

export function formatVolumeSize(sizeBytes: number | null) {
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

export function serializeVolumeEntryPayload(entry: VolumeEntry) {
  return JSON.stringify(entry)
}

export function parseVolumeEntryPayload(payload: string) {
  try {
    const parsed = JSON.parse(payload) as VolumeEntry
    if (!parsed?.path || !parsed?.name || !parsed?.kind) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const SUPPORTED_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.pjpeg',
  '.pjp',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
  '.apng',
  '.ico',
] as const

const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.m4v',
  '.webm',
  '.mov',
  '.mkv',
  '.avi',
  '.ogv',
  '.ogm',
  '.mpeg',
  '.mpg',
  '.mpe',
  '.mpv',
  '.m2v',
  '.ts',
  '.mts',
  '.m2ts',
  '.3gp',
  '.3g2',
] as const

export function isImageEntry(entry: VolumeEntry) {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(entry.extension.toLowerCase() as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number])
}

export function isVideoEntry(entry: VolumeEntry) {
  return SUPPORTED_VIDEO_EXTENSIONS.includes(entry.extension.toLowerCase() as (typeof SUPPORTED_VIDEO_EXTENSIONS)[number])
}

export function getMediaSource(filePath: string) {
  if (/^blob:/i.test(filePath)) {
    return filePath
  }

  return window.electronDesktop
    ? `mactorno-media://${encodeURIComponent(filePath)}`
    : `/api/media-file?path=${encodeURIComponent(filePath)}`
}

export function getWallpaperPreviewSource(selection: WallpaperSelection) {
  switch (selection.kind) {
    case 'preset': {
      const preset = WALLPAPER_PRESETS.find((item) => item.id === selection.value) ?? WALLPAPER_PRESETS[0]
      return { type: 'gradient' as const, value: preset.background, label: preset.name }
    }
    case 'asset':
      return { type: 'image' as const, value: loginWallpaperSvg, label: selection.name }
    case 'system':
      return { type: 'image' as const, value: getMediaSource(selection.value), label: selection.name }
    default:
      return { type: 'image' as const, value: selection.value, label: selection.name }
  }
}

export function getWallpaperBackground(selection: WallpaperSelection) {
  const preview = getWallpaperPreviewSource(selection)
  return preview.type === 'gradient'
    ? { background: preview.value }
    : { backgroundImage: `url("${preview.value}")` }
}

export function isWallpaperSelectionActive(current: WallpaperSelection, candidate: WallpaperSelection) {
  return current.kind === candidate.kind && current.value === candidate.value
}

export const MENU_TIME_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
})

export const LOGIN_DATE_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export const LOGIN_TIME_FORMATTER = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatTime(date: Date) {
  return MENU_TIME_FORMATTER.format(date)
}

export function formatLoginDate(date: Date) {
  return LOGIN_DATE_FORMATTER.format(date)
}

export function formatLoginTime(date: Date) {
  return LOGIN_TIME_FORMATTER.format(date)
}

export function getApp(appId: AppId) {
  return APPS.find((app) => app.id === appId) ?? APPS[0]
}

export function readIconFile(file: File, onLoad: (value: string) => void) {
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      onLoad(reader.result)
    }
  }
  reader.readAsDataURL(file)
}

export function readWallpaperFile(file: File, onLoad: (selection: WallpaperSelection) => void) {
  readIconFile(file, (value) => {
    onLoad({
      kind: 'upload',
      value,
      name: file.name.replace(/\.[^.]+$/, ''),
    })
  })
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function getDocumentPreviewIcon(name: string, extension = '') {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, '')
  const baseName = name.replace(/\.[^.]+$/, '').trim() || 'Archivo'
  const title = escapeSvgText(baseName.slice(0, 18))
  const palette = (() => {
    switch (normalizedExtension) {
      case 'pdf':
        return { top: '#ff6b61', bottom: '#c62828', badge: 'PDF' }
      case 'doc':
      case 'docx':
      case 'rtf':
      case 'txt':
        return { top: '#66a9ff', bottom: '#1e5ed8', badge: normalizedExtension.toUpperCase() || 'DOC' }
      case 'xls':
      case 'xlsx':
      case 'csv':
        return { top: '#49c774', bottom: '#1d8b52', badge: normalizedExtension.toUpperCase() || 'XLS' }
      case 'ppt':
      case 'pptx':
      case 'key':
        return { top: '#ff9f68', bottom: '#e25a1c', badge: normalizedExtension.toUpperCase() || 'PPT' }
      case 'zip':
      case 'rar':
      case '7z':
        return { top: '#8d95a6', bottom: '#5c6370', badge: normalizedExtension.toUpperCase() || 'ZIP' }
      default:
        return { top: '#9bb7ff', bottom: '#6a7dff', badge: (normalizedExtension || 'FILE').slice(0, 4).toUpperCase() }
    }
  })()

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${palette.top}"/>
      <stop offset="100%" stop-color="${palette.bottom}"/>
    </linearGradient>
  </defs>
  <rect x="14" y="10" width="68" height="76" rx="16" fill="#ffffff"/>
  <path d="M64 10h4a14 14 0 0 1 14 14v4H64z" fill="#eef3ff"/>
  <rect x="20" y="18" width="56" height="20" rx="10" fill="url(#g)"/>
  <text x="48" y="32" text-anchor="middle" font-size="13" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#ffffff">${escapeSvgText(palette.badge)}</text>
  <rect x="24" y="46" width="48" height="4" rx="2" fill="#d8dfef"/>
  <rect x="24" y="54" width="42" height="4" rx="2" fill="#e3e8f5"/>
  <rect x="24" y="62" width="36" height="4" rx="2" fill="#e3e8f5"/>
  <text x="48" y="80" text-anchor="middle" font-size="10" font-family="Segoe UI, Arial, sans-serif" font-weight="600" fill="#5b6478">${title}</text>
</svg>`.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function getFinderLabel(route: FinderRoute) {
  switch (route) {
    case 'computer':
      return 'Equipo'
    case 'desktop':
      return 'Escritorio'
    case 'trash':
      return 'Papelera'
    case 'device':
      return 'Dispositivo'
    case 'applications':
      return 'Aplicaciones'
    case 'dock':
      return 'Dock'
    case 'display':
      return 'Pantalla'
    case 'recents':
      return 'Recientes'
    default:
      return getDesktopFolderIdFromRoute(route) ? 'Carpeta' : formatVolumeLabel(getVolumeMountFromRoute(route) ?? '')
  }
}

export function getFinderRouteIcon(route: FinderRoute) {
  switch (route) {
    case 'desktop':
      return '▣'
    case 'trash':
      return '🗑'
    case 'computer':
      return '⌘'
    case 'device':
      return '◈'
    case 'applications':
      return '✦'
    case 'dock':
      return '◫'
    case 'display':
      return '☼'
    case 'recents':
      return '◷'
    default:
      return isDesktopFolderRoute(route) ? '▤' : '◉'
  }
}

export function loadAppearanceMode() {
  if (typeof window === 'undefined') {
    return 'classic'
  }

  const raw = window.localStorage.getItem(APPEARANCE_MODE_STORAGE_KEY)
  return raw === 'dark' ? 'dark' : 'classic'
}

export function loadPerformanceMode(): PerformanceMode {
  if (typeof window === 'undefined') {
    return 'auto'
  }

  const raw = window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY)
  return raw === 'high' || raw === 'balanced' || raw === 'compatibility' ? raw : 'auto'
}

export function parseNumericValue(value: string | number | null | undefined) {
  const numeric = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(numeric) ? numeric : 0
}

export function detectInitialLowEndDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const cpuCount = Number(navigator.hardwareConcurrency || 0)
  const memoryGb = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0)
  return (cpuCount > 0 && cpuCount <= 4) || (memoryGb > 0 && memoryGb <= 8)
}

export function getInitialProgressiveCount(total: number, batchSize: number) {
  return Math.min(total, batchSize)
}

export function resolvePerformanceProfile(
  performanceMode: PerformanceMode,
  deviceInfo: DeviceInfo | null,
  prefersReducedMotion: boolean,
): ResolvedPerformanceProfile {
  if (performanceMode !== 'auto') {
    return performanceMode
  }

  if (!deviceInfo) {
    return prefersReducedMotion ? 'balanced' : 'high'
  }

  const totalMemoryGb = parseNumericValue(deviceInfo.totalMemoryGb)
  const cpuCount = Number(deviceInfo.cpuCount || 0)
  const videoMemoryMb = Number(deviceInfo.videoMemoryMb || 0)
  const gpuModel = (deviceInfo.gpuModel || '').toLowerCase()
  const cpuModel = (deviceInfo.cpuModel || '').toLowerCase()
  const weakIntegratedGpu =
    /intel\(r\)\s+hd/.test(gpuModel) ||
    /intel hd graphics/.test(gpuModel) ||
    /uhd graphics 6/.test(gpuModel) ||
    /520|530|550|600|605|610|615|620/.test(gpuModel)
  const olderLowPowerCpu = /i[357]-[46]\d{3}u|pentium|celeron/.test(cpuModel)

  if (
    prefersReducedMotion ||
    totalMemoryGb <= 8 ||
    cpuCount <= 4 ||
    olderLowPowerCpu ||
    (videoMemoryMb > 0 && videoMemoryMb <= 256) ||
    weakIntegratedGpu
  ) {
    return 'compatibility'
  }

  if (totalMemoryGb <= 12 || cpuCount <= 6 || (videoMemoryMb > 0 && videoMemoryMb <= 1024) || gpuModel.includes('intel')) {
    return 'balanced'
  }

  return 'high'
}

export function isValidWallpaperSelection(value: unknown): value is WallpaperSelection {
  if (!value || typeof value !== 'object' || !('kind' in value) || !('value' in value)) {
    return false
  }

  const selection = value as WallpaperSelection
  if (selection.kind === 'preset') {
    return WALLPAPER_PRESETS.some((preset) => preset.id === selection.value)
  }

  if (selection.kind === 'asset') {
    return selection.value === DEFAULT_LOGIN_WALLPAPER.value
  }

  return typeof selection.value === 'string' && selection.value.length > 0
}

export function loadWallpaperSelection(storageKey: string, fallback: WallpaperSelection) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw)
    return isValidWallpaperSelection(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function loadNotes() {
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

export function loadDesktopVolumePositions() {
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

export function createFinderTab(route: FinderRoute, index: number): FinderTab {
  return { id: `finder-tab-${Date.now()}-${index}`, history: [route], historyIndex: 0 }
}

export function createCalculatorState(): CalculatorState {
  return {
    display: '0',
    storedValue: null,
    operator: null,
    waitingForOperand: false,
  }
}

export function createTerminalState(cwd: string): TerminalState {
  return {
    cwd,
    input: '',
    busy: false,
    history: [],
  }
}

export function createFinderState(route: FinderRoute): FinderState {
  const tab = createFinderTab(route, 1)
  return { tabs: [tab], activeTabId: tab.id, viewMode: 'icons', sortMode: 'name' }
}

export function normalizeBrowserUrl(value: string) {
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

export function createBrowserState(initialUrl = DEFAULT_BROWSER_URL): BrowserState {
  const normalized = normalizeBrowserUrl(initialUrl)
  const initialTab = {
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

export function getInitialBrowserUrl(isElectronDesktop: boolean) {
  return isElectronDesktop ? DEFAULT_BROWSER_URL : DEFAULT_WEB_FALLBACK_URL
}

export function isSafariHomeUrl(url: string) {
  return url === SAFARI_HOME_URL
}

export function isBlockedEmbeddedPage(lastError: string | null) {
  return lastError?.includes('ERR_BLOCKED_BY_RESPONSE') ?? false
}

export function getActiveFinderTab(finderState: FinderState | null) {
  if (!finderState) {
    return null
  }
  return finderState.tabs.find((tab) => tab.id === finderState.activeTabId) ?? finderState.tabs[0] ?? null
}

export function getActiveFinderRoute(finderState: FinderState | null) {
  const tab = getActiveFinderTab(finderState)
  return tab ? tab.history[tab.historyIndex] : ('computer' as FinderRoute)
}

export function loadDockItems() {
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

export function loadCustomDockItems() {
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

export function loadDockHoverAnimationEnabled() {
  if (typeof window === 'undefined') {
    return true
  }

  const raw = window.localStorage.getItem(DOCK_HOVER_ANIMATION_STORAGE_KEY)
  return raw === null ? true : raw === 'true'
}

export function normalizeIconSpec(value: DockIconSpec | string | null | undefined): DockIconSpec {
  if (typeof value === 'string') {
    return { kind: 'glyph', value: value || '?' }
  }

  if (value && (value.kind === 'glyph' || value.kind === 'image') && typeof value.value === 'string') {
    return { kind: value.kind, value: value.value || '?' }
  }

  return { kind: 'glyph', value: '?' }
}

export function loadAppVisualOverrides() {
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

export function renderDockIconContent(icon: DockIconSpec) {
  if (icon.kind === 'image') {
    return <img className="dock-icon-image" src={resolvePublicAssetPath(icon.value)} alt="" draggable={false} />
  }
  return <span className="dock-icon-glyph">{icon.value}</span>
}

export function getAppLauncherIcon(app: InstalledApp) {
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

export function renderInstalledAppIcon(app: InstalledApp, className = 'app-row-icon') {
  return <span className={className}>{getAppLauncherIcon(app)}</span>
}

export function clampControlValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

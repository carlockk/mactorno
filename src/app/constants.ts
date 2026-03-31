import type { AppId, DesktopApp, DockIconSpec, WallpaperPreset, WallpaperSelection } from './types'

export const MENU_BAR_HEIGHT = 30
export const DOCK_BOTTOM = 0
export const DOCK_HEIGHT = 82
export const WINDOW_RADIUS = 8
export const DESKTOP_SIDE_MARGIN = 24
export const DESKTOP_TOP_GAP = 16
export const DESKTOP_BOTTOM_GAP = 18
export const MIN_WINDOW_WIDTH = 320
export const MIN_WINDOW_HEIGHT = 220
export const DOCK_STORAGE_KEY = 'mactorno-dock-items'
export const CUSTOM_DOCK_STORAGE_KEY = 'mactorno-custom-dock-items'
export const APP_VISUAL_STORAGE_KEY = 'mactorno-app-visuals'
export const DOCK_HOVER_ANIMATION_STORAGE_KEY = 'mactorno-dock-hover-animation'
export const DESKTOP_VOLUME_POSITIONS_STORAGE_KEY = 'mactorno-desktop-volume-positions'
export const APPEARANCE_MODE_STORAGE_KEY = 'mactorno-appearance-mode'
export const PERFORMANCE_MODE_STORAGE_KEY = 'mactorno-performance-mode'
export const DESKTOP_WALLPAPER_STORAGE_KEY = 'mactorno-desktop-wallpaper'
export const LOGIN_WALLPAPER_STORAGE_KEY = 'mactorno-login-wallpaper'
export const NOTES_STORAGE_KEY = 'mactorno-notes'
export const DESKTOP_ITEMS_STORAGE_KEY = 'mactorno-desktop-items'
export const DESKTOP_TRASH_POSITION_STORAGE_KEY = 'mactorno-desktop-trash-position'
export const SYSTEM_CONTROLS_DEBOUNCE_MS = 120
export const BROWSER_PROGRESS_SHOW_DELAY_MS = 120
export const BROWSER_PROGRESS_MIN_VISIBLE_MS = 200
export const BROWSER_PROGRESS_HIDE_DELAY_MS = 220
export const PROGRESSIVE_APPS_INITIAL_BATCH = 36
export const PROGRESSIVE_APPS_BATCH = 36
export const PROGRESSIVE_ENTRIES_INITIAL_BATCH = 40
export const PROGRESSIVE_ENTRIES_BATCH = 40
export const DEFAULT_DOCK_ITEMS: AppId[] = ['finder', 'launcher', 'notes', 'safari', 'photos', 'videos', 'calculator', 'docksettings', 'terminal']
export const SAFARI_HOME_URL = 'mactorno://home'
export const DEFAULT_BROWSER_URL = SAFARI_HOME_URL
export const DEFAULT_WEB_FALLBACK_URL = SAFARI_HOME_URL
export const PUBLIC_ASSET_BASE = import.meta.env.BASE_URL
export const ICON_PRESETS: DockIconSpec[] = [
  { kind: 'glyph', value: '📁' },
  { kind: 'glyph', value: '🌐' },
  { kind: 'glyph', value: '📝' },
  { kind: 'glyph', value: '⌘' },
  { kind: 'glyph', value: '⚙' },
  { kind: 'glyph', value: '💻' },
  { kind: 'glyph', value: '🧭' },
  { kind: 'glyph', value: '🔧' },
]

export const ICON_ASSET_PRESETS: Array<{ label: string; icon: DockIconSpec }> = [
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

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
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
export const DEFAULT_DESKTOP_WALLPAPER: WallpaperSelection = { kind: 'preset', value: WALLPAPER_PRESETS[0].id }
export const DEFAULT_LOGIN_WALLPAPER: WallpaperSelection = { kind: 'asset', value: 'login-default', name: 'Inicio clásico' }

export const APPS: DesktopApp[] = [
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

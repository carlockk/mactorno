import { useEffect, useMemo, useState } from 'react'
import { APP_VISUAL_STORAGE_KEY, APPS, CUSTOM_DOCK_STORAGE_KEY, DEFAULT_DOCK_ITEMS, DOCK_HOVER_ANIMATION_STORAGE_KEY, DOCK_STORAGE_KEY } from '../constants'
import { createVolumeRoute, getApp, getDesktopVolumeIconSrc, normalizeIconSpec } from '../helpers'
import type { AppId, AppVisualOverrides, CustomDockItem, DeviceInfo, DockIconSpec, VolumeInfo, WindowState } from '../types'

function createMapsDockItem(): CustomDockItem {
  return {
    id: 'custom-maps',
    name: 'Mapas',
    target: 'https://www.google.com/maps',
    kind: 'url',
    icon: { kind: 'image', value: '/map.png' },
    accent: 'linear-gradient(135deg, #58a6ff 0%, #2d6df6 100%)',
  }
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
  const defaultMapsItem = createMapsDockItem()
  if (typeof window === 'undefined') {
    return [defaultMapsItem] as CustomDockItem[]
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_DOCK_STORAGE_KEY)
    if (!raw) {
      return [defaultMapsItem]
    }
    const parsed = JSON.parse(raw) as Array<CustomDockItem & { icon: DockIconSpec | string }>
    const normalized = parsed.map((item) => ({
      ...item,
      icon: normalizeIconSpec(item.icon),
    }))
    const hasMaps = normalized.some((item) => item.target === defaultMapsItem.target && item.kind === defaultMapsItem.kind)
    return hasMaps ? normalized : [...normalized, defaultMapsItem]
  } catch {
    return [defaultMapsItem]
  }
}

function loadDockHoverAnimationEnabled() {
  if (typeof window === 'undefined') {
    return true
  }

  const raw = window.localStorage.getItem(DOCK_HOVER_ANIMATION_STORAGE_KEY)
  return raw === null ? true : raw === 'true'
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

export function useDock({ windows, deviceInfo }: { windows: WindowState[]; deviceInfo: DeviceInfo | null }) {
  const [dockItems, setDockItems] = useState<AppId[]>(() => loadDockItems())
  const [customDockItems, setCustomDockItems] = useState<CustomDockItem[]>(() => loadCustomDockItems())
  const [dockHoverAnimationEnabled, setDockHoverAnimationEnabled] = useState(() => loadDockHoverAnimationEnabled())
  const [appVisualOverrides, setAppVisualOverrides] = useState<AppVisualOverrides>(() => loadAppVisualOverrides())

  useEffect(() => {
    window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dockItems))
  }, [dockItems])

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_DOCK_STORAGE_KEY, JSON.stringify(customDockItems))
  }, [customDockItems])

  useEffect(() => {
    const mapsItem = createMapsDockItem()
    setCustomDockItems((current) => {
      const hasMaps = current.some((item) => item.target === mapsItem.target && item.kind === mapsItem.kind)
      return hasMaps ? current : [...current, mapsItem]
    })
  }, [])

  useEffect(() => {
    window.localStorage.setItem(DOCK_HOVER_ANIMATION_STORAGE_KEY, String(dockHoverAnimationEnabled))
  }, [dockHoverAnimationEnabled])

  useEffect(() => {
    window.localStorage.setItem(APP_VISUAL_STORAGE_KEY, JSON.stringify(appVisualOverrides))
  }, [appVisualOverrides])

  const openAppIds = useMemo(() => new Set(windows.map((item) => item.appId)), [windows])

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
      .map((item) => {
        const route = item.finderState?.tabs.find((tab) => tab.id === item.finderState?.activeTabId)?.history[
          item.finderState?.tabs.find((tab) => tab.id === item.finderState?.activeTabId)?.historyIndex ?? 0
        ] ?? 'computer'
        if (!route.startsWith('volume:')) {
          return null
        }
        const raw = route.slice('volume:'.length)
        const separatorIndex = raw.indexOf('::')
        return decodeURIComponent(separatorIndex === -1 ? raw : raw.slice(0, separatorIndex))
      })
      .filter((mount): mount is string => !!mount)

    return [...new Set(openMounts)]
      .map((mount) => deviceInfo?.volumes.find((volume) => volume.mount === mount))
      .filter((volume): volume is VolumeInfo => !!volume)
      .filter((volume) => !pinnedTargets.has(createVolumeRoute(volume.mount)))
      .map((volume) => createVolumeDockItem(volume))
  }, [customDockItems, deviceInfo?.volumes, windows])

  const resolvedApps = useMemo(() => {
    return Object.fromEntries(
      APPS.map((baseApp) => {
        const override = appVisualOverrides[baseApp.id]
        return [
          baseApp.id,
          {
            ...baseApp,
            accent: override?.accent ?? baseApp.accent,
            iconSpec: normalizeIconSpec(override?.icon ?? baseApp.icon),
          },
        ]
      }),
    ) as Record<AppId, (typeof APPS)[number] & { iconSpec: DockIconSpec }>
  }, [appVisualOverrides])

  return {
    appVisualOverrides,
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
  }
}

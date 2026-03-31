import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APPEARANCE_MODE_STORAGE_KEY, DEFAULT_DESKTOP_WALLPAPER, DEFAULT_LOGIN_WALLPAPER, DESKTOP_WALLPAPER_STORAGE_KEY, LOGIN_WALLPAPER_STORAGE_KEY, PERFORMANCE_MODE_STORAGE_KEY, PROGRESSIVE_APPS_BATCH, PROGRESSIVE_APPS_INITIAL_BATCH, PROGRESSIVE_ENTRIES_BATCH, PROGRESSIVE_ENTRIES_INITIAL_BATCH } from '../constants'
import type { AppearanceMode, DeviceInfo, InstalledApp, PerformanceMode, ResolvedPerformanceProfile, SystemControlsState, VolumeEntriesPage, VolumeEntry, WallpaperSelection } from '../types'

function parseNumericValue(value: string | number | null | undefined) {
  const numeric = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(numeric) ? numeric : 0
}

function detectInitialLowEndDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const cpuCount = Number(navigator.hardwareConcurrency || 0)
  const memoryGb = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0)
  return (cpuCount > 0 && cpuCount <= 4) || (memoryGb > 0 && memoryGb <= 8)
}

function getInitialProgressiveCount(total: number, batchSize: number) {
  return Math.min(total, batchSize)
}

function resolvePerformanceProfile(
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

function isValidWallpaperSelection(value: unknown): value is WallpaperSelection {
  if (!value || typeof value !== 'object' || !('kind' in value) || !('value' in value)) {
    return false
  }

  const selection = value as WallpaperSelection
  if (selection.kind === 'preset') {
    return typeof selection.value === 'string' && selection.value.length > 0
  }

  if (selection.kind === 'asset') {
    return selection.value === DEFAULT_LOGIN_WALLPAPER.value
  }

  return typeof selection.value === 'string' && selection.value.length > 0
}

function loadWallpaperSelection(storageKey: string, fallback: WallpaperSelection) {
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

function loadAppearanceMode() {
  if (typeof window === 'undefined') {
    return 'classic' as AppearanceMode
  }

  const raw = window.localStorage.getItem(APPEARANCE_MODE_STORAGE_KEY)
  return raw === 'dark' ? 'dark' : 'classic'
}

function loadPerformanceMode() {
  if (typeof window === 'undefined') {
    return 'auto' as PerformanceMode
  }

  const raw = window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY)
  return raw === 'high' || raw === 'balanced' || raw === 'compatibility' ? raw : 'auto'
}

export function useSystemData({
  hasApplicationsFinderOpen,
  launcherOpen,
  loggedIn,
  prefersReducedMotion,
  progressiveEntryPaths,
}: {
  hasApplicationsFinderOpen: boolean
  launcherOpen: boolean
  loggedIn: boolean
  prefersReducedMotion: boolean
  progressiveEntryPaths: string[]
}) {
  const initialLowEndDevice = useMemo(() => detectInitialLowEndDevice(), [])
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [volumeEntriesByMount, setVolumeEntriesByMount] = useState<Record<string, VolumeEntry[]>>({})
  const [volumeEntryMetaByPath, setVolumeEntryMetaByPath] = useState<Record<string, { total: number; nextOffset: number | null; hasMore: boolean }>>({})
  const [visibleEntryCountsByPath, setVisibleEntryCountsByPath] = useState<Record<string, number>>({})
  const [loadingVolumeMounts, setLoadingVolumeMounts] = useState<Record<string, boolean>>({})
  const [loadingSystem, setLoadingSystem] = useState(false)
  const [systemError, setSystemError] = useState<string | null>(null)
  const [systemControls, setSystemControls] = useState<SystemControlsState>({
    brightness: 70,
    volume: 50,
    supportsBrightness: false,
    supportsVolume: false,
  })
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => loadAppearanceMode())
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() => loadPerformanceMode())
  const [desktopWallpaper, setDesktopWallpaper] = useState<WallpaperSelection>(() =>
    loadWallpaperSelection(DESKTOP_WALLPAPER_STORAGE_KEY, DEFAULT_DESKTOP_WALLPAPER),
  )
  const [loginWallpaper, setLoginWallpaper] = useState<WallpaperSelection>(() =>
    loadWallpaperSelection(LOGIN_WALLPAPER_STORAGE_KEY, DEFAULT_LOGIN_WALLPAPER),
  )
  const [visibleInstalledAppsCount, setVisibleInstalledAppsCount] = useState(0)

  const volumeEntriesByMountRef = useRef(volumeEntriesByMount)
  const volumeEntryMetaByPathRef = useRef(volumeEntryMetaByPath)
  const loadingVolumeMountsRef = useRef(loadingVolumeMounts)
  const installedAppsLoadedAtRef = useRef(0)
  const installedAppsRefreshPendingRef = useRef(false)
  const installedAppsLiteLoadedRef = useRef(false)
  const installedAppsFullLoadedRef = useRef(false)
  const fullDeviceInfoLoadedRef = useRef(false)

  const resolvedPerformanceProfile = useMemo(
    () => resolvePerformanceProfile(performanceMode, deviceInfo, prefersReducedMotion),
    [deviceInfo, performanceMode, prefersReducedMotion],
  )

  useEffect(() => {
    let cancelled = false
    async function loadIdentity() {
      try {
        const device = window.electronDesktop
          ? await (initialLowEndDevice
              ? window.electronDesktop.getBootDeviceInfo()
              : window.electronDesktop.getDeviceInfo()) as DeviceInfo
          : await fetch('/api/device-info').then((response) => {
              if (!response.ok) throw new Error('No fue posible leer los datos del dispositivo')
              return response.json() as Promise<DeviceInfo>
            })

        if (!cancelled) {
          if (!initialLowEndDevice) {
            fullDeviceInfoLoadedRef.current = true
          }
          setDeviceInfo((current) => current ?? device)
        }
      } catch {
        // Mantiene fallback local.
      }
    }

    void loadIdentity()
    return () => {
      cancelled = true
    }
  }, [initialLowEndDevice])

  useEffect(() => {
    window.localStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, appearanceMode)
  }, [appearanceMode])

  useEffect(() => {
    window.localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, performanceMode)
  }, [performanceMode])

  useEffect(() => {
    window.electronDesktop?.browser.setAppearance(appearanceMode)
  }, [appearanceMode])

  useEffect(() => {
    window.localStorage.setItem(DESKTOP_WALLPAPER_STORAGE_KEY, JSON.stringify(desktopWallpaper))
  }, [desktopWallpaper])

  useEffect(() => {
    window.localStorage.setItem(LOGIN_WALLPAPER_STORAGE_KEY, JSON.stringify(loginWallpaper))
  }, [loginWallpaper])

  useEffect(() => {
    if (!installedApps.length) {
      setVisibleInstalledAppsCount(0)
      return
    }

    if (!initialLowEndDevice || (!launcherOpen && !hasApplicationsFinderOpen)) {
      setVisibleInstalledAppsCount(installedApps.length)
      return
    }

    setVisibleInstalledAppsCount(getInitialProgressiveCount(installedApps.length, PROGRESSIVE_APPS_INITIAL_BATCH))

    const timer = window.setInterval(() => {
      setVisibleInstalledAppsCount((current) => {
        if (current >= installedApps.length) {
          window.clearInterval(timer)
          return current
        }

        const next = Math.min(installedApps.length, current + PROGRESSIVE_APPS_BATCH)
        if (next >= installedApps.length) {
          window.clearInterval(timer)
        }
        return next
      })
    }, 120)

    return () => window.clearInterval(timer)
  }, [hasApplicationsFinderOpen, initialLowEndDevice, installedApps, launcherOpen])

  useEffect(() => {
    if (!initialLowEndDevice || progressiveEntryPaths.length === 0) {
      return
    }

    setVisibleEntryCountsByPath((current) => {
      let changed = false
      const next = { ...current }

      for (const targetPath of progressiveEntryPaths) {
        const total = volumeEntriesByMount[targetPath]?.length ?? 0
        if (total <= 0) {
          continue
        }

        const initialCount = getInitialProgressiveCount(total, PROGRESSIVE_ENTRIES_INITIAL_BATCH)
        if (!next[targetPath] || next[targetPath] > total) {
          next[targetPath] = initialCount
          changed = true
        }
      }

      return changed ? next : current
    })

    const timer = window.setInterval(() => {
      setVisibleEntryCountsByPath((current) => {
        let changed = false
        const next = { ...current }

        for (const targetPath of progressiveEntryPaths) {
          const total = volumeEntriesByMount[targetPath]?.length ?? 0
          if (total <= 0) {
            continue
          }

          const currentCount = next[targetPath] ?? getInitialProgressiveCount(total, PROGRESSIVE_ENTRIES_INITIAL_BATCH)
          if (currentCount >= total) {
            continue
          }

          next[targetPath] = Math.min(total, currentCount + PROGRESSIVE_ENTRIES_BATCH)
          changed = true
        }

        return changed ? next : current
      })
    }, 120)

    return () => window.clearInterval(timer)
  }, [initialLowEndDevice, progressiveEntryPaths, volumeEntriesByMount])

  const refreshInstalledApps = useCallback(async (force = false, mode: 'auto' | 'lite' | 'full' = 'auto') => {
    if (!loggedIn || !window.electronDesktop) {
      return
    }

    const now = Date.now()
    const requestLite = mode === 'lite' || (mode === 'auto' && initialLowEndDevice && !installedAppsLiteLoadedRef.current)
    const requestFull = !requestLite

    if (
      !force &&
      (installedAppsRefreshPendingRef.current || now - installedAppsLoadedAtRef.current < 30_000) &&
      (!requestLite || installedAppsLiteLoadedRef.current) &&
      (!requestFull || installedAppsFullLoadedRef.current)
    ) {
      return
    }

    installedAppsRefreshPendingRef.current = true
    const shouldShowLoading = installedApps.length === 0
    if (shouldShowLoading) {
      setLoadingSystem(true)
    }
    try {
      const apps = await (window.electronDesktop.getInstalledApps({ lite: requestLite }) as Promise<InstalledApp[]>)
      setInstalledApps(apps)
      installedAppsLoadedAtRef.current = Date.now()
      if (requestLite) {
        installedAppsLiteLoadedRef.current = true
      } else {
        installedAppsFullLoadedRef.current = true
      }
    } catch {
      // Conserva la lista actual.
    } finally {
      installedAppsRefreshPendingRef.current = false
      if (shouldShowLoading) {
        setLoadingSystem(false)
      }
    }
  }, [initialLowEndDevice, installedApps.length, loggedIn])

  useEffect(() => {
    if (!loggedIn) {
      return
    }

    if (fullDeviceInfoLoadedRef.current) {
      return
    }

    let cancelled = false
    let timer: number | null = null
    async function loadSystemData() {
      if (!deviceInfo) {
        setLoadingSystem(true)
      }
      setSystemError(null)
      try {
        const device = window.electronDesktop
          ? await (window.electronDesktop.getDeviceInfo() as Promise<DeviceInfo>)
          : await fetch('/api/device-info').then((response) => {
              if (!response.ok) throw new Error('No fue posible leer los datos del dispositivo')
              return response.json() as Promise<DeviceInfo>
            })

        if (!cancelled) {
          fullDeviceInfoLoadedRef.current = true
          setDeviceInfo(device)
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

    if (initialLowEndDevice && window.electronDesktop) {
      timer = window.setTimeout(() => {
        void loadSystemData()
      }, 900)
    } else {
      void loadSystemData()
    }

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [deviceInfo, initialLowEndDevice, loggedIn])

  useEffect(() => {
    if (!loggedIn || !window.electronDesktop) {
      return
    }

    function handleWindowFocus() {
      void refreshInstalledApps()
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [loggedIn, refreshInstalledApps])

  useEffect(() => {
    if (!launcherOpen && !hasApplicationsFinderOpen) {
      return
    }

    void refreshInstalledApps()
  }, [hasApplicationsFinderOpen, launcherOpen, refreshInstalledApps])

  useEffect(() => {
    if (!initialLowEndDevice || !loggedIn || !window.electronDesktop) {
      return
    }

    if ((!launcherOpen && !hasApplicationsFinderOpen) || !installedAppsLiteLoadedRef.current || installedAppsFullLoadedRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      void refreshInstalledApps(false, 'full')
    }, 1400)

    return () => window.clearTimeout(timer)
  }, [hasApplicationsFinderOpen, initialLowEndDevice, launcherOpen, loggedIn, refreshInstalledApps])

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
    volumeEntriesByMountRef.current = volumeEntriesByMount
    volumeEntryMetaByPathRef.current = volumeEntryMetaByPath
    loadingVolumeMountsRef.current = loadingVolumeMounts
  }, [loadingVolumeMounts, volumeEntriesByMount, volumeEntryMetaByPath])

  const loadVolumeEntriesPage = useCallback(async (
    targetPath: string,
    options?: { reset?: boolean; forceFullIcons?: boolean },
  ) => {
    if (!window.electronDesktop || !targetPath) {
      return
    }

    const reset = options?.reset === true
    const currentMeta = volumeEntryMetaByPathRef.current[targetPath]
    const offset = reset ? 0 : currentMeta?.nextOffset ?? volumeEntriesByMountRef.current[targetPath]?.length ?? 0
    const limit = initialLowEndDevice ? PROGRESSIVE_ENTRIES_BATCH : 200

    if (!reset && currentMeta && !currentMeta.hasMore) {
      return
    }

    if (loadingVolumeMountsRef.current[targetPath]) {
      return
    }

    loadingVolumeMountsRef.current = { ...loadingVolumeMountsRef.current, [targetPath]: true }
    setLoadingVolumeMounts((current) => ({ ...current, [targetPath]: true }))

    try {
      const response = await (window.electronDesktop.listVolumeEntries({
        target: targetPath,
        offset,
        limit,
        lite: initialLowEndDevice && !options?.forceFullIcons,
      }) as Promise<VolumeEntriesPage>)

      const nextEntries = reset
        ? response.entries
        : [...(volumeEntriesByMountRef.current[targetPath] ?? []), ...response.entries]

      volumeEntriesByMountRef.current = { ...volumeEntriesByMountRef.current, [targetPath]: nextEntries }
      volumeEntryMetaByPathRef.current = {
        ...volumeEntryMetaByPathRef.current,
        [targetPath]: {
          total: response.total,
          nextOffset: response.nextOffset,
          hasMore: response.hasMore,
        },
      }
      setVolumeEntriesByMount((current) => ({ ...current, [targetPath]: nextEntries }))
      setVolumeEntryMetaByPath((current) => ({
        ...current,
        [targetPath]: {
          total: response.total,
          nextOffset: response.nextOffset,
          hasMore: response.hasMore,
        },
      }))
    } catch {
      if (reset) {
        volumeEntriesByMountRef.current = { ...volumeEntriesByMountRef.current, [targetPath]: [] }
        volumeEntryMetaByPathRef.current = {
          ...volumeEntryMetaByPathRef.current,
          [targetPath]: { total: 0, nextOffset: null, hasMore: false },
        }
        setVolumeEntriesByMount((current) => ({ ...current, [targetPath]: [] }))
        setVolumeEntryMetaByPath((current) => ({
          ...current,
          [targetPath]: { total: 0, nextOffset: null, hasMore: false },
        }))
      }
    } finally {
      loadingVolumeMountsRef.current = { ...loadingVolumeMountsRef.current, [targetPath]: false }
      setLoadingVolumeMounts((current) => ({ ...current, [targetPath]: false }))
    }
  }, [initialLowEndDevice])

  return {
    appearanceMode,
    desktopWallpaper,
    deviceInfo,
    initialLowEndDevice,
    installedApps,
    loadingSystem,
    loadingVolumeMounts,
    loadVolumeEntriesPage,
    loginWallpaper,
    refreshInstalledApps,
    resolvedPerformanceProfile,
    setAppearanceMode,
    setDesktopWallpaper,
    setDeviceInfo,
    setLoginWallpaper,
    setLoadingVolumeMounts,
    setPerformanceMode,
    setSystemControls,
    setSystemError,
    setVisibleEntryCountsByPath,
    setVisibleInstalledAppsCount,
    setVolumeEntriesByMount,
    systemControls,
    performanceMode,
    systemError,
    visibleEntryCountsByPath,
    visibleInstalledAppsCount,
    volumeEntriesByMount,
    volumeEntryMetaByPath,
  }
}

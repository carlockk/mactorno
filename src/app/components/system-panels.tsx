import { AnimatePresence, motion } from 'motion/react'
import { DEFAULT_LOGIN_WALLPAPER, WALLPAPER_PRESETS } from '../constants'
import { getAppLauncherIcon, getWallpaperPreviewSource, isWallpaperSelectionActive, readWallpaperFile, renderInstalledAppIcon } from '../helpers'
import type { AppearanceMode, DeviceInfo, InstalledApp, PerformanceMode, ResolvedPerformanceProfile, WallpaperSelection } from '../types'

export function AboutPanel({
  deviceInfo,
  loadingSystem,
  resolvedPerformanceProfile,
  systemError,
}: {
  deviceInfo: DeviceInfo | null
  loadingSystem: boolean
  resolvedPerformanceProfile: ResolvedPerformanceProfile
  systemError: string | null
}) {
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
            <article><strong>GPU</strong><span>{deviceInfo.gpuModel ?? 'No detectada'}</span></article>
            <article><strong>RAM</strong><span>{deviceInfo.totalMemoryGb} GB</span></article>
            <article><strong>Perfil</strong><span>{resolvedPerformanceProfile}</span></article>
            <article><strong>Arquitectura</strong><span>{deviceInfo.arch}</span></article>
            <article><strong>Uptime</strong><span>{deviceInfo.uptimeHours} horas</span></article>
          </div>
        </>
      ) : null}
    </div>
  )
}

export function LauncherPanel({
  deviceInfo,
  installedApps,
  visibleInstalledAppsCount,
  onLaunch,
  onPin,
  onShowAll,
  renderProgressiveStatus,
}: {
  deviceInfo: DeviceInfo | null
  installedApps: InstalledApp[]
  visibleInstalledAppsCount: number
  onLaunch: (app: InstalledApp) => void
  onPin: (app: InstalledApp) => void
  onShowAll: () => void
  renderProgressiveStatus: (visibleCount: number, totalCount: number, onShowMore: () => void) => React.ReactNode
}) {
  const visibleApps = installedApps.slice(0, visibleInstalledAppsCount || installedApps.length)

  return (
    <div className="launcher-panel">
      <h2>Aplicaciones del sistema</h2>
      <p>{deviceInfo ? `Mostrando apps para ${deviceInfo.osName}` : 'Detectando sistema...'}</p>
      <div className="apps-list launcher-grid">
        {visibleApps.map((app) => (
          <button
            key={app.id}
            type="button"
            className="app-row launch-card"
            onClick={() => onLaunch(app)}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/json', JSON.stringify(app))
              event.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <span className="app-row-main">
              {renderInstalledAppIcon(app)}
              <span className="app-row-copy">
                <strong>{app.name}</strong>
                <span>{app.source}</span>
              </span>
            </span>
            <span className="pin-hint" onClick={(event) => {
              event.stopPropagation()
              onPin(app)
            }}>Fijar al dock</span>
          </button>
        ))}
      </div>
      {renderProgressiveStatus(visibleApps.length, installedApps.length, onShowAll)}
    </div>
  )
}

export function LauncherPopup({
  filteredApps,
  launcherOpen,
  launcherPage,
  launcherSearch,
  loadingSystem,
  panelRef,
  setLauncherPage,
  setLauncherSearch,
  systemError,
  onLaunch,
}: {
  filteredApps: InstalledApp[]
  launcherOpen: boolean
  launcherPage: number
  launcherSearch: string
  loadingSystem: boolean
  panelRef: React.RefObject<HTMLDivElement | null>
  setLauncherPage: React.Dispatch<React.SetStateAction<number>>
  setLauncherSearch: React.Dispatch<React.SetStateAction<string>>
  systemError: string | null
  onLaunch: (app: InstalledApp) => void
}) {
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
        <div ref={panelRef}>
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
                        onClick={() => onLaunch(app)}
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

export function DisplayPanel({
  appearanceMode,
  desktopWallpaper,
  loginWallpaper,
  performanceMode,
  resolvedPerformanceProfile,
  setAppearanceMode,
  setDesktopWallpaper,
  setLoginWallpaper,
  setPerformanceMode,
  systemWallpapers,
}: {
  appearanceMode: AppearanceMode
  desktopWallpaper: WallpaperSelection
  loginWallpaper: WallpaperSelection
  performanceMode: PerformanceMode
  resolvedPerformanceProfile: ResolvedPerformanceProfile
  setAppearanceMode: (value: AppearanceMode) => void
  setDesktopWallpaper: (value: WallpaperSelection) => void
  setLoginWallpaper: (value: WallpaperSelection) => void
  setPerformanceMode: (value: PerformanceMode) => void
  systemWallpapers: Array<{ id: string; name: string; path: string }>
}) {
  const systemWallpaperChoices = systemWallpapers.map(
    (wallpaper) =>
      ({
        kind: 'system',
        value: wallpaper.path,
        name: wallpaper.name,
      }) satisfies WallpaperSelection,
  )

  function renderWallpaperSection(
    title: string,
    description: string,
    selection: WallpaperSelection,
    onChange: (next: WallpaperSelection) => void,
    uploadLabel: string,
  ) {
    const uploadId = `wallpaper-upload-${title.toLowerCase().replace(/\s+/g, '-')}`

    return (
      <section className="display-card">
        <div className="display-card-head">
          <div>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>
          <label className="file-pill wallpaper-upload-pill" htmlFor={uploadId}>
            {uploadLabel}
            <input
              id={uploadId}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) {
                  return
                }
                readWallpaperFile(file, onChange)
                event.currentTarget.value = ''
              }}
            />
          </label>
        </div>

        <div className="wallpaper-grid">
          {(title === 'Fondo de inicio' ? [DEFAULT_LOGIN_WALLPAPER] : []).map((choice) => {
            const preview = getWallpaperPreviewSource(choice)
            return (
              <button
                key={`${choice.kind}-${choice.value}`}
                type="button"
                className={`wallpaper-preset${isWallpaperSelectionActive(selection, choice) ? ' active' : ''}`}
                onClick={() => onChange(choice)}
              >
                <span
                  className="wallpaper-swatch"
                  style={
                    preview.type === 'gradient'
                      ? { background: preview.value }
                      : { backgroundImage: `url("${preview.value}")` }
                  }
                />
                <strong>{preview.label}</strong>
              </button>
            )
          })}
          {WALLPAPER_PRESETS.map((preset) => {
            const choice: WallpaperSelection = { kind: 'preset', value: preset.id }
            return (
              <button
                key={preset.id}
                type="button"
                className={`wallpaper-preset${isWallpaperSelectionActive(selection, choice) ? ' active' : ''}`}
                onClick={() => onChange(choice)}
              >
                <span className="wallpaper-swatch" style={{ background: preset.background }} />
                <strong>{preset.name}</strong>
              </button>
            )
          })}
          {selection.kind === 'upload' ? (
            <button type="button" className="wallpaper-preset active" onClick={() => onChange(selection)}>
              <span className="wallpaper-swatch" style={{ backgroundImage: `url("${selection.value}")` }} />
              <strong>{selection.name}</strong>
            </button>
          ) : null}
          {systemWallpaperChoices.map((choice) => {
            const preview = getWallpaperPreviewSource(choice)
            return (
              <button
                key={`${choice.kind}-${choice.value}`}
                type="button"
                className={`wallpaper-preset${isWallpaperSelectionActive(selection, choice) ? ' active' : ''}`}
                onClick={() => onChange(choice)}
              >
                <span className="wallpaper-swatch" style={{ backgroundImage: `url("${preview.value}")` }} />
                <strong>{choice.name}</strong>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

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
          <strong>Rendimiento visual</strong>
          <p>
            Ajusta los efectos del escritorio segun la maquina. No cambia funciones, solo la carga visual.
            {performanceMode === 'auto' ? ` Perfil detectado: ${resolvedPerformanceProfile}.` : null}
          </p>
        </div>
        <div className="appearance-toggle performance-toggle">
          <button type="button" className={performanceMode === 'auto' ? 'active' : ''} onClick={() => setPerformanceMode('auto')}>Auto</button>
          <button type="button" className={performanceMode === 'high' ? 'active' : ''} onClick={() => setPerformanceMode('high')}>Alta calidad</button>
          <button type="button" className={performanceMode === 'balanced' ? 'active' : ''} onClick={() => setPerformanceMode('balanced')}>Equilibrado</button>
          <button type="button" className={performanceMode === 'compatibility' ? 'active' : ''} onClick={() => setPerformanceMode('compatibility')}>Compatibilidad</button>
        </div>
      </section>

      {renderWallpaperSection(
        'Fondo de escritorio',
        'Elige presets, sube una foto o usa un wallpaper detectado del sistema real.',
        desktopWallpaper,
        setDesktopWallpaper,
        'Subir al escritorio',
      )}

      {renderWallpaperSection(
        'Fondo de inicio',
        'Configura por separado la pantalla de ingreso de Mactorno.',
        loginWallpaper,
        setLoginWallpaper,
        'Subir al inicio',
      )}
    </div>
  )
}

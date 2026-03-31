import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { getDocumentPreviewIcon, getMediaSource, isImageEntry, isVideoEntry, resolvePublicAssetPath } from '../helpers'
import type { DesktopItem, FinderRoute, FinderViewMode, InstalledApp, VolumeEntry, VolumeInfo } from '../types'
import { VideoThumbnail } from './video-thumbnail'

function VirtualizedButtonList<T>({
  items,
  rowHeight = 44,
  maxHeight = 420,
  renderItem,
}: {
  items: T[]
  rowHeight?: number
  maxHeight?: number
  renderItem: (item: T) => ReactNode
}) {
  const [scrollTop, setScrollTop] = useState(0)
  if (items.length <= 80) {
    return <div className="finder-file-list">{items.map((item) => renderItem(item))}</div>
  }

  const totalHeight = items.length * rowHeight
  const viewportHeight = Math.min(maxHeight, totalHeight)
  const overscan = 8
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const endIndex = Math.min(items.length, startIndex + visibleCount)
  const offsetTop = startIndex * rowHeight

  return (
    <div
      className="finder-file-list"
      style={{ maxHeight: `${maxHeight}px`, overflowY: 'auto', position: 'relative' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {items.slice(startIndex, endIndex).map((item) => renderItem(item))}
        </div>
      </div>
    </div>
  )
}

export function FinderCard({
  route,
  label,
  subtitle,
  onClick,
  onContextMenu,
}: {
  route: FinderRoute
  label: string
  subtitle: string
  onClick: () => void
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      key={route}
      type="button"
      className="finder-card"
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <strong>{label}</strong>
      <span>{subtitle}</span>
    </button>
  )
}

export function FinderListHeader({ secondaryLabel }: { secondaryLabel: string }) {
  return (
    <div className="finder-list-head" aria-hidden="true">
      <span>Nombre</span>
      <span>{secondaryLabel}</span>
    </div>
  )
}

export function FinderFileTile(options: {
  keyId: string
  name: string
  subtitle: string
  sourcePath?: string | null
  extension?: string
  iconSrc?: string | null
  onClick: () => void
  onFocus?: () => void
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
  draggable?: boolean
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
}) {
  const { keyId, name, subtitle, sourcePath, extension = '', iconSrc, onClick, onFocus, onContextMenu, draggable, onDragStart } = options
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false)
  const rootRef = useRef<HTMLButtonElement | null>(null)
  const isImage = !!sourcePath && isImageEntry({ name, path: sourcePath, kind: 'file', extension, sizeBytes: null } as VolumeEntry)
  const isVideo = !!sourcePath && isVideoEntry({ name, path: sourcePath, kind: 'file', extension, sizeBytes: null } as VolumeEntry)

  useEffect(() => {
    const node = rootRef.current
    if (!node || (!isImage && !isVideo)) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadPreview(true)
          observer.disconnect()
        }
      },
      { rootMargin: '160px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [isImage, isVideo, keyId])

  return (
    <button
      ref={rootRef}
      key={keyId}
      type="button"
      className="finder-file-tile"
      onClick={onClick}
      onMouseDown={onFocus}
      onFocus={onFocus}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {isImage && sourcePath && shouldLoadPreview ? (
        <img className="finder-file-thumb image" src={getMediaSource(sourcePath)} alt="" draggable={false} />
      ) : iconSrc ? (
        <img className="finder-file-thumb custom-icon" src={iconSrc} alt="" draggable={false} />
      ) : isVideo && sourcePath && shouldLoadPreview ? (
        <VideoThumbnail
          className="finder-file-thumb video"
          src={getMediaSource(sourcePath)}
          fallbackSrc={getDocumentPreviewIcon(name, extension)}
        />
      ) : extension ? (
        <img
          className="finder-file-thumb custom-icon"
          src={getDocumentPreviewIcon(name, extension)}
          alt=""
          draggable={false}
        />
      ) : (
        <span className="finder-file-thumb" aria-hidden="true">DOC</span>
      )}
      <strong>{name}</strong>
      <span>{subtitle}</span>
    </button>
  )
}

export function FinderSidebar({
  activeRoute,
  activeVolumeMount,
  volumes,
  onNavigate,
  renderRouteIcon,
}: {
  activeRoute: FinderRoute
  activeVolumeMount: string | null
  volumes: Array<VolumeInfo & { route: FinderRoute }>
  onNavigate: (route: FinderRoute) => void
  renderRouteIcon: (route: FinderRoute) => ReactNode
}) {
  return (
    <aside className="finder-sidebar">
      {[
        { route: 'desktop' as const, label: 'Escritorio' },
        { route: 'trash' as const, label: 'Papelera' },
        { route: 'computer' as const, label: 'Equipo' },
        { route: 'device' as const, label: 'Dispositivo' },
        { route: 'applications' as const, label: 'Aplicaciones' },
        { route: 'recents' as const, label: 'Recientes' },
        { route: 'dock' as const, label: 'Dock' },
        { route: 'display' as const, label: 'Pantalla' },
      ].map((item) => (
        <button
          key={item.route}
          type="button"
          className={activeRoute === item.route ? 'active' : ''}
          onClick={() => onNavigate(item.route)}
        >
          <span className="finder-sidebar-icon" aria-hidden="true">{renderRouteIcon(item.route)}</span>
          <span>{item.label}</span>
        </button>
      ))}
      {volumes.length ? (
        <div className="finder-sidebar-section">
          <span>Unidades</span>
          {volumes.map((volume) => (
            <button
              key={volume.mount}
              type="button"
              className={activeVolumeMount === volume.mount ? 'active' : ''}
              onClick={() => onNavigate(volume.route)}
            >
              <span className="finder-sidebar-icon" aria-hidden="true">{renderRouteIcon(volume.route)}</span>
              <span>{volume.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  )
}

export function FinderApplicationsPanel({
  osName,
  installedApps,
  visibleInstalledAppsCount,
  renderAppIcon,
  onLaunch,
  onAppContextMenu,
  onShowAll,
  renderProgressiveStatus,
}: {
  osName?: string
  installedApps: InstalledApp[]
  visibleInstalledAppsCount: number
  renderAppIcon: (app: InstalledApp) => ReactNode
  onLaunch: (app: InstalledApp) => void
  onAppContextMenu: (event: MouseEvent<HTMLButtonElement>, app: InstalledApp) => void
  onShowAll: () => void
  renderProgressiveStatus: (visibleCount: number, totalCount: number, onShowMore: () => void) => ReactNode
}) {
  const visibleApps = installedApps.slice(0, visibleInstalledAppsCount || installedApps.length)

  return (
    <div className="device-panel">
      <h2>Aplicaciones del dispositivo</h2>
      <p>{osName ? `Sistema detectado: ${osName}` : 'Leyendo sistema operativo...'}</p>
      <VirtualizedButtonList
        items={visibleApps}
        rowHeight={58}
        renderItem={(app) => (
          <button
            key={app.id}
            type="button"
            className="app-row"
            onClick={() => onLaunch(app)}
            onContextMenu={(event) => onAppContextMenu(event, app)}
          >
            <span className="app-row-main">
              {renderAppIcon(app)}
              <span className="app-row-copy">
                <strong>{app.name}</strong>
                <span>{app.source}</span>
              </span>
            </span>
          </button>
        )}
      />
      {renderProgressiveStatus(visibleInstalledAppsCount || installedApps.length, installedApps.length, onShowAll)}
    </div>
  )
}

export function FinderDesktopPanel({
  title,
  subtitle,
  activeImportedLoading,
  activeDesktopItemsLength,
  activeImportedEntriesLength,
  activeDesktopFolders,
  activeDesktopFiles,
  activeImportedFolders,
  activeImportedFiles,
  viewMode,
  renderFinderListHeader,
  renderFinderFileTile,
  onDesktopFolderOpen,
  onDesktopFileOpen,
  onDesktopItemDragStart,
  onDesktopFolderDragOver,
  onDesktopFolderDrop,
  onDesktopRootDragOver,
  onDesktopRootDrop,
  onImportedFolderImport,
  onImportedEntryOpen,
  onDesktopItemFocus,
  onImportedEntryFocus,
  onImportedEntryContextMenu,
  progressiveStatus,
}: {
  title: string
  subtitle: string
  activeImportedLoading: boolean
  activeDesktopItemsLength: number
  activeImportedEntriesLength: number
  activeDesktopFolders: DesktopItem[]
  activeDesktopFiles: DesktopItem[]
  activeImportedFolders: VolumeEntry[]
  activeImportedFiles: VolumeEntry[]
  viewMode: FinderViewMode
  renderFinderListHeader: (secondaryLabel: string) => ReactNode
  renderFinderFileTile: (options: {
    keyId: string
    name: string
    subtitle: string
    sourcePath?: string | null
    extension?: string
    iconSrc?: string | null
    onClick: () => void
    onFocus?: () => void
    onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
    draggable?: boolean
    onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  }) => ReactNode
  onDesktopFolderOpen: (item: DesktopItem) => void
  onDesktopFileOpen: (item: DesktopItem) => void
  onDesktopItemDragStart: (event: DragEvent<HTMLButtonElement>, item: DesktopItem) => void
  onDesktopFolderDragOver: (event: DragEvent<HTMLButtonElement | HTMLDivElement>, item: DesktopItem) => void
  onDesktopFolderDrop: (event: DragEvent<HTMLButtonElement | HTMLDivElement>, item: DesktopItem) => void
  onDesktopRootDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDesktopRootDrop: (event: DragEvent<HTMLDivElement>) => void
  onImportedFolderImport: (entry: VolumeEntry) => void
  onImportedEntryOpen: (entry: VolumeEntry) => void
  onDesktopItemFocus: (item: DesktopItem) => void
  onImportedEntryFocus: (entry: VolumeEntry) => void
  onImportedEntryContextMenu: (event: MouseEvent<HTMLButtonElement>, entry: VolumeEntry) => void
  progressiveStatus: ReactNode
}) {
  return (
    <div className="device-panel" onDragOver={onDesktopRootDragOver} onDrop={onDesktopRootDrop}>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {!activeImportedLoading && activeDesktopItemsLength === 0 && activeImportedEntriesLength === 0 ? <p>Esta ubicacion aun no tiene elementos.</p> : null}
      {activeImportedLoading ? <p>Cargando contenido importado...</p> : null}
      {activeDesktopFolders.length && viewMode === 'icons' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Carpetas</strong>
          <div className="finder-folder-grid">
            {activeDesktopFolders.map((item) => (
              <button
                key={item.id}
                type="button"
                className="finder-folder-tile"
                draggable
                onMouseDown={() => onDesktopItemFocus(item)}
                onFocus={() => onDesktopItemFocus(item)}
                onDragStart={(event) => onDesktopItemDragStart(event, item)}
                onDragOver={(event) => onDesktopFolderDragOver(event, item)}
                onDrop={(event) => onDesktopFolderDrop(event, item)}
                onClick={() => onDesktopFolderOpen(item)}
              >
                <span
                  className="finder-folder-icon"
                  style={{ backgroundImage: `url("${resolvePublicAssetPath('/carp.png')}")` }}
                  aria-hidden="true"
                />
                <strong>{item.name}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {activeDesktopFolders.length && viewMode === 'list' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Carpetas</strong>
          {renderFinderListHeader('Tipo')}
          <VirtualizedButtonList
            items={activeDesktopFolders}
            renderItem={(item) => (
              <button
                key={item.id}
                type="button"
                className="finder-file-row interactive"
                draggable
                onMouseDown={() => onDesktopItemFocus(item)}
                onFocus={() => onDesktopItemFocus(item)}
                onDragStart={(event) => onDesktopItemDragStart(event, item)}
                onDragOver={(event) => item.kind === 'folder' ? onDesktopFolderDragOver(event, item) : undefined}
                onDrop={(event) => item.kind === 'folder' ? onDesktopFolderDrop(event, item) : undefined}
                onClick={() => onDesktopFolderOpen(item)}
              >
                <strong>{item.name}</strong>
                <span>Carpeta</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {activeDesktopFiles.length && viewMode === 'list' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Documentos</strong>
          {renderFinderListHeader('Tipo')}
          <VirtualizedButtonList
            items={activeDesktopFiles}
            renderItem={(item) => (
              <button
                key={item.id}
                type="button"
                className="finder-file-row interactive"
                draggable
                onMouseDown={() => onDesktopItemFocus(item)}
                onFocus={() => onDesktopItemFocus(item)}
                onDragStart={(event) => onDesktopItemDragStart(event, item)}
                onClick={() => onDesktopFileOpen(item)}
              >
                <strong>{item.name}</strong>
                <span>{item.kind === 'text' ? 'Documento de texto' : item.extension || 'Archivo importado'}</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {activeDesktopFiles.length && viewMode === 'icons' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Documentos</strong>
          <div className="finder-file-grid">
            {activeDesktopFiles.map((item) =>
              renderFinderFileTile({
                keyId: item.id,
                name: item.name,
                subtitle: item.kind === 'text' ? 'Documento de texto' : item.extension || 'Archivo importado',
                sourcePath: item.sourcePath,
                extension: item.extension,
                iconSrc: item.iconDataUrl,
                draggable: true,
                onDragStart: (event) => onDesktopItemDragStart(event, item),
                onFocus: () => onDesktopItemFocus(item),
                onClick: () => onDesktopFileOpen(item),
              }),
            )}
          </div>
        </div>
      ) : null}
      {activeImportedFolders.length && viewMode === 'icons' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Carpetas importadas</strong>
          <div className="finder-folder-grid">
            {activeImportedFolders.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className="finder-folder-tile"
                onMouseDown={() => onImportedEntryFocus(entry)}
                onFocus={() => onImportedEntryFocus(entry)}
                onClick={() => onImportedFolderImport(entry)}
              >
                <span
                  className="finder-folder-icon"
                  style={{ backgroundImage: `url("${resolvePublicAssetPath('/carp.png')}")` }}
                  aria-hidden="true"
                />
                <strong>{entry.name}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {activeImportedFolders.length && viewMode === 'list' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Carpetas importadas</strong>
          {renderFinderListHeader('Tipo')}
          <VirtualizedButtonList
            items={activeImportedFolders}
            renderItem={(entry) => (
              <button
                key={entry.path}
                type="button"
                className="finder-file-row interactive"
                onMouseDown={() => onImportedEntryFocus(entry)}
                onFocus={() => onImportedEntryFocus(entry)}
                onClick={() => onImportedFolderImport(entry)}
                onContextMenu={(event) => onImportedEntryContextMenu(event, entry)}
              >
                <strong>{entry.name}</strong>
                <span>Carpeta importada</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {activeImportedFiles.length && viewMode === 'list' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Archivos importados</strong>
          {renderFinderListHeader('Tamaño')}
          <VirtualizedButtonList
            items={activeImportedFiles}
            renderItem={(entry) => (
              <button
                key={entry.path}
                type="button"
                className="finder-file-row interactive"
                onMouseDown={() => onImportedEntryFocus(entry)}
                onFocus={() => onImportedEntryFocus(entry)}
                onClick={() => onImportedEntryOpen(entry)}
                onContextMenu={(event) => onImportedEntryContextMenu(event, entry)}
              >
                <strong>{entry.name}</strong>
                <span>{entry.sizeBytes === null ? 'Tamano no disponible' : subtitleFromSize(entry.sizeBytes)}</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {activeImportedFiles.length && viewMode === 'icons' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Archivos importados</strong>
          <div className="finder-file-grid">
            {activeImportedFiles.map((entry) =>
              renderFinderFileTile({
                keyId: entry.path,
                name: entry.name,
                subtitle: entry.sizeBytes === null ? 'Tamano no disponible' : subtitleFromSize(entry.sizeBytes),
                sourcePath: entry.path,
                extension: entry.extension,
                iconSrc: entry.icon,
                onFocus: () => onImportedEntryFocus(entry),
                onClick: () => onImportedEntryOpen(entry),
                onContextMenu: (event) => onImportedEntryContextMenu(event, entry),
              }),
            )}
          </div>
        </div>
      ) : null}
      {progressiveStatus}
    </div>
  )
}

export function FinderVolumePanel({
  title,
  subtitle,
  capacity,
  free,
  activeVolumeLoading,
  activeVolumeEntriesLength,
  activeVolumeFolders,
  activeVolumeFiles,
  viewMode,
  renderFinderListHeader,
  renderFinderFileTile,
  onFolderOpen,
  onEntryOpen,
  onEntryFocus,
  onEntryContextMenu,
  onEntryDragStart,
  progressiveStatus,
}: {
  title: string
  subtitle: string
  capacity?: string
  free?: string
  activeVolumeLoading: boolean
  activeVolumeEntriesLength: number
  activeVolumeFolders: VolumeEntry[]
  activeVolumeFiles: VolumeEntry[]
  viewMode: FinderViewMode
  renderFinderListHeader: (secondaryLabel: string) => ReactNode
  renderFinderFileTile: (options: {
    keyId: string
    name: string
    subtitle: string
    sourcePath?: string | null
    extension?: string
    iconSrc?: string | null
    onClick: () => void
    onFocus?: () => void
    onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
    draggable?: boolean
    onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  }) => ReactNode
  onFolderOpen: (entry: VolumeEntry) => void
  onEntryOpen: (entry: VolumeEntry) => void
  onEntryFocus: (entry: VolumeEntry) => void
  onEntryContextMenu: (event: MouseEvent<HTMLButtonElement>, entry: VolumeEntry) => void
  onEntryDragStart: (event: DragEvent<HTMLButtonElement>, entry: VolumeEntry) => void
  progressiveStatus: ReactNode
}) {
  return (
    <div className="device-panel">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {capacity && free ? (
        <div className="finder-volume-summary">
          <article>
            <strong>Capacidad</strong>
            <span>{capacity} GB</span>
          </article>
          <article>
            <strong>Libre</strong>
            <span>{free} GB</span>
          </article>
        </div>
      ) : null}
      {activeVolumeLoading ? <p>Cargando contenido de la unidad...</p> : null}
      {!activeVolumeLoading && activeVolumeEntriesLength === 0 ? (
        <p>No se encontraron elementos visibles en esta unidad.</p>
      ) : null}
      {activeVolumeFolders.length && viewMode === 'icons' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Carpetas</strong>
          <div className="finder-folder-grid">
            {activeVolumeFolders.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className="finder-folder-tile"
                onMouseDown={() => onEntryFocus(entry)}
                onFocus={() => onEntryFocus(entry)}
                onClick={() => onFolderOpen(entry)}
                draggable
                onDragStart={(event) => onEntryDragStart(event, entry)}
                onContextMenu={(event) => onEntryContextMenu(event, entry)}
              >
                <span
                  className="finder-folder-icon"
                  style={{ backgroundImage: `url("${resolvePublicAssetPath('/carp.png')}")` }}
                  aria-hidden="true"
                />
                <strong>{entry.name}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {activeVolumeFolders.length && viewMode === 'list' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Carpetas</strong>
          {renderFinderListHeader('Tipo')}
          <VirtualizedButtonList
            items={activeVolumeFolders}
            renderItem={(entry) => (
              <button
                key={entry.path}
                type="button"
                className="finder-file-row interactive"
                draggable
                onMouseDown={() => onEntryFocus(entry)}
                onFocus={() => onEntryFocus(entry)}
                onDragStart={(event) => onEntryDragStart(event, entry)}
                onClick={() => onFolderOpen(entry)}
                onContextMenu={(event) => onEntryContextMenu(event, entry)}
              >
                <strong>{entry.name}</strong>
                <span>Carpeta</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {activeVolumeFiles.length && viewMode === 'list' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Archivos</strong>
          {renderFinderListHeader('Tamaño')}
          <VirtualizedButtonList
            items={activeVolumeFiles}
            renderItem={(entry) => (
              <button
                key={entry.path}
                type="button"
                className="finder-file-row interactive"
                draggable
                onMouseDown={() => onEntryFocus(entry)}
                onFocus={() => onEntryFocus(entry)}
                onDragStart={(event) => onEntryDragStart(event, entry)}
                onClick={() => onEntryOpen(entry)}
                onContextMenu={(event) => onEntryContextMenu(event, entry)}
              >
                <strong>{entry.name}</strong>
                <span>{entry.sizeBytes === null ? 'Tamano no disponible' : subtitleFromSize(entry.sizeBytes)}</span>
              </button>
            )}
          />
        </div>
      ) : null}
      {activeVolumeFiles.length && viewMode === 'icons' ? (
        <div className="finder-entry-section">
          <strong className="finder-entry-title">Archivos</strong>
          <div className="finder-file-grid">
            {activeVolumeFiles.map((entry) =>
              renderFinderFileTile({
                keyId: entry.path,
                name: entry.name,
                subtitle: entry.sizeBytes === null ? 'Tamano no disponible' : subtitleFromSize(entry.sizeBytes),
                sourcePath: entry.path,
                extension: entry.extension,
                iconSrc: entry.icon,
                draggable: true,
                onDragStart: (event) => onEntryDragStart(event, entry),
                onFocus: () => onEntryFocus(entry),
                onClick: () => onEntryOpen(entry),
                onContextMenu: (event) => onEntryContextMenu(event, entry),
              }),
            )}
          </div>
        </div>
      ) : null}
      {progressiveStatus}
    </div>
  )
}

function subtitleFromSize(sizeBytes: number) {
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

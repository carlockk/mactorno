import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './App.css'

type AppId = 'finder' | 'notes' | 'safari' | 'terminal'

type DesktopApp = {
  id: AppId
  name: string
  accent: string
  icon: string
  menu: string[]
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
  restoreBounds: {
    x: number
    y: number
    width: number
    height: number
  } | null
  genie: GenieState | null
}

type DragState = {
  id: string
  offsetX: number
  offsetY: number
}

type ResizeState = {
  id: string
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

type RectState = {
  x: number
  y: number
  width: number
  height: number
}

type GenieState = {
  mode: 'opening' | 'closing'
  dockRect: RectState
  minimizeOnFinish?: boolean
  removeOnFinish?: boolean
}

type DockVisualState = Record<
  AppId,
  {
    scale: number
    lift: number
    labelOpacity: number
  }
>

const MENU_BAR_HEIGHT = 36
const DOCK_BOTTOM = 18
const DOCK_HEIGHT = 82
const DESKTOP_SIDE_MARGIN = 24
const DESKTOP_TOP_GAP = 16
const DESKTOP_BOTTOM_GAP = 18
const MIN_WINDOW_WIDTH = 320
const MIN_WINDOW_HEIGHT = 220

const APPS: DesktopApp[] = [
  {
    id: 'finder',
    name: 'Finder',
    accent: 'linear-gradient(135deg, #7fd1ff 0%, #2f84ff 100%)',
    icon: 'F',
    menu: ['Archivo', 'Edicion', 'Ver', 'Ir', 'Ventana', 'Ayuda'],
  },
  {
    id: 'notes',
    name: 'Notas',
    accent: 'linear-gradient(135deg, #ffe57a 0%, #ffbf2f 100%)',
    icon: 'N',
    menu: ['Archivo', 'Edicion', 'Formato', 'Organizar', 'Ventana', 'Ayuda'],
  },
  {
    id: 'safari',
    name: 'Safari',
    accent: 'linear-gradient(135deg, #a8fff7 0%, #21b8ff 100%)',
    icon: 'S',
    menu: ['Archivo', 'Edicion', 'Visualizacion', 'Historial', 'Marcadores'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    accent: 'linear-gradient(135deg, #35383f 0%, #0f1116 100%)',
    icon: 'T',
    menu: ['Shell', 'Editar', 'Vista', 'Ventana', 'Ayuda'],
  },
]

const INITIAL_WINDOWS: WindowState[] = [
  {
    id: 'finder-main',
    appId: 'finder',
    title: 'Finder',
    x: 96,
    y: 104,
    width: 520,
    height: 340,
    zIndex: 3,
    minimized: false,
    maximized: false,
    restoreBounds: null,
    genie: null,
  },
  {
    id: 'notes-main',
    appId: 'notes',
    title: 'Notas',
    x: 288,
    y: 148,
    width: 420,
    height: 320,
    zIndex: 4,
    minimized: false,
    maximized: false,
    restoreBounds: null,
    genie: null,
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [clock, setClock] = useState(() => formatTime(new Date()))
  const [windows, setWindows] = useState<WindowState[]>(INITIAL_WINDOWS)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [resize, setResize] = useState<ResizeState | null>(null)
  const [dockVisuals, setDockVisuals] = useState<DockVisualState>({
    finder: { scale: 1, lift: 0, labelOpacity: 0 },
    notes: { scale: 1, lift: 0, labelOpacity: 0 },
    safari: { scale: 1, lift: 0, labelOpacity: 0 },
    terminal: { scale: 1, lift: 0, labelOpacity: 0 },
  })
  const nextWindowId = useRef(INITIAL_WINDOWS.length + 1)
  const dockItemRefs = useRef<Record<AppId, HTMLButtonElement | null>>({
    finder: null,
    notes: null,
    safari: null,
    terminal: null,
  })
  const windowRefs = useRef<Record<string, HTMLElement | null>>({})
  const runningGenies = useRef(new Set<string>())

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

  function getDockRect(appId: AppId): RectState | null {
    const dockItem = dockItemRefs.current[appId]
    if (!dockItem) {
      return null
    }

    const rect = dockItem.getBoundingClientRect()
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(formatTime(new Date()))
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

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
            width: clamp(
              activeResize.startWidth + (event.clientX - activeResize.startX),
              MIN_WINDOW_WIDTH,
              maxWidth,
            ),
            height: clamp(
              activeResize.startHeight + (event.clientY - activeResize.startY),
              MIN_WINDOW_HEIGHT,
              maxHeight,
            ),
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
    windows.forEach((item) => {
      if (!item.genie || runningGenies.current.has(item.id)) {
        return
      }

      const node = windowRefs.current[item.id]
      if (!node) {
        return
      }

      runningGenies.current.add(item.id)

      const windowRect = node.getBoundingClientRect()
      const dockRect = item.genie.dockRect
      const deltaX = dockRect.x - windowRect.x
      const deltaY = dockRect.y - windowRect.y
      const scaleX = clamp(dockRect.width / Math.max(windowRect.width, 1), 0.08, 1)
      const scaleY = clamp(dockRect.height / Math.max(windowRect.height, 1), 0.08, 1)

      const frames: Keyframe[] =
        item.genie.mode === 'opening'
          ? [
              {
                transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
                clipPath: 'polygon(47% 0%, 53% 0%, 57% 100%, 43% 100%)',
                borderRadius: '28px',
                opacity: '0.88',
                offset: 0,
              },
              {
                transform: `translate(${deltaX * 0.22}px, ${deltaY * 0.35}px) scale(${Math.min(
                  1.18,
                  scaleX + 0.22,
                )}, ${Math.min(1, scaleY + 0.18)})`,
                clipPath: 'polygon(0% 0%, 100% 0%, 72% 100%, 28% 100%)',
                borderRadius: '24px',
                opacity: '0.96',
                offset: 0.48,
              },
              {
                transform: 'translate(0px, 0px) scale(1, 1)',
                clipPath: 'inset(0 round 22px)',
                borderRadius: '22px',
                opacity: '1',
                offset: 1,
              },
            ]
          : [
              {
                transform: 'translate(0px, 0px) scale(1, 1)',
                clipPath: 'inset(0 round 22px)',
                borderRadius: '22px',
                opacity: '1',
                offset: 0,
              },
              {
                transform: `translate(${deltaX * 0.18}px, ${deltaY * 0.34}px) scale(${Math.max(
                  0.3,
                  1 - (1 - scaleX) * 0.55,
                )}, ${Math.max(0.52, 1 - (1 - scaleY) * 0.22)})`,
                clipPath: 'polygon(0% 0%, 100% 0%, 71% 100%, 29% 100%)',
                borderRadius: '24px',
                opacity: '0.96',
                offset: 0.42,
              },
              {
                transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
                clipPath: 'polygon(47% 0%, 53% 0%, 57% 100%, 43% 100%)',
                borderRadius: '28px',
                opacity: '0.84',
                offset: 1,
              },
            ]

      const animation = node.animate(frames, {
        duration: 620,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      })

      animation.onfinish = () => {
        runningGenies.current.delete(item.id)

        setWindows((current) =>
          current.flatMap((windowItem) => {
            if (windowItem.id !== item.id) {
              return [windowItem]
            }

            if (item.genie?.removeOnFinish) {
              return []
            }

            if (item.genie?.minimizeOnFinish) {
              return [{ ...windowItem, minimized: true, genie: null }]
            }

            return [{ ...windowItem, minimized: false, genie: null }]
          }),
        )

        requestAnimationFrame(() => {
          animation.onfinish = null
          animation.oncancel = null
          animation.cancel()
        })
      }

      animation.oncancel = () => {
        runningGenies.current.delete(item.id)
      }
    })
  }, [windows])

  const activeWindow = useMemo(() => {
    return [...windows]
      .filter((item) => !item.minimized)
      .sort((left, right) => right.zIndex - left.zIndex)[0]
  }, [windows])

  const activeApp = activeWindow ? getApp(activeWindow.appId) : getApp('finder')

  const topZIndex = useMemo(() => {
    return windows.reduce((max, item) => Math.max(max, item.zIndex), 0)
  }, [windows])

  function getDockItemStyle(appId: AppId) {
    const visual = dockVisuals[appId]
    return {
      '--dock-scale': visual.scale.toFixed(3),
      '--dock-lift': `-${visual.lift.toFixed(1)}px`,
      '--dock-label-opacity': visual.labelOpacity.toString(),
    } as CSSProperties
  }

  function resetDockVisuals() {
    setDockVisuals({
      finder: { scale: 1, lift: 0, labelOpacity: 0 },
      notes: { scale: 1, lift: 0, labelOpacity: 0 },
      safari: { scale: 1, lift: 0, labelOpacity: 0 },
      terminal: { scale: 1, lift: 0, labelOpacity: 0 },
    })
  }

  function handleDockMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const pointerX = event.clientX
    setDockVisuals({
      finder: getDockVisual(pointerX, 'finder'),
      notes: getDockVisual(pointerX, 'notes'),
      safari: getDockVisual(pointerX, 'safari'),
      terminal: getDockVisual(pointerX, 'terminal'),
    })
  }

  function getDockVisual(pointerX: number, appId: AppId) {
    const item = dockItemRefs.current[appId]
    if (!item) {
      return { scale: 1, lift: 0, labelOpacity: 0 }
    }

    const rect = item.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const distance = Math.abs(pointerX - centerX)
    const influence = clamp(1 - distance / 180, 0, 1)

    return {
      scale: 1 + influence * 0.72,
      lift: influence * 18,
      labelOpacity: influence > 0.72 ? 1 : 0,
    }
  }

  function focusWindow(id: string) {
    setWindows((current) =>
      current.map((item) =>
        item.id === id ? { ...item, zIndex: topZIndex + 1, minimized: false, genie: null } : item,
      ),
    )
  }

  function openApp(appId: AppId) {
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
                  genie: dockRect
                    ? {
                        mode: 'opening',
                        dockRect,
                      }
                    : null,
                }
              : item,
          ),
        )
        return
      }

      focusWindow(existing.id)
      return
    }

    const app = getApp(appId)
    const dockRect = getDockRect(appId)
    const nextWindow: WindowState = {
      id: `${appId}-${nextWindowId.current}`,
      appId,
      title: app.name,
      x: 160 + windows.length * 36,
      y: 110 + windows.length * 28,
      width: appId === 'safari' ? 620 : 460,
      height: appId === 'terminal' ? 300 : 340,
      zIndex: topZIndex + 1,
      minimized: false,
      maximized: false,
      restoreBounds: null,
      genie: dockRect
        ? {
            mode: 'opening',
            dockRect,
          }
        : null,
    }

    nextWindowId.current += 1

    setWindows((current) => [...current, nextWindow])
  }

  function closeWindow(id: string) {
    setWindows((current) =>
      current.flatMap((item) => {
        if (item.id !== id) {
          return [item]
        }

        const dockRect = getDockRect(item.appId)
        if (!dockRect) {
          return []
        }

        return [
          {
            ...item,
            genie: {
              mode: 'closing',
              dockRect,
              removeOnFinish: true,
            },
          },
        ]
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

        return {
          ...item,
          genie: {
            mode: 'closing',
            dockRect,
            minimizeOnFinish: true,
          },
        }
      }),
    )
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>, id: string) {
    const targetWindow = windows.find((item) => item.id === id)
    if (!targetWindow || targetWindow.maximized) {
      return
    }

    focusWindow(id)
    setDrag({
      id,
      offsetX: event.clientX - targetWindow.x,
      offsetY: event.clientY - targetWindow.y,
    })
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
    const desktop = getDesktopBounds()
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
          restoreBounds: {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
          },
          zIndex: topZIndex + 1,
          genie: null,
        }
      }),
    )
  }

  function renderWindowContent(appId: AppId) {
    if (appId === 'finder') {
      return (
        <div className="finder-layout">
          <aside className="finder-sidebar">
            <span>Favoritos</span>
            <span>Escritorio</span>
            <span>Descargas</span>
            <span>Aplicaciones</span>
          </aside>
          <div className="finder-panel">
            <h2>Mac local</h2>
            <p>Este escritorio corre sobre React y Vite en localhost.</p>
            <div className="card-grid">
              <article>
                <strong>Ventanas</strong>
                <p>Arrastrables, enfocables y minimizables.</p>
              </article>
              <article>
                <strong>Dock</strong>
                <p>Lanza apps y muestra las abiertas.</p>
              </article>
              <article>
                <strong>Barra superior</strong>
                <p>Cambia segun la ventana activa.</p>
              </article>
            </div>
          </div>
        </div>
      )
    }

    if (appId === 'notes') {
      return (
        <div className="notes-view">
          <span className="notes-chip">Nota rapida</span>
          <h2>Ideas para la siguiente fase</h2>
          <ul>
            <li>Animar el login y la apertura de ventanas.</li>
            <li>Agregar mas apps falsas con iconos reales.</li>
            <li>Persistir estado del escritorio en localStorage.</li>
          </ul>
        </div>
      )
    }

    if (appId === 'safari') {
      return (
        <div className="browser-view">
          <div className="browser-bar">
            <span className="traffic-url">localhost:5173</span>
          </div>
          <div className="browser-page">
            <h2>Vista previa del sistema</h2>
            <p>
              Desde aqui puedes evolucionar este mockup hacia un clon mucho mas
              cercano a macOS.
            </p>
            <button type="button">Explorar escritorio</button>
          </div>
        </div>
      )
    }

    return (
      <div className="terminal-view">
        <p>
          <span className="terminal-prompt">visitor@mactorno %</span> npm run dev
        </p>
        <p>Servidor local listo para seguir iterando.</p>
        <p className="terminal-muted">Siguiente paso: mas apps, mas gestos, mas detalle visual.</p>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <main className="login-screen">
        <div className="login-panel">
          <div className="avatar-shell">ME</div>
          <p className="welcome-tag">Mini macOS local</p>
          <h1>Mactorno</h1>
          <p className="welcome-copy">
            Pantalla de acceso inspirada en macOS. Sin clave: entra directo al
            escritorio.
          </p>
          <button type="button" onClick={() => setLoggedIn(true)}>
            Ingresar
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="desktop-shell">
      <header className="menu-bar">
        <div className="menu-left">
          <span className="apple-mark">M</span>
          <strong>{activeApp.name}</strong>
          {activeApp.menu.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="menu-right">
          <span>Localhost</span>
          <span>{clock}</span>
        </div>
      </header>

      <section className="desktop-canvas">
        <div className="wallpaper-glow wallpaper-glow-a" />
        <div className="wallpaper-glow wallpaper-glow-b" />

        {windows
          .filter((item) => !item.minimized)
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((item) => {
            const app = getApp(item.appId)
            const isActive = activeWindow?.id === item.id

            return (
              <article
                key={item.id}
                className={`app-window${isActive ? ' active' : ''}${item.genie ? ' is-genie' : ''}`}
                style={{
                  width: item.width,
                  height: item.height,
                  transform: `translate(${item.x}px, ${item.y}px)`,
                  zIndex: item.zIndex,
                }}
                onPointerDown={() => focusWindow(item.id)}
                ref={(node) => {
                  windowRefs.current[item.id] = node
                }}
              >
                <div
                  className="window-toolbar"
                  onPointerDown={(event) => startDrag(event, item.id)}
                  onDoubleClick={() => toggleMaximize(item.id)}
                >
                  <div className="traffic-lights">
                    <button
                      type="button"
                      className="light close"
                      aria-label={`Cerrar ${item.title}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => closeWindow(item.id)}
                    />
                    <button
                      type="button"
                      className="light minimize"
                      aria-label={`Minimizar ${item.title}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => minimizeWindow(item.id)}
                    />
                    <button
                      type="button"
                      className="light zoom"
                      aria-label={`${item.maximized ? 'Restaurar' : 'Expandir'} ${item.title}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => toggleMaximize(item.id)}
                    />
                  </div>
                  <div className="window-title">
                    <span className="window-app-icon" style={{ background: app.accent }}>
                      {app.icon}
                    </span>
                    <span>{item.title}</span>
                  </div>
                </div>
                <div className="window-content">{renderWindowContent(item.appId)}</div>
                <div
                  className={`resize-handle${item.maximized ? ' disabled' : ''}`}
                  onPointerDown={(event) => startResize(event, item.id)}
                />
              </article>
            )
          })}
      </section>

      <footer className="dock-wrap">
        <div
          className="dock"
          onMouseMove={handleDockMouseMove}
          onMouseLeave={resetDockVisuals}
        >
          {APPS.map((app) => {
            const isOpen = windows.some((item) => item.appId === app.id)
            return (
              <button
                key={app.id}
                type="button"
                className="dock-item"
                onClick={() => openApp(app.id)}
                aria-label={`Abrir ${app.name}`}
                ref={(node) => {
                  dockItemRefs.current[app.id] = node
                }}
                style={getDockItemStyle(app.id)}
              >
                <span className="dock-icon" style={{ background: app.accent }}>
                  {app.icon}
                </span>
                <span className="dock-label">{app.name}</span>
                <span className={`dock-indicator${isOpen ? ' visible' : ''}`} />
              </button>
            )
          })}
        </div>
      </footer>
    </main>
  )
}

export default App

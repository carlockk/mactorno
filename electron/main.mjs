import path from 'node:path'
import os from 'node:os'
import { createReadStream, existsSync, mkdirSync, promises as fs, rmSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import { executeTerminalCommand, getBootDeviceInfo, getDeviceInfo, getInstalledApps, getSystemControls, launchApp, listVolumeEntries, setSystemControls } from './system-info.mjs'

const sessionStatePath = path.join(app.getPath('userData'), 'session-state.json')
let safeStartup = false
let lowEndStartup = false

try {
  if (existsSync(sessionStatePath)) {
    const raw = JSON.parse(await fs.readFile(sessionStatePath, 'utf8'))
    safeStartup = raw?.pending === true
  }
} catch {
  safeStartup = false
}

function writeSessionState(pending, extra = {}) {
  try {
    mkdirSync(path.dirname(sessionStatePath), { recursive: true })
    writeFileSync(
      sessionStatePath,
      JSON.stringify({
        pending,
        updatedAt: Date.now(),
        ...extra,
      }),
    )
  } catch {
    // Si no puede escribir el marcador, sigue con arranque normal.
  }
}

function clearSessionState() {
  try {
    rmSync(sessionStatePath, { force: true })
  } catch {
    // Ignora errores de limpieza al salir.
  }
}

function detectLowEndStartupProfile() {
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024
  const cpuCount = os.cpus().length

  return totalMemoryGb <= 8 || cpuCount <= 4
}

lowEndStartup = detectLowEndStartupProfile()
writeSessionState(true, { reason: 'launching' })

if (process.platform === 'win32' && !safeStartup && !lowEndStartup && process.env.MACTORNO_FORCE_HIGH_PERFORMANCE_GPU === '1') {
  // Solo fuerza la GPU dedicada cuando se pide explicitamente.
  app.commandLine.appendSwitch('force_high_performance_gpu')
}

if (safeStartup || lowEndStartup) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
}

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = !app.isPackaged

let mainWindow = null
let browserWindow = null
let browserVisible = false
let currentBrowserUrl = ''
let browserSyncRequestTimer = null
let browserAppearance = 'classic'
let safeStartupClearTimer = null
let mainWindowRecoveryAttempts = 0
const desktopUserAgent = (() => {
  const chromeVersion = process.versions.chrome
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
})()
let browserState = {
  url: '',
  title: '',
  loading: false,
  lastError: null,
}

function getMediaMimeType(targetPath) {
  const extension = path.extname(targetPath).toLowerCase()
  switch (extension) {
    case '.png':
    case '.apng':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
    case '.jfif':
    case '.pjpeg':
    case '.pjp':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    case '.svg':
      return 'image/svg+xml'
    case '.avif':
      return 'image/avif'
    case '.ico':
      return 'image/x-icon'
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mkv':
      return 'video/x-matroska'
    case '.avi':
      return 'video/x-msvideo'
    case '.ogv':
    case '.ogm':
      return 'video/ogg'
    case '.mpeg':
    case '.mpg':
    case '.mpe':
    case '.mpv':
    case '.m2v':
      return 'video/mpeg'
    case '.ts':
    case '.mts':
    case '.m2ts':
      return 'video/mp2t'
    case '.3gp':
      return 'video/3gpp'
    case '.3g2':
      return 'video/3gpp2'
    default:
      return 'application/octet-stream'
  }
}

function normalizeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function shouldOpenExternally(url, errorDescription = '') {
  if (!/^https?:\/\//i.test(url)) {
    return false
  }

  const hostname = normalizeHostname(url)
  if (!hostname) {
    return false
  }

  return errorDescription === 'ERR_BLOCKED_BY_RESPONSE'
}

function openExternallyAndTrack(url, reason) {
  browserState = {
    ...browserState,
    url,
    loading: false,
    lastError: reason,
  }
  emitBrowserState()
  shell.openExternal(url).catch(() => {})
}

function navigateBrowserWindow(targetWindow, url) {
  if (!targetWindow || !url) {
    return
  }

  currentBrowserUrl = url
  browserState = {
    ...browserState,
    url,
    lastError: null,
  }
  emitBrowserState()

  targetWindow.webContents.loadURL(url).catch(() => {})
}

function emitBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('browser:state', browserState)
}

function emitBrowserSyncRequest() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('desktop:request-browser-sync')
}

function scheduleBrowserSyncRequest() {
  if (!mainWindow || !browserVisible || browserSyncRequestTimer !== null) {
    return
  }

  browserSyncRequestTimer = setTimeout(() => {
    browserSyncRequestTimer = null
    emitBrowserSyncRequest()
  }, 16)
}

async function applyBrowserAppearance(targetWindow = browserWindow) {
  nativeTheme.themeSource = browserAppearance === 'dark' ? 'dark' : 'light'

  if (!targetWindow || targetWindow.isDestroyed()) {
    return
  }

  try {
    if (!targetWindow.webContents.debugger.isAttached()) {
      targetWindow.webContents.debugger.attach('1.3')
    }

    await targetWindow.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      media: '',
      features: [
        {
          name: 'prefers-color-scheme',
          value: browserAppearance === 'dark' ? 'dark' : 'light',
        },
      ],
    })
    await targetWindow.webContents.debugger.sendCommand('Emulation.setAutoDarkModeOverride', {
      enabled: browserAppearance === 'dark',
    })
  } catch {
    // Si Chromium no soporta alguna emulacion, mantiene el navegador funcional.
  }
}

function attachBrowserWindowEvents(targetWindow) {
  targetWindow.webContents.setUserAgent(desktopUserAgent)
  targetWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return ['fullscreen', 'media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)
  })
  targetWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['fullscreen', 'media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission))
  })

  targetWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url) {
      return { action: 'deny' }
    }

    navigateBrowserWindow(targetWindow, url)
    return { action: 'deny' }
  })

  targetWindow.webContents.on('did-start-loading', () => {
    browserState = {
      ...browserState,
      loading: true,
      lastError: null,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on('page-title-updated', (_event, title) => {
    browserState = {
      ...browserState,
      title,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on('did-navigate', (_event, url) => {
    currentBrowserUrl = url
    browserState = {
      ...browserState,
      url,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    currentBrowserUrl = url
    browserState = {
      ...browserState,
      url,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on('did-frame-finish-load', (_event, isMainFrame) => {
    if (!isMainFrame) {
      return
    }

    browserState = {
      ...browserState,
      loading: false,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on('did-finish-load', () => {
    browserState = {
      ...browserState,
      loading: false,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on('did-stop-loading', () => {
    browserState = {
      ...browserState,
      loading: false,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on('will-redirect', (_event, url) => {
    currentBrowserUrl = url
    browserState = {
      ...browserState,
      url,
      lastError: null,
    }
    emitBrowserState()
  })

  targetWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return
      }

      if (validatedURL && shouldOpenExternally(validatedURL, errorDescription)) {
        openExternallyAndTrack(validatedURL, 'Este sitio se abrio en tu navegador predeterminado porque bloqueo el navegador integrado.')
        return
      }

      browserState = {
        ...browserState,
        url: validatedURL || browserState.url,
        loading: false,
        lastError: `${errorCode}: ${errorDescription}`,
      }
      emitBrowserState()
    },
  )

  targetWindow.webContents.on('render-process-gone', (_event, details) => {
    browserState = {
      ...browserState,
      loading: false,
      lastError:
        details?.reason === 'oom'
          ? 'El navegador integrado se desactivo por falta de memoria. Usa el enlace externo o reinicia la app.'
          : 'El navegador integrado se reiniciara porque el proceso web se cerro.',
    }
    emitBrowserState()

    hideBrowserWindow()
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.destroy()
    }
    browserWindow = null
    writeSessionState(true, { reason: `browser-${details?.reason ?? 'gone'}` })
  })
}

function handleMainRendererFailure(details) {
  writeSessionState(true, { reason: `renderer-${details?.reason ?? 'gone'}` })

  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (mainWindowRecoveryAttempts >= 1) {
    mainWindow.close()
    return
  }

  mainWindowRecoveryAttempts += 1
  const previousBounds = mainWindow.getBounds()
  mainWindow.destroy()
  mainWindow = null

  createWindow(previousBounds)
}

function ensureBrowserWindow() {
  if (!mainWindow) {
    return null
  }

  if (!browserWindow) {
    browserWindow = new BrowserWindow({
      parent: mainWindow,
      show: false,
      frame: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      resizable: false,
      fullscreenable: true,
      skipTaskbar: true,
      roundedCorners: false,
      backgroundColor: browserAppearance === 'dark' ? '#111827' : '#ffffff',
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required',
        partition: 'persist:mactorno-browser',
      },
    })
    attachBrowserWindowEvents(browserWindow)
    void applyBrowserAppearance(browserWindow)
    browserWindow.on('closed', () => {
      browserWindow = null
    })
  }

  return browserWindow
}

function hideBrowserWindow() {
  if (!browserWindow) {
    return
  }

  browserVisible = false
  if (browserSyncRequestTimer !== null) {
    clearTimeout(browserSyncRequestTimer)
    browserSyncRequestTimer = null
  }
  browserWindow.hide()
}

function createWindow(initialBounds = null) {
  mainWindow = new BrowserWindow({
    width: initialBounds?.width ?? 1480,
    height: initialBounds?.height ?? 920,
    x: initialBounds?.x,
    y: initialBounds?.y,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    roundedCorners: false,
    backgroundColor: '#0f172a',
    title: 'Mactorno',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) {
      return
    }
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.on('resize', () => {
    scheduleBrowserSyncRequest()
  })

  mainWindow.on('move', () => {
    scheduleBrowserSyncRequest()
  })

  mainWindow.on('maximize', () => {
    scheduleBrowserSyncRequest()
  })

  mainWindow.on('unmaximize', () => {
    scheduleBrowserSyncRequest()
  })

  mainWindow.on('closed', () => {
    if (safeStartupClearTimer !== null) {
      clearTimeout(safeStartupClearTimer)
      safeStartupClearTimer = null
    }
    if (browserSyncRequestTimer !== null) {
      clearTimeout(browserSyncRequestTimer)
      browserSyncRequestTimer = null
    }
    mainWindow = null
    browserWindow = null
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    handleMainRendererFailure(details)
  })

  mainWindow.once('ready-to-show', () => {
    mainWindowRecoveryAttempts = 0
    if (safeStartupClearTimer !== null) {
      clearTimeout(safeStartupClearTimer)
    }

    safeStartupClearTimer = setTimeout(() => {
      safeStartupClearTimer = null
      clearSessionState()
    }, 15000)
  })
}

app.whenReady().then(() => {
  protocol.handle('mactorno-media', async (request) => {
    const encodedPath = request.url.slice('mactorno-media://'.length)
    const targetPath = decodeURIComponent(encodedPath)

    try {
      const stat = await fs.stat(targetPath)
      if (!stat.isFile()) {
        return new Response('Not found', { status: 404 })
      }

      const mimeType = getMediaMimeType(targetPath)
      const rangeHeader = request.headers.get('range')
      const baseHeaders = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      }

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        if (match) {
          const start = Number(match[1] || 0)
          const end = Number(match[2] || stat.size - 1)
          const safeStart = Math.max(0, Math.min(start, stat.size - 1))
          const safeEnd = Math.max(safeStart, Math.min(end, stat.size - 1))
          const length = safeEnd - safeStart + 1
          const stream = createReadStream(targetPath, { start: safeStart, end: safeEnd })

          return new Response(Readable.toWeb(stream), {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Length': String(length),
              'Content-Range': `bytes ${safeStart}-${safeEnd}/${stat.size}`,
            },
          })
        }
      }

      const stream = createReadStream(targetPath)
      return new Response(Readable.toWeb(stream), {
        headers: {
          ...baseHeaders,
          'Content-Length': String(stat.size),
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()

  ipcMain.handle('device-info:boot', async () => getBootDeviceInfo())
  ipcMain.handle('device-info:get', async () => getDeviceInfo())
  ipcMain.handle('apps:list', async (_event, payload) => getInstalledApps(payload))
  ipcMain.handle('volumes:list-entries', async (_event, payload) => listVolumeEntries(payload))
  ipcMain.handle('system-controls:get', async () => getSystemControls())
  ipcMain.handle('system-controls:set', async (_event, payload) => setSystemControls(payload))
  ipcMain.handle('terminal:execute', async (_event, payload) => executeTerminalCommand(payload.command, payload.cwd))
  ipcMain.handle('apps:launch', async (_event, target) => {
    return launchApp(target)
  })
  ipcMain.handle('window:quit', async () => {
    app.quit()
    return { ok: true }
  })
  ipcMain.handle('window:reload', async () => {
    if (mainWindow) {
      mainWindow.reload()
    }
    return { ok: true }
  })
  ipcMain.handle('media:pick-file', async (_event, kind) => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      properties: ['openFile'],
      filters:
        kind === 'video'
          ? [{
              name: 'Videos',
              extensions: ['mp4', 'm4v', 'webm', 'mov', 'mkv', 'avi', 'ogv', 'ogm', 'mpeg', 'mpg', 'mpe', 'mpv', 'm2v', 'ts', 'mts', 'm2ts', '3gp', '3g2'],
            }]
          : [{ name: 'Imagenes', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'gif', 'webp', 'bmp', 'svg', 'avif', 'apng', 'ico'] }],
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    return {
      path: result.filePaths[0],
      name: path.basename(result.filePaths[0]),
    }
  })
  ipcMain.handle('path:reveal', async (_event, target) => {
    if (!target) {
      return { ok: false, error: 'Ruta vacia.' }
    }

    shell.showItemInFolder(target)
    return { ok: true, error: null }
  })

  ipcMain.on('browser:sync-host', (_event, payload) => {
    if (!mainWindow) {
      return
    }

    if (!payload?.visible) {
      hideBrowserWindow()
      return
    }

    const targetWindow = ensureBrowserWindow()
    if (!targetWindow) {
      return
    }

    const contentBounds = mainWindow.getContentBounds()
    browserVisible = true
    targetWindow.setBounds({
      x: Math.round(contentBounds.x + payload.bounds.x),
      y: Math.round(contentBounds.y + payload.bounds.y),
      width: Math.max(0, Math.round(payload.bounds.width)),
      height: Math.max(0, Math.round(payload.bounds.height)),
    })
    if (!targetWindow.isVisible()) {
      targetWindow.showInactive()
    }

    if (payload.url && currentBrowserUrl !== payload.url) {
      navigateBrowserWindow(targetWindow, payload.url)
    }
  })

  ipcMain.on('browser:navigate', (_event, url) => {
    const targetWindow = ensureBrowserWindow()
    if (!targetWindow || !url) {
      return
    }
    navigateBrowserWindow(targetWindow, url)
  })

  ipcMain.on('browser:go-back', () => {
    if (browserWindow?.webContents.canGoBack()) {
      browserWindow.webContents.goBack()
    }
  })

  ipcMain.on('browser:go-forward', () => {
    if (browserWindow?.webContents.canGoForward()) {
      browserWindow.webContents.goForward()
    }
  })

  ipcMain.on('browser:reload', () => {
    if (!browserWindow) {
      return
    }

    const loadedUrl = browserWindow.webContents.getURL()
    if (!loadedUrl || (browserState.lastError && currentBrowserUrl)) {
      navigateBrowserWindow(browserWindow, currentBrowserUrl || browserState.url)
      return
    }

    browserWindow.webContents.reload()
  })

  ipcMain.on('browser:set-appearance', (_event, mode) => {
    browserAppearance = mode === 'dark' ? 'dark' : 'classic'
    void applyBrowserAppearance()
  })

  ipcMain.on('browser:open-external', (_event, url) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      return
    }

    shell.openExternal(url).catch(() => {})
  })

  ipcMain.on('browser:hide', () => {
    hideBrowserWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on('child-process-gone', (_event, details) => {
    if (details?.type === 'GPU') {
      writeSessionState(true, { reason: `gpu-${details.reason ?? 'gone'}` })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (safeStartupClearTimer !== null) {
    clearTimeout(safeStartupClearTimer)
    safeStartupClearTimer = null
  }

  clearSessionState()
})

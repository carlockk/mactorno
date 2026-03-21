import path from 'node:path'
import { createReadStream, promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { executeTerminalCommand, getDeviceInfo, getInstalledApps, getSystemControls, launchApp, listVolumeEntries, setSystemControls } from './system-info.mjs'

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = !app.isPackaged

let mainWindow = null
let browserWindow = null
let browserVisible = false
let currentBrowserUrl = ''
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
      return 'image/png'
    case '.jpg':
    case '.jpeg':
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
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mkv':
      return 'video/x-matroska'
    case '.avi':
      return 'video/x-msvideo'
    case '.m4v':
      return 'video/x-m4v'
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

function isExternalOnlyHostname(hostname) {
  return [
    'google.com',
    'www.google.com',
    'google.cl',
    'www.google.cl',
    'accounts.google.com',
    'chat.openai.com',
    'chatgpt.com',
    'www.chatgpt.com',
    'auth.openai.com',
    'openai.com',
    'www.openai.com',
  ].some((candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`))
}

function shouldOpenExternally(url, errorDescription = '') {
  if (!/^https?:\/\//i.test(url)) {
    return false
  }

  const hostname = normalizeHostname(url)
  if (!hostname) {
    return false
  }

  if (isExternalOnlyHostname(hostname)) {
    return true
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

  if (shouldOpenExternally(url)) {
    openExternallyAndTrack(url, 'Este sitio se abre fuera de Mactorno porque bloquea navegadores embebidos.')
    return
  }

  targetWindow.webContents.loadURL(url).catch(() => {})
}

function emitBrowserState() {
  if (!mainWindow) {
    return
  }
  mainWindow.webContents.send('browser:state', browserState)
}

function emitBrowserSyncRequest() {
  if (!mainWindow) {
    return
  }

  mainWindow.webContents.send('desktop:request-browser-sync')
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

    if (shouldOpenExternally(url)) {
      openExternallyAndTrack(url, 'Este sitio se abrio en tu navegador predeterminado.')
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
      backgroundColor: '#ffffff',
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required',
        partition: 'persist:mactorno-browser',
      },
    })
    attachBrowserWindowEvents(browserWindow)
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
  browserWindow.hide()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    title: 'Mactorno',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
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
    if (!browserVisible) {
      return
    }
    emitBrowserSyncRequest()
  })

  mainWindow.on('move', () => {
    if (!browserVisible) {
      return
    }
    emitBrowserSyncRequest()
  })

  mainWindow.on('maximize', () => {
    if (!browserVisible) {
      return
    }
    emitBrowserSyncRequest()
  })

  mainWindow.on('unmaximize', () => {
    if (!browserVisible) {
      return
    }
    emitBrowserSyncRequest()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    browserWindow = null
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

  ipcMain.handle('device-info:get', async () => getDeviceInfo())
  ipcMain.handle('apps:list', async () => getInstalledApps())
  ipcMain.handle('volumes:list-entries', async (_event, target) => listVolumeEntries(target))
  ipcMain.handle('system-controls:get', async () => getSystemControls())
  ipcMain.handle('system-controls:set', async (_event, payload) => setSystemControls(payload))
  ipcMain.handle('terminal:execute', async (_event, payload) => executeTerminalCommand(payload.command, payload.cwd))
  ipcMain.handle('apps:launch', async (_event, target) => {
    return launchApp(target)
  })
  ipcMain.handle('media:pick-file', async (_event, kind) => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      properties: ['openFile'],
      filters:
        kind === 'video'
          ? [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }]
          : [{ name: 'Imagenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] }],
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
    browserWindow?.webContents.reload()
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

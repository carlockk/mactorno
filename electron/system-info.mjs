import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { shell } from 'electron'

function toGb(value) {
  return (value / 1024 / 1024 / 1024).toFixed(1)
}

const APPS_CACHE_TTL_MS = 5 * 60 * 1000
const DEVICE_INFO_CACHE_TTL_MS = 15 * 1000
const SYSTEM_CONTROLS_CACHE_TTL_MS = 5 * 1000

const appsCache = { expiresAt: 0, value: undefined, pending: undefined }
const deviceInfoCache = { expiresAt: 0, value: undefined, pending: undefined }
const systemControlsCache = { expiresAt: 0, value: undefined, pending: undefined }

async function getCachedValue(cache, ttlMs, loader) {
  const now = Date.now()
  if (cache.value !== undefined && cache.expiresAt > now) {
    return cache.value
  }

  if (cache.pending) {
    return cache.pending
  }

  cache.pending = loader()
    .then((value) => {
      cache.value = value
      cache.expiresAt = Date.now() + ttlMs
      return value
    })
    .finally(() => {
      cache.pending = undefined
    })

  return cache.pending
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
}

function walkFiles(dirPath, maxDepth, result = [], depth = 0) {
  if (depth > maxDepth) {
    return result
  }

  for (const entry of safeReadDir(dirPath)) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, maxDepth, result, depth + 1)
      continue
    }
    result.push(fullPath)
  }

  return result
}

function uniqueApps(items) {
  const map = new Map()
  for (const item of items) {
    const key = `${item.name.toLowerCase()}::${(item.launchTarget || item.target).toLowerCase()}`
    if (!map.has(key)) {
      map.set(key, item)
    }
  }
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeExecTarget(value) {
  return value
    .replace(/%.?/g, '')
    .replace(/--[\w-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fileToDataUrl(filePath) {
  try {
    const extension = path.extname(filePath).toLowerCase()
    const mimeType =
      extension === '.svg'
        ? 'image/svg+xml'
        : extension === '.jpg' || extension === '.jpeg'
          ? 'image/jpeg'
          : extension === '.webp'
            ? 'image/webp'
            : 'image/png'

    const buffer = fs.readFileSync(filePath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

async function resolveWindowsShortcut(filePath) {
  const script = `
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut('${filePath.replace(/'/g, "''")}')
$payload = [pscustomobject]@{
  TargetPath = $shortcut.TargetPath
  IconLocation = $shortcut.IconLocation
}
$payload | ConvertTo-Json -Compress
`
  const output = await runCommand('powershell.exe', ['-NoProfile', '-Command', script])
  try {
    return JSON.parse(output)
  } catch {
    return null
  }
}

async function withTimeout(promise, ms, fallback = null) {
  let timer = null
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function extractWindowsIconData(targetPath, iconLocation = '') {
  const script = `
Add-Type -AssemblyName System.Drawing
$source = '${(iconLocation || targetPath).replace(/'/g, "''")}'
if ([string]::IsNullOrWhiteSpace($source)) { return }
$iconPath = ($source -split ',')[0].Trim('"')
if (-not (Test-Path $iconPath)) { $iconPath = '${targetPath.replace(/'/g, "''")}' }
if (-not (Test-Path $iconPath)) { return }
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($iconPath)
if ($null -eq $icon) { return }
$bitmap = $icon.ToBitmap()
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($stream.ToArray())
`

  const output = await runCommand('powershell.exe', ['-NoProfile', '-Command', script])
  return output.trim() ? `data:image/png;base64,${output.trim()}` : null
}

function parseInternetShortcut(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const iconMatch = content.match(/^IconFile=(.+)$/m)
    const urlMatch = content.match(/^URL=(.+)$/m)
    return {
      iconFile: iconMatch?.[1]?.trim() ?? '',
      url: urlMatch?.[1]?.trim() ?? '',
    }
  } catch {
    return { iconFile: '', url: '' }
  }
}

function resolveLinuxIcon(iconName) {
  if (!iconName) {
    return null
  }

  if (iconName.startsWith('/')) {
    return fs.existsSync(iconName) ? fileToDataUrl(iconName) : null
  }

  const iconDirs = [
    '/usr/share/icons/hicolor/256x256/apps',
    '/usr/share/icons/hicolor/128x128/apps',
    '/usr/share/icons/hicolor/64x64/apps',
    '/usr/share/pixmaps',
    path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps'),
  ]

  for (const dir of iconDirs) {
    for (const extension of ['.png', '.svg', '.xpm']) {
      const candidate = path.join(dir, `${iconName}${extension}`)
      if (fs.existsSync(candidate)) {
        return extension === '.xpm' ? null : fileToDataUrl(candidate)
      }
    }
  }

  return null
}

function resolveMacIcon(appPath) {
  try {
    const resourcesDir = path.join(appPath, 'Contents', 'Resources')
    const candidates = safeReadDir(resourcesDir)
      .filter((entry) => !entry.isDirectory())
      .map((entry) => path.join(resourcesDir, entry.name))
      .filter((filePath) => /\.(png|jpg|jpeg|svg)$/i.test(filePath))

    return candidates.length ? fileToDataUrl(candidates[0]) : null
  } catch {
    return null
  }
}

async function getWindowsApps() {
  const locations = [
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ]

  const apps = []
  for (const location of locations) {
    for (const filePath of walkFiles(location, 3)) {
      const extension = path.extname(filePath).toLowerCase()
      if (!['.lnk', '.url', '.exe'].includes(extension)) {
        continue
      }

      const name = path.basename(filePath, extension).replace(/[-_]+/g, ' ').trim()
      if (!name || /uninstall|desinstalar|remove|repair|update/i.test(name)) {
        continue
      }

      apps.push({
        id: Buffer.from(filePath).toString('base64url'),
        name,
        target: filePath,
        launchTarget: filePath,
        source: 'start-menu',
        icon: null,
      })
    }
  }

  const portableDirs = [
    { dir: path.join(process.env.USERPROFILE ?? os.homedir(), 'Desktop'), depth: 2, source: 'desktop-portable' },
    { dir: path.join(process.env.USERPROFILE ?? os.homedir(), 'Downloads'), depth: 2, source: 'downloads-portable' },
    { dir: process.env.ProgramFiles ?? 'C:\\Program Files', depth: 2, source: 'program-files' },
    { dir: process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', depth: 2, source: 'program-files-x86' },
  ]

  for (const location of portableDirs) {
    if (!location.dir || !fs.existsSync(location.dir)) {
      continue
    }

    for (const filePath of walkFiles(location.dir, location.depth)) {
      if (path.extname(filePath).toLowerCase() !== '.exe') {
        continue
      }

      const normalizedPath = filePath.toLowerCase()
      if (
        normalizedPath.includes('\\windows\\') ||
        normalizedPath.includes('\\microsoft\\edge\\') ||
        normalizedPath.includes('\\windowsapps\\')
      ) {
        continue
      }

      const name = path.basename(filePath, '.exe').replace(/[-_]+/g, ' ').trim()
      if (!name || /uninstall|desinstalar|remove|repair|update|setup|install|helper|crash/i.test(name)) {
        continue
      }

      apps.push({
        id: Buffer.from(`exe:${filePath}`).toString('base64url'),
        name,
        target: filePath,
        launchTarget: filePath,
        source: location.source,
        icon: null,
      })
    }
  }

  const baseApps = uniqueApps(apps).slice(0, 120)
  const enrichedApps = await Promise.all(
    baseApps.map(async (app, index) => {
      if (index >= 24) {
        return app
      }

      const extension = path.extname(app.target).toLowerCase()
      try {
        if (extension === '.lnk') {
          const shortcut = await withTimeout(resolveWindowsShortcut(app.target), 350)
          const target = shortcut?.TargetPath || app.target
          const icon = await withTimeout(extractWindowsIconData(target, shortcut?.IconLocation ?? ''), 350)
          return { ...app, target, launchTarget: app.target, icon }
        }

        if (extension === '.url') {
          const shortcut = parseInternetShortcut(app.target)
          const target = shortcut.url || app.target
          const icon = shortcut.iconFile
            ? await withTimeout(extractWindowsIconData(target, shortcut.iconFile), 350)
            : null
          return { ...app, target, launchTarget: target, icon }
        }

        if (extension === '.exe') {
          const icon = await withTimeout(extractWindowsIconData(app.target), 350)
          return { ...app, launchTarget: app.target, icon }
        }
      } catch {
        return app
      }

      return app
    }),
  )

  return enrichedApps
}

function getWindowsAppsFallback() {
  const locations = [
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ]

  const apps = []
  for (const location of locations) {
    for (const filePath of walkFiles(location, 3)) {
      const extension = path.extname(filePath).toLowerCase()
      if (!['.lnk', '.url', '.exe'].includes(extension)) {
        continue
      }

      const name = path.basename(filePath, extension).replace(/[-_]+/g, ' ').trim()
      if (!name || /uninstall|desinstalar|remove|repair|update/i.test(name)) {
        continue
      }

      apps.push({
        id: Buffer.from(filePath).toString('base64url'),
        name,
        target: filePath,
        launchTarget: filePath,
        source: 'start-menu',
        icon: null,
      })
    }
  }

  return uniqueApps(apps).slice(0, 120)
}

function getMacApps() {
  const locations = ['/Applications', path.join(os.homedir(), 'Applications')]
  const apps = []

  for (const location of locations) {
    for (const entry of safeReadDir(location)) {
      if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
        continue
      }

      const fullPath = path.join(location, entry.name)
      apps.push({
        id: Buffer.from(fullPath).toString('base64url'),
        name: entry.name.replace(/\.app$/i, ''),
        target: fullPath,
        launchTarget: fullPath,
        source: 'applications',
        icon: resolveMacIcon(fullPath),
      })
    }
  }

  return uniqueApps(apps).slice(0, 120)
}

function getLinuxApps() {
  const locations = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    path.join(os.homedir(), '.local', 'share', 'applications'),
  ]
  const apps = []

  for (const location of locations) {
    for (const filePath of walkFiles(location, 1)) {
      if (!filePath.endsWith('.desktop')) {
        continue
      }

      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const nameMatch = content.match(/^Name=(.+)$/m)
        const execMatch = content.match(/^Exec=(.+)$/m)
        if (!nameMatch || !execMatch) {
          continue
        }
        const iconMatch = content.match(/^Icon=(.+)$/m)

        apps.push({
          id: Buffer.from(filePath).toString('base64url'),
          name: nameMatch[1].trim(),
          target: normalizeExecTarget(execMatch[1].trim()),
          launchTarget: filePath,
          source: 'desktop-entry',
          icon: resolveLinuxIcon(iconMatch?.[1]?.trim() ?? ''),
        })
      } catch {
        continue
      }
    }
  }

  return uniqueApps(apps).slice(0, 120)
}

export async function getInstalledApps() {
  return getCachedValue(appsCache, APPS_CACHE_TTL_MS, async () => {
    switch (process.platform) {
      case 'win32':
        try {
          const apps = await getWindowsApps()
          return apps.length > 0 ? apps : getWindowsAppsFallback()
        } catch {
          return getWindowsAppsFallback()
        }
      case 'darwin':
        return getMacApps()
      default:
        return getLinuxApps()
    }
  })
}

function normalizeVolumePath(target) {
  if (!target || typeof target !== 'string') {
    return ''
  }

  if (process.platform === 'win32') {
    const trimmed = target.trim()
    if (/^[a-zA-Z]:$/.test(trimmed)) {
      return `${trimmed}\\`
    }
    return trimmed
  }

  return target.trim()
}

export async function listVolumeEntries(target) {
  const volumePath = normalizeVolumePath(target)
  if (!volumePath) {
    return []
  }

  try {
    return safeReadDir(volumePath)
      .map((entry) => {
        const fullPath = path.join(volumePath, entry.name)
        let sizeBytes = null

        if (!entry.isDirectory()) {
          try {
            sizeBytes = fs.statSync(fullPath).size
          } catch {
            sizeBytes = null
          }
        }

        return {
          name: entry.name,
          path: fullPath,
          kind: entry.isDirectory() ? 'directory' : 'file',
          extension: entry.isDirectory() ? '' : path.extname(entry.name).toLowerCase(),
          sizeBytes,
        }
      })
      .sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === 'directory' ? -1 : 1
        }
        return left.name.localeCompare(right.name)
      })
      .slice(0, 200)
  } catch {
    return []
  }
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', () => resolve(output))
    child.on('error', () => resolve(''))
  })
}

async function getVolumes() {
  if (process.platform === 'win32') {
    const output = await runCommand('powershell.exe', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_LogicalDisk | Where-Object { ($_.DriveType -eq 2 -or $_.DriveType -eq 3) -and $_.DeviceID -and $_.Size } | Select-Object DeviceID,VolumeName,Size,FreeSpace,DriveType | Sort-Object DeviceID | ConvertTo-Json -Compress",
    ])

    try {
      const raw = JSON.parse(output)
      const items = Array.isArray(raw) ? raw : [raw]
      return items.map((item) => ({
        name: item.VolumeName || (item.DriveType === 2 ? `Unidad extraible ${item.DeviceID}` : `Disco local ${item.DeviceID}`),
        mount: `${item.DeviceID}\\`,
        totalGb: toGb(Number(item.Size)),
        freeGb: toGb(Number(item.FreeSpace)),
        kind: item.DriveType === 2 ? 'external' : 'internal',
      }))
    } catch {
      return []
    }
  }

  const output = await runCommand('df', ['-kP'])
  const lines = output.split('\n').slice(1).filter(Boolean)
  return lines.map((line) => {
    const parts = line.trim().split(/\s+/)
    return {
      name: parts[0] || 'disk',
      mount: parts[5] || '/',
      totalGb: (Number(parts[1] || 0) / 1024 / 1024).toFixed(1),
      freeGb: (Number(parts[3] || 0) / 1024 / 1024).toFixed(1),
      kind: 'internal',
    }
  })
}

export async function getDeviceInfo() {
  return getCachedValue(deviceInfoCache, DEVICE_INFO_CACHE_TTL_MS, async () => {
    const cpus = os.cpus()
    return {
      hostname: os.hostname(),
      osName: os.platform() === 'win32' ? 'Windows' : os.platform() === 'darwin' ? 'macOS' : 'Linux',
      platform: os.platform(),
      release: os.release(),
      version: os.version(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? 'Unknown CPU',
      cpuCount: cpus.length,
      totalMemoryGb: toGb(os.totalmem()),
      freeMemoryGb: toGb(os.freemem()),
      uptimeHours: (os.uptime() / 3600).toFixed(1),
      homeDir: os.homedir(),
      userName: os.userInfo().username,
      volumes: await getVolumes(),
    }
  })
}

async function getWindowsBrightness() {
  const output = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1 -ExpandProperty CurrentBrightness)",
  ])
  const value = Number(output.trim())
  return Number.isFinite(value) ? clampControl(value) : null
}

async function setWindowsBrightness(value) {
  const output = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods | Select-Object -First 1).WmiSetBrightness(1, ${clampControl(value)})`,
  ])
  return output
}

async function getWindowsVolume() {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
  int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
  int VolumeStepUp(Guid pguidEventContext);
  int VolumeStepDown(Guid pguidEventContext);
  int QueryHardwareSupport(out uint pdwHardwareSupportMask);
  int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume aev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}
public class Audio {
  public static float GetMasterVolume() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice device;
    enumerator.GetDefaultAudioEndpoint(0, 1, out device);
    Guid guid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume volume;
    device.Activate(ref guid, 23, IntPtr.Zero, out volume);
    float level;
    volume.GetMasterVolumeLevelScalar(out level);
    return level;
  }
  public static void SetMasterVolume(float value) {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice device;
    enumerator.GetDefaultAudioEndpoint(0, 1, out device);
    Guid guid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume volume;
    device.Activate(ref guid, 23, IntPtr.Zero, out volume);
    volume.SetMasterVolumeLevelScalar(value, Guid.Empty);
  }
}
"@
[Math]::Round([Audio]::GetMasterVolume() * 100)
`
  const output = await runCommand('powershell.exe', ['-NoProfile', '-Command', script])
  const value = Number(output.trim())
  return Number.isFinite(value) ? clampControl(value) : null
}

async function setWindowsVolume(value) {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
  int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
  int VolumeStepUp(Guid pguidEventContext);
  int VolumeStepDown(Guid pguidEventContext);
  int QueryHardwareSupport(out uint pdwHardwareSupportMask);
  int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume aev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}
public class Audio {
  public static void SetMasterVolume(float value) {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice device;
    enumerator.GetDefaultAudioEndpoint(0, 1, out device);
    Guid guid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume volume;
    device.Activate(ref guid, 23, IntPtr.Zero, out volume);
    volume.SetMasterVolumeLevelScalar(value, Guid.Empty);
  }
}
"@
[Audio]::SetMasterVolume(${clampControl(value)} / 100)
`
  const output = await runCommand('powershell.exe', ['-NoProfile', '-Command', script])
  return output
}

function clampControl(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

export async function getSystemControls() {
  return getCachedValue(systemControlsCache, SYSTEM_CONTROLS_CACHE_TTL_MS, async () => {
    if (process.platform === 'win32') {
      const [brightness, volume] = await Promise.all([
        getWindowsBrightness().catch(() => null),
        getWindowsVolume().catch(() => null),
      ])
      return {
        brightness: brightness ?? 70,
        volume: volume ?? 50,
        supportsBrightness: brightness !== null,
        supportsVolume: volume !== null,
      }
    }

    return {
      brightness: 70,
      volume: 50,
      supportsBrightness: false,
      supportsVolume: false,
    }
  })
}

export async function setSystemControls(nextControls) {
  const brightness = clampControl(nextControls?.brightness)
  const volume = clampControl(nextControls?.volume)

  if (process.platform === 'win32') {
    await Promise.all([
      nextControls?.brightness !== undefined ? setWindowsBrightness(brightness).catch(() => null) : Promise.resolve(),
      nextControls?.volume !== undefined ? setWindowsVolume(volume).catch(() => null) : Promise.resolve(),
    ])
  }

  systemControlsCache.expiresAt = 0
  systemControlsCache.value = undefined
  return getSystemControls()
}

export async function launchApp(target) {
  if (!target || typeof target !== 'string') {
    return { ok: false, error: 'No se recibio una ruta valida para abrir.' }
  }

  if (/^https?:\/\//i.test(target)) {
    await shell.openExternal(target)
    return { ok: true, error: null }
  }

  if (process.platform === 'win32') {
    if (!fs.existsSync(target)) {
      return { ok: false, error: `La ruta no existe o no esta disponible: ${target}` }
    }

    const error = await shell.openPath(target)
    return {
      ok: !error,
      error: error || null,
    }
  }

  if (process.platform === 'darwin') {
    spawn('open', [target], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true, error: null }
  }

  const linuxTarget = target.startsWith('/') ? target : normalizeExecTarget(target).split(' ')[0]
  spawn('xdg-open', [linuxTarget], { detached: true, stdio: 'ignore' }).unref()
  return { ok: true, error: null }
}

export async function executeTerminalCommand(command, cwd) {
  return new Promise((resolve) => {
    const child =
      process.platform === 'win32'
        ? spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `[Console]::InputEncoding=[System.Text.Encoding]::UTF8; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; chcp 65001 > $null; ${command}`,
            ],
            { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
          )
        : spawn(process.platform === 'darwin' ? 'zsh' : 'bash', ['-lc', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    child.on('close', (code) => {
      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: code ?? 0,
      })
    })

    child.on('error', (error) => {
      resolve({
        stdout: '',
        stderr: error.message,
        exitCode: 1,
      })
    })
  })
}

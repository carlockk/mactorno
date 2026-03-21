import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'

type DeviceInfo = {
  hostname: string
  osName: string
  platform: NodeJS.Platform
  release: string
  version: string
  arch: string
  cpuModel: string
  cpuCount: number
  totalMemoryGb: string
  freeMemoryGb: string
  uptimeHours: string
  homeDir: string
  userName: string
  userAvatar: string | null
  volumes: Array<{
    name: string
    mount: string
    totalGb: string
    freeGb: string
    kind: 'internal' | 'external'
  }>
}

type InstalledApp = {
  id: string
  name: string
  target: string
  source: string
  icon?: string | null
}

type CacheEntry<T> = {
  expiresAt: number
  value?: T
  pending?: Promise<T>
}

const APPS_CACHE_TTL_MS = 5 * 60 * 1000
const DEVICE_INFO_CACHE_TTL_MS = 15 * 1000
const SYSTEM_CONTROLS_CACHE_TTL_MS = 5 * 1000

const appsCache: CacheEntry<InstalledApp[]> = { expiresAt: 0 }
const deviceInfoCache: CacheEntry<DeviceInfo> = { expiresAt: 0 }
const systemControlsCache: CacheEntry<{
  brightness: number
  volume: number
  supportsBrightness: boolean
  supportsVolume: boolean
}> = { expiresAt: 0 }

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function getCachedValue<T>(cache: CacheEntry<T>, ttlMs: number, loader: () => Promise<T>) {
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

function toGb(value: number) {
  return (value / 1024 / 1024 / 1024).toFixed(1)
}

function safeReadDir(dirPath: string) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
}

function walkFiles(dirPath: string, maxDepth: number, result: string[] = [], depth = 0) {
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

function uniqueApps(items: InstalledApp[]) {
  const map = new Map<string, InstalledApp>()
  for (const item of items) {
    const key = `${item.name.toLowerCase()}::${item.target.toLowerCase()}`
    if (!map.has(key)) {
      map.set(key, item)
    }
  }
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeExecTarget(value: string) {
  return value
    .replace(/%.?/g, '')
    .replace(/--[\w-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fileToDataUrl(filePath: string) {
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

    return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`
  } catch {
    return null
  }
}

async function resolveWindowsShortcut(filePath: string) {
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
    return JSON.parse(output) as { TargetPath?: string; IconLocation?: string }
  } catch {
    return null
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T | null = null) {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T | null>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function extractWindowsIconData(targetPath: string, iconLocation = '') {
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

function parseInternetShortcut(filePath: string) {
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

function resolveLinuxIcon(iconName: string) {
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

function resolveMacIcon(appPath: string) {
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

async function resolveWindowsUserAvatar() {
  const registryOutput = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    "$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $key = \"HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AccountPicture\\Users\\$sid\"; if (Test-Path $key) { $props = Get-ItemProperty -Path $key; $candidates = @($props.Image1080,$props.Image448,$props.Image424,$props.Image240,$props.Image208,$props.Image192,$props.Image96,$props.Image64,$props.Image48,$props.Image40,$props.Image32) | Where-Object { $_ -and (Test-Path $_) }; if ($candidates.Count -gt 0) { $candidates[0] } }",
  ])
  const registryPath = registryOutput.trim()
  if (registryPath && fs.existsSync(registryPath)) {
    return fileToDataUrl(registryPath)
  }

  const homeDir = os.homedir()
  const candidates = [
    path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'AccountPictures'),
    path.join(homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'AccountPictures'),
    path.join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'AccountPictures'),
  ]

  for (const dir of candidates) {
    if (!dir || !fs.existsSync(dir)) {
      continue
    }

    const files = safeReadDir(dir)
      .filter((entry) => !entry.isDirectory() && /\.(png|jpg|jpeg|bmp)$/i.test(entry.name))
      .map((entry) => path.join(dir, entry.name))
      .sort((left, right) => {
        try {
          return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs
        } catch {
          return 0
        }
      })

    if (files[0]) {
      return fileToDataUrl(files[0])
    }
  }

  return null
}

function resolveMacUserAvatar() {
  const homeDir = os.homedir()
  const candidates = [
    path.join(homeDir, 'Library', 'Images', 'Profile Pictures'),
    '/Library/User Pictures',
  ]

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue
    }

    const files = walkFiles(candidate, 2).filter((filePath) => /\.(png|jpg|jpeg)$/i.test(filePath))
    if (files[0]) {
      return fileToDataUrl(files[0])
    }
  }

  return null
}

function resolveLinuxUserAvatar() {
  const homeDir = os.homedir()
  const candidates = [
    path.join(homeDir, '.face'),
    path.join(homeDir, '.face.icon'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fileToDataUrl(candidate)
    }
  }

  return null
}

async function getUserAvatar() {
  switch (process.platform) {
    case 'win32':
      return resolveWindowsUserAvatar()
    case 'darwin':
      return resolveMacUserAvatar()
    default:
      return resolveLinuxUserAvatar()
  }
}

async function getWindowsApps() {
  const locations = [
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ]

  const apps: InstalledApp[] = []
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
        source: 'start-menu',
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
          return { ...app, target, icon }
        }

        if (extension === '.url') {
          const shortcut = parseInternetShortcut(app.target)
          const target = shortcut.url || app.target
          const icon = shortcut.iconFile
            ? await withTimeout(extractWindowsIconData(target, shortcut.iconFile), 350)
            : null
          return { ...app, target, icon }
        }

        if (extension === '.exe') {
          const icon = await withTimeout(extractWindowsIconData(app.target), 350)
          return { ...app, icon }
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

  const apps: InstalledApp[] = []
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
        source: 'start-menu',
        icon: null,
      })
    }
  }

  return uniqueApps(apps).slice(0, 120)
}

function getMacApps() {
  const locations = ['/Applications', path.join(os.homedir(), 'Applications')]
  const apps: InstalledApp[] = []

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
  const apps: InstalledApp[] = []

  for (const location of locations) {
    for (const filePath of walkFiles(location, 1)) {
      if (!filePath.endsWith('.desktop')) {
        continue
      }

      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const nameMatch = content.match(/^Name=(.+)$/m)
        const execMatch = content.match(/^Exec=(.+)$/m)
        const iconMatch = content.match(/^Icon=(.+)$/m)
        if (!nameMatch || !execMatch) {
          continue
        }

        apps.push({
          id: Buffer.from(filePath).toString('base64url'),
          name: nameMatch[1].trim(),
          target: normalizeExecTarget(execMatch[1].trim()),
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

async function getInstalledApps() {
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

function normalizeVolumePath(target: string) {
  if (!target) {
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

async function listVolumeEntries(target: string) {
  const volumePath = normalizeVolumePath(target)
  if (!volumePath) {
    return []
  }

  try {
    return safeReadDir(volumePath)
      .map((entry) => {
        const fullPath = path.join(volumePath, entry.name)
        let sizeBytes: number | null = null

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

function runCommand(command: string, args: string[]) {
  return new Promise<string>((resolve) => {
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
      const raw = JSON.parse(output) as
        | { DeviceID: string; VolumeName: string; Size: number; FreeSpace: number; DriveType: number }
        | Array<{ DeviceID: string; VolumeName: string; Size: number; FreeSpace: number; DriveType: number }>
      const items = Array.isArray(raw) ? raw : [raw]
      return items.map((item) => ({
        name: item.VolumeName || (item.DriveType === 2 ? `Unidad extraible ${item.DeviceID}` : `Disco local ${item.DeviceID}`),
        mount: `${item.DeviceID}\\`,
        totalGb: toGb(Number(item.Size)),
        freeGb: toGb(Number(item.FreeSpace)),
        kind: item.DriveType === 2 ? ('external' as const) : ('internal' as const),
      }))
    } catch {
      return []
    }
  }

  const output = await runCommand('df', ['-kP'])
  const lines = output.split('\n').slice(1).filter(Boolean)
  return lines.map((line) => {
    const parts = line.trim().split(/\s+/)
    const totalKb = Number(parts[1] || 0)
    const freeKb = Number(parts[3] || 0)
    return {
      name: parts[0] || 'disk',
      mount: parts[5] || '/',
      totalGb: (totalKb / 1024 / 1024).toFixed(1),
      freeGb: (freeKb / 1024 / 1024).toFixed(1),
      kind: 'internal' as const,
    }
  })
}

async function getDeviceInfo(): Promise<DeviceInfo> {
  return getCachedValue(deviceInfoCache, DEVICE_INFO_CACHE_TTL_MS, async () => {
    const cpus = os.cpus()
    const volumes = await getVolumes()
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
      userAvatar: await getUserAvatar(),
      volumes,
    }
  })
}

function clampControl(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
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

async function setWindowsBrightness(value: number) {
  await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods | Select-Object -First 1).WmiSetBrightness(1, ${clampControl(value)})`,
  ])
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
}
"@
[Math]::Round([Audio]::GetMasterVolume() * 100)
`
  const output = await runCommand('powershell.exe', ['-NoProfile', '-Command', script])
  const value = Number(output.trim())
  return Number.isFinite(value) ? clampControl(value) : null
}

async function setWindowsVolume(value: number) {
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
  await runCommand('powershell.exe', ['-NoProfile', '-Command', script])
}

async function getSystemControls() {
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

async function setSystemControls(nextControls: { brightness?: number; volume?: number }) {
  if (process.platform === 'win32') {
    await Promise.all([
      nextControls.brightness !== undefined ? setWindowsBrightness(nextControls.brightness).catch(() => null) : Promise.resolve(),
      nextControls.volume !== undefined ? setWindowsVolume(nextControls.volume).catch(() => null) : Promise.resolve(),
    ])
  }

  systemControlsCache.expiresAt = 0
  systemControlsCache.value = undefined
  return getSystemControls()
}

async function launchApp(target: string) {
  if (process.platform === 'win32') {
    const escapedTarget = target.replace(/"/g, '""')
    const command = target.startsWith('http')
      ? `Start-Process "${escapedTarget}"`
      : `Start-Process -FilePath "${escapedTarget}"`
    spawn('powershell.exe', ['-NoProfile', '-Command', command], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    return
  }

  if (process.platform === 'darwin') {
    spawn('open', [target], { detached: true, stdio: 'ignore' }).unref()
    return
  }

  const linuxTarget = target.startsWith('/') ? target : normalizeExecTarget(target).split(' ')[0]
  spawn('xdg-open', [linuxTarget], { detached: true, stdio: 'ignore' }).unref()
}

async function executeTerminalCommand(command: string, cwd: string) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
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

function parseJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function getMediaContentType(target: string) {
  switch (path.extname(target).toLowerCase()) {
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

function createMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url?.split('?')[0] ?? ''

    if (req.method === 'GET' && url === '/api/device-info') {
      const info = await getDeviceInfo()
      sendJson(res, 200, info)
      return
    }

    if (req.method === 'GET' && url === '/api/apps') {
      sendJson(res, 200, await getInstalledApps())
      return
    }

    if (req.method === 'GET' && url === '/api/volumes/entries') {
      const target = new URL(req.url ?? '', 'http://localhost').searchParams.get('target') ?? ''
      sendJson(res, 200, await listVolumeEntries(target))
      return
    }

    if (req.method === 'GET' && url === '/api/media-file') {
      const target = new URL(req.url ?? '', 'http://localhost').searchParams.get('path') ?? ''
      if (!target || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        res.statusCode = 404
        res.end('Not found')
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', getMediaContentType(target))
      fs.createReadStream(target).pipe(res)
      return
    }

    if (req.method === 'GET' && url === '/api/system-controls') {
      sendJson(res, 200, await getSystemControls())
      return
    }

    if (req.method === 'POST' && url === '/api/system-controls') {
      const body = (await parseJsonBody(req)) as { brightness?: number; volume?: number }
      sendJson(res, 200, await setSystemControls(body))
      return
    }

    if (req.method === 'POST' && url === '/api/apps/launch') {
      const body = (await parseJsonBody(req)) as { target?: string }
      if (!body.target) {
        sendJson(res, 400, { error: 'Missing target' })
        return
      }

      await launchApp(body.target)
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url === '/api/terminal/execute') {
      const body = await parseJsonBody(req) as { command?: string; cwd?: string }
      const result = await executeTerminalCommand(body.command ?? '', body.cwd ?? process.cwd())
      sendJson(res, 200, result)
      return
    }

    next()
  }
}

export function localApiPlugin() {
  return {
    name: 'local-api-plugin',
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(createMiddleware())
    },
  }
}

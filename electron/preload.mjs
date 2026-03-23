import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronDesktop', {
  getDeviceInfo: () => ipcRenderer.invoke('device-info:get'),
  getInstalledApps: () => ipcRenderer.invoke('apps:list'),
  listVolumeEntries: (target) => ipcRenderer.invoke('volumes:list-entries', target),
  getSystemControls: () => ipcRenderer.invoke('system-controls:get'),
  setSystemControls: (payload) => ipcRenderer.invoke('system-controls:set', payload),
  pickMediaFile: (kind) => ipcRenderer.invoke('media:pick-file', kind),
  revealPath: (target) => ipcRenderer.invoke('path:reveal', target),
  executeTerminalCommand: (payload) => ipcRenderer.invoke('terminal:execute', payload),
  launchApp: (target) => ipcRenderer.invoke('apps:launch', target),
  quitApp: () => ipcRenderer.invoke('window:quit'),
  reloadApp: () => ipcRenderer.invoke('window:reload'),
  onBrowserSyncRequest: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('desktop:request-browser-sync', handler)
    return () => ipcRenderer.removeListener('desktop:request-browser-sync', handler)
  },
  onBrowserState: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('browser:state', handler)
    return () => ipcRenderer.removeListener('browser:state', handler)
  },
  browser: {
    syncHost: (payload) => ipcRenderer.send('browser:sync-host', payload),
    navigate: (url) => ipcRenderer.send('browser:navigate', url),
    goBack: () => ipcRenderer.send('browser:go-back'),
    goForward: () => ipcRenderer.send('browser:go-forward'),
    reload: () => ipcRenderer.send('browser:reload'),
    setAppearance: (mode) => ipcRenderer.send('browser:set-appearance', mode),
    openExternal: (url) => ipcRenderer.send('browser:open-external', url),
    hide: () => ipcRenderer.send('browser:hide'),
  },
})

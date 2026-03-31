import { useEffect, useMemo, useState } from 'react'
import { DESKTOP_ITEMS_STORAGE_KEY, DESKTOP_TRASH_POSITION_STORAGE_KEY } from '../constants'
import { getDesktopFolderIdFromRoute, getVolumePathFromRoute } from '../helpers'
import type { DesktopClipboardState, DesktopItem, WindowState } from '../types'

function loadDesktopItems() {
  if (typeof window === 'undefined') {
    return [] as DesktopItem[]
  }

  try {
    const raw = window.localStorage.getItem(DESKTOP_ITEMS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as DesktopItem[] : []
    return Array.isArray(parsed)
      ? parsed.map((item) => ({
          ...item,
          sourcePath: typeof item.sourcePath === 'string' ? item.sourcePath : null,
          extension: typeof item.extension === 'string' ? item.extension : '',
          iconDataUrl: typeof item.iconDataUrl === 'string' ? item.iconDataUrl : null,
          trashedAt: typeof item.trashedAt === 'number' ? item.trashedAt : null,
        }))
      : []
  } catch {
    return []
  }
}

function loadDesktopTrashPosition() {
  if (typeof window === 'undefined') {
    return null as { x: number; y: number } | null
  }

  try {
    const raw = window.localStorage.getItem(DESKTOP_TRASH_POSITION_STORAGE_KEY)
    return raw ? JSON.parse(raw) as { x: number; y: number } : null
  } catch {
    return null
  }
}

export function useFinder({ windows }: { windows: WindowState[] }) {
  const [desktopItems, setDesktopItems] = useState<DesktopItem[]>(() => loadDesktopItems())
  const [desktopTrashPosition, setDesktopTrashPosition] = useState<{ x: number; y: number } | null>(() => loadDesktopTrashPosition())
  const [desktopClipboard, setDesktopClipboard] = useState<DesktopClipboardState>(null)
  const [editingDesktopItemId, setEditingDesktopItemId] = useState<string | null>(null)
  const [editingDesktopItemName, setEditingDesktopItemName] = useState('')

  useEffect(() => {
    window.localStorage.setItem(DESKTOP_ITEMS_STORAGE_KEY, JSON.stringify(desktopItems))
  }, [desktopItems])

  useEffect(() => {
    if (desktopTrashPosition) {
      window.localStorage.setItem(DESKTOP_TRASH_POSITION_STORAGE_KEY, JSON.stringify(desktopTrashPosition))
    }
  }, [desktopTrashPosition])

  const rootDesktopItems = useMemo(
    () => desktopItems.filter((item) => item.parentId === null && item.trashedAt === null),
    [desktopItems],
  )

  const trashItems = useMemo(() => {
    const trashed = desktopItems.filter((item) => item.trashedAt !== null)
    const trashedIds = new Set(trashed.map((item) => item.id))
    return trashed.filter((item) => !item.parentId || !trashedIds.has(item.parentId))
  }, [desktopItems])

  const hasApplicationsFinderOpen = useMemo(
    () => windows.some((item) => item.appId === 'finder' && item.finderState && item.finderState.tabs.some((tab) => tab.id === item.finderState?.activeTabId && tab.history[tab.historyIndex] === 'applications')),
    [windows],
  )

  const progressiveEntryPaths = useMemo(
    () =>
      [...new Set(
        windows
          .filter((item) => item.appId === 'finder' && !item.minimized && item.finderState)
          .map((item) => {
            const activeTab = item.finderState?.tabs.find((tab) => tab.id === item.finderState?.activeTabId) ?? item.finderState?.tabs[0]
            const activeRoute = activeTab ? activeTab.history[activeTab.historyIndex] : 'computer'
            const desktopFolderId = getDesktopFolderIdFromRoute(activeRoute)
            const desktopFolder = desktopFolderId
              ? desktopItems.find((entry) => entry.id === desktopFolderId && entry.kind === 'folder') ?? null
              : null
            return desktopFolder?.sourcePath ?? getVolumePathFromRoute(activeRoute)
          })
          .filter((path): path is string => !!path),
      )],
    [desktopItems, windows],
  )

  return {
    desktopClipboard,
    desktopItems,
    desktopTrashPosition,
    editingDesktopItemId,
    editingDesktopItemName,
    hasApplicationsFinderOpen,
    progressiveEntryPaths,
    rootDesktopItems,
    setDesktopClipboard,
    setDesktopItems,
    setDesktopTrashPosition,
    setEditingDesktopItemId,
    setEditingDesktopItemName,
    trashItems,
  }
}

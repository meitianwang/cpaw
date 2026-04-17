import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { showMainWindow, getMainWindow } from './window.js'
import type { SettingsStore } from './settings-store.js'

const APP_ROOT = join(__dirname, '../..')

// Tray menu translations — kept minimal and in sync with renderer i18n.js
// (main process can't read renderer i18n module directly).
const TRAY_I18N = {
  en: { new_chat: 'New Chat', show_app: 'Show Klaus', settings: 'Settings', quit: 'Quit' },
  zh: { new_chat: '新对话', show_app: '显示 Klaus', settings: '设置', quit: '退出' },
} as const

let tray: Tray | null = null
let currentStore: SettingsStore | null = null

function currentLang(): keyof typeof TRAY_I18N {
  const lang = currentStore?.get('language')
  return lang === 'zh' ? 'zh' : 'en'
}

function buildMenu(): Menu {
  const t = TRAY_I18N[currentLang()]
  return Menu.buildFromTemplate([
    { label: t.new_chat, click: () => {
      showMainWindow()
      getMainWindow()?.webContents.send('tray:new-chat')
    }},
    { label: t.show_app, click: showMainWindow },
    { type: 'separator' },
    { label: t.settings, click: () => {
      showMainWindow()
      getMainWindow()?.webContents.send('tray:open-settings')
    }},
    { type: 'separator' },
    { label: t.quit, click: () => app.quit() },
  ])
}

export function createTray(store?: SettingsStore): void {
  currentStore = store ?? null
  const iconPath = join(APP_ROOT, 'resources/tray-icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
    icon.setTemplateImage(true)
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Klaus')
  tray.setContextMenu(buildMenu())
  tray.on('click', showMainWindow)
}

// Called after language switch in settings — rebuild menu labels live.
export function rebuildTrayMenu(): void {
  if (tray) tray.setContextMenu(buildMenu())
}

import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    title: 'PLC UML Generator',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function buildMenu(win: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('menu-new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu-open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu-save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('menu-save-as') },
        { type: 'separator' },
        { label: 'Print Report…', accelerator: 'CmdOrCtrl+P', click: () => win.webContents.send('menu-print-report') },
        { label: 'Export to Excel…', accelerator: 'CmdOrCtrl+Shift+E', click: () => win.webContents.send('menu-export-excel') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('menu-undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: () => win.webContents.send('menu-redo') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => win.webContents.send('menu-select-all') },
        { label: 'Delete Selected', accelerator: 'Delete', click: () => win.webContents.send('menu-delete') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Fit to Screen', accelerator: 'CmdOrCtrl+Shift+F', click: () => win.webContents.send('menu-fit') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.plc.uml-generator')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const win = createWindow()
  buildMenu(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('dialog:save', async (_, { content, defaultName }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName ?? 'diagram.plcd',
    filters: [{ name: 'PLC Diagram', extensions: ['plcd'] }]
  })
  if (!filePath) return { success: false }
  writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8')
  return { success: true, filePath }
})

ipcMain.handle('dialog:open', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    filters: [{ name: 'PLC Diagram', extensions: ['plcd'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return { success: false }
  const raw = readFileSync(filePaths[0], 'utf-8')
  return { success: true, content: JSON.parse(raw), filePath: filePaths[0] }
})

// ── Global Interface Library ─────────────────────────────────────────────────

const LIBRARY_FILE = join(app.getPath('userData'), 'interface-library.json')

ipcMain.handle('library:load', () => {
  try {
    if (!existsSync(LIBRARY_FILE)) return []
    return JSON.parse(readFileSync(LIBRARY_FILE, 'utf-8'))
  } catch { return [] }
})

ipcMain.handle('library:save', (_, items) => {
  writeFileSync(LIBRARY_FILE, JSON.stringify(items, null, 2), 'utf-8')
  return true
})

ipcMain.handle('dialog:import-interfaces', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    filters: [{ name: 'PLC Interface File', extensions: ['plci'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return null
  const raw = readFileSync(filePaths[0], 'utf-8')
  return JSON.parse(raw)
})

ipcMain.handle('dialog:export-interfaces', async (_, { items, defaultName }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName ?? 'interfaces.plci',
    filters: [{ name: 'PLC Interface File', extensions: ['plci'] }]
  })
  if (!filePath) return false
  writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8')
  return true
})

// ── Export to Excel ──────────────────────────────────────────────────────────

ipcMain.handle('dialog:export-excel', async (_, { base64, defaultName }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName ?? 'export.xlsx',
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  })
  if (!filePath) return { success: false }
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return { success: true, filePath }
})

// ── Print report ─────────────────────────────────────────────────────────────

ipcMain.handle('print:report', async (_, { html, defaultName }) => {
  const tmpPath = join(tmpdir(), `plc-report-${Date.now()}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  const printWin = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    webPreferences: { sandbox: false }
  })

  await printWin.loadFile(tmpPath)

  // Wait for Chromium to finish layout (fonts, flexbox, page-break calculations)
  await printWin.webContents.executeJavaScript(
    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
  )

  try {
    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      pageSize: 'A4',
      landscape: false
    })

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName ?? 'report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (filePath) {
      writeFileSync(filePath, pdfBuffer)
      return { success: true, filePath }
    }
    return { success: false }
  } finally {
    printWin.close()
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
  }
})

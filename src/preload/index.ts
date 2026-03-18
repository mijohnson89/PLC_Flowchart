import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // File operations
  saveFile: (content: unknown, defaultName?: string) =>
    ipcRenderer.invoke('dialog:save', { content, defaultName }),
  openFile: () => ipcRenderer.invoke('dialog:open'),
  exportImage: (ext: string) => ipcRenderer.invoke('dialog:export-image', { ext }),
  writeFile: (filePath: string, data: string, encoding?: string) =>
    ipcRenderer.invoke('fs:write', { filePath, data, encoding }),

  // Menu events (main -> renderer)
  onMenu: (channel: string, cb: () => void) => {
    const validChannels = [
      'menu-new', 'menu-open', 'menu-save', 'menu-save-as',
      'menu-export-png', 'menu-export-svg', 'menu-export-pdf', 'menu-print-pdf',
      'menu-undo', 'menu-redo', 'menu-delete', 'menu-fit', 'menu-select-all'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, cb)
      return () => ipcRenderer.removeListener(channel, cb)
    }
    return () => {}
  }
})

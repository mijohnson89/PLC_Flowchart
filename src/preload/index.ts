import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // File operations
  saveFile: (content: unknown, defaultName?: string) =>
    ipcRenderer.invoke('dialog:save', { content, defaultName }),
  openFile: () => ipcRenderer.invoke('dialog:open'),
  printReport: (html: string, defaultName?: string) =>
    ipcRenderer.invoke('print:report', { html, defaultName }),

  // Global Interface Library
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: (items: unknown) => ipcRenderer.invoke('library:save', items),
  importInterfaces: () => ipcRenderer.invoke('dialog:import-interfaces'),
  exportInterfaces: (items: unknown, defaultName?: string) =>
    ipcRenderer.invoke('dialog:export-interfaces', { items, defaultName }),

  // Export to Excel
  exportExcel: (base64: string, defaultName?: string) =>
    ipcRenderer.invoke('dialog:export-excel', { base64, defaultName }),

  // Notes companion-file operations
  importNoteFile: (projectPath?: string) =>
    ipcRenderer.invoke('notes:import-file', { projectPath }),
  openNoteFile: (relativePath: string, projectPath?: string) =>
    ipcRenderer.invoke('notes:open-file', { relativePath, projectPath }),
  deleteNoteFile: (relativePath: string, projectPath?: string) =>
    ipcRenderer.invoke('notes:delete-file', { relativePath, projectPath }),

  // Menu events (main -> renderer)
  onMenu: (channel: string, cb: () => void) => {
    const validChannels = [
      'menu-new', 'menu-open', 'menu-save', 'menu-save-as',
      'menu-print-report', 'menu-export-excel',
      'menu-undo', 'menu-redo', 'menu-delete', 'menu-fit', 'menu-select-all'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, cb)
      return () => ipcRenderer.removeListener(channel, cb)
    }
    return () => {}
  }
})

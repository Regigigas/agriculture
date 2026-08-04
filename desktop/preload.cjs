const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('agricultureDesktop', Object.freeze({
  isDesktop: true,
  apiBaseUrl: process.env.AGRI_API_BASE_URL || 'http://127.0.0.1:3100/api',
  getLocalAdminPassword: () => ipcRenderer.invoke('local-admin-password'),
  openCorrectionWindow: (contextRoute = '') => ipcRenderer.invoke('open-correction-window', contextRoute),
  selectManagedDocument: () => ipcRenderer.invoke('select-managed-document'),
  openManagedDocument: (filePath) => ipcRenderer.invoke('open-managed-document', filePath),
  onCorrectionContext: (listener) => {
    const handler = (_event, contextRoute) => listener(contextRoute)
    ipcRenderer.on('correction-context', handler)
    return () => ipcRenderer.removeListener('correction-context', handler)
  },
  platform: process.platform,
}))

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('agricultureDesktop', Object.freeze({
  isDesktop: true,
  apiBaseUrl: process.env.AGRI_API_BASE_URL || 'http://127.0.0.1:3100/api',
  getCloudSyncConfig: (accessToken) => ipcRenderer.invoke('cloud-sync-config', accessToken),
  setCloudSyncConfig: (accessToken, input) => ipcRenderer.invoke('set-cloud-sync-config', accessToken, input),
  openCorrectionWindow: (contextRoute = '') => ipcRenderer.invoke('open-correction-window', contextRoute),
  selectManagedDocument: () => ipcRenderer.invoke('select-managed-document'),
  openManagedDocument: (filePath) => ipcRenderer.invoke('open-managed-document', filePath),
  selectLocalDataFile: (accessToken) => ipcRenderer.invoke('select-local-data-file', accessToken),
  getCustomBackupConfig: (accessToken) => ipcRenderer.invoke('custom-backup-config', accessToken),
  selectCustomBackupDirectory: (accessToken) => ipcRenderer.invoke('select-custom-backup-directory', accessToken),
  backupToCustomDirectory: (accessToken) => ipcRenderer.invoke('backup-to-custom-directory', accessToken),
  exportBackup: (accessToken, name) => ipcRenderer.invoke('export-backup', accessToken, name),
  restoreBackup: (input) => ipcRenderer.invoke('restore-backup', input),
  openBackupDirectory: (accessToken) => ipcRenderer.invoke('open-backup-directory', accessToken),
  getDesktopUpdateState: (accessToken) => ipcRenderer.invoke('desktop-update-state', accessToken),
  checkDesktopUpdate: (accessToken) => ipcRenderer.invoke('check-desktop-update', accessToken),
  downloadDesktopUpdate: (accessToken) => ipcRenderer.invoke('download-desktop-update', accessToken),
  installDesktopUpdate: (accessToken) => ipcRenderer.invoke('install-desktop-update', accessToken),
  onDesktopUpdateState: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('desktop-update-state', handler)
    return () => ipcRenderer.removeListener('desktop-update-state', handler)
  },
  onCorrectionContext: (listener) => {
    const handler = (_event, contextRoute) => listener(contextRoute)
    ipcRenderer.on('correction-context', handler)
    return () => ipcRenderer.removeListener('correction-context', handler)
  },
  platform: process.platform,
}))

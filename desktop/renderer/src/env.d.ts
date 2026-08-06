/// <reference types="vite/client" />

interface Window {
  agricultureDesktop?: {
    readonly isDesktop: boolean
    readonly apiBaseUrl: string
    getCloudSyncConfig(accessToken: string): Promise<{ url: string; tokenConfigured: boolean }>
    setCloudSyncConfig(accessToken: string, input: { url: string; token: string }): Promise<{ url: string; tokenConfigured: boolean }>
    openCorrectionWindow(contextRoute?: string): Promise<void>
    selectManagedDocument(): Promise<{ canceled: boolean; filePath?: string; fileName?: string }>
    openManagedDocument(filePath: string): Promise<void>
    selectLocalDataFile(accessToken: string): Promise<{ canceled: boolean; importId?: string; fileName?: string; size?: number }>
    getCustomBackupConfig(accessToken: string): Promise<{ directory: string; available: boolean }>
    selectCustomBackupDirectory(accessToken: string): Promise<{ canceled: boolean; directory?: string }>
    backupToCustomDirectory(accessToken: string): Promise<{ name: string; filePath: string; size: number; createdAt: string }>
    openCustomBackupDirectory(accessToken: string): Promise<void>
    exportBackup(accessToken: string, name: string): Promise<{ canceled: boolean; filePath?: string }>
    restoreBackup(input: { name: string; accessToken: string; operationToken: string }): Promise<{ scheduled: boolean }>
    openBackupDirectory(accessToken: string): Promise<void>
    getDesktopUpdateState(accessToken: string): Promise<DesktopUpdateState>
    checkDesktopUpdate(accessToken: string): Promise<DesktopUpdateState>
    downloadDesktopUpdate(accessToken: string): Promise<DesktopUpdateState>
    installDesktopUpdate(accessToken: string): Promise<void>
    onDesktopUpdateState(listener: (state: DesktopUpdateState) => void): () => void
    onCorrectionContext(listener: (contextRoute: string) => void): () => void
    readonly platform: string
  }
}

interface DesktopUpdateState {
  phase: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  version: string
  percent: number
  transferred: number
  total: number
  message: string
  supported: boolean
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

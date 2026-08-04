/// <reference types="vite/client" />

interface Window {
  agricultureDesktop?: {
    readonly isDesktop: boolean
    readonly apiBaseUrl: string
    getLocalAdminPassword(): Promise<string>
    getCloudSyncConfig(): Promise<{ url: string; tokenConfigured: boolean }>
    setCloudSyncConfig(input: { url: string; token: string }): Promise<{ url: string; tokenConfigured: boolean }>
    openCorrectionWindow(contextRoute?: string): Promise<void>
    selectManagedDocument(): Promise<{ canceled: boolean; filePath?: string; fileName?: string }>
    openManagedDocument(filePath: string): Promise<void>
    onCorrectionContext(listener: (contextRoute: string) => void): () => void
    readonly platform: string
  }
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

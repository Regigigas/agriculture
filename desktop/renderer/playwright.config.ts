import { defineConfig } from '@playwright/test';
import { join } from 'path';
import { tmpdir } from 'os';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const reuseExistingServer = !process.env.CI;
const apiPort = process.env.PW_API_PORT || '3100';
const desktopPort = process.env.PW_DESKTOP_PORT || '5173';
const appPort = process.env.PW_APP_PORT || '5175';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;
const desktopUrl = `http://127.0.0.1:${desktopPort}`;
const appUrl = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  webServer: [
    {
      command: `${npm} --prefix ../server run start`,
      url: `${apiBaseUrl}/health`,
      reuseExistingServer,
      timeout: 120_000,
      env: {
        HOST: '127.0.0.1',
        PORT: apiPort,
        ADMIN_PASSWORD: 'admin123',
        AGRI_DATA_DIR: join(tmpdir(), `agriculture-playwright-${process.pid}`),
      },
    },
    {
      command: `${npm} run dev -- --host 127.0.0.1 --port ${desktopPort}`,
      url: desktopUrl,
      reuseExistingServer,
      timeout: 120_000,
      env: { VITE_API_BASE_URL: apiBaseUrl },
    },
    {
      command: `${npm} --prefix ../../APP run dev:h5 -- --host 127.0.0.1 --port ${appPort}`,
      url: appUrl,
      reuseExistingServer,
      timeout: 120_000,
      env: { VITE_API_BASE_URL: apiBaseUrl },
    },
  ],
  use: {
    baseURL: desktopUrl,
    screenshot: 'only-on-failure',
  },
  reporter: 'line',
  timeout: 90_000,
  workers: 1,
});

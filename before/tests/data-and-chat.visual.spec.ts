import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/#/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('admin123');
  await page.getByRole('button', { name: '进入管理平台' }).click();
  await page.waitForURL(/#\/dashboard/);
}

test('管理员可从直达入口创建本机数据库备份', async ({ page }) => {
  await login(page);
  await page.getByText('本地备份与同步', { exact: true }).click();
  await page.waitForURL(/#\/data-security/);
  await expect(page.getByRole('heading', { name: '创建本机数据库备份' })).toBeVisible();
  await expect(page.getByText('E:\\Project\\agriculture', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '创建本机备份' }).click();
  await expect(page.locator('.backup-list')).toContainText('agriculture-');
  await page.setViewportSize({ width: 390, height: 844 });
  const tool = page.locator('.data-tool').filter({ hasText: '选择外部目录并创建镜像备份' });
  const toolBox = await tool.boundingBox();
  const actionsBox = await tool.locator('.custom-backup-actions').boundingBox();
  expect(toolBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  if (toolBox && actionsBox) expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(toolBox.x + toolBox.width + 1);
  await page.goto('/#/operations');
  await page.waitForURL(/#\/operations/);
  await expect(page.locator('.n-tabs-tab--active')).toContainText('风险汇总');
});

test('Electron 聊天可独立切换线上服务并重新登录', async ({ page }) => {
  const failedResponses: Array<{ url: string; status: number }> = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() });
  });
  await login(page);
  await page.goto('/#/communication');
  await page.getByRole('button', { name: '聊天服务' }).click();
  await page.getByRole('button', { name: '线上服务' }).click();
  const apiPort = process.env.PW_API_PORT || '3100';
  await page.getByPlaceholder('https://chat.example.com/api').fill(`http://127.0.0.1:${apiPort}/api`);
  await page.getByRole('button', { name: '保存并切换' }).click();
  await expect(page.getByRole('heading', { name: '登录线上聊天' })).toBeVisible();
  await page.getByPlaceholder('线上账号').fill('admin');
  await page.getByPlaceholder('线上密码').fill('admin123');
  const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: '登录聊天' }).click();
  expect((await loginResponse).status()).toBe(201);
  await expect.poll(() => page.evaluate(() => ({
    token: Boolean(localStorage.getItem('agriculture_desktop_cloud_chat_token')),
    user: Boolean(localStorage.getItem('agriculture_desktop_cloud_chat_user')),
  }))).toEqual({ token: true, user: true });
  await page.waitForTimeout(1000);
  expect({
    failedResponses,
    session: await page.evaluate(() => ({
      token: Boolean(localStorage.getItem('agriculture_desktop_cloud_chat_token')),
      user: Boolean(localStorage.getItem('agriculture_desktop_cloud_chat_user')),
    })),
  }).toEqual({ failedResponses: [], session: { token: true, user: true } });
  await expect(page.getByText('线上聊天', { exact: true })).toBeVisible();
  await expect(page.locator('.communication-workspace')).toBeVisible();
});

test('桌面端挖除作物入口展示完整多重验证', async ({ page }) => {
  await login(page);
  await page.goto('/#/fields');
  await page.getByRole('button', { name: '挖除作物' }).first().click();
  await expect(page.getByText('挖除作物多重验证', { exact: true })).toBeVisible();
  await expect(page.getByText('UPROOT CROP', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '验证并挖除' })).toBeDisabled();
  await page.getByRole('button', { name: '取消' }).last().click();
});

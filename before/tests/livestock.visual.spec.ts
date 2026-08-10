import { expect, test } from '@playwright/test'

test('畜牧养殖中心展示完整业务闭环并可打开新增表单', async ({ page }) => {
  await page.goto('/#/login')
  await page.getByPlaceholder('请输入账号').fill('admin')
  await page.getByPlaceholder('请输入密码').fill('admin123')
  await page.getByRole('button', { name: '进入管理平台' }).click()
  await page.waitForURL(/#\/dashboard/)
  await page.goto('/#/livestock')

  await expect(page.getByRole('heading', { name: '畜牧养殖中心', level: 2 })).toBeVisible()
  await expect(page.locator('.barn-card').getByText('东区育肥牛舍', { exact: true })).toBeVisible()
  await expect(page.getByText('当前存栏', { exact: true })).toBeVisible()
  await expect(page.getByTestId('livestock-3d-scene')).toBeVisible()
  await expect(page.getByText('3D 数字牧场', { exact: true })).toBeVisible()
  await expect(page.getByText('负载率', { exact: true })).toBeVisible()

  await page.locator('.n-tabs-tab').filter({ hasText: '存栏批次' }).click()
  await expect(page.getByText('NC-2026-03', { exact: true })).toBeVisible()
  await expect(page.getByText('西门塔尔杂交牛', { exact: false })).toBeVisible()

  await page.locator('.n-tabs-tab').filter({ hasText: '健康防疫' }).click()
  await expect(page.getByText('口蹄疫疫苗加强免疫', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '登记健康事件' }).click()
  await expect(page.getByText('健康与防疫记录', { exact: true })).toBeVisible()
  await expect(page.getByText('养殖批次', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消' }).last().click()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.n-tabs-tab').filter({ hasText: '圈舍环境' }).click()
  await expect(page.locator('.barn-card').first()).toBeVisible()
})

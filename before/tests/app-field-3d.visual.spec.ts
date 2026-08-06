import { expect, test } from '@playwright/test'
import { join } from 'path'

const appUrl = process.env.APP_VISUAL_URL || `http://127.0.0.1:${process.env.PW_APP_PORT || '5175'}`

async function canvasSignature(page: import('@playwright/test').Page) {
  return page.locator('.scene-host canvas').evaluate((canvas: HTMLCanvasElement) => new Promise<{
    colored: number; checksum: number; width: number; height: number
  }>((resolve) => requestAnimationFrame(() => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!gl) return resolve({ colored: 0, checksum: 0, width: canvas.width, height: canvas.height })
      const width = Math.min(80, canvas.width)
      const height = Math.min(80, canvas.height)
      const pixels = new Uint8Array(width * height * 4)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let colored = 0
      let checksum = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] && (pixels[index] !== pixels[index + 1] || pixels[index + 1] !== pixels[index + 2])) colored += 1
        checksum = (checksum + pixels[index] * 3 + pixels[index + 1] * 5 + pixels[index + 2] * 7) % 2147483647
      }
      resolve({ colored, checksum, width: canvas.width, height: canvas.height })
    })))
}

test('App 地块场景在移动视口渲染并切换角度', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${appUrl}/#/pages/login/index`)
  await page.locator('input').nth(0).fill('admin')
  await page.locator('input').nth(1).fill('admin123')
  await page.locator('.login-button').click()
  await page.waitForTimeout(800)
  await page.goto(`${appUrl}/#/pages/fields/index`)
  await expect(page.locator('.field-card').first()).toBeVisible()
  await page.locator('.field-card').first().click()
  await expect(page.locator('.scene-host canvas')).toBeVisible()
  await expect(page.locator('.scene-host canvas')).toHaveCount(1)
  await page.waitForTimeout(800)

  const initial = await canvasSignature(page)
  expect(initial.width).toBeGreaterThan(300)
  expect(initial.height).toBeGreaterThan(300)
  expect(initial.colored).toBeGreaterThan(500)

  await page.locator('.camera-button').filter({ hasText: '东侧' }).click()
  await page.waitForTimeout(300)
  const east = await canvasSignature(page)
  expect(east.checksum).not.toBe(initial.checksum)

  const host = await page.locator('.scene-host').boundingBox()
  const toolbar = await page.locator('.camera-toolbar').boundingBox()
  expect(host).not.toBeNull()
  expect(toolbar).not.toBeNull()
  if (host && toolbar) expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(host.y)
  await page.screenshot({ path: join(process.env.TEMP || '.', 'agriculture-field-3d-app.png'), fullPage: true })
})

test('App 挖除作物验证弹窗适配移动视口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto(`${appUrl}/#/pages/login/index`)
  await page.locator('input').nth(0).fill('admin')
  await page.locator('input').nth(1).fill('admin123')
  await page.locator('.login-button').click()
  await page.waitForTimeout(500)
  await page.goto(`${appUrl}/#/pages/fields/index`)
  await page.locator('.uproot-button').first().click()
  await expect(page.locator('.uproot-modal')).toBeVisible()
  const modal = await page.locator('.uproot-modal').boundingBox()
  expect(modal).not.toBeNull()
  if (modal) {
    expect(modal.x).toBeGreaterThanOrEqual(0)
    expect(modal.x + modal.width).toBeLessThanOrEqual(391)
    expect(modal.height).toBeLessThanOrEqual(602)
  }
  await expect(page.locator('.danger-button')).toHaveAttribute('disabled', 'true')
})

import { expect, test, type Page } from '@playwright/test';
import { join } from 'path';

async function openScene(page: Page) {
  await page.goto('/#/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('admin123');
  await page.getByRole('button', { name: '进入管理平台' }).click();
  await page.waitForURL(/#\/dashboard/);
  await page.goto('/#/field-3d');
  await expect(page.locator('.field-scene canvas')).toBeVisible();
  await expect(page.locator('.field-readout')).toBeVisible();
  await page.waitForTimeout(800);
}

async function canvasSignature(page: Page) {
  return page.locator('.field-scene canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { colored: 0, checksum: 0, width: canvas.width, height: canvas.height };
    const width = Math.min(96, canvas.width);
    const height = Math.min(96, canvas.height);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(Math.max(0, Math.floor((canvas.width - width) / 2)), Math.max(0, Math.floor((canvas.height - height) / 2)), width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let colored = 0;
    let checksum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] && (pixels[index] !== pixels[index + 1] || pixels[index + 1] !== pixels[index + 2])) colored += 1;
      checksum = (checksum + pixels[index] * 3 + pixels[index + 1] * 5 + pixels[index + 2] * 7) % 2147483647;
    }
    return { colored, checksum, width: canvas.width, height: canvas.height };
  });
}

test('桌面端场景非空并支持角度切换和拖拽', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openScene(page);
  const initial = await canvasSignature(page);
  expect(initial.width).toBeGreaterThan(900);
  expect(initial.height).toBeGreaterThan(500);
  expect(initial.colored).toBeGreaterThan(2000);

  await page.getByRole('button', { name: /东侧/ }).click();
  await page.waitForTimeout(1200);
  const east = await canvasSignature(page);
  expect(east.checksum).not.toBe(initial.checksum);

  const canvas = page.locator('.field-scene canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.45, { steps: 4 });
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
  expect((await canvasSignature(page)).checksum).not.toBe(east.checksum);
  await page.screenshot({ path: join(process.env.TEMP || '.', 'agriculture-field-3d-desktop.png'), fullPage: true });
});

test('移动视口控件保持在画布内且互不遮挡', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScene(page);
  const toolbar = await page.locator('.scene-toolbar').boundingBox();
  const readout = await page.locator('.field-readout').boundingBox();
  const canvas = await page.locator('.field-scene canvas').boundingBox();
  expect(toolbar).not.toBeNull();
  expect(readout).not.toBeNull();
  expect(canvas).not.toBeNull();
  if (toolbar && readout && canvas) {
    expect(toolbar.x).toBeGreaterThanOrEqual(canvas.x);
    expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(readout.y).toBeGreaterThan(toolbar.y + toolbar.height);
    expect(readout.y + readout.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  }
  expect((await canvasSignature(page)).colored).toBeGreaterThan(1500);
  await page.getByRole('button', { name: /近景/ }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(process.env.TEMP || '.', 'agriculture-field-3d-mobile.png'), fullPage: true });
});

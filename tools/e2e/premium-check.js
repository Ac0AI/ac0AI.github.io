#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT_DIR = path.join(ROOT, 'test-results', 'premium-baseline');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server probe failed with status ${res.statusCode}`));
        } else {
          setTimeout(probe, 400);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(probe, 400);
        }
      });
      req.setTimeout(1200, () => {
        req.destroy();
      });
    };
    probe();
  });
}

async function startServer() {
  const proc = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  try {
    await waitForHttp(`http://127.0.0.1:${PORT}`, 30000);
    return proc;
  } catch (err) {
    if (!proc.killed) proc.kill('SIGTERM');
    throw err;
  }
}

async function estimateFps(page, sampleMs = 5000) {
  return page.evaluate(async (durationMs) => {
    return await new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function tick(now) {
        frames += 1;
        if (now - start >= durationMs) {
          resolve((frames * 1000) / (now - start));
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, sampleMs);
}

async function run() {
  ensureDir(OUT_DIR);

  const serverProc = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultNavigationTimeout(90000);

  const report = {
    date: new Date().toISOString(),
    fps: null,
    invalidMeshCount: null,
    consoleErrors: [],
    checks: {
      startButtonWorks: false,
      leaderboardLoads: false,
      pickupDropFlow: false,
      gameplay120s: false,
      gameOverVisible: false,
    },
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('Could not load leaderboard')) {
        if (text.includes('ERR_CONNECTION_CLOSED')) return;
        report.consoleErrors.push(text);
      }
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(1200);
    try {
      const hasBtn = await page.locator('#start-btn').count();
      if (hasBtn < 1) throw new Error('missing');
    } catch (err) {
      await page.screenshot({ path: path.join(OUT_DIR, 'debug-start-fail.png'), fullPage: true }).catch(() => {});
      const debugUrl = page.url();
      const debugTitle = await page.title().catch(() => 'n/a');
      const debugHasBtn = await page.locator('#start-btn').count().catch(() => 0);
      throw new Error(`start button missing; url=${debugUrl} title=${debugTitle} count=${debugHasBtn}`);
    }
    report.checks.startButtonWorks = true;

    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('#start-leaderboard');
        return !!el && !el.textContent.includes('Laddar...');
      }, { timeout: 8000 });
      report.checks.leaderboardLoads = true;
    } catch (_) {
      report.checks.leaderboardLoads = false;
    }

    await page.screenshot({ path: path.join(OUT_DIR, '01-start-screen.png'), fullPage: false, timeout: 90000 });

    await page.click('#start-btn', { force: true });
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 8000 });

    const pickupDropFlow = await page.evaluate(() => {
      const game = window.__game;
      if (!game || !Array.isArray(game.furnitureItems) || game.furnitureItems.length === 0) return false;
      const first = game.furnitureItems.find((it) => !!it?.model);
      if (!first) return false;

      game.playerPos.copy(first.model.position);
      game.playerModel.position.x = game.playerPos.x;
      game.playerModel.position.z = game.playerPos.z;
      game._handleInteraction();
      if (!game.carriedItem) return false;

      game.playerPos.copy(game.world.housePos);
      game.playerModel.position.x = game.playerPos.x;
      game.playerModel.position.z = game.playerPos.z;
      game._handleInteraction();
      return !game.carriedItem;
    });
    report.checks.pickupDropFlow = !!pickupDropFlow;

    await page.evaluate(() => {
      if (!window.__game) return;
      window.__game.currentLevel = window.__game.maxLevel;
    });

    await sleep(5000);
    await page.screenshot({ path: path.join(OUT_DIR, '02-gameplay-5s.png'), fullPage: false, timeout: 90000 });

    await sleep(25000);
    await page.screenshot({ path: path.join(OUT_DIR, '03-gameplay-30s.png'), fullPage: false, timeout: 90000 });

    report.fps = await estimateFps(page, 5000);

    await sleep(90000);
    await page.screenshot({ path: path.join(OUT_DIR, '04-gameplay-120s.png'), fullPage: false, timeout: 90000 });
    report.checks.gameplay120s = true;

    report.invalidMeshCount = await page.evaluate(() => {
      const scene = window.__scene;
      if (!scene) return 999;
      const limits = {
        player: 6,
        furniture: 5,
        truck: 10,
        house: 12,
        sheep: 4,
        dog: 5,
        powerup: 3,
        default: 14,
      };

      let bad = 0;
      scene.traverse((node) => {
        if (!node.isMesh || !node.geometry) return;

        let owner = node;
        while (owner && !owner.userData?.type) owner = owner.parent;
        if (!owner || !owner.userData?.type) return;

        if (!node.geometry.boundingSphere) {
          try { node.geometry.computeBoundingSphere(); } catch (_) { bad += 1; return; }
        }
        const sphere = node.geometry.boundingSphere;
        if (!sphere || !Number.isFinite(sphere.radius)) {
          bad += 1;
          return;
        }

        const e = node.matrixWorld?.elements || [];
        const sx = Math.hypot(e[0] || 0, e[1] || 0, e[2] || 0);
        const sy = Math.hypot(e[4] || 0, e[5] || 0, e[6] || 0);
        const sz = Math.hypot(e[8] || 0, e[9] || 0, e[10] || 0);
        const scaleMax = Math.max(sx, sy, sz, 0.00001);
        const worldRadius = sphere.radius * scaleMax;
        const limit = limits[owner.userData.type] || limits.default;
        if (!Number.isFinite(worldRadius) || worldRadius > limit) {
          bad += 1;
        }
      });

      return bad;
    });

    await page.evaluate(() => {
      if (!window.__game) return;
      window.__game._gameOver('E2E CHECK');
    });
    await page.waitForSelector('#gameover-screen:not(.hidden)', { timeout: 6000 });
    await page.screenshot({ path: path.join(OUT_DIR, '05-game-over.png'), fullPage: false, timeout: 90000 });
    report.checks.gameOverVisible = true;
  } finally {
    await browser.close();
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  const failures = [];
  if (!report.checks.startButtonWorks) failures.push('start button did not work');
  if (!report.checks.pickupDropFlow) failures.push('pickup/drop flow failed');
  if (!report.checks.gameplay120s) failures.push('120s gameplay baseline missing');
  if (!report.checks.gameOverVisible) failures.push('game over overlay did not appear');
  if ((report.invalidMeshCount || 0) > 0) failures.push(`invalid mesh count > 0 (${report.invalidMeshCount})`);
  if ((report.consoleErrors || []).length > 0) failures.push(`console errors: ${report.consoleErrors.length}`);

  if (failures.length > 0) {
    console.error('Premium check failed:\n- ' + failures.join('\n- '));
    process.exit(1);
  }

  console.log('Premium check passed. Report at test-results/premium-baseline/report.json');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

import * as THREE from 'three';
import { Game } from './game.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/shaders/FXAAShader.js';
import { POSTFX_PRESETS, VISUAL_PROFILE } from './visual-profile.js';

// ============================================================
// MAIN ENTRY POINT — Three.js scene setup + game loop
// ============================================================

// Scene
const scene = new THREE.Scene();
const postfx = POSTFX_PRESETS[VISUAL_PROFILE] || POSTFX_PRESETS.premium_arcade_v2;

// Quality profile (performance-safe for laptop browsers)
const lowMemoryDevice = typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 8;
const lowCpuDevice = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 8;
const lowPowerMode = lowMemoryDevice || lowCpuDevice;
const quality = {
    lowPower: lowPowerMode,
    maxPixelRatio: lowPowerMode ? 1.5 : 2.0,
    shadowMapSize: lowPowerMode ? 768 : 1024,
    particleCount: lowPowerMode ? 64 : 96,
};

const orientationLockEl = document.getElementById('orientation-lock');
const immersiveBtn = document.getElementById('immersive-btn');
const orientationHintEl = document.querySelector('.orientation-hint');

function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function shouldForceLandscapeMode() {
    return isIOSDevice()
        || window.matchMedia('(pointer: coarse)').matches
        || window.matchMedia('(hover: none)').matches;
}

function getViewportSize() {
    const vv = window.visualViewport;
    const width = Math.max(1, Math.round(vv?.width || window.innerWidth));
    const height = Math.max(1, Math.round(vv?.height || window.innerHeight));
    return { width, height };
}

function isLandscapeViewport() {
    const { width, height } = getViewportSize();
    return width >= height;
}

async function requestImmersiveMode() {
    const root = document.documentElement;
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (typeof root.requestFullscreen === 'function') {
                await root.requestFullscreen({ navigationUI: 'hide' });
            } else if (typeof root.webkitRequestFullscreen === 'function') {
                root.webkitRequestFullscreen();
            }
        }
    } catch (_) { }

    try {
        if (screen.orientation?.lock) {
            await screen.orientation.lock('landscape');
        }
    } catch (_) { }
}

if (immersiveBtn) {
    immersiveBtn.addEventListener('click', () => {
        requestImmersiveMode();
    });
}

// Renderer
const renderer = new THREE.WebGLRenderer({
    antialias: false, // FXAA pass handles edge smoothing at lower GPU cost.
    alpha: false,
    powerPreference: 'high-performance'
});
const initialViewport = getViewportSize();
let activePixelRatio = Math.min(window.devicePixelRatio, quality.maxPixelRatio);
renderer.setPixelRatio(activePixelRatio);
renderer.setSize(initialViewport.width, initialViewport.height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = postfx.toneMappingExposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game-container').appendChild(renderer.domElement);

// Vignette overlay for depth
const vignette = document.createElement('div');
vignette.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 1;
    background: radial-gradient(ellipse at center, transparent ${postfx.vignette.innerStopPct}%, rgba(0,0,0,${postfx.vignette.outerAlpha}) 100%);
`;
document.getElementById('game-container').appendChild(vignette);

// Camera — Orthographic isometric
const frustumSize = 28;
const aspect = initialViewport.width / initialViewport.height;
const camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    1, 200
);

// Isometric camera position
camera.position.set(30, 30, 30);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

// Game
const game = new Game(scene, camera, quality);

// Post-processing for a richer arcade look
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = quality.lowPower
    ? null
    : new UnrealBloomPass(
        new THREE.Vector2(initialViewport.width, initialViewport.height),
        postfx.bloom.strength.normal,
        postfx.bloom.radius.normal,
        postfx.bloom.threshold.normal
    );
if (bloomPass) {
    composer.addPass(bloomPass);
}

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms.resolution.value.set(
    1 / (initialViewport.width * activePixelRatio),
    1 / (initialViewport.height * activePixelRatio)
);
composer.addPass(fxaaPass);

// Animation loop
let lastTime = 0;
let perfAcc = 0;
let perfFrames = 0;
let adaptiveDegradeCount = 0;
let landscapeBlocked = false;
let manualControlActive = false;
let shadowRefreshFrames = 2;

function requestShadowRefresh(frames = 2) {
    shadowRefreshFrames = Math.max(shadowRefreshFrames, frames);
    renderer.shadowMap.needsUpdate = shadowRefreshFrames > 0;
}

function updatePostProcessSize(width, height) {
    renderer.setSize(width, height);
    composer.setSize(width, height);
    if (bloomPass) bloomPass.setSize(width, height);
    fxaaPass.material.uniforms.resolution.value.set(
        1 / (width * activePixelRatio),
        1 / (height * activePixelRatio)
    );
}

function applyOrientationLockState() {
    const blocked = shouldForceLandscapeMode() && !isLandscapeViewport();
    landscapeBlocked = blocked;
    document.body.classList.toggle('landscape-locked', blocked);
    if (orientationLockEl) {
        orientationLockEl.classList.toggle('hidden', !blocked);
    }
    if (orientationHintEl) {
        orientationHintEl.classList.toggle('hidden', !isIOSDevice());
    }
}

function resizeViewport() {
    applyOrientationLockState();
    const { width, height } = getViewportSize();
    const a = width / height;

    camera.left = frustumSize * a / -2;
    camera.right = frustumSize * a / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();

    updatePostProcessSize(width, height);
}

function applyAdaptiveQuality(dt) {
    perfAcc += dt;
    perfFrames += 1;
    if (perfAcc < postfx.adaptive.sampleWindowSec) return;

    const fps = perfFrames / perfAcc;
    if (fps < postfx.adaptive.fpsThreshold && adaptiveDegradeCount < 6) {
        adaptiveDegradeCount += 1;
        if (activePixelRatio > 1.01) {
            activePixelRatio = Math.max(1, activePixelRatio - postfx.adaptive.pixelRatioStep);
            renderer.setPixelRatio(activePixelRatio);
            updatePostProcessSize(window.innerWidth, window.innerHeight);
        } else if (bloomPass && bloomPass.enabled !== false) {
            bloomPass.strength *= postfx.adaptive.bloomDegradeScale;
            if (bloomPass.strength < 0.08) {
                bloomPass.enabled = false;
            }
        } else if (renderer.shadowMap.enabled) {
            renderer.shadowMap.enabled = false;
        }
    }

    perfAcc = 0;
    perfFrames = 0;
}

function runFrame(dt, trackPerformance = false) {
    if (game.consumeShadowRefreshRequest?.()) {
        requestShadowRefresh(2);
    }

    renderer.shadowMap.autoUpdate = shadowRefreshFrames > 0;
    game.update(dt);
    composer.render();

    if (shadowRefreshFrames > 0) {
        shadowRefreshFrames -= 1;
        renderer.shadowMap.needsUpdate = shadowRefreshFrames > 0;
    }

    if (trackPerformance) {
        applyAdaptiveQuality(dt);
    }
}

function animate(time) {
    requestAnimationFrame(animate);

    if (landscapeBlocked) {
        lastTime = time;
        composer.render();
        return;
    }

    if (manualControlActive) {
        lastTime = time;
        return;
    }

    const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt to prevent huge jumps
    lastTime = time;
    runFrame(dt, true);
}

requestAnimationFrame(animate);
applyOrientationLockState();
requestShadowRefresh(3);

if (typeof window !== 'undefined') {
    window.__game = game;
    window.__scene = scene;
    window.__requestShadowRefresh = requestShadowRefresh;
    window.render_game_to_text = () => game.renderGameToText();
    window.advanceTime = async (ms = 1000 / 60) => {
        manualControlActive = true;
        const frameMs = 1000 / 60;
        const steps = Math.max(1, Math.round(ms / frameMs));
        for (let i = 0; i < steps; i++) {
            runFrame(1 / 60, false);
        }
    };
    window.resumeRealtime = () => {
        manualControlActive = false;
        lastTime = performance.now();
    };
}

const immersiveTriggers = [
    document.getElementById('start-btn'),
    document.getElementById('restart-btn'),
    document.getElementById('next-level-btn'),
    document.getElementById('victory-restart-btn')
].filter(Boolean);

immersiveTriggers.forEach((el) => {
    el.addEventListener('click', () => {
        requestImmersiveMode();
    });
});

// Resize handler
window.addEventListener('resize', resizeViewport);
window.addEventListener('orientationchange', () => {
    setTimeout(resizeViewport, 80);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeViewport);
}

resizeViewport();

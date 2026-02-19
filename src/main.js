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
    maxPixelRatio: lowPowerMode ? 1.25 : 1.65,
    shadowMapSize: lowPowerMode ? 1024 : 1536,
    particleCount: lowPowerMode ? 84 : 120,
};

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
let activePixelRatio = Math.min(window.devicePixelRatio, quality.maxPixelRatio);
renderer.setPixelRatio(activePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = quality.lowPower ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap;
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
const aspect = window.innerWidth / window.innerHeight;
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
if (typeof window !== 'undefined') {
    window.__game = game;
    window.__scene = scene;
}

// Post-processing for a richer arcade look
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    quality.lowPower ? postfx.bloom.strength.lowPower : postfx.bloom.strength.normal,
    quality.lowPower ? postfx.bloom.radius.lowPower : postfx.bloom.radius.normal,
    quality.lowPower ? postfx.bloom.threshold.lowPower : postfx.bloom.threshold.normal
);
composer.addPass(bloomPass);

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * activePixelRatio),
    1 / (window.innerHeight * activePixelRatio)
);
composer.addPass(fxaaPass);

// Animation loop
let lastTime = 0;
let perfAcc = 0;
let perfFrames = 0;
let degradedQuality = false;

function updatePostProcessSize(width, height) {
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
    fxaaPass.material.uniforms.resolution.value.set(
        1 / (width * activePixelRatio),
        1 / (height * activePixelRatio)
    );
}

function animate(time) {
    requestAnimationFrame(animate);

    const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt to prevent huge jumps
    lastTime = time;

    game.update(dt);
    composer.render();

    // One-step adaptive fallback for sustained heavy load
    if (!degradedQuality) {
        perfAcc += dt;
        perfFrames += 1;
        if (perfAcc >= postfx.adaptive.sampleWindowSec) {
            const fps = perfFrames / perfAcc;
            if (fps < postfx.adaptive.fpsThreshold) {
                degradedQuality = true;
                activePixelRatio = Math.max(1, activePixelRatio - postfx.adaptive.pixelRatioStep);
                renderer.setPixelRatio(activePixelRatio);
                bloomPass.strength *= postfx.adaptive.bloomDegradeScale;
                updatePostProcessSize(window.innerWidth, window.innerHeight);
            }
            perfAcc = 0;
            perfFrames = 0;
        }
    }
}

requestAnimationFrame(animate);

// Resize handler
window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const a = w / h;

    camera.left = frustumSize * a / -2;
    camera.right = frustumSize * a / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();

    updatePostProcessSize(w, h);
});

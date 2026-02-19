import * as THREE from 'three';
import { Game } from './game.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/shaders/FXAAShader.js';

// ============================================================
// MAIN ENTRY POINT — Three.js scene setup + game loop
// ============================================================

// Scene
const scene = new THREE.Scene();

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game-container').appendChild(renderer.domElement);

// Vignette overlay for depth
const vignette = document.createElement('div');
vignette.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 1;
    background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%);
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
const game = new Game(scene, camera);

// Post-processing for a richer arcade look
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.48,
    0.72,
    0.22
);
composer.addPass(bloomPass);

const fxaaPass = new ShaderPass(FXAAShader);
const pixelRatio = renderer.getPixelRatio();
fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * pixelRatio),
    1 / (window.innerHeight * pixelRatio)
);
composer.addPass(fxaaPass);

// Animation loop
let lastTime = 0;

function animate(time) {
    requestAnimationFrame(animate);

    const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt to prevent huge jumps
    lastTime = time;

    game.update(dt);
    composer.render();
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

    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);

    const pr = renderer.getPixelRatio();
    fxaaPass.material.uniforms.resolution.value.set(
        1 / (w * pr),
        1 / (h * pr)
    );
});

import * as THREE from 'three';
import { Game } from './game.js';

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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
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

// Animation loop
let lastTime = 0;

function animate(time) {
    requestAnimationFrame(animate);

    const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt to prevent huge jumps
    lastTime = time;

    game.update(dt);
    renderer.render(scene, camera);
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
});

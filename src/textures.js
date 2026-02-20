import * as THREE from 'three';

let cachedPack = null;

function makeCanvas(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
}

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function createTexture(size, painter, repeatX = 1, repeatY = 1) {
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    painter(ctx, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
}

function noiseFill(ctx, size, baseColor, dots, dotMin, dotMax) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < dots; i++) {
        const alpha = rand(dotMin, dotMax).toFixed(3);
        const shade = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        const r = rand(1, 5);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createPaintedTexture() {
    return createTexture(256, (ctx, size) => {
        noiseFill(ctx, size, '#d5dce3', 320, 0.02, 0.08);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let i = 0; i < 28; i++) {
            ctx.beginPath();
            ctx.moveTo(rand(0, size), rand(0, size));
            ctx.lineTo(rand(0, size), rand(0, size));
            ctx.stroke();
        }
    }, 2, 2);
}

function createGrassTexture() {
    return createTexture(256, (ctx, size) => {
        noiseFill(ctx, size, '#7cc856', 600, 0.03, 0.1);
        for (let i = 0; i < 420; i++) {
            const x = rand(0, size);
            const y = rand(0, size);
            const len = rand(2, 6);
            ctx.strokeStyle = `rgba(40, 100, 30, ${rand(0.06, 0.18).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + rand(-1.5, 1.5), y - len);
            ctx.stroke();
        }
    }, 22, 22);
}

function createDirtTexture() {
    return createTexture(256, (ctx, size) => {
        noiseFill(ctx, size, '#9f7a49', 480, 0.03, 0.14);
        for (let i = 0; i < 200; i++) {
            ctx.fillStyle = `rgba(70, 45, 20, ${rand(0.04, 0.16).toFixed(3)})`;
            ctx.fillRect(rand(0, size), rand(0, size), rand(4, 14), rand(2, 8));
        }
    }, 12, 12);
}

function createWoodTexture() {
    return createTexture(256, (ctx, size) => {
        const g = ctx.createLinearGradient(0, 0, 0, size);
        g.addColorStop(0, '#d18641');
        g.addColorStop(1, '#9b5d25');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);

        for (let i = 0; i < 40; i++) {
            const y = i * (size / 40);
            ctx.strokeStyle = `rgba(87, 44, 15, ${rand(0.2, 0.4).toFixed(3)})`;
            ctx.lineWidth = rand(1, 3);
            ctx.beginPath();
            ctx.moveTo(0, y + rand(-4, 4));
            ctx.bezierCurveTo(
                size * 0.33, y + rand(-10, 10),
                size * 0.66, y + rand(-10, 10),
                size, y + rand(-4, 4)
            );
            ctx.stroke();
        }
    }, 2, 2);
}

function createBarkTexture() {
    return createTexture(256, (ctx, size) => {
        noiseFill(ctx, size, '#6f4f2f', 360, 0.05, 0.14);
        for (let i = 0; i < 90; i++) {
            const x = rand(0, size);
            ctx.strokeStyle = `rgba(40, 26, 16, ${rand(0.12, 0.24).toFixed(3)})`;
            ctx.lineWidth = rand(1, 2.2);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + rand(-8, 8), size);
            ctx.stroke();
        }
    }, 2, 6);
}

function createStoneTexture() {
    return createTexture(256, (ctx, size) => {
        noiseFill(ctx, size, '#8d9298', 520, 0.04, 0.16);
        for (let i = 0; i < 140; i++) {
            ctx.fillStyle = `rgba(255,255,255,${rand(0.03, 0.1).toFixed(3)})`;
            ctx.fillRect(rand(0, size), rand(0, size), rand(2, 9), rand(2, 9));
        }
    }, 4, 4);
}

function createMetalTexture() {
    return createTexture(256, (ctx, size) => {
        const g = ctx.createLinearGradient(0, 0, size, size);
        g.addColorStop(0, '#d2dee8');
        g.addColorStop(0.5, '#a4b5c4');
        g.addColorStop(1, '#e6f0f7');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = `rgba(255,255,255,0.08)`;
        ctx.fillRect(0, 0, size, size * 0.1);
        ctx.fillStyle = `rgba(0,0,0,0.05)`;
        ctx.fillRect(0, size * 0.9, size, size);

        for (let i = 0; i < 80; i++) {
            ctx.strokeStyle = `rgba(255,255,255,${rand(0.08, 0.2).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(0, rand(0, size));
            ctx.lineTo(size, rand(0, size));
            ctx.stroke();
        }
    }, 2, 2);
}

function createFabricTexture() {
    return createTexture(256, (ctx, size) => {
        ctx.fillStyle = '#a6bad3';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;

        for (let i = 0; i < size; i += 6) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, size);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(size, i);
            ctx.stroke();

            ctx.strokeStyle = `rgba(0,0,0,${rand(0.02, 0.05).toFixed(3)})`;
        }
    }, 2, 2);
}

export function createTexturePack() {
    if (cachedPack) return cachedPack;

    cachedPack = {
        painted: createPaintedTexture(),
        grass: createGrassTexture(),
        dirt: createDirtTexture(),
        wood: createWoodTexture(),
        bark: createBarkTexture(),
        stone: createStoneTexture(),
        metal: createMetalTexture(),
        fabric: createFabricTexture(),
    };

    return cachedPack;
}

export function getSurfaceMaterialProps(pack, surface = 'painted') {
    const p = pack || createTexturePack();
    switch (surface) {
        case 'grass':
            return { map: p.grass, roughness: 0.93, metalness: 0.03 };
        case 'dirt':
            return { map: p.dirt, roughness: 0.9, metalness: 0.02 };
        case 'wood':
            return { map: p.wood, roughness: 0.78, metalness: 0.06 };
        case 'bark':
            return { map: p.bark, roughness: 0.87, metalness: 0.03 };
        case 'stone':
            return { map: p.stone, roughness: 0.75, metalness: 0.08 };
        case 'metal':
            return { map: p.metal, roughness: 0.45, metalness: 0.35 };
        case 'fabric':
            return { map: p.fabric, roughness: 0.82, metalness: 0.02 };
        case 'painted':
        default:
            return { map: p.painted, roughness: 0.62, metalness: 0.08 };
    }
}

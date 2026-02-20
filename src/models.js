import * as THREE from 'three';
import { createTexturePack, getSurfaceMaterialProps } from './textures.js';
import { externalModelCatalog } from './external-model-catalog.js';
import { MODEL_VALIDATION_LIMITS } from './asset-curation.js';

export const EXTERNAL_PLAYER_ENABLED = true;
export const EXTERNAL_DOG_ENABLED = true;
export const EXTERNAL_FURNITURE_ENABLED = true;
const STRICT_CURATED_FURNITURE = false;

// ============================================================
// LOW-POLY PROCEDURAL 3D MODEL FACTORY
// All models return THREE.Group objects
// ============================================================

// Helper: create a rounded box-ish mesh
const texturePack = createTexturePack();
const _tmpBox = new THREE.Box3();
const _tmpSize = new THREE.Vector3();
const _tmpCenter = new THREE.Vector3();

function _specForType(type) {
    return MODEL_VALIDATION_LIMITS.TARGET_DIMENSIONS_PER_TYPE[type]
        || MODEL_VALIDATION_LIMITS.TARGET_DIMENSIONS_PER_TYPE.default;
}

function _limitForType(bucket, type, fallback) {
    const limits = MODEL_VALIDATION_LIMITS[bucket] || {};
    return limits[type] || limits.default || fallback;
}

function _prepareExternalModel(root, opts = {}) {
    if (!root) return null;

    const castShadow = opts.castShadow !== false;
    const receiveShadow = opts.receiveShadow !== false;
    const allowSkinned = opts.allowSkinned === true;
    let hasSkinnedMesh = false;
    let totalVertices = 0;
    root.traverse((node) => {
        if (!node.isMesh) return;
        if (node.isSkinnedMesh) hasSkinnedMesh = true;
        const vertCount = node.geometry?.attributes?.position?.count || 0;
        totalVertices += vertCount;
        node.castShadow = castShadow && vertCount < 9000;
        node.receiveShadow = receiveShadow;
        node.frustumCulled = !node.isSkinnedMesh;
    });

    if (totalVertices > (opts.maxVertices || 42000)) {
        return null;
    }

    // Skinned assets from Unity packages are unstable in this lightweight runtime path.
    // Fallback to procedural models instead of risking stretched mega-polygons.
    if (hasSkinnedMesh && !allowSkinned) {
        return null;
    }

    root.updateWorldMatrix(true, true);
    _tmpBox.setFromObject(root);
    _tmpBox.getSize(_tmpSize);
    _tmpBox.getCenter(_tmpCenter);

    if (
        !Number.isFinite(_tmpSize.x) || !Number.isFinite(_tmpSize.y) || !Number.isFinite(_tmpSize.z)
        || _tmpSize.y <= 0.0001 || _tmpSize.x <= 0.0001 || _tmpSize.z <= 0.0001
    ) {
        if (hasSkinnedMesh) {
            _tmpSize.set(1, 1, 1);
            _tmpCenter.set(0, 0, 0);
        } else {
            return null;
        }
    }

    const modelType = opts.validationType || opts.furnitureType || opts.role || 'default';
    const targetHeight = Math.max(0.05, opts.targetHeight || _tmpSize.y);
    const maxExtent = Math.max(0.05, opts.maxExtent || Infinity);
    const currentExtent = Math.max(_tmpSize.x, _tmpSize.z, 0.0001);

    const scaleFromHeight = targetHeight / _tmpSize.y;
    const scaleFromExtent = maxExtent / currentExtent;
    const uniformScale = Math.min(scaleFromHeight, scaleFromExtent) * (opts.extraScale || 1);
    root.scale.multiplyScalar(uniformScale);

    root.updateWorldMatrix(true, true);
    _tmpBox.setFromObject(root);
    _tmpBox.getSize(_tmpSize);
    if (
        !Number.isFinite(_tmpSize.x) || !Number.isFinite(_tmpSize.y) || !Number.isFinite(_tmpSize.z)
        || _tmpSize.y > 9 || Math.max(_tmpSize.x, _tmpSize.z) > 9
    ) {
        if (!hasSkinnedMesh) return null;
    }
    if (!hasSkinnedMesh) {
        _tmpBox.getCenter(_tmpCenter);
    }
    root.position.x -= _tmpCenter.x;
    root.position.z -= _tmpCenter.z;
    root.position.y -= _tmpBox.min.y;
    root.position.y += opts.yOffset || 0;
    root.updateWorldMatrix(true, true);

    const expectedExtent = Number.isFinite(maxExtent)
        ? Math.max(targetHeight, maxExtent, 0.2)
        : Math.max(targetHeight, 0.2);
    const maxAllowedMeshRadius = _limitForType('MAX_WORLD_RADIUS_PER_TYPE', modelType, expectedExtent * 2.8);
    const maxAllowedMeshOffset = _limitForType('MAX_WORLD_OFFSET_PER_TYPE', modelType, expectedExtent * 3.2);
    let suspiciousMesh = false;
    root.traverse((node) => {
        if (!node.isMesh || !node.geometry || suspiciousMesh) return;
        if (!node.geometry.boundingSphere) {
            try { node.geometry.computeBoundingSphere(); } catch (_) { }
        }
        const sphere = node.geometry.boundingSphere;
        if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius <= 0) {
            suspiciousMesh = true;
            return;
        }

        const e = node.matrixWorld?.elements || [];
        const sx = Math.hypot(e[0] || 0, e[1] || 0, e[2] || 0);
        const sy = Math.hypot(e[4] || 0, e[5] || 0, e[6] || 0);
        const sz = Math.hypot(e[8] || 0, e[9] || 0, e[10] || 0);
        const scaleMax = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz), 0.00001);
        const radiusWorld = sphere.radius * scaleMax;
        const worldOffset = Math.hypot(e[12] || 0, e[13] || 0, e[14] || 0);

        if (
            !Number.isFinite(radiusWorld) || !Number.isFinite(worldOffset)
            || radiusWorld > maxAllowedMeshRadius
            || worldOffset > maxAllowedMeshOffset
        ) {
            suspiciousMesh = true;
        }
    });
    if (suspiciousMesh) {
        return null;
    }

    root.userData.externalModel = true;
    return root;
}

function _tryCreateExternalRole(role, opts = {}) {
    if (!externalModelCatalog.ready) return null;
    const root = externalModelCatalog.cloneRole(role);
    return root ? _prepareExternalModel(root, { ...opts, validationType: role }) : null;
}

function _tryCreateExternalAnimal(kind, opts = {}) {
    if (!externalModelCatalog.ready) return null;
    const root = externalModelCatalog.cloneAnimal(kind);
    return root ? _prepareExternalModel(root, { ...opts, validationType: kind }) : null;
}

function _ensureColorMapColorSpace(material) {
    const map = material?.map;
    if (!map) return;
    if (map.colorSpace !== THREE.SRGBColorSpace) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
    }
}

function _polishExternalPlayerMaterials(root) {
    const suitColor = new THREE.Color(0x2f76d8);
    const skinColor = new THREE.Color(0xffcfb0);
    const suitSurface = getSurfaceMaterialProps(texturePack, 'fabric');
    const skinSurface = getSurfaceMaterialProps(texturePack, 'painted');

    root.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const nextMats = mats.map((material) => {
            if (!material || !material.isMaterial) return material;
            const next = material.clone();
            const brightness = next.color
                ? (next.color.r + next.color.g + next.color.b) / 3
                : 0.5;
            const isSkinLike = brightness > 0.66 && next.color && next.color.r > next.color.b;
            const targetColor = isSkinLike ? skinColor : suitColor;
            const props = isSkinLike ? skinSurface : suitSurface;

            if (!next.map && props.map) {
                next.map = props.map;
            }
            _ensureColorMapColorSpace(next);
            if (next.color) {
                next.color.lerp(targetColor, isSkinLike ? 0.48 : 0.58);
            }
            if (typeof next.roughness === 'number') {
                next.roughness = THREE.MathUtils.clamp(next.roughness, 0.42, 0.86);
            } else {
                next.roughness = props.roughness;
            }
            if (typeof next.metalness === 'number') {
                next.metalness = THREE.MathUtils.clamp(next.metalness, 0.02, 0.16);
            } else {
                next.metalness = props.metalness;
            }
            next.envMapIntensity = Math.max(0.32, next.envMapIntensity || 0.32);
            return next;
        });
        node.material = Array.isArray(node.material) ? nextMats : nextMats[0];
    });
}

function buildStandardMaterial(color, defaults, opts = {}) {
    const { surface = 'painted', ...matOpts } = opts;
    const surfaceProps = getSurfaceMaterialProps(texturePack, surface);
    return new THREE.MeshStandardMaterial({
        color,
        ...defaults,
        ...surfaceProps,
        ...matOpts
    });
}

function box(w, h, d, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = buildStandardMaterial(color, { roughness: 0.62, metalness: 0.08 }, opts);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function sphere(r, color, opts = {}) {
    const geo = new THREE.SphereGeometry(r, 12, 8);
    const mat = buildStandardMaterial(color, { roughness: 0.5, metalness: 0.06 }, opts);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
}

function cylinder(rTop, rBot, h, color, segs = 8, opts = {}) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
    const mat = buildStandardMaterial(color, { roughness: 0.58, metalness: 0.08 }, opts);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
}

// ============================================================
// PLAYER — cute mover character
// ============================================================
export function createPlayer() {
    if (EXTERNAL_PLAYER_ENABLED) {
        const external = _tryCreateExternalRole('player', {
            targetHeight: 1.95,
            maxExtent: 1.35,
            castShadow: true,
            receiveShadow: true,
            allowSkinned: true
        });
        if (external) {
            _polishExternalPlayerMaterials(external);
            external.userData.type = 'player';
            return external;
        }
    }

    const group = new THREE.Group();

    // Body (chubby overalls)
    const body = cylinder(0.42, 0.48, 0.7, 0x3498db, 10, { surface: 'fabric' });
    body.position.y = 0.65;
    group.add(body);

    // Belly bump
    const belly = sphere(0.4, 0x3498db, { surface: 'fabric' });
    belly.position.set(0, 0.5, 0.15);
    belly.scale.set(1, 0.8, 1.2);
    group.add(belly);

    // Overall bib
    const bib = box(0.46, 0.35, 0.1, 0x2e86c1, { surface: 'fabric' });
    bib.position.set(0, 0.82, 0.38);
    group.add(bib);

    // Buttons
    const btnL = sphere(0.045, 0xf1c40f, { surface: 'metal' });
    btnL.position.set(-0.15, 0.9, 0.45);
    group.add(btnL);
    const btnR = sphere(0.045, 0xf1c40f, { surface: 'metal' });
    btnR.position.set(0.15, 0.9, 0.45);
    group.add(btnR);

    // Head (skin color, slightly oversized for cuteness)
    const head = sphere(0.38, 0xffccaa);
    head.position.y = 1.45;
    head.userData.baseY = head.position.y;
    group.add(head);

    // Nose
    const nose = sphere(0.06, 0xf7b998);
    nose.position.set(0, 1.4, 0.38);
    group.add(nose);

    // Cap (dark blue, rounder)
    const cap = sphere(0.39, 0x2980b9, { surface: 'fabric' });
    cap.position.y = 1.55;
    cap.scale.set(1, 0.6, 1);
    group.add(cap);

    // Cap brim
    const brim = cylinder(0.4, 0.4, 0.05, 0x2980b9, 12, { surface: 'fabric' });
    brim.position.set(0, 1.55, 0.15);
    brim.scale.set(1, 1, 1.2);
    group.add(brim);

    // Eyes
    const eyeL = sphere(0.06, 0x222222, { surface: 'metal', roughness: 0.2, metalness: 0.8 });
    eyeL.position.set(-0.14, 1.48, 0.32);
    group.add(eyeL);

    const eyeR = sphere(0.06, 0x222222, { surface: 'metal', roughness: 0.2, metalness: 0.8 });
    eyeR.position.set(0.14, 1.48, 0.32);
    group.add(eyeR);

    // Cheeks
    const cheekL = sphere(0.05, 0xff9988, { surface: 'painted', transparent: true, opacity: 0.6 });
    cheekL.position.set(-0.2, 1.36, 0.3);
    group.add(cheekL);
    const cheekR = sphere(0.05, 0xff9988, { surface: 'painted', transparent: true, opacity: 0.6 });
    cheekR.position.set(0.2, 1.36, 0.3);
    group.add(cheekR);

    // Legs (thicker)
    const legL = cylinder(0.16, 0.14, 0.5, 0x2c3e50, 8, { surface: 'fabric' });
    legL.position.set(-0.22, 0.2, 0);
    legL.userData.baseY = legL.position.y;
    group.add(legL);

    const legR = cylinder(0.16, 0.14, 0.5, 0x2c3e50, 8, { surface: 'fabric' });
    legR.position.set(0.22, 0.2, 0);
    legR.userData.baseY = legR.position.y;
    group.add(legR);

    // Shoes (rounder)
    const shoeL = cylinder(0.16, 0.18, 0.15, 0x1a1a1a, 10, { surface: 'stone', roughness: 0.8, metalness: 0.1 });
    shoeL.position.set(-0.22, 0.05, 0.08);
    shoeL.scale.set(1, 1, 1.4);
    group.add(shoeL);
    const shoeR = cylinder(0.16, 0.18, 0.15, 0x1a1a1a, 10, { surface: 'stone', roughness: 0.8, metalness: 0.1 });
    shoeR.position.set(0.22, 0.05, 0.08);
    shoeR.scale.set(1, 1, 1.4);
    group.add(shoeR);

    // Arms (cylinders)
    const armL = cylinder(0.12, 0.1, 0.6, 0x3498db, 8, { surface: 'fabric' });
    armL.position.set(-0.55, 0.75, 0);
    armL.userData.baseY = armL.position.y;
    group.add(armL);

    const armR = cylinder(0.12, 0.1, 0.6, 0x3498db, 8, { surface: 'fabric' });
    armR.position.set(0.55, 0.75, 0);
    armR.userData.baseY = armR.position.y;
    group.add(armR);

    // Gloves (thick)
    const gloveL = sphere(0.11, 0xffccaa, { surface: 'fabric' });
    gloveL.position.set(-0.55, 0.45, 0.06);
    group.add(gloveL);
    const gloveR = sphere(0.11, 0xffccaa, { surface: 'fabric' });
    gloveR.position.set(0.55, 0.45, 0.06);
    group.add(gloveR);

    group.userData.type = 'player';
    group.userData.animRig = {
        armL,
        armR,
        legL,
        legR,
        head,
        blend: 0,
    };
    return group;
}

// ============================================================
// TRUCK — delivery truck
// ============================================================
export function createTruck() {
    const truckSpec = _specForType('truck');
    const external = _tryCreateExternalRole('truck', {
        ...truckSpec,
        castShadow: true,
        receiveShadow: true
    });
    if (external) {
        external.userData.type = 'truck';
        return external;
    }

    const group = new THREE.Group();

    // Cargo bed (open top)
    const bed = box(3, 1, 2, 0xff8c00, { surface: 'metal' });
    bed.position.set(0, 0.5, 0);
    group.add(bed);

    // Cabin
    const cabin = box(1.2, 1.3, 1.8, 0xe74c3c, { surface: 'metal' });
    cabin.position.set(-1.6, 0.65, 0);
    group.add(cabin);

    // Windshield
    const windshield = box(0.05, 0.6, 1.2, 0x87CEEB, { surface: 'metal', transparent: true, opacity: 0.6 });
    windshield.position.set(-0.97, 0.85, 0);
    group.add(windshield);

    // Roof
    const roof = box(1.2, 0.1, 1.8, 0xc0392b, { surface: 'metal' });
    roof.position.set(-1.6, 1.35, 0);
    group.add(roof);

    // Wheels
    const wheelPositions = [
        [-1.8, 0.2, 1.1], [-1.8, 0.2, -1.1],
        [0.8, 0.2, 1.1], [0.8, 0.2, -1.1]
    ];
    wheelPositions.forEach(([x, y, z]) => {
        const wheel = cylinder(0.25, 0.25, 0.2, 0x1a1a1a, 12, { surface: 'stone', roughness: 0.95, metalness: 0.01 });
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, y, z);
        group.add(wheel);

        // Hub
        const hub = cylinder(0.1, 0.1, 0.22, 0x999999, 8, { surface: 'metal' });
        hub.rotation.x = Math.PI / 2;
        hub.position.set(x, y, z);
        group.add(hub);
    });

    // Headlights
    const hlL = sphere(0.08, 0xffff88, { emissive: 0xffff44, emissiveIntensity: 0.5 });
    hlL.position.set(-2.2, 0.5, 0.5);
    group.add(hlL);

    const hlR = sphere(0.08, 0xffff88, { emissive: 0xffff44, emissiveIntensity: 0.5 });
    hlR.position.set(-2.2, 0.5, -0.5);
    group.add(hlR);

    group.userData.type = 'truck';
    group.scale.set(1.1, 1.1, 1.1);
    return group;
}

// ============================================================
// HOUSE — cute little house
// ============================================================
export function createHouse() {
    const buildingSpec = _specForType('building');
    const external = _tryCreateExternalRole('building', {
        ...buildingSpec,
        castShadow: true,
        receiveShadow: true
    });
    if (external) {
        external.userData.type = 'house';
        return external;
    }

    const group = new THREE.Group();

    // Walls
    const walls = box(3.5, 2.5, 3, 0xffeaa7, { surface: 'painted' });
    walls.position.y = 1.25;
    group.add(walls);

    // Roof (pyramid shape using a cone)
    const roofGeo = new THREE.ConeGeometry(3, 1.8, 4);
    const roofMat = buildStandardMaterial(0xc0392b, { roughness: 0.72, metalness: 0.05 }, { surface: 'fabric' });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3.4;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Door
    const door = box(0.6, 1.2, 0.05, 0x8B4513, { surface: 'wood' });
    door.position.set(0, 0.6, 1.53);
    group.add(door);

    // Door handle
    const handle = sphere(0.04, 0xffd700);
    handle.position.set(0.2, 0.65, 1.58);
    group.add(handle);

    // Windows
    const windowPositions = [
        [-0.9, 1.6, 1.53], [0.9, 1.6, 1.53],  // Front
        [1.78, 1.6, 0], [-1.78, 1.6, 0]  // Sides
    ];
    windowPositions.forEach(([x, y, z]) => {
        const win = box(
            z !== 0 ? 0.6 : 0.05,
            0.5,
            z === 0 ? 0.6 : 0.05,
            0x87CEEB,
            { surface: 'metal', transparent: true, opacity: 0.5 }
        );
        win.position.set(x, y, z);
        group.add(win);

        // Window frame
        const frame = box(
            z !== 0 ? 0.7 : 0.06,
            0.6,
            z === 0 ? 0.7 : 0.06,
            0xffffff,
            { surface: 'wood' }
        );
        frame.position.set(x, y, z > 0 ? z - 0.01 : z < 0 ? z + 0.01 : z);
        if (z === 0) frame.position.x = x > 0 ? x - 0.01 : x + 0.01;
        group.add(frame);
    });

    // Chimney
    const chimney = box(0.4, 1, 0.4, 0x8B4513);
    chimney.position.set(1, 3.5, -0.6);
    group.add(chimney);

    group.userData.type = 'house';
    return group;
}

// ============================================================
// SHEEP — fluffy cloud sheep
// ============================================================
export function createSheep(scale = 1) {
    const external = _tryCreateExternalAnimal('sheep', {
        targetHeight: 1.2 * scale,
        maxExtent: 1.8 * scale,
        castShadow: true,
        receiveShadow: true,
        allowSkinned: true
    });
    if (external) {
        external.userData.type = 'sheep';
        return external;
    }

    const group = new THREE.Group();

    // Body fluff (cluster of white spheres)
    const fluffPositions = [
        [0, 0.5, 0, 0.4],
        [0.3, 0.55, 0, 0.3],
        [-0.3, 0.55, 0, 0.3],
        [0, 0.55, 0.25, 0.3],
        [0, 0.55, -0.25, 0.3],
        [0.2, 0.65, 0.15, 0.25],
        [-0.2, 0.65, 0.15, 0.25],
        [0.2, 0.65, -0.15, 0.25],
        [-0.2, 0.65, -0.15, 0.25],
    ];
    fluffPositions.forEach(([x, y, z, r]) => {
        const fluff = sphere(r, 0xffffff);
        fluff.position.set(x, y, z);
        group.add(fluff);
    });

    // Head (dark)
    const head = sphere(0.22, 0x1a1a1a);
    head.position.set(0.5, 0.55, 0);
    group.add(head);

    // Eyes
    const eyeL = sphere(0.04, 0xffffff);
    eyeL.position.set(0.65, 0.6, 0.1);
    group.add(eyeL);
    const eyeR = sphere(0.04, 0xffffff);
    eyeR.position.set(0.65, 0.6, -0.1);
    group.add(eyeR);

    // Pupils
    const pupilL = sphere(0.02, 0x000000);
    pupilL.position.set(0.68, 0.6, 0.1);
    group.add(pupilL);
    const pupilR = sphere(0.02, 0x000000);
    pupilR.position.set(0.68, 0.6, -0.1);
    group.add(pupilR);

    // Ears
    const earL = sphere(0.08, 0x1a1a1a);
    earL.position.set(0.45, 0.75, 0.2);
    group.add(earL);
    const earR = sphere(0.08, 0x1a1a1a);
    earR.position.set(0.45, 0.75, -0.2);
    group.add(earR);

    // Legs
    const legPositions = [
        [-0.2, 0, 0.15], [-0.2, 0, -0.15],
        [0.2, 0, 0.15], [0.2, 0, -0.15]
    ];
    legPositions.forEach(([x, y, z]) => {
        const leg = cylinder(0.05, 0.05, 0.3, 0x1a1a1a);
        leg.position.set(x, y + 0.15, z);
        group.add(leg);
    });

    group.scale.set(scale, scale, scale);
    group.userData.type = 'sheep';
    return group;
}

// ============================================================
// DOG — Swedish Vallhund
// ============================================================
export function createDog() {
    if (EXTERNAL_DOG_ENABLED) {
        const external = _tryCreateExternalRole('dog', {
            targetHeight: 1.1,
            maxExtent: 1.6,
            castShadow: true,
            receiveShadow: true,
            allowSkinned: true
        });
        if (external) {
            external.userData.type = 'dog';
            return external;
        }
    }

    const group = new THREE.Group();

    // Body
    const body = box(0.9, 0.4, 0.45, 0xd4a574);
    body.position.y = 0.5;
    group.add(body);

    // Head
    const head = sphere(0.25, 0xc6956c);
    head.position.set(0.55, 0.65, 0);
    group.add(head);

    // Snout
    const snout = box(0.2, 0.12, 0.15, 0x1a1a1a);
    snout.position.set(0.75, 0.58, 0);
    group.add(snout);

    // Ears (pointy)
    const earL = box(0.08, 0.15, 0.08, 0xb8844c);
    earL.position.set(0.48, 0.85, 0.12);
    earL.rotation.z = 0.2;
    group.add(earL);

    const earR = box(0.08, 0.15, 0.08, 0xb8844c);
    earR.position.set(0.48, 0.85, -0.12);
    earR.rotation.z = 0.2;
    group.add(earR);

    // Eyes
    const eyeL = sphere(0.04, 0x000000);
    eyeL.position.set(0.7, 0.7, 0.1);
    group.add(eyeL);
    const eyeR = sphere(0.04, 0x000000);
    eyeR.position.set(0.7, 0.7, -0.1);
    group.add(eyeR);

    // Legs
    const legPositions = [
        [-0.3, 0, 0.18], [-0.3, 0, -0.18],
        [0.25, 0, 0.18], [0.25, 0, -0.18]
    ];
    legPositions.forEach(([x, y, z]) => {
        const leg = cylinder(0.06, 0.06, 0.35, 0xc6956c);
        leg.position.set(x, y + 0.17, z);
        group.add(leg);
    });

    // Tail (curled up)
    const tail = cylinder(0.04, 0.06, 0.3, 0xd4a574);
    tail.position.set(-0.55, 0.65, 0);
    tail.rotation.z = Math.PI / 4;
    group.add(tail);

    group.scale.set(1.2, 1.2, 1.2);
    group.userData.type = 'dog';
    return group;
}

// ============================================================
// FURNITURE — various items
// ============================================================
const FURNITURE_COLORS = {
    box: 0xD2B48C,
    sofa: 0x2ecc71,
    tv: 0x2c3e50,
    lamp: 0xf1c40f,
    plant: 0x27ae60,
    bookshelf: 0x8B4513,
    chair: 0xe67e22,
    fridge: 0xecf0f1,
    console: 0x2c3e50,
    freezer: 0x3498db,
    cd: 0xbdc3c7,
    radio: 0x8e44ad,
    guitar: 0xd35400,
    clock: 0x95a5a6,
    washer: 0xecf0f1,
    table: 0x8B6914,
    mirror: 0xC0C0C0,
    rug: 0xc0392b,
    piano: 0x1a1a1a,
    microwave: 0xbdc3c7,
    vase: 0x2980b9,
};

const FURNITURE_SURFACES = {
    box: 'wood',
    sofa: 'fabric',
    tv: 'metal',
    lamp: 'metal',
    plant: 'painted',
    bookshelf: 'wood',
    chair: 'wood',
    fridge: 'metal',
    console: 'metal',
    freezer: 'metal',
    cd: 'metal',
    radio: 'metal',
    guitar: 'wood',
    clock: 'metal',
    washer: 'metal',
    table: 'wood',
    mirror: 'metal',
    rug: 'fabric',
    piano: 'wood',
    microwave: 'metal',
    vase: 'painted',
};

function _isNearWhite(material) {
    if (!material?.color) return false;
    const { r, g, b } = material.color;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = max - min;
    return brightness > 0.9 && saturation < 0.08;
}

function _isNearGray(material) {
    if (!material?.color) return false;
    const { r, g, b } = material.color;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = max - min;
    return brightness > 0.24 && brightness < 0.9 && saturation < 0.08;
}

function _isNearBlack(material) {
    if (!material?.color) return false;
    const { r, g, b } = material.color;
    const brightness = (r + g + b) / 3;
    return brightness < 0.08;
}

function _hasWorkingMap(material) {
    return !!(material?.map && material.map.image);
}

function _buildExternalReskinMaterial(type, sourceMaterial) {
    const accent = new THREE.Color(FURNITURE_COLORS[type] || 0xD2B48C);
    const surface = FURNITURE_SURFACES[type] || 'painted';
    const surfaceProps = getSurfaceMaterialProps(texturePack, surface);

    if (['fridge', 'washer', 'freezer', 'microwave', 'clock', 'mirror', 'cd'].includes(type)) {
        accent.lerp(new THREE.Color(0xdfe8ef), 0.35);
    }
    if (type === 'tv' || type === 'console') {
        accent.lerp(new THREE.Color(0x263544), 0.45);
    }

    return new THREE.MeshStandardMaterial({
        color: accent,
        ...surfaceProps,
        roughness: THREE.MathUtils.clamp(surfaceProps.roughness ?? 0.62, 0.35, 0.9),
        metalness: THREE.MathUtils.clamp(surfaceProps.metalness ?? 0.08, 0.02, 0.35),
        transparent: !!sourceMaterial?.transparent && (sourceMaterial?.opacity ?? 1) < 1,
        opacity: sourceMaterial?.transparent ? sourceMaterial.opacity : 1,
    });
}

function _polishExternalFurnitureMaterials(root, type) {
    const accent = new THREE.Color(FURNITURE_COLORS[type] || 0xD2B48C);
    const surface = FURNITURE_SURFACES[type] || 'painted';
    const surfaceProps = getSurfaceMaterialProps(texturePack, surface);
    root.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const polished = mats.map((material) => {
            if (!material || !material.isMaterial) return material;
            const hasMap = _hasWorkingMap(material);
            // Only reskin completely if no map AND no color or very weird color.
            // Many external models look better if left mostly alone.
            const needsReskin = !hasMap && (_isNearWhite(material) || _isNearGray(material));

            const next = needsReskin
                ? _buildExternalReskinMaterial(type, material)
                : material.clone();

            // If we don't have a map, try applying the procedural surface properties (like wood grain)
            if (!next.map && surfaceProps.map) {
                next.map = surfaceProps.map;
            }
            _ensureColorMapColorSpace(next);

            if (next.color) {
                const brightness = (next.color.r + next.color.g + next.color.b) / 3;
                const max = Math.max(next.color.r, next.color.g, next.color.b);
                const min = Math.min(next.color.r, next.color.g, next.color.b);
                const saturation = max - min;

                // Even with a texture map, Kenney models use a white base color and an atlas.
                // We tint the base color so the texture inherits the accent.
                if (saturation < 0.1) {
                    next.color.lerp(accent, hasMap ? 0.55 : 0.9);
                } else if (brightness > 0.78) {
                    next.color.lerp(accent, hasMap ? 0.3 : 0.5);
                } else if (_isNearBlack(next)) {
                    next.color.lerp(accent, 0.6);
                } else {
                    next.color.lerp(accent, 0.22); // lighter touch
                }
            }

            if (typeof next.roughness === 'number') {
                // Keep original roughness roughly intact, just bound it a bit.
                next.roughness = THREE.MathUtils.clamp(next.roughness, 0.2, 0.95);
            }
            if (typeof next.metalness === 'number') {
                next.metalness = THREE.MathUtils.clamp(next.metalness, 0.0, 0.5);
            }

            // Add a very subtle emissive rim for a "premium" pop
            if ('emissive' in next) {
                next.emissive = next.emissive || new THREE.Color(0x000000);
                next.emissive.lerp(accent, 0.08);
                next.emissiveIntensity = Math.max(0.06, next.emissiveIntensity || 0.06);
            }
            next.envMapIntensity = Math.max(0.4, next.envMapIntensity || 0.4);
            return next;
        });
        node.material = Array.isArray(node.material) ? polished : polished[0];
    });
}

function _applyProceduralFurnitureFinish(root, type) {
    const surface = FURNITURE_SURFACES[type] || 'painted';
    const surfaceProps = getSurfaceMaterialProps(texturePack, surface);
    const accent = new THREE.Color(FURNITURE_COLORS[type] || 0xD2B48C);
    root.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const nextMats = mats.map((material) => {
            if (!material || !material.isMaterial) return material;
            const next = material.clone();

            if (!next.map && surfaceProps.map) {
                next.map = surfaceProps.map;
            }
            _ensureColorMapColorSpace(next);
            if (typeof next.roughness === 'number') {
                next.roughness = THREE.MathUtils.clamp(next.roughness, 0.38, 0.88);
            }
            if (typeof next.metalness === 'number') {
                next.metalness = THREE.MathUtils.clamp(next.metalness, 0.02, 0.18);
            }
            if (_isNearBlack(next)) {
                next.color.lerp(accent, 0.52);
            }
            if ('emissive' in next) {
                next.emissive = next.emissive || new THREE.Color(0x000000);
                next.emissive.lerp(accent, 0.035);
                next.emissiveIntensity = Math.max(0.02, next.emissiveIntensity || 0.02);
            }
            next.envMapIntensity = Math.max(0.28, next.envMapIntensity || 0.28);
            return next;
        });
        node.material = Array.isArray(node.material) ? nextMats : nextMats[0];
    });
}

export function createFurniture(type) {
    if (EXTERNAL_FURNITURE_ENABLED) {
        if (!externalModelCatalog.ready) {
            return STRICT_CURATED_FURNITURE ? null : undefined;
        }
        const external = externalModelCatalog.cloneFurnitureForType(type);
        if (!external) {
            return STRICT_CURATED_FURNITURE ? null : undefined;
        }
        const spec = _specForType(type);
        const prepared = _prepareExternalModel(external, {
            ...spec,
            validationType: type,
            castShadow: false,
            receiveShadow: true
        });
        if (prepared) {
            _polishExternalFurnitureMaterials(prepared, type);
            prepared.userData.type = 'furniture';
            prepared.userData.furnitureType = type;
            return prepared;
        }
        return STRICT_CURATED_FURNITURE ? null : undefined;
    }

    const group = new THREE.Group();
    const color = FURNITURE_COLORS[type] || 0xD2B48C;

    switch (type) {
        case 'box':
            const cardboard = box(0.5, 0.5, 0.5, color);
            cardboard.position.y = 0.25;
            group.add(cardboard);
            // Tape
            const tape = box(0.52, 0.05, 0.15, 0xc29547);
            tape.position.y = 0.51;
            group.add(tape);
            break;

        case 'sofa':
            const seat = box(0.9, 0.35, 0.45, color, { surface: 'fabric' });
            seat.position.y = 0.25;
            group.add(seat);
            const backS = box(0.9, 0.4, 0.15, 0x229954, { surface: 'fabric' });
            backS.position.set(0, 0.55, -0.2);
            group.add(backS);
            const armLS = box(0.15, 0.35, 0.45, 0x229954, { surface: 'fabric' });
            armLS.position.set(-0.45, 0.45, 0);
            group.add(armLS);
            const armRS = box(0.15, 0.35, 0.45, 0x229954, { surface: 'fabric' });
            armRS.position.set(0.45, 0.45, 0);
            group.add(armRS);
            // Cute cushion
            const cushionL = box(0.35, 0.1, 0.25, 0xf1c40f, { surface: 'fabric' });
            cushionL.position.set(-0.2, 0.45, -0.05);
            group.add(cushionL);
            const cushionR = box(0.35, 0.1, 0.25, 0xf1c40f, { surface: 'fabric' });
            cushionR.position.set(0.2, 0.45, -0.05);
            group.add(cushionR);
            break;

        case 'tv':
            const screen = box(0.8, 0.5, 0.1, 0x222222, { surface: 'metal' });
            screen.position.y = 0.6;
            group.add(screen);
            // Screen display (emissive)
            const display = box(0.72, 0.4, 0.02, 0x3498db, { emissive: 0x1a5276, emissiveIntensity: 0.5 });
            display.position.set(0, 0.6, 0.05);
            group.add(display);
            // Stand
            const stand = cylinder(0.06, 0.06, 0.3, 0x1a1a1a, 8, { surface: 'stone' });
            stand.position.y = 0.2;
            group.add(stand);
            const base = box(0.4, 0.06, 0.2, 0x1a1a1a, { surface: 'stone' });
            base.position.y = 0.03;
            group.add(base);
            break;

        case 'lamp':
            const pole = cylinder(0.03, 0.03, 0.7, 0x808080);
            pole.position.y = 0.35;
            group.add(pole);
            const shade = new THREE.Mesh(
                new THREE.ConeGeometry(0.25, 0.3, 8, 1, true),
                new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.64, metalness: 0.08, side: THREE.DoubleSide })
            );
            shade.position.y = 0.75;
            shade.castShadow = true;
            group.add(shade);
            const lbase = cylinder(0.12, 0.12, 0.04, 0x808080, 12);
            lbase.position.y = 0.02;
            group.add(lbase);
            break;

        case 'plant':
            const pot = cylinder(0.15, 0.12, 0.25, 0xc0392b, 8);
            pot.position.y = 0.125;
            group.add(pot);
            const foliage = sphere(0.25, 0x27ae60);
            foliage.position.y = 0.45;
            group.add(foliage);
            const leaf1 = sphere(0.15, 0x229954);
            leaf1.position.set(0.15, 0.55, 0.1);
            group.add(leaf1);
            break;

        case 'bookshelf':
            const shelf = box(0.6, 0.8, 0.3, color);
            shelf.position.y = 0.4;
            group.add(shelf);
            // Books (colored stripes)
            const bookColors = [0xe74c3c, 0x2ecc71, 0x3498db, 0xf39c12];
            bookColors.forEach((c, i) => {
                const book = box(0.12, 0.3, 0.25, c);
                book.position.set(-0.2 + i * 0.13, 0.55, 0);
                group.add(book);
            });
            break;

        case 'chair':
            const cseat = box(0.4, 0.05, 0.4, color);
            cseat.position.y = 0.35;
            group.add(cseat);
            const cback = box(0.4, 0.35, 0.05, color);
            cback.position.set(0, 0.55, -0.2);
            group.add(cback);
            // Legs
            [[-0.15, 0, -0.15], [0.15, 0, -0.15], [-0.15, 0, 0.15], [0.15, 0, 0.15]].forEach(([cx, cy, cz]) => {
                const cleg = cylinder(0.03, 0.03, 0.35, 0x8B4513);
                cleg.position.set(cx, 0.175, cz);
                group.add(cleg);
            });
            break;

        case 'fridge':
            const fridgeBody = box(0.6, 1.2, 0.5, color, { surface: 'metal' });
            fridgeBody.position.y = 0.6;
            group.add(fridgeBody);
            // Top door
            const fridgeDoor1 = box(0.58, 0.7, 0.05, 0xe0e0e0, { surface: 'metal' });
            fridgeDoor1.position.set(0, 0.8, 0.26);
            group.add(fridgeDoor1);
            // Bottom door
            const fridgeDoor2 = box(0.58, 0.35, 0.05, 0xe0e0e0, { surface: 'metal' });
            fridgeDoor2.position.set(0, 0.22, 0.26);
            group.add(fridgeDoor2);
            // Handles
            const handle1 = cylinder(0.02, 0.02, 0.3, 0x808080, 8, { surface: 'metal' });
            handle1.position.set(0.2, 0.8, 0.3);
            group.add(handle1);
            const handle2 = cylinder(0.02, 0.02, 0.15, 0x808080, 8, { surface: 'metal' });
            handle2.position.set(0.2, 0.28, 0.3);
            group.add(handle2);
            break;

        case 'console':
            const cbox = box(0.35, 0.08, 0.25, 0x1a1a1a);
            cbox.position.y = 0.04;
            group.add(cbox);
            const light = sphere(0.03, 0x2ecc71, { emissive: 0x2ecc71, emissiveIntensity: 0.5 });
            light.position.set(0.12, 0.1, 0.1);
            group.add(light);
            break;

        case 'freezer':
            const fBody = box(0.6, 0.5, 0.45, color);
            fBody.position.y = 0.25;
            group.add(fBody);
            const fLid = box(0.62, 0.05, 0.47, 0x2980b9);
            fLid.position.y = 0.52;
            group.add(fLid);
            break;

        case 'cd':
            const disc = cylinder(0.2, 0.2, 0.02, 0xbdc3c7, 16);
            disc.position.y = 0.15;
            group.add(disc);
            const hole = cylinder(0.05, 0.05, 0.03, 0x999999, 16);
            hole.position.y = 0.15;
            group.add(hole);
            break;

        case 'radio':
            const rBody = box(0.4, 0.25, 0.2, color);
            rBody.position.y = 0.125;
            group.add(rBody);
            const speaker1 = cylinder(0.06, 0.06, 0.02, 0x333333, 12);
            speaker1.position.set(-0.1, 0.14, 0.11);
            speaker1.rotation.x = Math.PI / 2;
            group.add(speaker1);
            const speaker2 = cylinder(0.06, 0.06, 0.02, 0x333333, 12);
            speaker2.position.set(0.1, 0.14, 0.11);
            speaker2.rotation.x = Math.PI / 2;
            group.add(speaker2);
            break;

        case 'guitar':
            const gBody = sphere(0.2, color);
            gBody.position.y = 0.3;
            gBody.scale.set(1, 0.5, 1);
            group.add(gBody);
            const neck = box(0.06, 0.5, 0.04, 0x8B4513);
            neck.position.set(0, 0.6, 0);
            group.add(neck);
            const gHead = box(0.1, 0.1, 0.04, 0x333333);
            gHead.position.y = 0.88;
            group.add(gHead);
            break;

        case 'clock':
            const face = cylinder(0.2, 0.2, 0.05, 0xecf0f1, 16);
            face.position.y = 0.4;
            face.rotation.x = Math.PI / 2;
            group.add(face);
            const frame = cylinder(0.22, 0.22, 0.06, color, 16);
            frame.position.y = 0.4;
            frame.rotation.x = Math.PI / 2;
            group.add(frame);
            // Hour hand
            const hand = box(0.02, 0.12, 0.01, 0x000000);
            hand.position.set(0, 0.43, 0.03);
            hand.rotation.z = Math.PI / 6;
            group.add(hand);
            break;

        case 'washer':
            const wBody = box(0.55, 0.6, 0.5, color);
            wBody.position.y = 0.3;
            group.add(wBody);
            const wDoor = cylinder(0.15, 0.15, 0.02, 0x87CEEB, 12);
            wDoor.position.set(0, 0.3, 0.26);
            wDoor.rotation.x = Math.PI / 2;
            group.add(wDoor);
            const wFrame = cylinder(0.17, 0.17, 0.03, 0x999999, 12);
            wFrame.position.set(0, 0.3, 0.26);
            wFrame.rotation.x = Math.PI / 2;
            group.add(wFrame);
            break;

        case 'table':
            // Wooden dining table
            const tTop = box(0.9, 0.08, 0.55, color, { surface: 'wood' });
            tTop.position.y = 0.5;
            group.add(tTop);
            [[-0.38, 0, -0.22], [0.38, 0, -0.22], [-0.38, 0, 0.22], [0.38, 0, 0.22]].forEach(([tx, ty, tz]) => {
                const tLeg = cylinder(0.04, 0.03, 0.5, 0x6B4513, 8, { surface: 'wood' });
                tLeg.position.set(tx, 0.25, tz);
                group.add(tLeg);
            });
            break;

        case 'mirror':
            // Standing oval mirror
            const mFrame2 = cylinder(0.25, 0.25, 0.03, 0x8B4513, 16);
            mFrame2.position.y = 0.55;
            mFrame2.rotation.x = Math.PI / 2;
            mFrame2.scale.y = 1.4;
            group.add(mFrame2);
            const mGlass = cylinder(0.2, 0.2, 0.02, 0xaacce8, 16);
            mGlass.position.y = 0.55;
            mGlass.rotation.x = Math.PI / 2;
            mGlass.scale.y = 1.4;
            group.add(mGlass);
            const mStand = cylinder(0.03, 0.03, 0.35, 0x8B4513);
            mStand.position.y = 0.175;
            group.add(mStand);
            const mBase2 = cylinder(0.12, 0.12, 0.04, 0x8B4513, 12);
            mBase2.position.y = 0.02;
            group.add(mBase2);
            break;

        case 'rug':
            // Rolled-up carpet
            const rugRoll = cylinder(0.12, 0.12, 0.7, color);
            rugRoll.position.y = 0.12;
            rugRoll.rotation.z = Math.PI / 2;
            group.add(rugRoll);
            // Pattern stripe
            const rugStripe = cylinder(0.125, 0.125, 0.2, 0xf39c12);
            rugStripe.position.y = 0.12;
            rugStripe.rotation.z = Math.PI / 2;
            group.add(rugStripe);
            // Fringe ends
            const fringeL = cylinder(0.13, 0.08, 0.04, 0xe8c870);
            fringeL.position.set(-0.37, 0.12, 0);
            fringeL.rotation.z = Math.PI / 2;
            group.add(fringeL);
            const fringeR = cylinder(0.13, 0.08, 0.04, 0xe8c870);
            fringeR.position.set(0.37, 0.12, 0);
            fringeR.rotation.z = Math.PI / 2;
            group.add(fringeR);
            break;

        case 'piano':
            // Upright piano
            const pBody = box(0.7, 0.7, 0.35, color);
            pBody.position.y = 0.35;
            group.add(pBody);
            // Keys (white strip)
            const pKeys = box(0.65, 0.04, 0.12, 0xffffff);
            pKeys.position.set(0, 0.25, 0.2);
            group.add(pKeys);
            // Black keys
            for (let k = 0; k < 5; k++) {
                const bk = box(0.04, 0.05, 0.07, 0x000000);
                bk.position.set(-0.24 + k * 0.12, 0.27, 0.17);
                group.add(bk);
            }
            // Top lid
            const pLid = box(0.72, 0.03, 0.36, 0x222222);
            pLid.position.y = 0.72;
            group.add(pLid);
            break;

        case 'microwave':
            // Compact microwave
            const mwBody = box(0.45, 0.28, 0.3, color);
            mwBody.position.y = 0.14;
            group.add(mwBody);
            // Door window
            const mwDoor = box(0.25, 0.18, 0.02, 0x333333);
            mwDoor.position.set(-0.05, 0.16, 0.16);
            group.add(mwDoor);
            // Control panel
            const mwPanel = box(0.08, 0.18, 0.02, 0x444444);
            mwPanel.position.set(0.16, 0.16, 0.16);
            group.add(mwPanel);
            // Buttons
            const mwBtn = sphere(0.02, 0x2ecc71, { emissive: 0x2ecc71, emissiveIntensity: 0.3 });
            mwBtn.position.set(0.16, 0.2, 0.18);
            group.add(mwBtn);
            break;

        case 'vase':
            // Ceramic vase with flowers
            const vBody = cylinder(0.08, 0.12, 0.3, color, 8);
            vBody.position.y = 0.15;
            group.add(vBody);
            const vNeck = cylinder(0.06, 0.08, 0.1, color, 8);
            vNeck.position.y = 0.35;
            group.add(vNeck);
            // Flowers
            const fColors = [0xff6b9d, 0xf1c40f, 0xff4444];
            fColors.forEach((fc, fi) => {
                const flower = sphere(0.06, fc);
                const a = (fi / 3) * Math.PI * 2;
                flower.position.set(Math.cos(a) * 0.06, 0.48 + fi * 0.04, Math.sin(a) * 0.06);
                group.add(flower);
                // Stem
                const stem = cylinder(0.01, 0.01, 0.12, 0x27ae60);
                stem.position.set(Math.cos(a) * 0.03, 0.42, Math.sin(a) * 0.03);
                group.add(stem);
            });
            break;

        default:
            // Generic box
            const g = box(0.4, 0.4, 0.4, color);
            g.position.y = 0.2;
            group.add(g);
    }

    _applyProceduralFurnitureFinish(group, type);
    group.userData.type = 'furniture';
    group.userData.furnitureType = type;
    return group;
}

// ============================================================
// POWER-UPS — glowing floating objects
// ============================================================
let powerUpSpriteTex = null;

export function createPowerUp(type) {
    const group = new THREE.Group();
    let meshColor = 0xffffff;

    if (type === 'powerup_coffee') {
        const cup = cylinder(0.2, 0.15, 0.4, 0xffffff);
        cup.position.y = 0.4;
        group.add(cup);
        const liquid = cylinder(0.18, 0.18, 0.05, 0x4a2e1b);
        liquid.position.y = 0.6;
        group.add(liquid);
        meshColor = 0x8B4513;
    } else if (type === 'powerup_clock') {
        const base = cylinder(0.3, 0.3, 0.1, 0xffffff);
        base.rotation.x = Math.PI / 2;
        base.position.y = 0.4;
        group.add(base);
        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.3, 0.05, 8, 16),
            new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.3, metalness: 0.8 })
        );
        rim.position.y = 0.4;
        group.add(rim);
        const hand = box(0.04, 0.2, 0.04, 0x000000);
        hand.position.set(0, 0.4, 0.05);
        hand.rotation.z = -Math.PI / 4;
        group.add(hand);
        meshColor = 0xf1c40f;
    } else if (type === 'powerup_shield') {
        const s = cylinder(0.3, 0.3, 0.1, 0x3498db);
        s.rotation.x = Math.PI / 2;
        s.position.y = 0.4;
        s.scale.set(1, 1.2, 1);
        group.add(s);
        const cross = box(0.1, 0.4, 0.15, 0xffffff);
        cross.position.y = 0.4;
        group.add(cross);
        const cross2 = box(0.4, 0.1, 0.15, 0xffffff);
        cross2.position.y = 0.4;
        group.add(cross2);
        meshColor = 0x3498db;
    } else if (type === 'powerup_beer') {
        const mug = cylinder(0.25, 0.25, 0.5, 0xe6a817);
        mug.position.y = 0.4;
        group.add(mug);
        const foam = sphere(0.26, 0xffffff);
        foam.position.y = 0.65;
        group.add(foam);
        const foam2 = sphere(0.15, 0xffffff);
        foam2.position.set(0.15, 0.65, 0);
        group.add(foam2);
        meshColor = 0xe6a817;
    }

    // Glow ring
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.4, 16),
        new THREE.MeshBasicMaterial({ color: meshColor, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    group.userData.type = 'powerup';
    group.userData.powerUpType = type;
    return group;
}

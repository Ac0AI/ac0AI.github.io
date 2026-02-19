import * as THREE from 'three';
import { createTexturePack, getSurfaceMaterialProps } from './textures.js';
import { externalModelCatalog } from './external-model-catalog.js';
import { MODEL_VALIDATION_LIMITS } from './asset-curation.js';

export const EXTERNAL_PLAYER_ENABLED = false;
export const EXTERNAL_DOG_ENABLED = false;
export const EXTERNAL_FURNITURE_ENABLED = true;

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
        return null;
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
        return null;
    }
    _tmpBox.getCenter(_tmpCenter);
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
            try { node.geometry.computeBoundingSphere(); } catch (_) {}
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
            receiveShadow: true
        });
        if (external) {
            external.userData.type = 'player';
            return external;
        }
    }

    const group = new THREE.Group();

    // Body (blue overalls)
    const body = box(0.7, 0.8, 0.5, 0x3498db);
    body.position.y = 0.7;
    group.add(body);

    // Overall bib + buttons
    const bib = box(0.42, 0.3, 0.06, 0x2e86c1, { surface: 'fabric' });
    bib.position.set(0, 0.77, 0.25);
    group.add(bib);
    const btnL = sphere(0.03, 0xf1c40f, { surface: 'metal' });
    btnL.position.set(-0.11, 0.82, 0.29);
    group.add(btnL);
    const btnR = sphere(0.03, 0xf1c40f, { surface: 'metal' });
    btnR.position.set(0.11, 0.82, 0.29);
    group.add(btnR);

    // Head (skin color)
    const head = sphere(0.3, 0xffccaa);
    head.position.y = 1.45;
    head.userData.baseY = head.position.y;
    group.add(head);

    // Nose
    const nose = sphere(0.035, 0xf7b998);
    nose.position.set(0, 1.4, 0.29);
    group.add(nose);

    // Cap (dark blue)
    const cap = cylinder(0.32, 0.32, 0.12, 0x2980b9, 12);
    cap.position.y = 1.65;
    group.add(cap);

    // Cap brim
    const brim = cylinder(0.35, 0.35, 0.04, 0x2980b9, 12);
    brim.position.y = 1.55;
    brim.position.z = 0.1;
    group.add(brim);

    // Eyes
    const eyeL = sphere(0.05, 0x000000);
    eyeL.position.set(-0.1, 1.45, 0.25);
    group.add(eyeL);

    const eyeR = sphere(0.05, 0x000000);
    eyeR.position.set(0.1, 1.45, 0.25);
    group.add(eyeR);

    // Cheeks
    const cheekL = sphere(0.04, 0xffb2a3, { surface: 'painted', transparent: true, opacity: 0.75 });
    cheekL.position.set(-0.16, 1.36, 0.23);
    group.add(cheekL);
    const cheekR = sphere(0.04, 0xffb2a3, { surface: 'painted', transparent: true, opacity: 0.75 });
    cheekR.position.set(0.16, 1.36, 0.23);
    group.add(cheekR);

    // Legs
    const legL = box(0.2, 0.5, 0.2, 0x2c3e50);
    legL.position.set(-0.18, 0.15, 0);
    legL.userData.baseY = legL.position.y;
    group.add(legL);

    const legR = box(0.2, 0.5, 0.2, 0x2c3e50);
    legR.position.set(0.18, 0.15, 0);
    legR.userData.baseY = legR.position.y;
    group.add(legR);

    // Shoes
    const shoeL = box(0.24, 0.09, 0.28, 0x111111, { surface: 'stone', roughness: 0.92, metalness: 0.01 });
    shoeL.position.set(-0.18, 0.03, 0.03);
    group.add(shoeL);
    const shoeR = box(0.24, 0.09, 0.28, 0x111111, { surface: 'stone', roughness: 0.92, metalness: 0.01 });
    shoeR.position.set(0.18, 0.03, 0.03);
    group.add(shoeR);

    // Arms
    const armL = box(0.15, 0.5, 0.15, 0x3498db);
    armL.position.set(-0.5, 0.75, 0);
    armL.userData.baseY = armL.position.y;
    group.add(armL);

    const armR = box(0.15, 0.5, 0.15, 0x3498db);
    armR.position.set(0.5, 0.75, 0);
    armR.userData.baseY = armR.position.y;
    group.add(armR);

    // Gloves
    const gloveL = sphere(0.08, 0xffccaa, { surface: 'fabric' });
    gloveL.position.set(-0.5, 0.5, 0.06);
    group.add(gloveL);
    const gloveR = sphere(0.08, 0xffccaa, { surface: 'fabric' });
    gloveR.position.set(0.5, 0.5, 0.06);
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
            receiveShadow: true
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

function _polishExternalFurnitureMaterials(root, type) {
    const accent = new THREE.Color(FURNITURE_COLORS[type] || 0xD2B48C);
    root.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const polished = mats.map((material) => {
            if (!material || !material.isMaterial) return material;
            const next = material.clone();

            if (next.color && !next.map) {
                const brightness = (next.color.r + next.color.g + next.color.b) / 3;
                if (brightness > 0.78) {
                    next.color.lerp(accent, 0.42);
                } else {
                    next.color.lerp(accent, 0.16);
                }
            }

            if (typeof next.roughness === 'number') {
                next.roughness = THREE.MathUtils.clamp(next.roughness, 0.35, 0.86);
            }
            if (typeof next.metalness === 'number') {
                next.metalness = THREE.MathUtils.clamp(next.metalness, 0.02, 0.2);
            }
            return next;
        });
        node.material = Array.isArray(node.material) ? polished : polished[0];
    });
}

export function createFurniture(type) {
    if (EXTERNAL_FURNITURE_ENABLED && externalModelCatalog.ready) {
        const external = externalModelCatalog.cloneFurnitureForType(type);
        if (external) {
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
        }
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
            const seat = box(0.8, 0.3, 0.4, color);
            seat.position.y = 0.25;
            group.add(seat);
            const back = box(0.8, 0.35, 0.1, 0x229954);
            back.position.set(0, 0.47, -0.2);
            group.add(back);
            const armL = box(0.1, 0.3, 0.4, 0x229954);
            armL.position.set(-0.4, 0.35, 0);
            group.add(armL);
            const armR = box(0.1, 0.3, 0.4, 0x229954);
            armR.position.set(0.4, 0.35, 0);
            group.add(armR);
            break;

        case 'tv':
            const screen = box(0.7, 0.45, 0.05, 0x1a1a1a);
            screen.position.y = 0.55;
            group.add(screen);
            // Screen display
            const display = box(0.6, 0.35, 0.01, 0x3498db, { emissive: 0x1a5276, emissiveIntensity: 0.3 });
            display.position.set(0, 0.55, 0.03);
            group.add(display);
            // Stand
            const stand = cylinder(0.04, 0.04, 0.3, 0x333333);
            stand.position.y = 0.15;
            group.add(stand);
            const base = cylinder(0.15, 0.15, 0.04, 0x333333, 12);
            base.position.y = 0.02;
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
            const fridgeBody = box(0.5, 0.9, 0.45, color);
            fridgeBody.position.y = 0.45;
            group.add(fridgeBody);
            const fridgeHandle = cylinder(0.02, 0.02, 0.3, 0x808080);
            fridgeHandle.position.set(0.27, 0.55, 0);
            group.add(fridgeHandle);
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
            const tTop = box(0.8, 0.06, 0.5, color);
            tTop.position.y = 0.45;
            group.add(tTop);
            [[-0.33, 0, -0.18], [0.33, 0, -0.18], [-0.33, 0, 0.18], [0.33, 0, 0.18]].forEach(([tx, ty, tz]) => {
                const tLeg = cylinder(0.03, 0.03, 0.45, 0x6B4513);
                tLeg.position.set(tx, 0.225, tz);
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

    group.userData.type = 'furniture';
    group.userData.furnitureType = type;
    return group;
}

// ============================================================
// POWER-UPS — glowing floating objects
// ============================================================
export function createPowerUp(type) {
    const group = new THREE.Group();

    const colors = {
        powerup_coffee: 0x8B4513,
        powerup_clock: 0xf1c40f,
        powerup_shield: 0x3498db,
        powerup_beer: 0xe6a817,
    };
    const color = colors[type] || 0xffffff;

    switch (type) {
        case 'powerup_coffee':
            const cup = cylinder(0.12, 0.1, 0.2, color);
            cup.position.y = 0.3;
            group.add(cup);
            // Steam
            const steam = sphere(0.06, 0xffffff, { transparent: true, opacity: 0.5 });
            steam.position.y = 0.5;
            group.add(steam);
            break;

        case 'powerup_clock':
            const clockFace = cylinder(0.18, 0.18, 0.04, 0xecf0f1, 16);
            clockFace.position.y = 0.3;
            group.add(clockFace);
            const clockFrame = cylinder(0.2, 0.2, 0.05, color, 16);
            clockFrame.position.y = 0.3;
            group.add(clockFrame);
            break;

        case 'powerup_shield':
            const shield = sphere(0.2, color, { transparent: true, opacity: 0.7 });
            shield.position.y = 0.3;
            shield.scale.set(1, 1.3, 0.3);
            group.add(shield);
            break;

        case 'powerup_beer':
            const mug = cylinder(0.1, 0.1, 0.25, color);
            mug.position.y = 0.25;
            group.add(mug);
            const foam = cylinder(0.11, 0.11, 0.06, 0xffffff);
            foam.position.y = 0.4;
            group.add(foam);
            break;

        default:
            const orb = sphere(0.15, color, { emissive: color, emissiveIntensity: 0.3 });
            orb.position.y = 0.3;
            group.add(orb);
    }

    // Glow ring
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.3, 16),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    group.userData.type = 'powerup';
    group.userData.powerUpType = type;
    return group;
}

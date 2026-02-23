import * as THREE from 'three';
import { createTexturePack, getSurfaceMaterialProps } from './textures.js';
import { externalModelCatalog } from './external-model-catalog.js';
import { CURATED_ROLE_MODELS, MODEL_VALIDATION_LIMITS } from './asset-curation.js';

// Runtime now uses external models only (no procedural gameplay fallbacks).
export const EXTERNAL_PLAYER_ENABLED = true;
export const EXTERNAL_DOG_ENABLED = true;
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
    const hadFiniteBounds = Number.isFinite(_tmpBox.min.y) && Number.isFinite(_tmpBox.max.y);

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
    // Skinned assets often include animation bounds much wider than gameplay stance.
    // Prioritize height normalization so characters don't get shrunk into tiny silhouettes.
    const baseScale = hasSkinnedMesh ? scaleFromHeight : Math.min(scaleFromHeight, scaleFromExtent);
    const uniformScale = baseScale * (opts.extraScale || 1);
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
    if (Number.isFinite(_tmpBox.min.x) && Number.isFinite(_tmpBox.max.x) && Number.isFinite(_tmpBox.min.z) && Number.isFinite(_tmpBox.max.z)) {
        _tmpBox.getCenter(_tmpCenter);
    }
    const safeCenterX = Number.isFinite(_tmpCenter.x) ? _tmpCenter.x : 0;
    const safeCenterZ = Number.isFinite(_tmpCenter.z) ? _tmpCenter.z : 0;
    const safeMinY = (Number.isFinite(_tmpBox.min.y) ? _tmpBox.min.y : (hadFiniteBounds ? 0 : -targetHeight * 0.5));
    root.position.x -= safeCenterX;
    root.position.z -= safeCenterZ;
    root.position.y -= safeMinY;
    root.position.y += opts.yOffset || 0;
    root.updateWorldMatrix(true, true);

    if (!hasSkinnedMesh) {
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
    }

    root.userData.externalModel = true;
    return root;
}

function _tryCreateExternalRole(role, opts = {}) {
    if (!externalModelCatalog.ready) return null;
    const root = externalModelCatalog.cloneRole(role);
    return root ? _prepareExternalModel(root, { ...opts, validationType: role }) : null;
}

function _tryCreateExternalRoleWithFallbacks(role, opts = {}) {
    if (!externalModelCatalog.ready) return null;
    const candidates = [
        ...(Array.isArray(CURATED_ROLE_MODELS[role]) ? CURATED_ROLE_MODELS[role] : []),
        externalModelCatalog.roleId?.[role]
    ].filter(Boolean);
    const seen = new Set();
    for (const id of candidates) {
        if (seen.has(id)) continue;
        seen.add(id);
        const root = externalModelCatalog.cloneById(id);
        const prepared = root ? _prepareExternalModel(root, { ...opts, validationType: role }) : null;
        if (prepared) return prepared;
    }
    return null;
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
    const external = _tryCreateExternalRoleWithFallbacks('player', {
        targetHeight: 1.95,
        maxExtent: 1.35,
        castShadow: true,
        receiveShadow: true,
        allowSkinned: true
    });
    if (!external) return null;
    _polishExternalPlayerMaterials(external);
    external.userData.type = 'player';
    return external;
}

// ============================================================
// TRUCK — delivery truck
// ============================================================
export function createTruck() {
    const truckSpec = _specForType('truck');
    const external = _tryCreateExternalRoleWithFallbacks('truck', {
        ...truckSpec,
        castShadow: true,
        receiveShadow: true
    });
    if (external) {
        external.userData.type = 'truck';
        return external;
    }
    return null;
}

// ============================================================
// HOUSE — cute little house
// ============================================================
export function createHouse() {
    const buildingSpec = _specForType('building');
    const external = _tryCreateExternalRoleWithFallbacks('building', {
        ...buildingSpec,
        castShadow: true,
        receiveShadow: true
    });
    if (external) {
        external.userData.type = 'house';
        return external;
    }
    return null;
}

// ============================================================
// SHEEP — fluffy cloud sheep
// ============================================================
export function createSheep(scale = 1) {
    const opts = {
        targetHeight: 1.2 * scale,
        maxExtent: 1.8 * scale,
        castShadow: false,
        receiveShadow: true,
        allowSkinned: true
    };
    const external = _tryCreateExternalAnimal('sheep', opts) || _tryCreateExternalRoleWithFallbacks('sheep', opts);
    if (!external) return null;
    external.userData.type = 'sheep';
    return external;
}

// ============================================================
// DOG — Swedish Vallhund
// ============================================================
export function createDog() {
    if (!EXTERNAL_DOG_ENABLED) return null;
    const opts = {
        targetHeight: 1.1,
        maxExtent: 1.6,
        castShadow: false,
        receiveShadow: true,
        allowSkinned: true
    };
    const external = _tryCreateExternalAnimal('dog', opts) || _tryCreateExternalRoleWithFallbacks('dog', opts);
    if (!external) return null;
    external.traverse((node) => {
        if (node?.isMesh) node.visible = true;
    });
    external.userData.type = 'dog';
    return external;
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

export function createFurniture(type) {
    if (!EXTERNAL_FURNITURE_ENABLED) return null;
    if (!externalModelCatalog.ready) return null;
    const external = externalModelCatalog.cloneFurnitureForType(type);
    if (!external) return null;
    const spec = _specForType(type);
    const prepared = _prepareExternalModel(external, {
        ...spec,
        validationType: type,
        castShadow: false,
        receiveShadow: true
    });
    if (!prepared) return null;
    _polishExternalFurnitureMaterials(prepared, type);
    prepared.userData.type = 'furniture';
    prepared.userData.furnitureType = type;
    return prepared;
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

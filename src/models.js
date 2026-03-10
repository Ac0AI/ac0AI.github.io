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
const _tmpBakedVertex = new THREE.Vector3();

function _specForType(type) {
    return MODEL_VALIDATION_LIMITS.TARGET_DIMENSIONS_PER_TYPE[type]
        || MODEL_VALIDATION_LIMITS.TARGET_DIMENSIONS_PER_TYPE.default;
}

function _limitForType(bucket, type, fallback) {
    const limits = MODEL_VALIDATION_LIMITS[bucket] || {};
    return limits[type] || limits.default || fallback;
}

function _bakeSkinnedMeshesToStatic(root) {
    if (!root) return;
    const skinnedMeshes = [];
    root.updateWorldMatrix(true, true);
    root.traverse((node) => {
        if (node?.isSkinnedMesh && node.geometry && node.parent) {
            skinnedMeshes.push(node);
        }
    });

    for (const skinned of skinnedMeshes) {
        const sourcePos = skinned.geometry?.attributes?.position;
        if (!sourcePos || sourcePos.count <= 0) continue;

        if (typeof skinned.pose === 'function') {
            skinned.pose();
        }
        skinned.updateWorldMatrix(true, false);
        if (skinned.skeleton && typeof skinned.skeleton.update === 'function') {
            skinned.skeleton.update();
        }

        const bakedGeometry = skinned.geometry.clone();
        const bakedPos = new Float32Array(sourcePos.count * 3);
        for (let i = 0; i < sourcePos.count; i++) {
            if (typeof skinned.boneTransform === 'function') {
                skinned.boneTransform(i, _tmpBakedVertex);
            } else {
                _tmpBakedVertex.fromBufferAttribute(sourcePos, i);
            }
            const idx = i * 3;
            bakedPos[idx] = _tmpBakedVertex.x;
            bakedPos[idx + 1] = _tmpBakedVertex.y;
            bakedPos[idx + 2] = _tmpBakedVertex.z;
        }

        bakedGeometry.setAttribute('position', new THREE.BufferAttribute(bakedPos, 3));
        bakedGeometry.deleteAttribute('skinIndex');
        bakedGeometry.deleteAttribute('skinWeight');
        bakedGeometry.computeVertexNormals();
        bakedGeometry.computeBoundingSphere();
        bakedGeometry.computeBoundingBox();

        const nextMaterial = Array.isArray(skinned.material)
            ? skinned.material.map((material) => (material?.clone ? material.clone() : material))
            : (skinned.material?.clone ? skinned.material.clone() : skinned.material);

        const bakedMesh = new THREE.Mesh(bakedGeometry, nextMaterial);
        bakedMesh.name = skinned.name;
        bakedMesh.castShadow = skinned.castShadow;
        bakedMesh.receiveShadow = skinned.receiveShadow;
        bakedMesh.visible = skinned.visible;
        bakedMesh.frustumCulled = true;
        bakedMesh.position.copy(skinned.position);
        bakedMesh.quaternion.copy(skinned.quaternion);
        bakedMesh.scale.copy(skinned.scale);
        bakedMesh.renderOrder = skinned.renderOrder;
        bakedMesh.userData = { ...skinned.userData };

        skinned.parent.add(bakedMesh);
        skinned.parent.remove(skinned);
    }
}

function _prepareExternalModel(root, opts = {}) {
    if (!root) return null;

    const castShadow = opts.castShadow !== false;
    const receiveShadow = opts.receiveShadow !== false;
    const allowSkinned = opts.allowSkinned === true;
    const bakeSkinned = opts.bakeSkinned !== false;
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

    if (hasSkinnedMesh && bakeSkinned) {
        _bakeSkinnedMeshesToStatic(root);
        hasSkinnedMesh = false;
        totalVertices = 0;
        root.traverse((node) => {
            if (!node.isMesh) return;
            const vertCount = node.geometry?.attributes?.position?.count || 0;
            totalVertices += vertCount;
            node.castShadow = castShadow && vertCount < 9000;
            node.receiveShadow = receiveShadow;
            node.frustumCulled = true;
        });
    }

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

function _polishExternalAnimalMaterials(root, kind = 'sheep', variant = null) {
    const palette = kind === 'dog'
        ? {
            main: new THREE.Color(0xb99165),
            dark: new THREE.Color(0x3d2d20),
            light: new THREE.Color(0xe8d7bf),
            emissive: new THREE.Color(0x2a1d11)
        }
        : {
            main: new THREE.Color(0xf2f3ef),
            dark: new THREE.Color(0x3a3430),
            light: new THREE.Color(0xffffff),
            emissive: new THREE.Color(0x1a1a1a)
        };
    const woolTint = kind === 'sheep' && variant?.woolTint
        ? new THREE.Color(variant.woolTint)
        : null;
    const glowTint = kind === 'sheep' && variant?.glowTint
        ? new THREE.Color(variant.glowTint)
        : null;
    const furSurface = getSurfaceMaterialProps(texturePack, 'fabric');

    root.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const nextMats = mats.map((material) => {
            if (!material || !material.isMaterial) return material;
            const next = material.clone();
            const brightness = next.color
                ? (next.color.r + next.color.g + next.color.b) / 3
                : 0.5;
            const target = brightness < 0.26
                ? palette.dark
                : brightness > 0.72
                    ? palette.light
                    : palette.main;

            if (!next.map && furSurface.map) {
                next.map = furSurface.map;
            }
            _ensureColorMapColorSpace(next);
            if (next.color) {
                next.color.lerp(target, kind === 'dog' ? 0.54 : 0.62);
                if (kind === 'sheep') {
                    const hsl = { h: 0, s: 0, l: 0 };
                    next.color.getHSL(hsl);
                    next.color.setHSL(
                        hsl.h,
                        THREE.MathUtils.clamp(hsl.s * 0.28 + 0.03, 0.02, 0.16),
                        THREE.MathUtils.clamp(Math.max(hsl.l, 0.84), 0.84, 0.96)
                    );
                    if (woolTint) {
                        next.color.lerp(woolTint, 0.34);
                    }
                }
            }
            if (typeof next.roughness === 'number') {
                next.roughness = THREE.MathUtils.clamp(next.roughness, 0.52, 0.94);
            } else {
                next.roughness = furSurface.roughness;
            }
            if (typeof next.metalness === 'number') {
                next.metalness = THREE.MathUtils.clamp(next.metalness, 0.0, 0.12);
            } else {
                next.metalness = 0.02;
            }
            if ('emissive' in next) {
                next.emissive = next.emissive || new THREE.Color(0x000000);
                if (kind === 'sheep') {
                    next.emissive.lerp(glowTint || new THREE.Color(0xffffff), glowTint ? 0.14 : 0.06);
                    next.emissiveIntensity = Math.max(glowTint ? 0.11 : 0.07, next.emissiveIntensity || 0.07);
                } else {
                    next.emissive.lerp(palette.emissive, 0.08);
                    next.emissiveIntensity = Math.max(0.04, next.emissiveIntensity || 0.04);
                }
            }
            next.envMapIntensity = Math.max(0.22, next.envMapIntensity || 0.22);
            return next;
        });
        node.material = Array.isArray(node.material) ? nextMats : nextMats[0];
    });
}

const SHEEP_THEME_STYLES = {
    1: {
        woolTint: 0xfefbf1,
        glowTint: 0xffffff,
        eyeIris: 0x63e0bd,
        eyeIrisGlow: 0x1f705f,
        nose: 0xffb4c7,
        nostril: 0xdf788f,
        blush: 0xff7eb3,
        smile: 0xb05070,
        mouth: 0x6b2d3e,
        bow: 0xff72b0,
        fluff: 0xfef9f0,
        scarf: 0x8fe8b4,
        scarfTag: 0xffe5a8,
        star: 0xffe066,
        starEmissive: 0x604010,
        hatPalette: [0x00c6ff, 0xff7fc0, 0x6ee7b7, 0xffd6a5, 0xb5a8ff],
        hatChance: 0.84,
    },
    2: {
        woolTint: 0xf5e0c3,
        glowTint: 0xffd7a6,
        eyeIris: 0xbde36f,
        eyeIrisGlow: 0x4e6e1f,
        nose: 0xf2ab7e,
        nostril: 0xc56f48,
        blush: 0xffb28e,
        smile: 0x9d4e2b,
        mouth: 0x5f2d17,
        bow: 0xe97f35,
        fluff: 0xf7ead6,
        scarf: 0xd95d39,
        scarfTag: 0xffd17a,
        star: 0xffb347,
        starEmissive: 0x6d3408,
        hatPalette: [0xff9f43, 0xf7b267, 0xc96f2d, 0xa15c38, 0xe76f51],
        hatChance: 0.78,
    },
    3: {
        woolTint: 0xfcfdff,
        glowTint: 0xb8e2ff,
        eyeIris: 0x88d8ff,
        eyeIrisGlow: 0x3e7ab0,
        nose: 0xf0bfd6,
        nostril: 0xc484a1,
        blush: 0xd8f0ff,
        smile: 0x7b97c7,
        mouth: 0x5474a4,
        bow: 0x8bc8ff,
        fluff: 0xffffff,
        scarf: 0xd4ecff,
        scarfTag: 0x9bd5ff,
        star: 0xdff7ff,
        starEmissive: 0x4b90c8,
        hatPalette: [0xb8deff, 0xe4f3ff, 0x9dc2ff, 0x81dbff],
        hatChance: 0.74,
    },
    4: {
        woolTint: 0xe1d7ff,
        glowTint: 0x7bd7ff,
        eyeIris: 0x7ef3ff,
        eyeIrisGlow: 0x1a5e76,
        nose: 0xd9b5ff,
        nostril: 0x9d76d1,
        blush: 0xc68fff,
        smile: 0x6f54c6,
        mouth: 0x3b275f,
        bow: 0x7f9bff,
        fluff: 0xefe7ff,
        scarf: 0x6dffd8,
        scarfTag: 0xa8fff1,
        star: 0x8df3ff,
        starEmissive: 0x195d73,
        hatPalette: [0x7f9bff, 0x9f8cff, 0x72e7ff, 0x6dffd8, 0xb8a6ff],
        hatChance: 0.88,
    },
    5: {
        woolTint: 0xf0c4a2,
        glowTint: 0xff9e63,
        eyeIris: 0xffc178,
        eyeIrisGlow: 0x7c3d16,
        nose: 0xff9f7e,
        nostril: 0xd66249,
        blush: 0xff9d78,
        smile: 0xb95635,
        mouth: 0x6b2919,
        bow: 0xff7a45,
        fluff: 0xf5d4b4,
        scarf: 0xffc15a,
        scarfTag: 0xfff0c2,
        star: 0xff934f,
        starEmissive: 0x7a2500,
        hatPalette: [0xff7a45, 0xffa552, 0xffd166, 0xd8572a, 0xffbc80],
        hatChance: 0.9,
    }
};

function _getSheepThemeStyle(variant = {}) {
    const level = Math.max(1, Math.min(5, Math.round(variant?.level || 1)));
    return SHEEP_THEME_STYLES[level] || SHEEP_THEME_STYLES[1];
}

function _markSheepAccessory(mesh) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData = { ...mesh.userData, noBossTint: true, sheepAccessory: true };
    return mesh;
}

function _addSheepStylePass(root, variant = {}) {
    if (!root) return;
    root.updateWorldMatrix(true, true);
    _tmpBox.setFromObject(root);
    _tmpBox.getSize(_tmpSize);
    if (
        !Number.isFinite(_tmpSize.x) || !Number.isFinite(_tmpSize.y) || !Number.isFinite(_tmpSize.z)
        || _tmpSize.y < 0.08
    ) {
        return;
    }

    const width = Math.max(0.22, _tmpSize.x);
    const height = Math.max(0.22, _tmpSize.y);
    const depth = Math.max(0.22, _tmpSize.z);
    // Bigger unit scale = bigger eyes, nose, etc.
    const unit = Math.max(0.055, Math.min(width, height, depth) * 0.22);
    const eyeX = width * 0.20;
    const faceY = height * 0.66;
    const faceZ = depth * 0.38;

    const deco = new THREE.Group();
    deco.name = 'sheep-style-pass';
    const theme = _getSheepThemeStyle(variant);

    // --- Big cute anime-style eyes ---
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfff8f0, roughness: 0.3, metalness: 0.0 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a0a2e, roughness: 0.2, metalness: 0.12 });
    // Bright iris ring (teal/blue cute)
    const irisMat = new THREE.MeshStandardMaterial({
        color: theme.eyeIris, roughness: 0.28, metalness: 0.0,
        emissive: new THREE.Color(theme.eyeIrisGlow), emissiveIntensity: 0.25
    });
    // White sparkle highlight
    const sparkMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.1, metalness: 0.0,
        emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55
    });

    // Big eye whites (1.45× the old size)
    const eyeGeo = new THREE.SphereGeometry(unit * 1.45, 14, 12);
    const eyeL = _markSheepAccessory(new THREE.Mesh(eyeGeo, eyeMat));
    eyeL.position.set(-eyeX, faceY, faceZ);
    eyeL.scale.set(1.0, 1.18, 0.82); // slightly oval
    deco.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = eyeX;
    deco.add(eyeR);

    // Iris ring
    const irisGeo = new THREE.SphereGeometry(unit * 1.0, 12, 10);
    const irisL = _markSheepAccessory(new THREE.Mesh(irisGeo, irisMat));
    irisL.position.set(-eyeX, faceY - unit * 0.04, faceZ + unit * 0.78);
    irisL.scale.set(1.0, 1.18, 0.7);
    deco.add(irisL);
    const irisR = irisL.clone();
    irisR.position.x = eyeX;
    deco.add(irisR);

    // Dark pupil
    const pupilGeo = new THREE.SphereGeometry(unit * 0.58, 10, 8);
    const pupilL = _markSheepAccessory(new THREE.Mesh(pupilGeo, pupilMat));
    pupilL.position.set(-eyeX, faceY - unit * 0.05, faceZ + unit * 1.0);
    pupilL.scale.set(1.0, 1.1, 0.65);
    pupilL.userData.baseX = pupilL.position.x;
    pupilL.userData.baseY = pupilL.position.y;
    deco.add(pupilL);
    const pupilR = pupilL.clone();
    pupilR.position.x = eyeX;
    pupilR.userData.baseX = pupilR.position.x;
    pupilR.userData.baseY = pupilR.position.y;
    deco.add(pupilR);

    // Sparkle highlight — top-right of each eye
    const sparkGeo = new THREE.SphereGeometry(unit * 0.28, 8, 6);
    const sparkL = _markSheepAccessory(new THREE.Mesh(sparkGeo, sparkMat));
    sparkL.position.set(-eyeX + unit * 0.46, faceY + unit * 0.48, faceZ + unit * 1.1);
    deco.add(sparkL);
    const sparkR = sparkL.clone();
    sparkR.position.x = eyeX + unit * 0.46;
    deco.add(sparkR);
    // Tiny second sparkle
    const spark2Geo = new THREE.SphereGeometry(unit * 0.14, 6, 5);
    const spark2L = _markSheepAccessory(new THREE.Mesh(spark2Geo, sparkMat));
    spark2L.position.set(-eyeX - unit * 0.26, faceY + unit * 0.64, faceZ + unit * 1.1);
    deco.add(spark2L);
    const spark2R = spark2L.clone();
    spark2R.position.x = eyeX - unit * 0.26;
    deco.add(spark2R);

    // --- Cute round pink nose ---
    const noseMat = new THREE.MeshStandardMaterial({ color: theme.nose, roughness: 0.65, metalness: 0.0 });
    const nose = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 0.58, 10, 8), noseMat));
    nose.scale.set(1.4, 0.88, 0.75);
    nose.position.set(0, faceY - unit * 1.0, faceZ + unit * 0.72);
    deco.add(nose);
    // Tiny nostrils
    const nostrilMat = new THREE.MeshStandardMaterial({ color: theme.nostril, roughness: 0.7, metalness: 0.0 });
    const nostrilGeo = new THREE.SphereGeometry(unit * 0.17, 7, 6);
    const nostrilL = _markSheepAccessory(new THREE.Mesh(nostrilGeo, nostrilMat));
    nostrilL.position.set(-unit * 0.28, faceY - unit * 1.04, faceZ + unit * 1.08);
    deco.add(nostrilL);
    const nostrilR = nostrilL.clone();
    nostrilR.position.x = unit * 0.28;
    deco.add(nostrilR);

    // --- Big rosy blush cheeks ---
    const blushMat = new THREE.MeshStandardMaterial({
        color: theme.blush, roughness: 0.82, metalness: 0.0,
        transparent: true, opacity: 0.72
    });
    const blushGeo = new THREE.SphereGeometry(unit * 0.92, 10, 8);
    const blushL = _markSheepAccessory(new THREE.Mesh(blushGeo, blushMat));
    blushL.scale.set(1.55, 0.7, 0.42);
    blushL.position.set(-eyeX * 1.5, faceY - unit * 0.62, faceZ + unit * 0.45);
    deco.add(blushL);
    const blushR = blushL.clone();
    blushR.position.x = eyeX * 1.5;
    deco.add(blushR);

    // --- Happy smile ---
    const smileMat = new THREE.MeshStandardMaterial({ color: theme.smile, roughness: 0.62, metalness: 0.02 });
    const smile = _markSheepAccessory(
        new THREE.Mesh(new THREE.TorusGeometry(unit * 0.72, unit * 0.16, 8, 20, Math.PI), smileMat)
    );
    smile.position.set(0, faceY - unit * 1.42, faceZ + unit * 0.72);
    smile.rotation.z = Math.PI;
    deco.add(smile);

    // Inner mouth hint (tiny dark oval)
    const mouthMat = new THREE.MeshStandardMaterial({ color: theme.mouth, roughness: 0.7, metalness: 0.0 });
    const mouthGeo = new THREE.SphereGeometry(unit * 0.26, 8, 6);
    const mouth = _markSheepAccessory(new THREE.Mesh(mouthGeo, mouthMat));
    mouth.scale.set(1.8, 0.7, 0.5);
    mouth.position.set(0, faceY - unit * 1.44, faceZ + unit * 0.82);
    deco.add(mouth);

    // --- Pretty bow / ribbon ---
    const bowMat = new THREE.MeshStandardMaterial({ color: theme.bow, roughness: 0.52, metalness: 0.08 });
    const bowKnot = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 0.38, 10, 8), bowMat));
    bowKnot.position.set(0, height * 0.94, depth * 0.3);
    deco.add(bowKnot);
    const bowWingL = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 0.64, 10, 8), bowMat));
    bowWingL.scale.set(1.48, 0.68, 0.52);
    bowWingL.position.set(-unit * 1.0, height * 0.94, depth * 0.3);
    deco.add(bowWingL);
    const bowWingR = bowWingL.clone();
    bowWingR.position.x = unit * 1.0;
    deco.add(bowWingR);

    // --- Super fluffy wool — two rings of big puffs + extra cap puffs ---
    const fluffMat = new THREE.MeshStandardMaterial({
        color: theme.fluff,
        ...getSurfaceMaterialProps(texturePack, 'fabric'),
        roughness: 0.96,
        metalness: 0.0,
        emissive: new THREE.Color(theme.glowTint).multiplyScalar(0.05),
        emissiveIntensity: 0.18
    });

    // Lower ring of puffs
    const fluffCountLow = 14;
    for (let i = 0; i < fluffCountLow; i++) {
        const t = i / fluffCountLow;
        const angle = t * Math.PI * 2;
        const radius = (0.40 + Math.sin(t * Math.PI * 4) * 0.06) * width;
        const puffSize = unit * (0.85 + Math.random() * 0.52);
        const puff = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(puffSize, 11, 9), fluffMat));
        puff.position.set(
            Math.cos(angle) * radius,
            height * (0.32 + Math.random() * 0.14),
            Math.sin(angle) * (depth * 0.38)
        );
        puff.scale.set(1.28, 1.05, 1.18);
        deco.add(puff);
    }

    // Upper ring of puffs — slightly smaller, higher up
    const fluffCountHigh = 12;
    for (let i = 0; i < fluffCountHigh; i++) {
        const t = i / fluffCountHigh;
        const angle = t * Math.PI * 2 + Math.PI / fluffCountHigh; // offset so they interleave
        const radius = (0.32 + Math.sin(t * Math.PI * 3) * 0.06) * width;
        const puffSize = unit * (0.72 + Math.random() * 0.44);
        const puff = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(puffSize, 11, 9), fluffMat));
        puff.position.set(
            Math.cos(angle) * radius,
            height * (0.52 + Math.random() * 0.14),
            Math.sin(angle) * (depth * 0.32)
        );
        puff.scale.set(1.18, 1.02, 1.12);
        deco.add(puff);
    }

    // Top fluffy head cap — bigger and rounder
    const topFluff = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 1.1, 12, 10), fluffMat));
    topFluff.scale.set(2.4, 1.1, 1.8);
    topFluff.position.set(0, height * 0.74, 0);
    deco.add(topFluff);

    // Extra side puffs (ears-ish)
    const earFluffL = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 0.82, 10, 8), fluffMat));
    earFluffL.scale.set(0.9, 1.1, 0.9);
    earFluffL.position.set(-width * 0.46, height * 0.68, 0);
    deco.add(earFluffL);
    const earFluffR = earFluffL.clone();
    earFluffR.position.x = width * 0.46;
    deco.add(earFluffR);

    // --- Pastel scarf ---
    const scarfMat = new THREE.MeshStandardMaterial({ color: theme.scarf, roughness: 0.54, metalness: 0.06 });
    const scarf = _markSheepAccessory(new THREE.Mesh(new THREE.TorusGeometry(width * 0.3, unit * 0.32, 10, 24), scarfMat));
    scarf.position.set(0, height * 0.28, 0);
    scarf.rotation.x = Math.PI / 2;
    scarf.userData.baseRotZ = 0;
    deco.add(scarf);
    const scarfTag = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 0.3, 10, 8), new THREE.MeshStandardMaterial({
        color: theme.scarfTag,
        roughness: 0.42,
        metalness: 0.14
    })));
    scarfTag.position.set(0, height * 0.24, depth * 0.36);
    deco.add(scarfTag);

    // --- Floating star ---
    const star = _markSheepAccessory(new THREE.Mesh(new THREE.OctahedronGeometry(unit * 0.7, 0), new THREE.MeshStandardMaterial({
        color: theme.star,
        emissive: theme.starEmissive,
        emissiveIntensity: 0.5,
        roughness: 0.36,
        metalness: 0.16
    })));
    star.position.set(0, height * 1.18, 0);
    star.userData.baseY = star.position.y;
    deco.add(star);

    // --- Cute hat (more frequent, rounder party-hat proportions) ---
    let hatCone = null;
    if (Math.random() < theme.hatChance) {
        const hatPalette = theme.hatPalette;
        const hatColor = hatPalette[Math.floor(Math.random() * hatPalette.length)];
        const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.48, metalness: 0.1 });
        // Wider, rounder cone for a cuter silhouette
        hatCone = _markSheepAccessory(new THREE.Mesh(new THREE.ConeGeometry(unit * 1.1, unit * 2.6, 16), hatMat));
        hatCone.position.set((Math.random() - 0.5) * width * 0.1, height * 0.96, -depth * 0.02);
        hatCone.rotation.z = (Math.random() - 0.5) * 0.34;
        hatCone.userData.baseRotZ = hatCone.rotation.z;
        deco.add(hatCone);

        const brim = _markSheepAccessory(new THREE.Mesh(new THREE.CylinderGeometry(unit * 1.28, unit * 1.38, unit * 0.22, 16), hatMat));
        brim.position.set(hatCone.position.x, height * 0.80, -depth * 0.02);
        deco.add(brim);

        // heart-shaped pom on top (two spheres + tiny one)
        const pomMat = new THREE.MeshStandardMaterial({
            color: theme.scarfTag,
            roughness: 0.5,
            metalness: 0.0,
            emissive: new THREE.Color(theme.glowTint).multiplyScalar(0.2),
            emissiveIntensity: 0.25
        });
        const pom = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 0.42, 10, 8), pomMat));
        pom.position.set(hatCone.position.x, height * 1.16, -depth * 0.02);
        deco.add(pom);

        // Polka-dot on hat (contrasting color sphere)
        const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0, transparent: true, opacity: 0.68 });
        const dot1 = _markSheepAccessory(new THREE.Mesh(new THREE.SphereGeometry(unit * 0.2, 8, 6), dotMat));
        dot1.position.set(hatCone.position.x + unit * 0.48, height * 0.87, (depth * 0.5) * 0.5 + unit * 0.32);
        deco.add(dot1);
        const dot2 = dot1.clone();
        dot2.position.set(hatCone.position.x - unit * 0.36, height * 0.91, dot1.position.z);
        deco.add(dot2);
    }

    root.add(deco);
    root.userData.sheepStyle = {
        pupils: [pupilL, pupilR],
        hat: hatCone,
        smile,
        scarf,
        star
    };
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

function _createStylizedCourierPlayer() {
    const group = new THREE.Group();

    const palette = {
        jacket: 0x2f6fd3,
        jacketDark: 0x1e4ea4,
        shirt: 0xdde7f7,
        pants: 0x1f2d3d,
        shoes: 0x161b24,
        skin: 0xffcfab,
        hair: 0x3a2924,
        accent: 0x4ad2b8
    };

    const legL = new THREE.Group();
    legL.position.set(-0.18, 0.96, 0);
    legL.userData.baseY = legL.position.y;
    const legLU = box(0.2, 0.48, 0.24, palette.pants, { surface: 'fabric', roughness: 0.78 });
    legLU.position.y = -0.24;
    legL.add(legLU);
    const legLL = box(0.18, 0.42, 0.2, 0x26384e, { surface: 'fabric', roughness: 0.8 });
    legLL.position.y = -0.69;
    legL.add(legLL);
    const shoeL = box(0.22, 0.12, 0.34, palette.shoes, { surface: 'rubber', roughness: 0.88 });
    shoeL.position.set(0, -0.95, 0.05);
    legL.add(shoeL);
    group.add(legL);

    const legR = legL.clone(true);
    legR.position.x = 0.18;
    legR.userData.baseY = legR.position.y;
    group.add(legR);

    const hips = box(0.52, 0.28, 0.34, 0x24364c, { surface: 'fabric', roughness: 0.76 });
    hips.position.y = 1.02;
    group.add(hips);

    const torso = box(0.7, 0.9, 0.4, palette.jacket, { surface: 'fabric', roughness: 0.66 });
    torso.position.y = 1.65;
    group.add(torso);

    const shirt = box(0.34, 0.76, 0.41, palette.shirt, { surface: 'fabric', roughness: 0.58 });
    shirt.position.set(0, 1.67, 0.01);
    group.add(shirt);

    const zipper = box(0.05, 0.72, 0.42, palette.accent, { surface: 'metal', roughness: 0.36, metalness: 0.34 });
    zipper.position.set(0, 1.66, 0.02);
    group.add(zipper);

    const chestPatch = box(0.18, 0.13, 0.43, palette.accent, { surface: 'painted' });
    chestPatch.position.set(0.2, 1.86, 0.02);
    group.add(chestPatch);

    const backpack = box(0.44, 0.68, 0.24, palette.jacketDark, { surface: 'fabric', roughness: 0.72 });
    backpack.position.set(0, 1.66, -0.3);
    group.add(backpack);

    const neck = cylinder(0.1, 0.11, 0.14, palette.skin, 10, { surface: 'skin', roughness: 0.6 });
    neck.position.y = 2.18;
    group.add(neck);

    const armL = new THREE.Group();
    armL.position.set(-0.47, 2.01, 0.02);
    armL.userData.baseY = armL.position.y;
    const upperArmL = box(0.17, 0.44, 0.2, palette.jacketDark, { surface: 'fabric', roughness: 0.74 });
    upperArmL.position.y = -0.22;
    armL.add(upperArmL);
    const forearmL = box(0.15, 0.42, 0.17, palette.jacket, { surface: 'fabric', roughness: 0.7 });
    forearmL.position.y = -0.65;
    armL.add(forearmL);
    const handL = sphere(0.1, palette.skin, { surface: 'skin', roughness: 0.58 });
    handL.position.set(0, -0.92, 0.01);
    armL.add(handL);
    group.add(armL);

    const armR = armL.clone(true);
    armR.position.x = 0.47;
    armR.userData.baseY = armR.position.y;
    group.add(armR);

    const head = new THREE.Group();
    head.position.set(0, 2.4, 0.02);
    head.userData.baseY = head.position.y;
    const skull = box(0.5, 0.48, 0.46, palette.skin, { surface: 'skin', roughness: 0.52 });
    skull.position.y = 0;
    head.add(skull);
    const hair = box(0.52, 0.16, 0.5, palette.hair, { surface: 'painted', roughness: 0.62 });
    hair.position.y = 0.26;
    head.add(hair);
    const cap = box(0.56, 0.11, 0.52, palette.jacketDark, { surface: 'fabric', roughness: 0.73 });
    cap.position.set(0, 0.33, 0);
    head.add(cap);
    const brim = box(0.42, 0.05, 0.24, palette.jacketDark, { surface: 'fabric', roughness: 0.74 });
    brim.position.set(0, 0.25, 0.29);
    head.add(brim);
    const eyeL = box(0.07, 0.06, 0.04, 0x141414, { surface: 'painted', roughness: 0.35 });
    eyeL.position.set(-0.11, 0.03, 0.24);
    head.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.11;
    head.add(eyeR);
    const smile = box(0.16, 0.03, 0.03, 0x8a4e3e, { surface: 'painted', roughness: 0.42 });
    smile.position.set(0, -0.12, 0.24);
    head.add(smile);
    group.add(head);

    group.updateWorldMatrix(true, true);
    _tmpBox.setFromObject(group);
    _tmpBox.getSize(_tmpSize);
    _tmpBox.getCenter(_tmpCenter);

    const safeHeight = Math.max(0.0001, _tmpSize.y);
    const targetPlayerHeight = 2.35;
    group.scale.multiplyScalar(targetPlayerHeight / safeHeight);
    group.updateWorldMatrix(true, true);
    _tmpBox.setFromObject(group);
    _tmpBox.getCenter(_tmpCenter);
    group.position.x -= _tmpCenter.x;
    group.position.z -= _tmpCenter.z;
    group.position.y -= _tmpBox.min.y;

    group.traverse((node) => {
        if (!node.isMesh) return;
        // The player already has a dedicated blob shadow, so dynamic shadow casting is wasted work.
        node.castShadow = false;
        node.receiveShadow = true;
    });

    group.userData.animRig = { armL, armR, legL, legR, head };
    group.userData.externalModel = true;
    group.userData.type = 'player';
    return group;
}

function _finalizeStaticRoleModel(group, type, opts = {}) {
    if (!group) return null;
    const targetHeight = opts.targetHeight || null;
    const maxExtent = opts.maxExtent || null;

    group.updateWorldMatrix(true, true);
    _tmpBox.setFromObject(group);
    _tmpBox.getSize(_tmpSize);

    const safeHeight = Math.max(0.0001, _tmpSize.y);
    if (targetHeight) {
        group.scale.multiplyScalar(targetHeight / safeHeight);
        group.updateWorldMatrix(true, true);
        _tmpBox.setFromObject(group);
        _tmpBox.getSize(_tmpSize);
    }

    if (maxExtent) {
        const extent = Math.max(_tmpSize.x, _tmpSize.z, 0.0001);
        if (extent > maxExtent) {
            group.scale.multiplyScalar(maxExtent / extent);
            group.updateWorldMatrix(true, true);
            _tmpBox.setFromObject(group);
        }
    }

    _tmpBox.getCenter(_tmpCenter);
    group.position.x -= _tmpCenter.x;
    group.position.z -= _tmpCenter.z;
    group.position.y -= _tmpBox.min.y;

    group.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((material) => _ensureColorMapColorSpace(material));
    });

    group.userData.externalModel = true;
    group.userData.type = type;
    return group;
}

function _createLowpolyMovingTruck() {
    const group = new THREE.Group();
    const palette = {
        cabin: 0xf6fbff,
        cargo: 0xfbfdff,
        accent: 0x1f6ecf,
        accentSoft: 0x5cc2ff,
        stripe: 0xffb14a,
        trim: 0x1e2f45,
        glass: 0x9dd9ff,
        rubber: 0x1a1f28,
        metal: 0x8ea0b1
    };

    const chassis = box(2.36, 0.24, 4.18, 0x2b3748, { surface: 'metal', roughness: 0.56, metalness: 0.28 });
    chassis.position.y = 0.38;
    group.add(chassis);

    const cargo = box(2.12, 1.52, 2.6, palette.cargo, { surface: 'painted', roughness: 0.58, metalness: 0.08 });
    cargo.position.set(0, 1.3, 0.62);
    group.add(cargo);

    const cargoStripe = box(2.18, 0.22, 2.62, palette.accent, { surface: 'painted', roughness: 0.54 });
    cargoStripe.position.set(0, 1.68, 0.62);
    group.add(cargoStripe);

    const cargoLowerStripe = box(2.18, 0.14, 2.62, palette.stripe, { surface: 'painted', roughness: 0.5 });
    cargoLowerStripe.position.set(0, 0.82, 0.62);
    group.add(cargoLowerStripe);

    const cabin = box(1.9, 1.08, 1.34, palette.cabin, { surface: 'painted', roughness: 0.56, metalness: 0.09 });
    cabin.position.set(0, 1.14, -1.48);
    group.add(cabin);

    const hood = box(1.84, 0.46, 0.94, palette.cabin, { surface: 'painted', roughness: 0.55, metalness: 0.1 });
    hood.position.set(0, 0.8, -2.05);
    group.add(hood);

    const roofCap = box(1.64, 0.2, 1.02, palette.accentSoft, { surface: 'painted', roughness: 0.52, metalness: 0.12 });
    roofCap.position.set(0, 1.73, -1.53);
    group.add(roofCap);

    const windshieldMat = new THREE.MeshStandardMaterial({
        color: palette.glass,
        emissive: 0x1b4a66,
        emissiveIntensity: 0.18,
        roughness: 0.18,
        metalness: 0.12,
        transparent: true,
        opacity: 0.84
    });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.54, 0.1), windshieldMat);
    windshield.position.set(0, 1.35, -1.96);
    windshield.rotation.x = -0.25;
    group.add(windshield);

    const sideWindowL = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.08), windshieldMat.clone());
    sideWindowL.position.set(-0.93, 1.35, -1.5);
    sideWindowL.rotation.y = Math.PI / 2;
    group.add(sideWindowL);
    const sideWindowR = sideWindowL.clone();
    sideWindowR.position.x = 0.93;
    group.add(sideWindowR);

    const grille = box(1.36, 0.26, 0.1, palette.trim, { surface: 'metal', roughness: 0.48, metalness: 0.32 });
    grille.position.set(0, 0.78, -2.5);
    group.add(grille);

    const bumper = box(1.8, 0.16, 0.16, palette.metal, { surface: 'metal', roughness: 0.4, metalness: 0.45 });
    bumper.position.set(0, 0.46, -2.44);
    group.add(bumper);

    const headlightL = box(0.26, 0.12, 0.09, 0xffe7a8, { surface: 'painted', roughness: 0.28, metalness: 0.2 });
    headlightL.position.set(-0.58, 0.78, -2.5);
    group.add(headlightL);
    const headlightR = headlightL.clone();
    headlightR.position.x = 0.58;
    group.add(headlightR);

    const signalL = box(0.18, 0.1, 0.08, 0xff9d47, { surface: 'painted', roughness: 0.32, metalness: 0.14 });
    signalL.position.set(-0.86, 0.72, -2.48);
    group.add(signalL);
    const signalR = signalL.clone();
    signalR.position.x = 0.86;
    group.add(signalR);

    const sideBrandL = box(0.08, 0.62, 1.16, palette.accent, { surface: 'painted', roughness: 0.52, metalness: 0.1 });
    sideBrandL.position.set(-1.12, 1.32, 0.62);
    group.add(sideBrandL);
    const sideBrandR = sideBrandL.clone();
    sideBrandR.position.x = 1.12;
    group.add(sideBrandR);

    for (let i = 0; i < 3; i++) {
        const line = box(0.09, 0.08, 0.76 - i * 0.16, 0xffffff, { surface: 'painted', roughness: 0.5 });
        line.position.set(-1.17, 1.2 + i * 0.14, 0.62);
        group.add(line);
        const lineR = line.clone();
        lineR.position.x = 1.17;
        group.add(lineR);
    }

    const rearDoorL = box(0.98, 1.22, 0.08, 0xf7fbff, { surface: 'painted', roughness: 0.62, metalness: 0.08 });
    rearDoorL.position.set(-0.53, 1.24, 1.94);
    group.add(rearDoorL);
    const rearDoorR = rearDoorL.clone();
    rearDoorR.position.x = 0.53;
    group.add(rearDoorR);
    const rearJoin = box(0.08, 1.22, 0.09, palette.accentSoft, { surface: 'painted', roughness: 0.5 });
    rearJoin.position.set(0, 1.24, 1.95);
    group.add(rearJoin);

    const plate = box(0.62, 0.12, 0.08, 0xf4f8ff, { surface: 'painted', roughness: 0.5, metalness: 0.12 });
    plate.position.set(0, 0.57, 1.98);
    group.add(plate);

    const mirrorL = box(0.08, 0.18, 0.28, 0x1f2f42, { surface: 'metal', roughness: 0.48, metalness: 0.35 });
    mirrorL.position.set(-1.03, 1.29, -1.88);
    group.add(mirrorL);
    const mirrorR = mirrorL.clone();
    mirrorR.position.x = 1.03;
    group.add(mirrorR);

    const wheelMat = new THREE.MeshStandardMaterial({ color: palette.rubber, roughness: 0.9, metalness: 0.05 });
    const hubMat = new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.4, metalness: 0.45 });
    const addWheel = (x, z) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.34, 12), wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.46, z);
        group.add(wheel);

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 10), hubMat);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(x, 0.46, z);
        group.add(hub);
    };
    addWheel(-1.02, -1.68);
    addWheel(1.02, -1.68);
    addWheel(-1.02, 1.45);
    addWheel(1.02, 1.45);

    return _finalizeStaticRoleModel(group, 'truck', { targetHeight: 2.05, maxExtent: 4.4 });
}

function _createSwedishCottageHouse() {
    const group = new THREE.Group();
    const palette = {
        wall: 0xa4372b,      // Falu red
        trim: 0xf2efe7,
        roof: 0x3f2620,
        roofHighlight: 0x78443a,
        foundation: 0x8a8f97,
        door: 0x7f5632,
        glass: 0xbbe7ff,
        shutter: 0x23593f
    };

    const foundation = box(3.56, 0.34, 3.14, palette.foundation, { surface: 'stone', roughness: 0.76, metalness: 0.05 });
    foundation.position.y = 0.17;
    group.add(foundation);

    const walls = box(3.08, 1.84, 2.66, palette.wall, { surface: 'painted', roughness: 0.72, metalness: 0.05 });
    walls.position.y = 1.27;
    group.add(walls);

    const upperGable = box(2.35, 0.58, 2.66, palette.wall, { surface: 'painted', roughness: 0.7, metalness: 0.05 });
    upperGable.position.y = 2.03;
    group.add(upperGable);

    const roofL = box(1.95, 0.2, 2.98, palette.roof, { surface: 'wood', roughness: 0.66, metalness: 0.06 });
    roofL.position.set(-0.79, 2.42, 0);
    roofL.rotation.z = Math.PI * 0.17;
    group.add(roofL);
    const roofR = roofL.clone();
    roofR.position.x = 0.79;
    roofR.rotation.z = -Math.PI * 0.17;
    group.add(roofR);

    const ridge = box(0.2, 0.12, 3.0, palette.roofHighlight, { surface: 'wood', roughness: 0.62 });
    ridge.position.y = 2.7;
    group.add(ridge);

    const chimney = box(0.34, 0.92, 0.34, 0xd5c8b8, { surface: 'stone', roughness: 0.72, metalness: 0.04 });
    chimney.position.set(0.52, 2.98, -0.26);
    group.add(chimney);
    const chimneyTop = box(0.42, 0.1, 0.42, 0x5a5d66, { surface: 'stone', roughness: 0.74, metalness: 0.05 });
    chimneyTop.position.set(0.52, 3.5, -0.26);
    group.add(chimneyTop);

    const corners = [
        [-1.52, 1.27, -1.28], [1.52, 1.27, -1.28], [-1.52, 1.27, 1.28], [1.52, 1.27, 1.28]
    ];
    corners.forEach(([x, y, z]) => {
        const trim = box(0.12, 1.9, 0.14, palette.trim, { surface: 'painted', roughness: 0.58, metalness: 0.05 });
        trim.position.set(x, y, z);
        group.add(trim);
    });

    const roofTrim = box(3.12, 0.1, 0.12, palette.trim, { surface: 'painted', roughness: 0.55 });
    roofTrim.position.set(0, 2.13, 1.34);
    group.add(roofTrim);
    const roofTrimBack = roofTrim.clone();
    roofTrimBack.position.z = -1.34;
    group.add(roofTrimBack);

    const doorFrame = box(0.74, 1.16, 0.14, palette.trim, { surface: 'painted', roughness: 0.56 });
    doorFrame.position.set(0, 0.82, 1.4);
    group.add(doorFrame);

    const door = box(0.58, 1.02, 0.1, palette.door, { surface: 'wood', roughness: 0.72, metalness: 0.06 });
    door.position.set(0, 0.82, 1.46);
    group.add(door);
    const knob = sphere(0.035, 0xc7b28e, { surface: 'metal', roughness: 0.4, metalness: 0.45 });
    knob.position.set(0.2, 0.78, 1.52);
    group.add(knob);

    const porch = box(1.04, 0.14, 0.96, 0x8b6c45, { surface: 'wood', roughness: 0.78, metalness: 0.05 });
    porch.position.set(0, 0.07, 1.72);
    group.add(porch);
    const step = box(0.82, 0.1, 0.42, 0x997650, { surface: 'wood', roughness: 0.79, metalness: 0.04 });
    step.position.set(0, 0.05, 2.22);
    group.add(step);

    const addWindow = (x, y, z, rotY = 0) => {
        const frame = box(0.72, 0.84, 0.12, palette.trim, { surface: 'painted', roughness: 0.56, metalness: 0.05 });
        frame.position.set(x, y, z);
        frame.rotation.y = rotY;
        group.add(frame);

        const paneMat = new THREE.MeshStandardMaterial({
            color: palette.glass,
            emissive: 0x3e7491,
            emissiveIntensity: 0.19,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.86
        });
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.06), paneMat);
        pane.position.set(x, y, z + Math.cos(rotY) * 0.04);
        pane.rotation.y = rotY;
        group.add(pane);

        const mullionV = box(0.07, 0.68, 0.08, palette.trim, { surface: 'painted', roughness: 0.52 });
        mullionV.position.set(x, y, z + Math.cos(rotY) * 0.05);
        mullionV.rotation.y = rotY;
        group.add(mullionV);
        const mullionH = box(0.56, 0.07, 0.08, palette.trim, { surface: 'painted', roughness: 0.52 });
        mullionH.position.set(x, y, z + Math.cos(rotY) * 0.05);
        mullionH.rotation.y = rotY;
        group.add(mullionH);

        const shutterL = box(0.12, 0.8, 0.07, palette.shutter, { surface: 'painted', roughness: 0.64, metalness: 0.05 });
        const shutterR = shutterL.clone();
        if (Math.abs(rotY) < 0.2) {
            shutterL.position.set(x - 0.42, y, z + 0.02);
            shutterR.position.set(x + 0.42, y, z + 0.02);
        } else {
            shutterL.position.set(x + Math.sin(rotY) * 0.02, y, z - 0.42);
            shutterR.position.set(x + Math.sin(rotY) * 0.02, y, z + 0.42);
        }
        shutterL.rotation.y = rotY;
        shutterR.rotation.y = rotY;
        group.add(shutterL);
        group.add(shutterR);
    };

    addWindow(-0.86, 1.3, 1.4, 0);
    addWindow(0.86, 1.3, 1.4, 0);
    addWindow(-1.58, 1.3, 0.24, Math.PI / 2);
    addWindow(1.58, 1.3, -0.28, Math.PI / 2);

    const flagPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.24, 8),
        new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.48, metalness: 0.35 })
    );
    flagPole.position.set(-1.95, 0.8, 1.25);
    group.add(flagPole);
    const flagBlue = box(0.48, 0.26, 0.05, 0x2166cc, { surface: 'painted', roughness: 0.46, metalness: 0.08 });
    flagBlue.position.set(-1.7, 1.22, 1.25);
    group.add(flagBlue);
    const flagYellowV = box(0.08, 0.26, 0.055, 0xf3cf2f, { surface: 'painted', roughness: 0.42, metalness: 0.08 });
    flagYellowV.position.set(-1.73, 1.22, 1.28);
    group.add(flagYellowV);
    const flagYellowH = box(0.48, 0.08, 0.055, 0xf3cf2f, { surface: 'painted', roughness: 0.42, metalness: 0.08 });
    flagYellowH.position.set(-1.7, 1.22, 1.28);
    group.add(flagYellowH);

    return _finalizeStaticRoleModel(group, 'house', { targetHeight: 3.0, maxExtent: 3.9 });
}

// ============================================================
// PLAYER — cute mover character
// ============================================================
export function createPlayer() {
    return _createStylizedCourierPlayer();
}

// ============================================================
// TRUCK — delivery truck
// ============================================================
export function createTruck() {
    return _createLowpolyMovingTruck();
}

// ============================================================
// HOUSE — cute little house
// ============================================================
export function createHouse() {
    return _createSwedishCottageHouse();
}

// ============================================================
// SHEEP — fluffy cloud sheep
// ============================================================
export function createSheep(scale = 1, variant = {}) {
    const opts = {
        targetHeight: 1.2 * scale,
        maxExtent: 1.8 * scale,
        castShadow: false,
        receiveShadow: true,
        allowSkinned: true,
        bakeSkinned: true
    };
    const external = _tryCreateExternalAnimal('sheep', opts) || _tryCreateExternalRoleWithFallbacks('sheep', opts);
    if (!external) return null;
    _polishExternalAnimalMaterials(external, 'sheep', variant);
    _addSheepStylePass(external, variant);
    external.userData.type = 'sheep';
    external.userData.themeLevel = Math.max(1, Math.min(5, Math.round(variant?.level || 1)));
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
        allowSkinned: true,
        bakeSkinned: true
    };
    const external = _tryCreateExternalAnimal('dog', opts) || _tryCreateExternalRoleWithFallbacks('dog', opts);
    if (!external) return null;
    _polishExternalAnimalMaterials(external, 'dog');
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

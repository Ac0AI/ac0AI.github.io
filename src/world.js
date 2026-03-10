import * as THREE from 'three';
import { createTruck, createHouse } from './models.js';
import { createTexturePack, getSurfaceMaterialProps } from './textures.js';
import { LIGHTING_PRESETS, VISUAL_PROFILE } from './visual-profile.js';

const LIGHTING_PROFILE = LIGHTING_PRESETS[VISUAL_PROFILE] || LIGHTING_PRESETS.premium_arcade_v2;

function themeForLevel(level) {
    const list = LIGHTING_PROFILE.levels || [];
    if (list.length === 0) {
        return {
            ground: 0x7ec850,
            fog: 0x87CEEB,
            fogDensity: 0.006,
            ambient: 0xffffff,
            ambientIntensity: 0.7,
            dirLight: 0xffffff,
            dirIntensity: 1.0,
            sky: 0x87CEEB,
            fillFactor: 0.3,
            hemiIntensity: 0.45,
            rimIntensity: 0.22,
            ringOpacity: 0.25,
            discOpacity: 0.1,
        };
    }
    return list[level - 1] || list[0];
}

function pathPaletteForLevel(level) {
    switch (level) {
        case 2:
            return { base: 0xb96d2d, highlight: 0xf0be63, fringe: 0x6c3517, opacityMul: 1.05 };
        case 3:
            return { base: 0xc6dcf2, highlight: 0xfafdff, fringe: 0x7fa0c2, opacityMul: 1.18 };
        case 4:
            return { base: 0x264767, highlight: 0x70d3ff, fringe: 0x101d34, opacityMul: 1.08 };
        case 5:
            return { base: 0x7f3117, highlight: 0xff9b4f, fringe: 0x2d0d06, opacityMul: 1.12 };
        case 1:
        default:
            return { base: 0xb88e54, highlight: 0xe0c188, fringe: 0x6a5432, opacityMul: 1.0 };
    }
}

function detailPaletteForLevel(level) {
    switch (level) {
        case 2:
            return {
                blade: 0x7f722e,
                stem: 0x6b7a32,
                accents: [0xff9f43, 0xe56b2f, 0xf7d36b, 0xb94a24, 0xd98e44],
                accentGlow: 0.04,
                patchMul: 0.9,
                tuftMul: 0.92,
                accentMul: 0.8,
            };
        case 3:
            return {
                blade: 0xddeefe,
                stem: 0xeaf5ff,
                accents: [0xffffff, 0xd9f1ff, 0xb4dcff, 0xe8fbff],
                accentGlow: 0.12,
                patchMul: 0.74,
                tuftMul: 0.65,
                accentMul: 0.7,
            };
        case 4:
            return {
                blade: 0x2a5677,
                stem: 0x2db08a,
                accents: [0x74e7ff, 0x9f8cff, 0x6dffd8, 0x93d8ff],
                accentGlow: 0.28,
                patchMul: 0.56,
                tuftMul: 0.62,
                accentMul: 0.72,
            };
        case 5:
            return {
                blade: 0x724538,
                stem: 0x92542f,
                accents: [0xffa043, 0xff6b3d, 0xffd166, 0xdb3a34],
                accentGlow: 0.26,
                patchMul: 0.48,
                tuftMul: 0.54,
                accentMul: 0.52,
            };
        case 1:
        default:
            return {
                blade: 0x2c8d3d,
                stem: 0x2fa95a,
                accents: [0xff6da8, 0xffd84d, 0xff5b5b, 0xffffff, 0x79e08f, 0x8dd8ff],
                accentGlow: 0.05,
                patchMul: 1.0,
                tuftMul: 1.0,
                accentMul: 1.0,
            };
    }
}

function particlePaletteForLevel(theme, level) {
    switch (level) {
        case 2:
            return [0xfff2c0, 0xffbf66, 0xff8f52];
        case 3:
            return [0xffffff, 0xdff3ff, 0xb8deff];
        case 4:
            return [0xa7d7ff, 0x8de7ff, 0xb59cff];
        case 5:
            return [0xffe0a8, 0xff8f4a, 0xff5c33];
        case 1:
        default:
            return [0xffffff, 0xffffcc, new THREE.Color(theme.sky).offsetHSL(0, -0.3, 0.3).getHex()];
    }
}

function groundSurfaceForLevel(level) {
    switch (level) {
        case 2:
            return 'grassAutumn';
        case 3:
            return 'snow';
        case 4:
            return 'moonGrass';
        case 5:
            return 'ash';
        case 1:
        default:
            return 'grass';
    }
}

export class World {
    constructor(scene, quality = {}) {
        this.scene = scene;
        this.quality = quality;
        this.groundMesh = null;
        this.truckModel = null;
        this.houseModel = null;
        this.ambientLight = null;
        this.dirLight = null;
        this.fillLight = null;
        this.hemiLight = null;
        this.rimLight = null;
        this.decorations = [];
        this.obstacles = [];  // { x, z, radius } for collision
        this.particles = null;
        this.skyDome = null;
        this.texturePack = createTexturePack();
        this.truckGlowLight = null;
        this.houseGlowLight = null;
        this.truckBeacon = null;
        this.houseBeacon = null;
        this.truckContactShadow = null;
        this.houseContactShadow = null;
        this.pathPatches = [];
        this.zoneIndicators = [];
        this.activeObjective = 'truck';
        this.currentLevel = 1;
        this._fxPulseTime = 0;

        // World positions (play area ~40x40, centered at origin)
        this.truckPos = new THREE.Vector3(-10, 0, 10);
        this.housePos = new THREE.Vector3(10, 0, -8);
        this.truckZoneRadius = 5;
        this.houseZoneRadius = 5;

        // Play bounds
        this.bounds = { minX: -18, maxX: 18, minZ: -18, maxZ: 18 };
    }

    create(level = 1) {
        const theme = themeForLevel(level);
        const groundPreset = LIGHTING_PROFILE.ground;
        this.currentLevel = level;
        this.zoneIndicators = [];
        this.activeObjective = 'truck';

        // Ground — vertex-colored for natural variation
        const groundGeo = new THREE.PlaneGeometry(
            groundPreset.size,
            groundPreset.size,
            groundPreset.segments,
            groundPreset.segments
        );
        const colors = new Float32Array(groundGeo.attributes.position.count * 3);
        const posAttr = groundGeo.attributes.position;
        groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const groundMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            ...getSurfaceMaterialProps(this.texturePack, groundSurfaceForLevel(level)),
            roughness: 0.95,
            metalness: 0.02
        });

        this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.receiveShadow = true;
        this.scene.add(this.groundMesh);
        this._applyGroundVertexColors(theme);

        // Grass tufts and flowers for visual variety
        this._addGrassDetails(theme, level);

        // Path from truck to house (subtle)
        this._createPath(level);

        // Sky dome — gradient from horizon to zenith
        this._createSkyDome(theme);

        // Lighting
        this.ambientLight = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(theme.dirLight, theme.dirIntensity);
        this.dirLight.position.set(15, 25, 10);
        this.dirLight.castShadow = true;
        const shadowMapSize = this.quality.shadowMapSize || 1536;
        this.dirLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        this.dirLight.shadow.camera.left = -30;
        this.dirLight.shadow.camera.right = 30;
        this.dirLight.shadow.camera.top = 30;
        this.dirLight.shadow.camera.bottom = -30;
        this.dirLight.shadow.camera.near = 1;
        this.dirLight.shadow.camera.far = 80;
        this.dirLight.shadow.bias = -0.0005;
        this.dirLight.shadow.normalBias = 0.04;
        this.dirLight.shadow.radius = 2; // soft shadow edges
        this.scene.add(this.dirLight);

        // Secondary fill light for softer shadows
        const fillLight = new THREE.DirectionalLight(theme.dirLight, theme.dirIntensity * theme.fillFactor);
        fillLight.position.set(-15, 20, -10);
        this.scene.add(fillLight);
        this.fillLight = fillLight;

        // Hemisphere light for softer fill
        const hemiLight = new THREE.HemisphereLight(theme.sky, theme.ground, theme.hemiIntensity);
        this.scene.add(hemiLight);
        this.hemiLight = hemiLight;

        // Cool rim light for shape definition (no shadows, cheap)
        const rimBase = this.quality.lowPower ? 0.2 : theme.rimIntensity;
        const rimLight = new THREE.DirectionalLight(0x9bd6ff, rimBase);
        rimLight.position.set(-20, 18, 20);
        rimLight.castShadow = false;
        this.scene.add(rimLight);
        this.rimLight = rimLight;

        // Fog
        this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);

        // Truck
        this.truckModel = createTruck();
        if (!this.truckModel?.userData?.externalModel) {
            throw new Error('External truck model unavailable');
        }
        this.truckModel.position.copy(this.truckPos);
        this.truckModel.rotation.y = Math.PI / 4;
        this.scene.add(this.truckModel);

        // House
        this.houseModel = createHouse();
        if (!this.houseModel?.userData?.externalModel) {
            throw new Error('External house model unavailable');
        }
        this.houseModel.position.copy(this.housePos);
        this.houseModel.rotation.y = -Math.PI / 6;
        this.scene.add(this.houseModel);

        // Zone indicators (subtle rings on ground)
        this._createZoneIndicator(this.truckPos, this.truckZoneRadius, 0xff8c00, theme, 'truck');
        this._createZoneIndicator(this.housePos, this.houseZoneRadius, 0x27ae60, theme, 'house');
        this._createArcadeBeacons();
        this._createContactShadows();

        // Decorations (trees, rocks etc.)
        this._addDecorations(level);

        // Ambient particles
        this._createParticles(theme, level);
    }

    _computeGroundColor(theme, x, z) {
        const c = new THREE.Color(theme.ground);
        const macroA = Math.sin((x + z) * 0.052) * 0.5 + 0.5;
        const macroB = Math.sin((x * 0.12) - (z * 0.09) + 1.7) * 0.5 + 0.5;
        const macroC = Math.cos((x * 0.045) + (z * 0.05) - 0.8) * 0.5 + 0.5;
        c.offsetHSL(
            (macroB - 0.5) * 0.035,
            (macroC - 0.5) * 0.1,
            (macroA - 0.5) * 0.14 + (macroB - 0.5) * 0.07
        );
        return c;
    }

    _applyGroundVertexColors(theme) {
        if (!this.groundMesh?.geometry) return;
        const posAttr = this.groundMesh.geometry.attributes.position;
        const colorAttr = this.groundMesh.geometry.attributes.color;
        if (!posAttr || !colorAttr) return;

        for (let i = 0; i < posAttr.count; i++) {
            // PlaneGeometry stores terrain coordinates on X/Y before mesh rotation.
            const px = posAttr.getX(i);
            const pz = posAttr.getY(i);
            const c = this._computeGroundColor(theme, px, pz);
            colorAttr.setXYZ(i, c.r, c.g, c.b);
        }
        colorAttr.needsUpdate = true;
    }

    _addGrassDetails(theme, level = this.currentLevel) {
        this.grassDetails = this.grassDetails || [];
        this.grassDetails.forEach(g => this.scene.remove(g));
        this.grassDetails = [];

        const detailPalette = detailPaletteForLevel(level);

        const patchCount = this.quality.lowPower
            ? Math.round(LIGHTING_PROFILE.ground.grassPatchCount.lowPower * detailPalette.patchMul)
            : Math.round(LIGHTING_PROFILE.ground.grassPatchCount.normal * detailPalette.patchMul);
        const tuftCount = this.quality.lowPower
            ? Math.round(LIGHTING_PROFILE.ground.tuftCount.lowPower * detailPalette.tuftMul)
            : Math.round(LIGHTING_PROFILE.ground.tuftCount.normal * detailPalette.tuftMul);
        const flowerCount = this.quality.lowPower
            ? Math.round(LIGHTING_PROFILE.ground.flowerCount.lowPower * detailPalette.accentMul)
            : Math.round(LIGHTING_PROFILE.ground.flowerCount.normal * detailPalette.accentMul);

        // Darker / lighter grass patches (soft macro variation layer)
        for (let i = 0; i < patchCount; i++) {
            const r = 2 + Math.random() * 6;
            const patchGeo = new THREE.CircleGeometry(r, 22);
            const baseColor = new THREE.Color(theme.ground);
            const variation = (Math.random() - 0.5) * 0.08;
            baseColor.r = Math.max(0, Math.min(1, baseColor.r + variation));
            baseColor.g = Math.max(0, Math.min(1, baseColor.g + variation * 0.8));
            baseColor.b = Math.max(0, Math.min(1, baseColor.b + variation * 0.3));
            const patchMat = new THREE.MeshStandardMaterial({
                color: baseColor,
                transparent: true,
                opacity: level >= 4 ? 0.18 : level === 3 ? 0.26 : 0.22,
                depthWrite: false,
                ...getSurfaceMaterialProps(this.texturePack, 'grass'),
                roughness: 0.97,
                metalness: 0.01
            });
            const patch = new THREE.Mesh(patchGeo, patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.rotation.z = Math.random() * Math.PI;
            const sx = 0.74 + Math.random() * 0.56;
            patch.scale.set(sx, 1, 1 / sx);
            patch.position.set(
                (Math.random() - 0.5) * 70,
                0.012 + i * 0.00003,
                (Math.random() - 0.5) * 70
            );
            patch.receiveShadow = true;
            this.scene.add(patch);
            this.grassDetails.push(patch);
        }

        // Small grass tufts (tiny cones)
        for (let i = 0; i < tuftCount; i++) {
            const tuft = new THREE.Group();
            const bladeCount = 3 + Math.floor(Math.random() * 4);
            for (let b = 0; b < bladeCount; b++) {
                const h = 0.15 + Math.random() * 0.25;
                const bladeColor = new THREE.Color(detailPalette.blade).offsetHSL(
                    (Math.random() - 0.5) * 0.04,
                    (Math.random() - 0.5) * 0.12,
                    (Math.random() - 0.5) * 0.18
                );
                const blade = new THREE.Mesh(
                    new THREE.ConeGeometry(0.04, h, 4),
                    new THREE.MeshStandardMaterial({
                        color: bladeColor,
                        emissive: level >= 4 ? bladeColor.clone().multiplyScalar(0.08) : 0x000000,
                        emissiveIntensity: level >= 4 ? 0.22 : 0,
                        ...getSurfaceMaterialProps(this.texturePack, 'grass')
                    })
                );
                blade.position.set(
                    (Math.random() - 0.5) * 0.3,
                    h / 2,
                    (Math.random() - 0.5) * 0.3
                );
                blade.rotation.z = (Math.random() - 0.5) * 0.5;
                blade.castShadow = true;
                tuft.add(blade);
            }
            tuft.position.set(
                (Math.random() - 0.5) * 55,
                0,
                (Math.random() - 0.5) * 55
            );
            tuft.userData.kind = 'tuft';
            tuft.userData.swayPhase = Math.random() * Math.PI * 2;
            tuft.userData.swayAmp = 0.08 + Math.random() * 0.06;
            tuft.userData.baseRotX = (Math.random() - 0.5) * 0.06;
            tuft.userData.baseRotZ = (Math.random() - 0.5) * 0.06;
            this.scene.add(tuft);
            this.grassDetails.push(tuft);
        }

        // Tiny flower / accent clusters
        const flowerColors = detailPalette.accents;
        for (let i = 0; i < flowerCount; i++) {
            const flowerGroup = new THREE.Group();
            const fc = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            // Petals
            for (let p = 0; p < 4; p++) {
                const petal = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 6, 4),
                    new THREE.MeshStandardMaterial({
                        color: fc,
                        roughness: 0.52,
                        metalness: 0.06,
                        emissive: new THREE.Color(fc).multiplyScalar(detailPalette.accentGlow),
                        emissiveIntensity: detailPalette.accentGlow > 0 ? 0.38 : 0
                    })
                );
                const angle = (p / 4) * Math.PI * 2;
                petal.position.set(Math.cos(angle) * 0.04, 0.08, Math.sin(angle) * 0.04);
                flowerGroup.add(petal);
            }
            // Center
            const center = new THREE.Mesh(
                new THREE.SphereGeometry(0.03, 6, 4),
                new THREE.MeshStandardMaterial({
                    color: level >= 3 ? 0xe7fbff : 0xf1c40f,
                    roughness: 0.5,
                    metalness: 0.12,
                    emissive: level >= 4 ? 0x3bc5b1 : 0x000000,
                    emissiveIntensity: level >= 4 ? 0.25 : 0
                })
            );
            center.position.y = 0.08;
            flowerGroup.add(center);
            // Stem
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4),
                new THREE.MeshStandardMaterial({
                    color: detailPalette.stem,
                    roughness: 0.84,
                    metalness: 0.04
                })
            );
            stem.position.y = 0.04;
            flowerGroup.add(stem);

            flowerGroup.position.set(
                (Math.random() - 0.5) * 50,
                0,
                (Math.random() - 0.5) * 50
            );
            this.scene.add(flowerGroup);
            this.grassDetails.push(flowerGroup);
        }
    }

    _createPath(level = this.currentLevel) {
        this.pathPatches.forEach(p => this.scene.remove(p));
        this.pathPatches = [];

        // Dirt trail built from layered soft blobs.
        const pathPreset = LIGHTING_PROFILE.path;
        const palette = pathPaletteForLevel(level);
        const steps = pathPreset.steps;
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const px = THREE.MathUtils.lerp(this.truckPos.x, this.housePos.x, t) + (Math.random() - 0.5) * pathPreset.jitter;
            const pz = THREE.MathUtils.lerp(this.truckPos.z, this.housePos.z, t) + (Math.random() - 0.5) * pathPreset.jitter;
            const radius = pathPreset.radius.min + Math.random() * (pathPreset.radius.max - pathPreset.radius.min);
            const trailColor = new THREE.Color(palette.base).lerp(new THREE.Color(palette.highlight), Math.sin(t * Math.PI) * 0.35);

            const patchGeo = new THREE.CircleGeometry(radius, 22);
            const patchMat = new THREE.MeshStandardMaterial({
                color: trailColor,
                transparent: true,
                opacity: pathPreset.opacity * palette.opacityMul * (0.86 + Math.sin(t * Math.PI) * 0.25),
                depthWrite: false,
                ...getSurfaceMaterialProps(this.texturePack, 'dirt'),
                roughness: 0.92,
                metalness: 0.01
            });
            const patch = new THREE.Mesh(patchGeo, patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(px, pathPreset.yBase + i * pathPreset.yStep, pz);
            patch.renderOrder = 20 + i;
            this.scene.add(patch);
            this.pathPatches.push(patch);

            const highlightGeo = new THREE.CircleGeometry(radius * 0.56, 16);
            const highlightMat = new THREE.MeshStandardMaterial({
                color: palette.highlight,
                transparent: true,
                opacity: pathPreset.opacity * palette.opacityMul * 0.32,
                depthWrite: false,
                roughness: 0.9,
                metalness: 0.01
            });
            const highlight = new THREE.Mesh(highlightGeo, highlightMat);
            highlight.rotation.x = -Math.PI / 2;
            highlight.position.set(px, pathPreset.yBase + i * pathPreset.yStep + 0.00035, pz);
            highlight.renderOrder = 40 + i;
            this.scene.add(highlight);
            this.pathPatches.push(highlight);

            const fringeGeo = new THREE.CircleGeometry(radius * 1.45, 20);
            const fringeMat = new THREE.MeshStandardMaterial({
                color: palette.fringe,
                transparent: true,
                opacity: pathPreset.opacity * palette.opacityMul * 0.16,
                depthWrite: false,
                roughness: 0.94,
                metalness: 0.01
            });
            const fringe = new THREE.Mesh(fringeGeo, fringeMat);
            fringe.rotation.x = -Math.PI / 2;
            fringe.position.set(px, pathPreset.yBase + i * pathPreset.yStep - 0.0001, pz);
            fringe.renderOrder = 8 + i;
            this.scene.add(fringe);
            this.pathPatches.push(fringe);
        }
    }

    _createZoneIndicator(pos, radius, color, theme, key = 'truck') {
        const zonePreset = LIGHTING_PROFILE.zones;
        const ringGeo = new THREE.RingGeometry(radius - zonePreset.ringWidth, radius, 32);
        const ringMat = new THREE.MeshStandardMaterial({
            color,
            emissive: new THREE.Color(color).multiplyScalar(zonePreset.ringEmissiveMul),
            emissiveIntensity: zonePreset.ringIntensity,
            transparent: true,
            opacity: theme.ringOpacity,
            roughness: 0.44,
            metalness: 0.06,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, zonePreset.yRing, pos.z);
        ring.renderOrder = 40;
        this.scene.add(ring);

        // Pulsing disc
        const discGeo = new THREE.CircleGeometry(radius, 32);
        const discMat = new THREE.MeshStandardMaterial({
            color,
            emissive: new THREE.Color(color).multiplyScalar(zonePreset.discEmissiveMul),
            emissiveIntensity: zonePreset.discIntensity,
            transparent: true,
            opacity: theme.discOpacity,
            roughness: 0.5,
            metalness: 0.04,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(pos.x, zonePreset.yDisc, pos.z);
        disc.renderOrder = 39;
        this.scene.add(disc);

        const dashGeo = new THREE.RingGeometry(radius + 0.22, radius + 0.34, 48, 1);
        const dashMat = new THREE.MeshStandardMaterial({
            color,
            emissive: new THREE.Color(color).multiplyScalar(0.35),
            emissiveIntensity: 0.32,
            transparent: true,
            opacity: theme.ringOpacity * 0.48,
            roughness: 0.38,
            metalness: 0.08,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(pos.x, zonePreset.yRing + 0.0015, pos.z);
        dash.renderOrder = 41;
        this.scene.add(dash);

        const rippleGeo = new THREE.RingGeometry(radius * 0.65, radius * 0.7, 42);
        const rippleMat = new THREE.MeshStandardMaterial({
            color,
            emissive: new THREE.Color(color).multiplyScalar(0.24),
            emissiveIntensity: 0.26,
            transparent: true,
            opacity: theme.discOpacity * 0.68,
            roughness: 0.46,
            metalness: 0.04,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const ripple = new THREE.Mesh(rippleGeo, rippleMat);
        ripple.rotation.x = -Math.PI / 2;
        ripple.position.set(pos.x, zonePreset.yDisc + 0.0012, pos.z);
        ripple.renderOrder = 42;
        this.scene.add(ripple);

        this.zoneIndicators.push({
            key,
            ring,
            disc,
            dash,
            ripple,
            baseRingOpacity: theme.ringOpacity,
            baseDiscOpacity: theme.discOpacity,
            baseDashOpacity: theme.ringOpacity * 0.48,
            baseRippleOpacity: theme.discOpacity * 0.68
        });
    }

    setObjectiveTarget(target = 'truck') {
        this.activeObjective = target === 'house' ? 'house' : 'truck';
    }

    _createContactShadows() {
        if (this.truckContactShadow) this.scene.remove(this.truckContactShadow);
        if (this.houseContactShadow) this.scene.remove(this.houseContactShadow);

        const buildShadow = (radius, opacity) => new THREE.Mesh(
            new THREE.CircleGeometry(radius, 28),
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity,
                depthWrite: false
            })
        );

        this.truckContactShadow = buildShadow(2.08, 0.15);
        this.truckContactShadow.rotation.x = -Math.PI / 2;
        this.truckContactShadow.position.set(this.truckPos.x, 0.022, this.truckPos.z);
        this.truckContactShadow.renderOrder = 12;
        this.scene.add(this.truckContactShadow);

        this.houseContactShadow = buildShadow(2.36, 0.17);
        this.houseContactShadow.rotation.x = -Math.PI / 2;
        this.houseContactShadow.position.set(this.housePos.x, 0.022, this.housePos.z);
        this.houseContactShadow.renderOrder = 12;
        this.scene.add(this.houseContactShadow);
    }

    _createArcadeBeacons() {
        const beaconPreset = LIGHTING_PROFILE.beacons;
        if (this.truckGlowLight) this.scene.remove(this.truckGlowLight);
        if (this.houseGlowLight) this.scene.remove(this.houseGlowLight);
        if (this.truckBeacon) this.scene.remove(this.truckBeacon);
        if (this.houseBeacon) this.scene.remove(this.houseBeacon);

        this.truckGlowLight = new THREE.PointLight(0xffaa56, beaconPreset.truckLightIntensity, beaconPreset.truckRadius, 2);
        this.truckGlowLight.position.set(this.truckPos.x, 1.35, this.truckPos.z);
        this.scene.add(this.truckGlowLight);

        this.houseGlowLight = new THREE.PointLight(0x66ffd1, beaconPreset.houseLightIntensity, beaconPreset.houseRadius, 2);
        this.houseGlowLight.position.set(this.housePos.x, 1.35, this.housePos.z);
        this.scene.add(this.houseGlowLight);

        const truckBeaconMat = new THREE.MeshStandardMaterial({
            color: 0xffc16f,
            emissive: 0xffa347,
            emissiveIntensity: 1.2,
            roughness: 0.22,
            metalness: 0.12
        });
        this.truckBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), truckBeaconMat);
        this.truckBeacon.position.set(this.truckPos.x, 1.15, this.truckPos.z);
        this.scene.add(this.truckBeacon);

        const houseBeaconMat = new THREE.MeshStandardMaterial({
            color: 0xa9ffe9,
            emissive: 0x52ffd0,
            emissiveIntensity: 1.1,
            roughness: 0.24,
            metalness: 0.1
        });
        this.houseBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), houseBeaconMat);
        this.houseBeacon.position.set(this.housePos.x, 1.15, this.housePos.z);
        this.scene.add(this.houseBeacon);
    }

    _addDecorations(level) {
        // Clean previous
        this.decorations.forEach(d => this.scene.remove(d));
        this.decorations = [];
        this.obstacles = [];

        // Add trees around the edges
        const treePositions = [
            [-16, -16], [-14, -12], [-16, 0], [-12, -16],
            [16, 16], [14, 12], [16, 0], [12, 16],
            [-16, 14], [16, -14], [-8, -16], [8, 16],
        ];

        treePositions.forEach(([x, z]) => {
            const tree = this._createTree(level);
            const tx = x + Math.random() * 2;
            const tz = z + Math.random() * 2;
            tree.position.set(tx, 0, tz);
            tree.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(tree);
            this.decorations.push(tree);
            this.obstacles.push({ x: tx, z: tz, radius: 1.0 });
        });

        // Rocks
        for (let i = 0; i < 6; i++) {
            const rock = this._createRock();
            const rx = (Math.random() - 0.5) * 36;
            const rz = (Math.random() - 0.5) * 36;
            rock.position.set(rx, 0, rz);
            // Avoid truck and house areas
            const distToTruck = rock.position.distanceTo(this.truckPos);
            const distToHouse = rock.position.distanceTo(this.housePos);
            if (distToTruck > 6 && distToHouse > 6) {
                this.scene.add(rock);
                this.decorations.push(rock);
                this.obstacles.push({ x: rx, z: rz, radius: 0.8 });
            }
        }

        this._addThemeSetDressing(level);

        // Also add truck and house as obstacles
        this.obstacles.push({ x: this.truckPos.x, z: this.truckPos.z, radius: 2.5 });
        this.obstacles.push({ x: this.housePos.x, z: this.housePos.z, radius: 2.8 });
    }

    _createTree(level) {
        if (level === 5) {
            return this._createDeadTree();
        }

        const group = new THREE.Group();
        const trunkColor = level === 4 ? 0x41315d : 0x8B4513;
        const foliageColors = [0x228B22, 0xcf7d2f, 0x5f849d, 0x163457, 0x5a2a0a];
        const foliageColor = foliageColors[level - 1] || 0x228B22;

        // Trunk with bark texture variation
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.25, 1.5, 6),
            new THREE.MeshStandardMaterial({
                color: trunkColor,
                flatShading: true,
                ...getSurfaceMaterialProps(this.texturePack, 'bark')
            })
        );
        trunk.position.y = 0.75;
        trunk.castShadow = true;
        group.add(trunk);

        // Foliage (stacked cones = low poly tree, with color variation)
        const sizes = [[0.9, 1.1], [0.7, 0.9], [0.45, 0.7]];
        let y = 1.2;
        sizes.forEach(([r, h], i) => {
            const leafColor = new THREE.Color(foliageColor);
            leafColor.offsetHSL(level === 2 ? 0.01 : 0, 0, (i - 1) * 0.06);
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(r, h, 7),
                new THREE.MeshStandardMaterial({
                    color: leafColor,
                    flatShading: true,
                    emissive: level === 4 ? new THREE.Color(0x163a66) : 0x000000,
                    emissiveIntensity: level === 4 ? 0.22 : 0,
                    ...getSurfaceMaterialProps(this.texturePack, 'grass')
                })
            );
            cone.position.y = y;
            cone.castShadow = true;
            cone.receiveShadow = true;
            group.add(cone);

            if (level === 3) {
                const snowCap = new THREE.Mesh(
                    new THREE.ConeGeometry(r * 0.72, h * 0.32, 7),
                    new THREE.MeshStandardMaterial({
                        color: 0xf7fbff,
                        roughness: 0.92,
                        metalness: 0.02,
                        emissive: 0xb2dfff,
                        emissiveIntensity: 0.08
                    })
                );
                snowCap.position.y = y + h * 0.18;
                snowCap.castShadow = true;
                group.add(snowCap);
            }
            y += h * 0.5;
        });

        if (level === 4) {
            for (let i = 0; i < 3; i++) {
                const glowBerry = new THREE.Mesh(
                    new THREE.SphereGeometry(0.08 + Math.random() * 0.03, 8, 6),
                    new THREE.MeshStandardMaterial({
                        color: i % 2 === 0 ? 0x86f4ff : 0xb39aff,
                        emissive: i % 2 === 0 ? 0x2a9cc6 : 0x5e4bc2,
                        emissiveIntensity: 0.8,
                        roughness: 0.32,
                        metalness: 0.08
                    })
                );
                glowBerry.position.set(
                    (Math.random() - 0.5) * 0.7,
                    1.5 + Math.random() * 1.1,
                    (Math.random() - 0.5) * 0.7
                );
                group.add(glowBerry);
            }
        }

        const s = 0.8 + Math.random() * 0.6;
        group.scale.set(s, s, s);
        return group;
    }

    _createDeadTree() {
        const group = new THREE.Group();
        const barkMat = new THREE.MeshStandardMaterial({
            color: 0x34211a,
            flatShading: true,
            emissive: 0x100705,
            emissiveIntensity: 0.16,
            ...getSurfaceMaterialProps(this.texturePack, 'bark')
        });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.8, 6), barkMat);
        trunk.position.y = 0.9;
        trunk.castShadow = true;
        group.add(trunk);

        const branchAngles = [-0.8, -0.25, 0.65];
        branchAngles.forEach((angle, index) => {
            const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.05, 5), barkMat);
            branch.position.set(Math.sin(angle) * 0.18, 1.35 + index * 0.12, Math.cos(angle) * 0.14);
            branch.rotation.z = -0.8 + index * 0.45;
            branch.rotation.x = 0.4 - index * 0.18;
            branch.castShadow = true;
            group.add(branch);
        });

        for (let i = 0; i < 2; i++) {
            const ember = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 8, 6),
                new THREE.MeshStandardMaterial({
                    color: 0xff8a4a,
                    emissive: 0xff531a,
                    emissiveIntensity: 0.55,
                    roughness: 0.38,
                    metalness: 0.08
                })
            );
            ember.position.set((Math.random() - 0.5) * 0.3, 0.6 + i * 0.35, (Math.random() - 0.5) * 0.3);
            group.add(ember);
        }

        const s = 0.88 + Math.random() * 0.42;
        group.scale.set(s, s, s);
        return group;
    }

    _createRock() {
        const group = new THREE.Group();
        const r = 0.3 + Math.random() * 0.5;
        // Use varied greys
        const grey = 0.35 + Math.random() * 0.3;
        const rockColor = new THREE.Color(grey, grey, grey * 0.95);
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(r, 0),
            new THREE.MeshStandardMaterial({
                color: rockColor,
                flatShading: true,
                ...getSurfaceMaterialProps(this.texturePack, 'stone')
            })
        );
        rock.position.y = r * 0.45;
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        rock.receiveShadow = true;
        group.add(rock);

        // Sometimes add a smaller rock beside
        if (Math.random() > 0.5) {
            const r2 = r * 0.4;
            const rock2 = new THREE.Mesh(
                new THREE.DodecahedronGeometry(r2, 0),
                new THREE.MeshStandardMaterial({
                    color: rockColor.clone().offsetHSL(0, 0, 0.05),
                    flatShading: true,
                    ...getSurfaceMaterialProps(this.texturePack, 'stone')
                })
            );
            rock2.position.set(r * 0.7, r2 * 0.4, r * 0.3);
            rock2.rotation.set(Math.random(), Math.random(), Math.random());
            rock2.castShadow = true;
            group.add(rock2);
        }

        return group;
    }

    _sampleDetailPositions(count, minSpacing = 4.6) {
        const positions = [];
        let attempts = 0;
        while (positions.length < count && attempts < count * 40) {
            attempts++;
            const x = (Math.random() - 0.5) * 34;
            const z = (Math.random() - 0.5) * 34;
            const pos = new THREE.Vector3(x, 0, z);
            if (pos.distanceTo(this.truckPos) < 7 || pos.distanceTo(this.housePos) < 7) continue;
            if (Math.hypot(x, z) < 5) continue;
            if (positions.some((other) => other.distanceToSquared(pos) < minSpacing * minSpacing)) continue;
            positions.push(pos);
        }
        return positions;
    }

    _addThemeSetDressing(level) {
        const counts = [8, 9, 8, 8, 7];
        const positions = this._sampleDetailPositions(counts[level - 1] || 8, level === 3 ? 4.1 : 4.7);
        positions.forEach((pos) => {
            let detail = null;
            switch (level) {
                case 2:
                    detail = this._createAutumnLeafPile();
                    break;
                case 3:
                    detail = this._createSnowDrift();
                    break;
                case 4:
                    detail = this._createMoonBloomPatch();
                    break;
                case 5:
                    detail = this._createEmberFissure();
                    break;
                case 1:
                default:
                    detail = this._createMeadowFlowerPatch();
                    break;
            }
            if (!detail) return;
            detail.position.copy(pos);
            detail.rotation.y = Math.random() * Math.PI * 2;
            const scale = level === 5
                ? 0.95 + Math.random() * 0.3
                : 0.82 + Math.random() * 0.42;
            detail.scale.setScalar(scale);
            this.scene.add(detail);
            this.decorations.push(detail);
        });
    }

    _createMeadowFlowerPatch() {
        const group = new THREE.Group();
        const patch = new THREE.Mesh(
            new THREE.CircleGeometry(0.85, 20),
            new THREE.MeshStandardMaterial({
                color: 0x8fce63,
                transparent: true,
                opacity: 0.28,
                depthWrite: false,
                roughness: 0.95,
                metalness: 0.01
            })
        );
        patch.rotation.x = -Math.PI / 2;
        patch.position.y = 0.014;
        group.add(patch);

        const colors = [0xff88bc, 0xffd95a, 0xffffff, 0x8ee17b, 0x8ed8ff];
        for (let i = 0; i < 7; i++) {
            const flower = new THREE.Group();
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.01, 0.01, 0.16, 5),
                new THREE.MeshStandardMaterial({ color: 0x3ca65d, roughness: 0.86, metalness: 0.03 })
            );
            stem.position.y = 0.08;
            flower.add(stem);
            const petalColor = colors[Math.floor(Math.random() * colors.length)];
            for (let p = 0; p < 5; p++) {
                const petal = new THREE.Mesh(
                    new THREE.SphereGeometry(0.04, 6, 5),
                    new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.5, metalness: 0.04 })
                );
                const angle = (p / 5) * Math.PI * 2;
                petal.position.set(Math.cos(angle) * 0.05, 0.16, Math.sin(angle) * 0.05);
                flower.add(petal);
            }
            const center = new THREE.Mesh(
                new THREE.SphereGeometry(0.03, 6, 5),
                new THREE.MeshStandardMaterial({ color: 0xffe58a, roughness: 0.4, metalness: 0.08 })
            );
            center.position.y = 0.16;
            flower.add(center);
            flower.position.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
            group.add(flower);
        }
        return group;
    }

    _createAutumnLeafPile() {
        const group = new THREE.Group();
        const pileColors = [0xde7f2f, 0xc55323, 0xf1b35a, 0x8a451d];
        for (let i = 0; i < 12; i++) {
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(0.09 + Math.random() * 0.05, 7, 6),
                new THREE.MeshStandardMaterial({
                    color: pileColors[Math.floor(Math.random() * pileColors.length)],
                    roughness: 0.88,
                    metalness: 0.02
                })
            );
            leaf.scale.set(1.2, 0.22, 0.8);
            leaf.position.set((Math.random() - 0.5) * 1.1, 0.025 + i * 0.0015, (Math.random() - 0.5) * 0.9);
            leaf.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(leaf);
        }

        const twig = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.02, 0.42, 5),
            new THREE.MeshStandardMaterial({
                color: 0x6b3e1d,
                flatShading: true,
                ...getSurfaceMaterialProps(this.texturePack, 'bark')
            })
        );
        twig.position.set(0.1, 0.05, -0.05);
        twig.rotation.z = 1.1;
        group.add(twig);
        return group;
    }

    _createSnowDrift() {
        const group = new THREE.Group();
        const driftMat = new THREE.MeshStandardMaterial({
            color: 0xf7fbff,
            roughness: 0.95,
            metalness: 0.02,
            emissive: 0xa5dbff,
            emissiveIntensity: 0.08
        });
        for (let i = 0; i < 3; i++) {
            const drift = new THREE.Mesh(new THREE.SphereGeometry(0.38 + i * 0.08, 10, 8), driftMat);
            drift.scale.set(1.55, 0.28, 1.2);
            drift.position.set((i - 1) * 0.24, 0.08 + i * 0.015, (Math.random() - 0.5) * 0.18);
            group.add(drift);
        }
        for (let i = 0; i < 3; i++) {
            const crystal = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.1 + Math.random() * 0.06, 0),
                new THREE.MeshStandardMaterial({
                    color: 0xb7e7ff,
                    emissive: 0x68bfff,
                    emissiveIntensity: 0.25,
                    roughness: 0.34,
                    metalness: 0.16
                })
            );
            crystal.position.set((Math.random() - 0.5) * 0.85, 0.14 + Math.random() * 0.14, (Math.random() - 0.5) * 0.7);
            crystal.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(crystal);
        }
        return group;
    }

    _createMoonBloomPatch() {
        const group = new THREE.Group();
        const stemMat = new THREE.MeshStandardMaterial({
            color: 0x6fd2c4,
            roughness: 0.74,
            metalness: 0.04
        });
        const capColors = [0x84e5ff, 0xa58dff, 0x6dffd8];
        for (let i = 0; i < 4; i++) {
            const mushroom = new THREE.Group();
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.34, 6), stemMat);
            stem.position.y = 0.17;
            mushroom.add(stem);
            const capColor = capColors[i % capColors.length];
            const cap = new THREE.Mesh(
                new THREE.SphereGeometry(0.16 + Math.random() * 0.04, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshStandardMaterial({
                    color: capColor,
                    emissive: new THREE.Color(capColor).multiplyScalar(0.62),
                    emissiveIntensity: 0.66,
                    roughness: 0.4,
                    metalness: 0.06
                })
            );
            cap.scale.y = 0.72;
            cap.position.y = 0.32;
            mushroom.add(cap);
            mushroom.position.set((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9);
            group.add(mushroom);
        }
        return group;
    }

    _createEmberFissure() {
        const group = new THREE.Group();
        for (let i = 0; i < 3; i++) {
            const crack = new THREE.Mesh(
                new THREE.BoxGeometry(0.6 + Math.random() * 0.45, 0.03, 0.12 + Math.random() * 0.05),
                new THREE.MeshStandardMaterial({
                    color: 0xff7c36,
                    emissive: 0xff4d1e,
                    emissiveIntensity: 0.82,
                    roughness: 0.3,
                    metalness: 0.12
                })
            );
            crack.position.set((Math.random() - 0.5) * 0.8, 0.03 + i * 0.004, (Math.random() - 0.5) * 0.7);
            crack.rotation.y = (Math.random() - 0.5) * 1.2;
            group.add(crack);
        }
        for (let i = 0; i < 5; i++) {
            const stone = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.11 + Math.random() * 0.07, 0),
                new THREE.MeshStandardMaterial({
                    color: 0x2e1a15,
                    roughness: 0.88,
                    metalness: 0.04
                })
            );
            stone.position.set((Math.random() - 0.5) * 1.2, 0.06, (Math.random() - 0.5) * 0.9);
            stone.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(stone);
        }
        return group;
    }

    switchLevel(level) {
        const theme = themeForLevel(level);
        this.currentLevel = level;

        // Update vertex-colored ground
        if (this.groundMesh) {
            this._applyGroundVertexColors(theme);
            const grassSurface = getSurfaceMaterialProps(this.texturePack, groundSurfaceForLevel(level));
            this.groundMesh.material.map = grassSurface.map || null;
            this.groundMesh.material.roughness = grassSurface.roughness ?? 0.95;
            this.groundMesh.material.metalness = grassSurface.metalness ?? 0.02;
            this.groundMesh.material.needsUpdate = true;
        }
        if (this.ambientLight) {
            this.ambientLight.color.setHex(theme.ambient);
            this.ambientLight.intensity = theme.ambientIntensity;
        }
        if (this.dirLight) {
            this.dirLight.color.setHex(theme.dirLight);
            this.dirLight.intensity = theme.dirIntensity;
        }
        if (this.fillLight) {
            this.fillLight.color.setHex(theme.dirLight);
            this.fillLight.intensity = theme.dirIntensity * theme.fillFactor;
        }
        if (this.hemiLight) {
            this.hemiLight.color.setHex(theme.sky);
            this.hemiLight.groundColor.setHex(theme.ground);
            this.hemiLight.intensity = theme.hemiIntensity;
        }
        if (this.rimLight) {
            const rimBase = this.quality.lowPower ? 0.16 : theme.rimIntensity;
            this.rimLight.intensity = rimBase * (level === 4 ? 1.2 : 1);
        }
        if (this.truckGlowLight && this.houseGlowLight) {
            const beaconPreset = LIGHTING_PROFILE.beacons;
            const nightBoost = level === 4 ? 1.35 : 1.0;
            this.truckGlowLight.intensity = beaconPreset.truckLightIntensity * nightBoost;
            this.houseGlowLight.intensity = beaconPreset.houseLightIntensity * nightBoost;
            this.truckGlowLight.color.setHex(level === 5 ? 0xff7a4f : 0xffaa56);
            this.houseGlowLight.color.setHex(level === 3 ? 0xc8e9ff : 0x66ffd1);
        }
        if (this.truckBeacon?.material) {
            this.truckBeacon.material.emissiveIntensity = level === 5 ? 1.45 : 1.2;
        }
        if (this.houseBeacon?.material) {
            this.houseBeacon.material.emissiveIntensity = level === 4 ? 1.35 : 1.1;
        }
        this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);

        // Update sky dome
        this._updateSkyDome(theme);

        // Refresh grass and decorations for new theme
        this._addGrassDetails(theme, level);
        this._createPath(level);
        this._addDecorations(level);

        // Refresh particles
        this._createParticles(theme, level);

        this.zoneIndicators.forEach((zone) => {
            if (!zone?.ring?.material || !zone?.disc?.material) return;
            zone.baseRingOpacity = theme.ringOpacity;
            zone.baseDiscOpacity = theme.discOpacity;
            zone.ring.material.opacity = theme.ringOpacity;
            zone.disc.material.opacity = theme.discOpacity;
            if (zone?.dash?.material) {
                zone.baseDashOpacity = theme.ringOpacity * 0.48;
                zone.dash.material.opacity = zone.baseDashOpacity;
            }
            if (zone?.ripple?.material) {
                zone.baseRippleOpacity = theme.discOpacity * 0.68;
                zone.ripple.material.opacity = zone.baseRippleOpacity;
            }
        });
    }

    isInTruckZone(pos) {
        const dx = pos.x - this.truckPos.x;
        const dz = pos.z - this.truckPos.z;
        return Math.sqrt(dx * dx + dz * dz) < this.truckZoneRadius;
    }

    isInHouseZone(pos) {
        const dx = pos.x - this.housePos.x;
        const dz = pos.z - this.housePos.z;
        return Math.sqrt(dx * dx + dz * dz) < this.houseZoneRadius;
    }

    clampToBounds(pos) {
        pos.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, pos.x));
        pos.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, pos.z));
    }

    // Push position out of any obstacle it overlaps with
    resolveCollisions(pos, entityRadius = 0.5) {
        for (const obs of this.obstacles) {
            const dx = pos.x - obs.x;
            const dz = pos.z - obs.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minDist = obs.radius + entityRadius;
            if (dist < minDist && dist > 0.001) {
                const pushFactor = (minDist - dist) / dist;
                pos.x += dx * pushFactor;
                pos.z += dz * pushFactor;
            }
        }
    }

    // Sky dome with gradient
    _createSkyDome(theme) {
        if (this.skyDome) {
            this.scene.remove(this.skyDome);
            this.skyDome.geometry.dispose();
            this.skyDome.material.dispose();
        }
        const skyGeo = new THREE.SphereGeometry(90, 32, 24);
        const skyColors = [];
        const skyColor = new THREE.Color(theme.sky);
        const horizonColor = new THREE.Color(theme.fog);
        const posAttr = skyGeo.attributes.position;
        const horizonBright = horizonColor.clone().offsetHSL(0, -0.1, 0.15);
        for (let i = 0; i < posAttr.count; i++) {
            const y = posAttr.getY(i);
            const t = Math.max(0, y / 90);  // 0 at horizon, 1 at zenith
            // Smoother gradient: warm horizon → vivid sky
            const c = horizonBright.clone().lerp(skyColor, Math.pow(t, 1.5));
            skyColors.push(c.r, c.g, c.b);
        }
        skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
        const skyMat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.BackSide,
            fog: false
        });
        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyDome);
        this.scene.background = null;  // Use sky dome instead
    }

    _updateSkyDome(theme) {
        if (!this.skyDome) return;
        const skyColor = new THREE.Color(theme.sky);
        const horizonColor = new THREE.Color(theme.fog);
        const colorAttr = this.skyDome.geometry.attributes.color;
        const posAttr = this.skyDome.geometry.attributes.position;
        const horizonBright = horizonColor.clone().offsetHSL(0, -0.1, 0.15);
        for (let i = 0; i < posAttr.count; i++) {
            const y = posAttr.getY(i);
            const t = Math.max(0, y / 90);
            const c = horizonBright.clone().lerp(skyColor, Math.pow(t, 1.5));
            colorAttr.setXYZ(i, c.r, c.g, c.b);
        }
        colorAttr.needsUpdate = true;
    }

    // Floating ambient particles (pollen, dust motes)
    _createParticles(theme, level = this.currentLevel) {
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
        const count = this.quality.particleCount || 120;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const particleColors = particlePaletteForLevel(theme, level).map((color) => new THREE.Color(color));
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 50;
            positions[i * 3 + 1] = 0.5 + Math.random() * 8;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
            const c = particleColors[Math.floor(Math.random() * particleColors.length)];
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size: LIGHTING_PROFILE.particles.size,
            vertexColors: true,
            transparent: true,
            opacity: level >= 4 ? 0.82 : LIGHTING_PROFILE.particles.opacity,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            depthWrite: false
        });
        this.particles = new THREE.Points(geo, mat);
        this.scene.add(this.particles);
    }

    // Call from game update loop
    updateParticles(dt) {
        if (!this.particles) return;
        this._fxPulseTime += dt;
        const now = Date.now();
        const positions = this.particles.geometry.attributes.position.array;
        const count = positions.length / 3;
        for (let i = 0; i < count; i++) {
            // Gentle floating drift
            positions[i * 3] += Math.sin(now * 0.0003 + i) * 0.003;
            positions[i * 3 + 1] += Math.sin(now * 0.0005 + i * 0.7) * 0.002;
            positions[i * 3 + 2] += Math.cos(now * 0.0004 + i * 1.3) * 0.003;

            // Wrap around
            if (positions[i * 3 + 1] > 10) positions[i * 3 + 1] = 0.5;
            if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] = 8;
        }
        this.particles.geometry.attributes.position.needsUpdate = true;

        if (this.truckGlowLight && this.houseGlowLight) {
            const beaconPreset = LIGHTING_PROFILE.beacons;
            const truckPulse = 1 + Math.sin(this._fxPulseTime * beaconPreset.truckPulse.speed) * beaconPreset.truckPulse.amount;
            const housePulse = 1 + Math.sin(this._fxPulseTime * beaconPreset.housePulse.speed + beaconPreset.housePulse.phase) * beaconPreset.housePulse.amount;
            const truckFocus = this.activeObjective === 'truck' ? 1.32 : 0.86;
            const houseFocus = this.activeObjective === 'house' ? 1.32 : 0.86;
            this.truckGlowLight.intensity = beaconPreset.truckLightIntensity * truckPulse * truckFocus;
            this.houseGlowLight.intensity = beaconPreset.houseLightIntensity * housePulse * houseFocus;
        }
        if (this.truckBeacon?.material && this.houseBeacon?.material) {
            const truckFocus = this.activeObjective === 'truck' ? 1.28 : 0.92;
            const houseFocus = this.activeObjective === 'house' ? 1.28 : 0.92;
            this.truckBeacon.material.emissiveIntensity = (1.08 + Math.sin(this._fxPulseTime * 2.9) * 0.26) * truckFocus;
            this.houseBeacon.material.emissiveIntensity = (1.02 + Math.sin(this._fxPulseTime * 2.3 + 1.6) * 0.24) * houseFocus;
            const truckScale = this.activeObjective === 'truck' ? 1.12 + Math.sin(this._fxPulseTime * 4.8) * 0.05 : 1;
            const houseScale = this.activeObjective === 'house' ? 1.12 + Math.sin(this._fxPulseTime * 4.2 + 0.8) * 0.05 : 1;
            this.truckBeacon.scale.setScalar(truckScale);
            this.houseBeacon.scale.setScalar(houseScale);
        }
        if (this.truckContactShadow?.material && this.houseContactShadow?.material) {
            this.truckContactShadow.material.opacity = 0.14 + Math.sin(this._fxPulseTime * 1.9) * 0.022;
            this.houseContactShadow.material.opacity = 0.16 + Math.sin(this._fxPulseTime * 1.6 + 0.8) * 0.02;
        }

        this.grassDetails.forEach((detail) => {
            if (detail?.userData?.kind !== 'tuft') return;
            const phase = detail.userData.swayPhase || 0;
            const amp = detail.userData.swayAmp || 0.08;
            const baseRotX = detail.userData.baseRotX || 0;
            const baseRotZ = detail.userData.baseRotZ || 0;
            const sway = Math.sin(this._fxPulseTime * 2.7 + phase) * amp;
            detail.rotation.x = baseRotX + sway * 0.35;
            detail.rotation.z = baseRotZ + sway;
        });

        this.zoneIndicators.forEach((zone, idx) => {
            if (!zone?.ring?.material || !zone?.disc?.material) return;
            const isObjective = zone.key === this.activeObjective;
            const focusMul = isObjective ? 1.45 : 0.8;
            const pulse = 1 + Math.sin(this._fxPulseTime * 2.1 + idx) * 0.08;
            const ringScale = isObjective ? 1.06 + Math.sin(this._fxPulseTime * 3.4 + idx) * 0.03 : 1;
            const discScale = isObjective ? 1.03 + Math.sin(this._fxPulseTime * 2.8 + idx * 0.3) * 0.02 : 1;
            zone.ring.scale.set(ringScale, ringScale, ringScale);
            zone.disc.scale.set(discScale, discScale, discScale);
            zone.ring.material.opacity = zone.baseRingOpacity * pulse * focusMul;
            zone.disc.material.opacity = zone.baseDiscOpacity * (0.88 + Math.sin(this._fxPulseTime * 1.7 + idx * 0.6) * 0.14) * focusMul;
            if (zone?.dash?.material) {
                zone.dash.rotation.z += 0.19 * dt * (1 + idx * 0.08);
                zone.dash.scale.set(ringScale, ringScale, ringScale);
                zone.dash.material.opacity = zone.baseDashOpacity * (0.9 + Math.sin(this._fxPulseTime * 2.8 + idx) * 0.14) * focusMul;
            }
            if (zone?.ripple?.material && zone?.ripple?.scale) {
                const cycle = (this._fxPulseTime * 0.58 + idx * 0.33) % 1;
                const s = (0.84 + cycle * 0.62) * (isObjective ? 1.05 : 0.96);
                zone.ripple.scale.set(s, s, s);
                zone.ripple.material.opacity = zone.baseRippleOpacity * (1 - cycle) * 0.92 * focusMul;
            }
        });
    }
}

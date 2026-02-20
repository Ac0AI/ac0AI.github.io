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
        this.pathPatches = [];
        this.zoneIndicators = [];
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
        this.zoneIndicators = [];

        // Ground — vertex-colored for natural variation
        const groundGeo = new THREE.PlaneGeometry(
            groundPreset.size,
            groundPreset.size,
            groundPreset.segments,
            groundPreset.segments
        );
        const colors = [];
        const baseColor = new THREE.Color(theme.ground);
        const posAttr = groundGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const c = baseColor.clone();
            c.offsetHSL(
                (Math.random() - 0.5) * 0.04,
                (Math.random() - 0.5) * 0.08,
                (Math.random() - 0.5) * 0.06
            );
            colors.push(c.r, c.g, c.b);
        }
        groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const groundMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            ...getSurfaceMaterialProps(this.texturePack, 'grass')
        });

        this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.receiveShadow = true;
        this.scene.add(this.groundMesh);

        // Grass tufts and flowers for visual variety
        this._addGrassDetails(theme);

        // Path from truck to house (subtle)
        this._createPath();

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
        this.truckModel.position.copy(this.truckPos);
        this.truckModel.rotation.y = Math.PI / 4;
        this.scene.add(this.truckModel);

        // House
        this.houseModel = createHouse();
        this.houseModel.position.copy(this.housePos);
        this.houseModel.rotation.y = -Math.PI / 6;
        this.scene.add(this.houseModel);

        // Zone indicators (subtle rings on ground)
        this._createZoneIndicator(this.truckPos, this.truckZoneRadius, 0xff8c00, theme);
        this._createZoneIndicator(this.housePos, this.houseZoneRadius, 0x27ae60, theme);
        this._createArcadeBeacons();

        // Decorations (trees, rocks etc.)
        this._addDecorations(level);

        // Ambient particles
        this._createParticles(theme);
    }

    _addGrassDetails(theme) {
        this.grassDetails = this.grassDetails || [];
        this.grassDetails.forEach(g => this.scene.remove(g));
        this.grassDetails = [];

        const patchCount = this.quality.lowPower
            ? LIGHTING_PROFILE.ground.grassPatchCount.lowPower
            : LIGHTING_PROFILE.ground.grassPatchCount.normal;
        const tuftCount = this.quality.lowPower
            ? LIGHTING_PROFILE.ground.tuftCount.lowPower
            : LIGHTING_PROFILE.ground.tuftCount.normal;
        const flowerCount = this.quality.lowPower
            ? LIGHTING_PROFILE.ground.flowerCount.lowPower
            : LIGHTING_PROFILE.ground.flowerCount.normal;

        // Darker / lighter grass patches (large subtle circles on ground)
        for (let i = 0; i < patchCount; i++) {
            const r = 2 + Math.random() * 6;
            const patchGeo = new THREE.CircleGeometry(r, 8);
            const baseColor = new THREE.Color(theme.ground);
            const variation = (Math.random() - 0.5) * 0.12;
            baseColor.r = Math.max(0, Math.min(1, baseColor.r + variation));
            baseColor.g = Math.max(0, Math.min(1, baseColor.g + variation * 0.8));
            baseColor.b = Math.max(0, Math.min(1, baseColor.b + variation * 0.3));
            const patchMat = new THREE.MeshStandardMaterial({
                color: baseColor,
                ...getSurfaceMaterialProps(this.texturePack, 'grass')
            });
            const patch = new THREE.Mesh(patchGeo, patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(
                (Math.random() - 0.5) * 70,
                0.015,
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
                const blade = new THREE.Mesh(
                    new THREE.ConeGeometry(0.04, h, 4),
                    new THREE.MeshStandardMaterial({
                        color: new THREE.Color(theme.ground).offsetHSL(
                            (Math.random() - 0.5) * 0.06,
                            (Math.random() - 0.5) * 0.15,
                            (Math.random() - 0.5) * 0.2
                        ),
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
            this.scene.add(tuft);
            this.grassDetails.push(tuft);
        }

        // Tiny flower clusters
        const flowerColors = [0xff5588, 0xffdd22, 0xff4455, 0xbb55ee, 0xffffff, 0xff88dd, 0x44eebb];
        for (let i = 0; i < flowerCount; i++) {
            const flowerGroup = new THREE.Group();
            const fc = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            // Petals
            for (let p = 0; p < 4; p++) {
                const petal = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 6, 4),
                    new THREE.MeshStandardMaterial({ color: fc, roughness: 0.52, metalness: 0.06 })
                );
                const angle = (p / 4) * Math.PI * 2;
                petal.position.set(Math.cos(angle) * 0.04, 0.08, Math.sin(angle) * 0.04);
                flowerGroup.add(petal);
            }
            // Center
            const center = new THREE.Mesh(
                new THREE.SphereGeometry(0.03, 6, 4),
                new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.5, metalness: 0.12 })
            );
            center.position.y = 0.08;
            flowerGroup.add(center);
            // Stem
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4),
                new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.84, metalness: 0.04 })
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

    _createPath() {
        this.pathPatches.forEach(p => this.scene.remove(p));
        this.pathPatches = [];

        // Dirt trail as soft blobs instead of one large transparent plane.
        const pathPreset = LIGHTING_PROFILE.path;
        const steps = pathPreset.steps;
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const px = THREE.MathUtils.lerp(this.truckPos.x, this.housePos.x, t) + (Math.random() - 0.5) * pathPreset.jitter;
            const pz = THREE.MathUtils.lerp(this.truckPos.z, this.housePos.z, t) + (Math.random() - 0.5) * pathPreset.jitter;
            const radius = pathPreset.radius.min + Math.random() * (pathPreset.radius.max - pathPreset.radius.min);

            const patchGeo = new THREE.CircleGeometry(radius, 10);
            const patchMat = new THREE.MeshStandardMaterial({
                color: 0xc7a05a,
                transparent: true,
                opacity: pathPreset.opacity,
                depthWrite: false,
                ...getSurfaceMaterialProps(this.texturePack, 'dirt')
            });
            const patch = new THREE.Mesh(patchGeo, patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(px, pathPreset.yBase + i * pathPreset.yStep, pz);
            patch.renderOrder = 20 + i;
            this.scene.add(patch);
            this.pathPatches.push(patch);
        }
    }

    _createZoneIndicator(pos, radius, color, theme) {
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
        this.zoneIndicators.push({ ring, disc, baseRingOpacity: theme.ringOpacity, baseDiscOpacity: theme.discOpacity });
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

        // Also add truck and house as obstacles
        this.obstacles.push({ x: this.truckPos.x, z: this.truckPos.z, radius: 2.5 });
        this.obstacles.push({ x: this.housePos.x, z: this.housePos.z, radius: 2.8 });
    }

    _createTree(level) {
        const group = new THREE.Group();
        const trunkColor = 0x8B4513;
        const foliageColors = [0x228B22, 0xd4a056, 0xe8e8f0, 0x1a5a1a, 0x5a2a0a];
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
            leafColor.offsetHSL(0, 0, (i - 1) * 0.06);
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(r, h, 7),
                new THREE.MeshStandardMaterial({
                    color: leafColor,
                    flatShading: true,
                    ...getSurfaceMaterialProps(this.texturePack, 'grass')
                })
            );
            cone.position.y = y;
            cone.castShadow = true;
            cone.receiveShadow = true;
            group.add(cone);
            y += h * 0.5;
        });

        const s = 0.8 + Math.random() * 0.6;
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

    switchLevel(level) {
        const theme = themeForLevel(level);

        // Update vertex-colored ground
        if (this.groundMesh) {
            const posAttr = this.groundMesh.geometry.attributes.position;
            const colorAttr = this.groundMesh.geometry.attributes.color;
            const baseColor = new THREE.Color(theme.ground);
            for (let i = 0; i < posAttr.count; i++) {
                const c = baseColor.clone();
                c.offsetHSL(
                    (Math.random() - 0.5) * 0.04,
                    (Math.random() - 0.5) * 0.08,
                    (Math.random() - 0.5) * 0.06
                );
                colorAttr.setXYZ(i, c.r, c.g, c.b);
            }
            colorAttr.needsUpdate = true;
            this.groundMesh.material.map = null;
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
        this._addGrassDetails(theme);
        this._addDecorations(level);

        // Refresh particles
        this._createParticles(theme);

        this.zoneIndicators.forEach((zone) => {
            if (!zone?.ring?.material || !zone?.disc?.material) return;
            zone.baseRingOpacity = theme.ringOpacity;
            zone.baseDiscOpacity = theme.discOpacity;
            zone.ring.material.opacity = theme.ringOpacity;
            zone.disc.material.opacity = theme.discOpacity;
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
    _createParticles(theme) {
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
        const count = this.quality.particleCount || 120;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const particleColors = [
            new THREE.Color(0xffffff),
            new THREE.Color(0xffffcc),
            new THREE.Color(theme.sky).offsetHSL(0, -0.3, 0.3)
        ];
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
            opacity: LIGHTING_PROFILE.particles.opacity,
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
            this.truckGlowLight.intensity = beaconPreset.truckLightIntensity * truckPulse;
            this.houseGlowLight.intensity = beaconPreset.houseLightIntensity * housePulse;
        }
        if (this.truckBeacon?.material && this.houseBeacon?.material) {
            this.truckBeacon.material.emissiveIntensity = 1.08 + Math.sin(this._fxPulseTime * 2.9) * 0.26;
            this.houseBeacon.material.emissiveIntensity = 1.02 + Math.sin(this._fxPulseTime * 2.3 + 1.6) * 0.24;
        }
        this.zoneIndicators.forEach((zone, idx) => {
            if (!zone?.ring?.material || !zone?.disc?.material) return;
            const pulse = 1 + Math.sin(this._fxPulseTime * 2.1 + idx) * 0.08;
            zone.ring.material.opacity = zone.baseRingOpacity * pulse;
            zone.disc.material.opacity = zone.baseDiscOpacity * pulse;
        });
    }
}

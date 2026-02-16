import * as THREE from 'three';
import { createTruck, createHouse } from './models.js';

// Level environment themes
const LEVEL_THEMES = [
    { // Level 1 — Spring meadow
        ground: 0x7ec850,
        fog: 0x87CEEB,
        fogDensity: 0.008,
        ambient: 0xffffff,
        ambientIntensity: 0.6,
        dirLight: 0xffffff,
        dirIntensity: 1.0,
        sky: 0x87CEEB,
    },
    { // Level 2 — Autumn
        ground: 0xd4a056,
        fog: 0xc9a95a,
        fogDensity: 0.01,
        ambient: 0xfff0d0,
        ambientIntensity: 0.5,
        dirLight: 0xffe0a0,
        dirIntensity: 0.9,
        sky: 0xd4a060,
    },
    { // Level 3 — Winter
        ground: 0xe8e8f0,
        fog: 0xd0d8e8,
        fogDensity: 0.012,
        ambient: 0xd0d8ff,
        ambientIntensity: 0.7,
        dirLight: 0xeeeeff,
        dirIntensity: 0.8,
        sky: 0xb0c0d0,
    },
    { // Level 4 — Night
        ground: 0x1a3a1a,
        fog: 0x0a0a2a,
        fogDensity: 0.015,
        ambient: 0x4444aa,
        ambientIntensity: 0.3,
        dirLight: 0x8888cc,
        dirIntensity: 0.5,
        sky: 0x0a0a2a,
    },
    { // Level 5 — Volcano
        ground: 0x3a2a1a,
        fog: 0x4a1a0a,
        fogDensity: 0.01,
        ambient: 0xff6633,
        ambientIntensity: 0.4,
        dirLight: 0xff8844,
        dirIntensity: 1.2,
        sky: 0x2a0a00,
    },
];

export class World {
    constructor(scene) {
        this.scene = scene;
        this.groundMesh = null;
        this.truckModel = null;
        this.houseModel = null;
        this.ambientLight = null;
        this.dirLight = null;
        this.decorations = [];
        this.obstacles = [];  // { x, z, radius } for collision

        // World positions (play area ~40x40, centered at origin)
        this.truckPos = new THREE.Vector3(-10, 0, 10);
        this.housePos = new THREE.Vector3(10, 0, -8);
        this.truckZoneRadius = 5;
        this.houseZoneRadius = 5;

        // Play bounds
        this.bounds = { minX: -18, maxX: 18, minZ: -18, maxZ: 18 };
    }

    create(level = 1) {
        const theme = LEVEL_THEMES[level - 1] || LEVEL_THEMES[0];

        // Ground — large enough to fill the entire view
        const groundGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
        const groundMat = new THREE.MeshLambertMaterial({ color: theme.ground });
        this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.receiveShadow = true;
        this.scene.add(this.groundMesh);

        // Grass tufts and flowers for visual variety
        this._addGrassDetails(theme);

        // Path from truck to house (subtle)
        this._createPath();

        // Lighting
        this.ambientLight = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(theme.dirLight, theme.dirIntensity);
        this.dirLight.position.set(15, 20, 10);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.set(1024, 1024);
        this.dirLight.shadow.camera.left = -25;
        this.dirLight.shadow.camera.right = 25;
        this.dirLight.shadow.camera.top = 25;
        this.dirLight.shadow.camera.bottom = -25;
        this.dirLight.shadow.camera.near = 1;
        this.dirLight.shadow.camera.far = 60;
        this.scene.add(this.dirLight);

        // Hemisphere light for softer fill
        const hemiLight = new THREE.HemisphereLight(theme.sky, theme.ground, 0.3);
        this.scene.add(hemiLight);
        this.hemiLight = hemiLight;

        // Fog
        this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
        this.scene.background = new THREE.Color(theme.sky);

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
        this._createZoneIndicator(this.truckPos, this.truckZoneRadius, 0xff8c00);
        this._createZoneIndicator(this.housePos, this.houseZoneRadius, 0x27ae60);

        // Decorations (trees, rocks etc.)
        this._addDecorations(level);
    }

    _addGrassDetails(theme) {
        this.grassDetails = this.grassDetails || [];
        this.grassDetails.forEach(g => this.scene.remove(g));
        this.grassDetails = [];

        // Darker / lighter grass patches (large subtle circles on ground)
        for (let i = 0; i < 20; i++) {
            const r = 2 + Math.random() * 5;
            const patchGeo = new THREE.CircleGeometry(r, 8);
            // Slightly vary the ground color
            const baseColor = new THREE.Color(theme.ground);
            const variation = (Math.random() - 0.5) * 0.08;
            baseColor.r = Math.max(0, Math.min(1, baseColor.r + variation));
            baseColor.g = Math.max(0, Math.min(1, baseColor.g + variation));
            const patchMat = new THREE.MeshLambertMaterial({ color: baseColor });
            const patch = new THREE.Mesh(patchGeo, patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(
                (Math.random() - 0.5) * 60,
                0.015,
                (Math.random() - 0.5) * 60
            );
            patch.receiveShadow = true;
            this.scene.add(patch);
            this.grassDetails.push(patch);
        }

        // Small grass tufts (tiny cones)
        for (let i = 0; i < 50; i++) {
            const tuft = new THREE.Group();
            const bladeCount = 3 + Math.floor(Math.random() * 3);
            for (let b = 0; b < bladeCount; b++) {
                const h = 0.15 + Math.random() * 0.2;
                const blade = new THREE.Mesh(
                    new THREE.ConeGeometry(0.04, h, 4),
                    new THREE.MeshLambertMaterial({
                        color: new THREE.Color(theme.ground).offsetHSL(
                            (Math.random() - 0.5) * 0.05,
                            (Math.random() - 0.5) * 0.1,
                            (Math.random() - 0.5) * 0.15
                        )
                    })
                );
                blade.position.set(
                    (Math.random() - 0.5) * 0.3,
                    h / 2,
                    (Math.random() - 0.5) * 0.3
                );
                blade.rotation.z = (Math.random() - 0.5) * 0.4;
                tuft.add(blade);
            }
            tuft.position.set(
                (Math.random() - 0.5) * 50,
                0,
                (Math.random() - 0.5) * 50
            );
            this.scene.add(tuft);
            this.grassDetails.push(tuft);
        }

        // Tiny flower clusters (colored spheres on ground)
        const flowerColors = [0xff6b9d, 0xf1c40f, 0xe74c3c, 0x9b59b6, 0xffffff];
        for (let i = 0; i < 15; i++) {
            const flower = new THREE.Mesh(
                new THREE.SphereGeometry(0.06, 6, 4),
                new THREE.MeshLambertMaterial({
                    color: flowerColors[Math.floor(Math.random() * flowerColors.length)]
                })
            );
            flower.position.set(
                (Math.random() - 0.5) * 45,
                0.06,
                (Math.random() - 0.5) * 45
            );
            this.scene.add(flower);
            this.grassDetails.push(flower);
        }
    }

    _createPath() {
        // Subtle dirt path from truck to house area
        const pathGeo = new THREE.PlaneGeometry(2, 30);
        const pathMat = new THREE.MeshLambertMaterial({
            color: 0xc9a55a,
            transparent: true,
            opacity: 0.3
        });
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.rotation.z = Math.PI / 4;
        path.position.y = 0.02;
        this.scene.add(path);
    }

    _createZoneIndicator(pos, radius, color) {
        const ringGeo = new THREE.RingGeometry(radius - 0.15, radius, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, 0.03, pos.z);
        this.scene.add(ring);

        // Pulsing disc
        const discGeo = new THREE.CircleGeometry(radius, 32);
        const discMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(pos.x, 0.02, pos.z);
        this.scene.add(disc);
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

        // Trunk
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6),
            new THREE.MeshLambertMaterial({ color: trunkColor })
        );
        trunk.position.y = 0.75;
        trunk.castShadow = true;
        group.add(trunk);

        // Foliage (stacked cones = low poly tree)
        const sizes = [[0.8, 1], [0.6, 0.8], [0.4, 0.6]];
        let y = 1.3;
        sizes.forEach(([r, h]) => {
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(r, h, 6),
                new THREE.MeshLambertMaterial({ color: foliageColor })
            );
            cone.position.y = y;
            cone.castShadow = true;
            group.add(cone);
            y += h * 0.55;
        });

        const s = 0.8 + Math.random() * 0.6;
        group.scale.set(s, s, s);
        return group;
    }

    _createRock() {
        const group = new THREE.Group();
        const r = 0.3 + Math.random() * 0.4;
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(r, 0),
            new THREE.MeshLambertMaterial({ color: 0x808080 })
        );
        rock.position.y = r * 0.5;
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        group.add(rock);
        return group;
    }

    switchLevel(level) {
        const theme = LEVEL_THEMES[level - 1] || LEVEL_THEMES[0];

        // Transition colors smoothly
        if (this.groundMesh) {
            this.groundMesh.material.color.setHex(theme.ground);
        }
        if (this.ambientLight) {
            this.ambientLight.color.setHex(theme.ambient);
            this.ambientLight.intensity = theme.ambientIntensity;
        }
        if (this.dirLight) {
            this.dirLight.color.setHex(theme.dirLight);
            this.dirLight.intensity = theme.dirIntensity;
        }
        if (this.hemiLight) {
            this.hemiLight.color.setHex(theme.sky);
            this.hemiLight.groundColor.setHex(theme.ground);
        }
        this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
        this.scene.background = new THREE.Color(theme.sky);

        this._addDecorations(level);
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
                // Push out along the vector from obstacle center to pos
                const pushFactor = (minDist - dist) / dist;
                pos.x += dx * pushFactor;
                pos.z += dz * pushFactor;
            }
        }
    }
}

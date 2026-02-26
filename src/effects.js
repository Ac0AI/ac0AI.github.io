import * as THREE from 'three';

// Visual effects — camera shake, shield glow, walk bob

export class Effects {
    constructor(camera) {
        this.camera = camera;
        this.cameraBasePos = camera.position.clone();

        // Shake
        this._shaking = false;
        this._shakeTimer = 0;
        this._shakeIntensity = 0;

        // Carried item bobbing
        this._bobPhase = 0;
        this._walkLift = 0;
        this._bursts = [];
    }

    shake(duration = 300, intensity = 0.3) {
        this._shaking = true;
        this._shakeTimer = duration;
        this._shakeIntensity = intensity;
    }

    update(dt) {
        // Camera shake
        if (this._shaking) {
            this._shakeTimer -= dt * 1000;
            if (this._shakeTimer <= 0) {
                this._shaking = false;
                this.camera.position.copy(this.cameraBasePos);
            } else {
                const factor = this._shakeTimer / 300;
                this.camera.position.x = this.cameraBasePos.x + (Math.random() - 0.5) * this._shakeIntensity * factor;
                this.camera.position.y = this.cameraBasePos.y + (Math.random() - 0.5) * this._shakeIntensity * factor;
                this.camera.position.z = this.cameraBasePos.z + (Math.random() - 0.5) * this._shakeIntensity * factor;
            }
        }

        this._bobPhase += dt * 8;
        this._updateBursts(dt);
    }

    // Walk bobbing for player root only (limb swing is handled in game animation rig).
    applyWalkBob(playerModel, isMoving, isCarrying = false) {
        const targetLift = isMoving
            ? Math.abs(Math.sin(this._bobPhase)) * (isCarrying ? 0.1 : 0.14)
            : 0;
        this._walkLift = THREE.MathUtils.lerp(this._walkLift, targetLift, 0.22);
        playerModel.position.y = this._walkLift;
        return this._walkLift;
    }

    // Carried item bobbing
    getCarryOffset() {
        return Math.sin(this._bobPhase * 0.7) * 0.05;
    }

    // Shield glow around player
    createShieldGlow(scene) {
        const geo = new THREE.SphereGeometry(1.2, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const shield = new THREE.Mesh(geo, mat);
        shield.position.y = 0.8;
        scene.add(shield);
        return shield;
    }

    removeShieldGlow(scene, shield) {
        if (shield) {
            scene.remove(shield);
            shield.geometry.dispose();
            shield.material.dispose();
        }
    }

    spawnInteractionBurst(scene, worldPos, style = 'pickup') {
        if (!scene || !worldPos) return;

        const styleMap = {
            pickup: { color: 0x76d8ff, duration: 0.56, sparkCount: 7, radius: 1.05, height: 0.22, opacity: 0.72 },
            drop: { color: 0x8fb8ff, duration: 0.52, sparkCount: 6, radius: 0.95, height: 0.18, opacity: 0.66 },
            deliver: { color: 0x6cffb1, duration: 0.72, sparkCount: 10, radius: 1.55, height: 0.32, opacity: 0.92 },
            goldDeliver: { color: 0xffdc5a, duration: 0.8, sparkCount: 13, radius: 1.9, height: 0.4, opacity: 1.0 },
            impact: { color: 0xff965d, duration: 0.62, sparkCount: 9, radius: 1.3, height: 0.26, opacity: 0.9 },
            impactBoss: { color: 0xff5555, duration: 0.74, sparkCount: 14, radius: 1.75, height: 0.36, opacity: 1.0 }
        };
        const cfg = styleMap[style] || styleMap.pickup;

        const group = new THREE.Group();
        group.position.set(worldPos.x, worldPos.y + 0.03, worldPos.z);

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.2, 0.34, 32),
            new THREE.MeshBasicMaterial({
                color: cfg.color,
                transparent: true,
                opacity: cfg.opacity,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 120;
        group.add(ring);

        const sparks = [];
        for (let i = 0; i < cfg.sparkCount; i++) {
            const spark = new THREE.Mesh(
                new THREE.SphereGeometry(0.055, 6, 4),
                new THREE.MeshBasicMaterial({
                    color: cfg.color,
                    transparent: true,
                    opacity: Math.min(0.95, cfg.opacity + 0.1),
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                })
            );
            const a = (i / cfg.sparkCount) * Math.PI * 2 + Math.random() * 0.35;
            spark.userData.dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
            spark.userData.spin = (Math.random() - 0.5) * 3.8;
            spark.position.set(0, cfg.height * (0.4 + Math.random() * 0.8), 0);
            spark.renderOrder = 121;
            group.add(spark);
            sparks.push(spark);
        }

        scene.add(group);
        this._bursts.push({
            scene,
            group,
            ring,
            sparks,
            age: 0,
            duration: cfg.duration,
            radius: cfg.radius,
            lift: cfg.height
        });
    }

    clearTransient(scene = null) {
        for (let i = this._bursts.length - 1; i >= 0; i--) {
            const burst = this._bursts[i];
            if (scene && burst.scene !== scene) continue;
            this._disposeBurst(burst);
            this._bursts.splice(i, 1);
        }
    }

    _disposeBurst(burst) {
        if (!burst) return;
        if (burst.scene && burst.group) {
            burst.scene.remove(burst.group);
        }
        if (burst.ring?.geometry) burst.ring.geometry.dispose();
        if (burst.ring?.material) burst.ring.material.dispose();
        burst.sparks?.forEach((spark) => {
            if (spark.geometry) spark.geometry.dispose();
            if (spark.material) spark.material.dispose();
        });
    }

    _updateBursts(dt) {
        if (this._bursts.length === 0) return;
        for (let i = this._bursts.length - 1; i >= 0; i--) {
            const burst = this._bursts[i];
            burst.age += dt;
            const t = burst.age / burst.duration;
            if (t >= 1) {
                this._disposeBurst(burst);
                this._bursts.splice(i, 1);
                continue;
            }

            const easeOut = 1 - Math.pow(1 - t, 2);
            const ringScale = 1 + easeOut * burst.radius;
            burst.ring.scale.set(ringScale, ringScale, ringScale);
            burst.ring.material.opacity = (1 - t) * 1.0;
            burst.group.position.y += dt * burst.lift * 0.25;

            burst.sparks.forEach((spark, idx) => {
                const dir = spark.userData.dir || new THREE.Vector3(1, 0, 0);
                const spread = burst.radius * 0.85 * easeOut;
                spark.position.x = dir.x * spread;
                spark.position.z = dir.z * spread;
                spark.position.y = burst.lift * 0.2 + Math.sin(easeOut * Math.PI + idx) * burst.lift * 0.28 + easeOut * burst.lift * 0.65;
                spark.material.opacity = Math.max(0, (1 - t) * (1 - t) * 1.0);
                spark.rotation.y += (spark.userData.spin || 0) * dt;
            });
        }
    }

    // Gold shimmer
    updateGoldShimmer(model, time) {
        if (!model) return;
        const pulse = 0.7 + Math.sin(time * 5) * 0.3;
        model.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((material) => {
                if (!material || !material.isMaterial || !('emissive' in material)) return;
                material.emissive = material.emissive || new THREE.Color(0x000000);
                material.emissive.setHex(0xFFD700);
                material.emissiveIntensity = pulse * 0.3;
            });
        });
    }

    updateCameraBasePos(pos) {
        this.cameraBasePos.copy(pos);
    }
}

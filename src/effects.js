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
    }

    // Walk bobbing for player
    applyWalkBob(playerModel, isMoving) {
        if (isMoving) {
            playerModel.position.y = Math.abs(Math.sin(this._bobPhase)) * 0.15;
            playerModel.rotation.z = Math.sin(this._bobPhase * 0.5) * 0.08;
        } else {
            playerModel.position.y = 0;
            playerModel.rotation.z = 0;
        }
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

    // Gold shimmer
    updateGoldShimmer(model, time) {
        if (!model) return;
        model.children.forEach(child => {
            if (child.material) {
                const pulse = 0.7 + Math.sin(time * 5) * 0.3;
                child.material.emissive = child.material.emissive || new THREE.Color(0);
                child.material.emissive.setHex(0xFFD700);
                child.material.emissiveIntensity = pulse * 0.3;
            }
        });
    }

    updateCameraBasePos(pos) {
        this.cameraBasePos.copy(pos);
    }
}

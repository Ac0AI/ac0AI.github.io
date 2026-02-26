import * as THREE from 'three';
import { createSheep, createDog } from './models.js';

// Sheep + Dog enemy manager
const BOSS_TINT_COLOR = new THREE.Color(0xff4444);

export class EnemyManager {
    constructor(scene) {
        this.scene = scene;
        this.sheep = [];       // { model, vx, vz, isBoss }
        this.dog = null;
        this.activeDog = false;
        this.dogAge = 0;
        this.dogDuration = 15;
        this.dogSpeed = 8;
        this.dogEatRadius = 2;
    }

    spawnSheep(count, currentLevel, playerPos, screenW, screenH) {
        const worldSize = 18;

        for (let i = 0; i < count; i++) {
            let sx, sz;
            let attempts = 0;
            let tooClose = true;

            while (tooClose && attempts < 10) {
                const edge = Math.floor(Math.random() * 4);
                switch (edge) {
                    case 0: sx = (Math.random() - 0.5) * worldSize * 2; sz = -worldSize - 2; break;
                    case 1: sx = (Math.random() - 0.5) * worldSize * 2; sz = worldSize + 2; break;
                    case 2: sx = -worldSize - 2; sz = (Math.random() - 0.5) * worldSize * 2; break;
                    case 3: sx = worldSize + 2; sz = (Math.random() - 0.5) * worldSize * 2; break;
                }
                const distToPlayer = Math.sqrt(
                    (sx - playerPos.x) ** 2 + (sz - playerPos.z) ** 2
                );
                tooClose = distToPlayer < 8;
                attempts++;
            }

            const sheepScale = 0.8 + (currentLevel - 1) * 0.3;
            const model = createSheep(sheepScale);
            if (!model) continue;
            model.position.set(sx, 0, sz);
            this.scene.add(model);

            // Random target direction
            const tx = (Math.random() - 0.5) * worldSize * 2;
            const tz = (Math.random() - 0.5) * worldSize * 2;
            const dx = tx - sx;
            const dz = tz - sz;
            const dist = Math.sqrt(dx * dx + dz * dz) || 1;
            const speed = 2.5 + currentLevel * 0.7;

            this.sheep.push({
                model,
                vx: (dx / dist) * speed,
                vz: (dz / dist) * speed,
                isBoss: false,
                baseY: model.position.y,
                animTime: Math.random() * Math.PI * 2,
                animPhase: Math.random() * Math.PI * 2,
                hopSpeed: 7.8 + Math.random() * 2.4,
                hopAmp: (0.08 + Math.random() * 0.05) * sheepScale,
                rollAmp: 0.07 + Math.random() * 0.04,
                nodAmp: 0.05 + Math.random() * 0.03,
                yawWiggleAmp: 0.04 + Math.random() * 0.03,
                lookSpeed: 2.2 + Math.random() * 1.4,
            });

            // Face movement direction
            model.rotation.y = Math.atan2(dx, dz);
        }

        // Boss sheep on level 5+
        if (currentLevel >= 5 && Math.random() < 0.1) {
            this._spawnBoss(playerPos);
        }
    }

    _spawnBoss(playerPos) {
        const worldSize = 18;
        const edge = Math.floor(Math.random() * 4);
        let bx, bz;
        switch (edge) {
            case 0: bx = (Math.random() - 0.5) * worldSize * 2; bz = -worldSize - 3; break;
            case 1: bx = (Math.random() - 0.5) * worldSize * 2; bz = worldSize + 3; break;
            case 2: bx = -worldSize - 3; bz = (Math.random() - 0.5) * worldSize * 2; break;
            case 3: bx = worldSize + 3; bz = (Math.random() - 0.5) * worldSize * 2; break;
        }

        const model = createSheep(2.0);
        if (!model) return;
        model.position.set(bx, 0, bz);
        // Tint boss red (guard against imported models with material arrays / non-color materials)
        model.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            if (child.userData?.noBossTint) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            const tinted = mats.map((material) => {
                if (!material || !material.isMaterial || !material.color) return material;
                const next = material.clone();
                if (next.color.getHex() === 0xffffff) {
                    next.color.copy(BOSS_TINT_COLOR);
                } else {
                    next.color.lerp(BOSS_TINT_COLOR, 0.22);
                }
                return next;
            });
            child.material = Array.isArray(child.material) ? tinted : tinted[0];
        });
        this.scene.add(model);

        this.sheep.push({
            model,
            vx: 0,
            vz: 0,
            isBoss: true,
            baseY: model.position.y,
            animTime: Math.random() * Math.PI * 2,
            animPhase: Math.random() * Math.PI * 2,
            hopSpeed: 6.2,
            hopAmp: 0.2,
            rollAmp: 0.05,
            nodAmp: 0.04,
            yawWiggleAmp: 0.03,
            lookSpeed: 1.8,
        });
    }

    update(dt, playerPos, currentLevel, hasGracePeriod, hasShield, isTurbo, world) {
        const worldSize = 22;
        let hitPlayer = false;
        let roadkills = [];

        for (let i = this.sheep.length - 1; i >= 0; i--) {
            const s = this.sheep[i];
            s.animTime = (s.animTime || 0) + dt;

            // Chasing behavior L3+
            if (currentLevel >= 3 && !s.isBoss) {
                const chaseStrength = currentLevel >= 4 ? 0.15 : 0.06;
                const toDx = playerPos.x - s.model.position.x;
                const toDz = playerPos.z - s.model.position.z;
                const toDist = Math.sqrt(toDx * toDx + toDz * toDz) || 1;
                s.vx += (toDx / toDist) * chaseStrength;
                s.vz += (toDz / toDist) * chaseStrength;
            }

            // Boss always chases
            if (s.isBoss) {
                const toDx = playerPos.x - s.model.position.x;
                const toDz = playerPos.z - s.model.position.z;
                const toDist = Math.sqrt(toDx * toDx + toDz * toDz) || 1;
                s.vx = (toDx / toDist) * 4.0;
                s.vz = (toDz / toDist) * 4.0;
            }

            const prevX = s.model.position.x;
            const prevZ = s.model.position.z;

            s.model.position.x += s.vx * dt;
            s.model.position.z += s.vz * dt;

            // Resolve collisions with obstacles — bounce off
            if (world) {
                const sheepPos = s.model.position;
                const sheepRadius = s.isBoss ? 1.5 : 0.6;
                for (const obs of world.obstacles) {
                    const dx = sheepPos.x - obs.x;
                    const dz = sheepPos.z - obs.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const minDist = obs.radius + sheepRadius;
                    if (dist < minDist && dist > 0.001) {
                        // Push out
                        const pushFactor = (minDist - dist) / dist;
                        sheepPos.x += dx * pushFactor;
                        sheepPos.z += dz * pushFactor;
                        // Bounce velocity
                        const nx = dx / dist;
                        const nz = dz / dist;
                        const dot = s.vx * nx + s.vz * nz;
                        if (dot < 0) {
                            s.vx -= 2 * dot * nx;
                            s.vz -= 2 * dot * nz;
                        }
                    }
                }
            }

            // Face movement direction + playful sheep motion
            const heading = Math.atan2(s.vx, s.vz);
            const bob = Math.abs(Math.sin(s.animTime * (s.hopSpeed || 7.5) + (s.animPhase || 0))) * (s.hopAmp || 0.08);
            s.model.position.y = (s.baseY || 0) + bob;
            s.model.rotation.y = heading + Math.sin(s.animTime * (s.lookSpeed || 2.6) + (s.animPhase || 0)) * (s.yawWiggleAmp || 0.04);
            s.model.rotation.z = Math.sin(s.animTime * ((s.hopSpeed || 7.5) * 0.68) + i) * (s.rollAmp || 0.08);
            s.model.rotation.x = Math.sin(s.animTime * ((s.hopSpeed || 7.5) * 0.5) + (s.animPhase || 0) * 0.6) * (s.nodAmp || 0.06);

            const style = s.model.userData?.sheepStyle;
            if (style?.pupils?.length) {
                const lookX = Math.sin(s.animTime * ((s.lookSpeed || 2.6) + 0.9) + i) * 0.01;
                const lookY = Math.cos(s.animTime * ((s.lookSpeed || 2.6) + 1.2) + i * 0.7) * 0.008;
                style.pupils.forEach((pupil) => {
                    if (!pupil) return;
                    pupil.position.x = (pupil.userData.baseX || 0) + lookX;
                    pupil.position.y = (pupil.userData.baseY || 0) + lookY;
                });
            }
            if (style?.hat) {
                style.hat.rotation.z = (style.hat.userData.baseRotZ || 0)
                    + Math.sin(s.animTime * 5.8 + (s.animPhase || 0)) * 0.08;
            }
            if (style?.smile) {
                style.smile.scale.y = 1 + Math.sin(s.animTime * 8 + i) * 0.08;
            }
            if (style?.scarf) {
                style.scarf.rotation.z = (style.scarf.userData.baseRotZ || 0)
                    + Math.sin(s.animTime * 4.6 + (s.animPhase || 0)) * 0.11;
            }
            if (style?.star) {
                style.star.rotation.y += dt * 4.8;
                style.star.position.y = (style.star.userData.baseY || 0)
                    + Math.sin(s.animTime * 7.2 + (s.animPhase || 0)) * 0.05;
            }

            // Out of bounds — remove
            if (Math.abs(s.model.position.x) > worldSize ||
                Math.abs(s.model.position.z) > worldSize) {
                this.scene.remove(s.model);
                this.sheep.splice(i, 1);
                continue;
            }

            // Collision with player
            if (!hasGracePeriod) {
                const dist = Math.sqrt(
                    (playerPos.x - s.model.position.x) ** 2 +
                    (playerPos.z - s.model.position.z) ** 2
                );
                // Make hit radius a bit more forgiving for roadkill
                const hitRadius = s.isBoss ? 2.5 : 1.2;
                if (dist < hitRadius) {
                    if (hasShield || isTurbo) {
                        // VÄGMORD! Remove sheep and track to pass back
                        roadkills.push({ pos: s.model.position.clone(), isBoss: s.isBoss });
                        this.scene.remove(s.model);
                        this.sheep.splice(i, 1);
                    } else {
                        hitPlayer = true;
                    }
                }
            }
        }

        this._updateDog(dt);
        return { hitPlayer, roadkills };
    }

    clearAll() {
        this.sheep.forEach(s => this.scene.remove(s.model));
        this.sheep = [];
        this._finishDog();
    }

    getSheepCount() {
        return this.sheep.length;
    }

    // Spawn burst of sheep (for fårinvasion event)
    spawnBurst(count, playerPos, currentLevel) {
        this.spawnSheep(count, currentLevel, playerPos);
    }

    // Dog — chases and removes sheep
    spawnDog(playerPos, audio) {
        if (this.activeDog && this.dog) return false;
        if (this.activeDog && !this.dog) {
            this._finishDog();
        }
        if (this.sheep.length === 0) return false;

        const worldSize = 18;
        const edge = Math.floor(Math.random() * 4);
        let dx, dz;
        switch (edge) {
            case 0: dx = (Math.random() - 0.5) * worldSize; dz = -worldSize; break;
            case 1: dx = (Math.random() - 0.5) * worldSize; dz = worldSize; break;
            case 2: dx = -worldSize; dz = (Math.random() - 0.5) * worldSize; break;
            case 3: dx = worldSize; dz = (Math.random() - 0.5) * worldSize; break;
        }

        let model = null;
        try {
            model = createDog();
        } catch (err) {
            console.error('Dog spawn failed:', err);
            this._finishDog();
            return false;
        }
        if (!model) {
            this._finishDog();
            return false;
        }

        this.dog = model;
        this.dog.position.set(dx, 0, dz);
        this.scene.add(this.dog);
        this.activeDog = true;
        this.dogAge = 0;

        if (audio) {
            try {
                audio.playSound('dog');
            } catch (_) { }
        }

        return true;
    }

    _updateDog(dt) {
        if (!this.activeDog) return;
        if (!this.dog) {
            this._finishDog();
            return;
        }

        this.dogAge += dt;
        if (this.dogAge >= this.dogDuration || this.sheep.length === 0) {
            this._finishDog();
            return;
        }

        // Find nearest sheep
        let nearest = null;
        let minDist = Infinity;
        this.sheep.forEach(s => {
            const d = Math.sqrt(
                (this.dog.position.x - s.model.position.x) ** 2 +
                (this.dog.position.z - s.model.position.z) ** 2
            );
            if (d < minDist) {
                minDist = d;
                nearest = s;
            }
        });

        if (!nearest) return;

        if (minDist < this.dogEatRadius) {
            this.scene.remove(nearest.model);
            const idx = this.sheep.indexOf(nearest);
            if (idx >= 0) this.sheep.splice(idx, 1);
            return;
        }

        // Move toward sheep in frame-time space
        const tdx = nearest.model.position.x - this.dog.position.x;
        const tdz = nearest.model.position.z - this.dog.position.z;
        const tDist = Math.sqrt(tdx * tdx + tdz * tdz) || 1;
        this.dog.position.x += (tdx / tDist) * this.dogSpeed * dt;
        this.dog.position.z += (tdz / tDist) * this.dogSpeed * dt;
        this.dog.rotation.y = Math.atan2(tdx, tdz);
    }

    _finishDog() {
        if (this.dog) {
            this.scene.remove(this.dog);
            this.dog = null;
        }
        this.activeDog = false;
        this.dogAge = 0;
    }
}

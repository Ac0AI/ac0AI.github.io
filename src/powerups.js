import * as THREE from 'three';
import { createPowerUp } from './models.js';

// Power-up, combo, and random event manager

export class PowerUpManager {
    constructor(scene) {
        this.scene = scene;
        this.powerups = [];    // { model, type, timeout }
        this._timers = new Set();
        this._activeInput = null;

        // Combo state
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboMaxTime = 4000;
        this.comboMultiplier = 1;

        // Random events
        this.eventTimer = 0;
        this.eventInterval = 25000;
        this.activeEvent = null;
        this.eventMultiplier = 1;

        // Active effects
        this.speedMultiplier = 1;
        this.hasShield = false;
        this.invertedControls = false;
        this.shieldGlow = null;
    }

    spawnPowerUp() {
        const types = ['powerup_coffee', 'powerup_clock', 'powerup_shield', 'powerup_beer'];
        const type = types[Math.floor(Math.random() * types.length)];

        const worldRange = 14;
        const rx = (Math.random() - 0.5) * worldRange * 2;
        const rz = (Math.random() - 0.5) * worldRange * 2;

        const model = createPowerUp(type);
        model.scale.set(2, 2, 2);  // Make power-ups clearly visible
        model.position.set(rx, 0, rz);
        this.scene.add(model);

        const entry = { model, type, spawnTime: Date.now() };
        this.powerups.push(entry);

        // Auto-remove after 8s
        this._setManagedTimeout(() => {
            const idx = this.powerups.indexOf(entry);
            if (idx >= 0) {
                this.scene.remove(entry.model);
                this.powerups.splice(idx, 1);
            }
        }, 8000);
    }

    update(dt, playerPos, audio, ui, input) {
        if (input) this._activeInput = input;
        const time = Date.now() * 0.001;

        // Animate power-ups (float + rotate)
        this.powerups.forEach(p => {
            p.model.position.y = 0.5 + Math.sin(time * 3 + p.model.position.x) * 0.3;
            p.model.rotation.y += dt * 2;
        });

        // Check pickup
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const p = this.powerups[i];
            const dist = Math.sqrt(
                (playerPos.x - p.model.position.x) ** 2 +
                (playerPos.z - p.model.position.z) ** 2
            );
            if (dist < 2.0) {
                this._activate(p.type, audio, ui, input);
                this.scene.remove(p.model);
                this.powerups.splice(i, 1);
            }
        }

        // Combo timer
        if (this.comboTimer > 0) {
            this.comboTimer -= dt * 1000;
            if (this.comboTimer <= 0) {
                this.comboCount = 0;
                this.comboMultiplier = 1;
                this.comboTimer = 0;
            }
        }

        // Shield glow follows player
        if (this.shieldGlow) {
            this.shieldGlow.position.x = playerPos.x;
            this.shieldGlow.position.z = playerPos.z;
            this.shieldGlow.position.y = 0.8;
            this.shieldGlow.material.opacity = 0.15 + Math.sin(time * 4) * 0.1;
        }
    }

    _activate(type, audio, ui, input) {
        let label = '';

        switch (type) {
            case 'powerup_coffee':
                label = '☕ TURBO!';
                this.speedMultiplier = 2;
                this._setManagedTimeout(() => { this.speedMultiplier = 1; }, 5000);
                break;

            case 'powerup_clock':
                label = '⏰ +10 SEK!';
                // Will be handled by game.js to add time
                this._clockBonus = true;
                break;

            case 'powerup_shield':
                label = '🛡️ SKÖLD!';
                this.hasShield = true;
                this._createShieldGlow();
                this._setManagedTimeout(() => {
                    this.hasShield = false;
                    this._removeShieldGlow();
                }, 5000);
                break;

            case 'powerup_beer':
                label = '🍺 FULL!';
                this.invertedControls = true;
                if (input) input.invertControls = true;
                if (audio) audio.playSynth('drop');
                this._setManagedTimeout(() => {
                    this.invertedControls = false;
                    if (input) input.invertControls = false;
                }, 5000);
                break;
        }

        if (ui) ui.showPowerUpToast(label);
        if (audio) audio.playSynth('pickup');
    }

    _createShieldGlow() {
        if (this.shieldGlow) return;
        const geo = new THREE.SphereGeometry(1.5, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        this.shieldGlow = new THREE.Mesh(geo, mat);
        this.scene.add(this.shieldGlow);
    }

    _removeShieldGlow() {
        if (this.shieldGlow) {
            this.scene.remove(this.shieldGlow);
            this.shieldGlow.geometry.dispose();
            this.shieldGlow.material.dispose();
            this.shieldGlow = null;
        }
    }

    // Check and consume clock bonus
    consumeClockBonus() {
        if (this._clockBonus) {
            this._clockBonus = false;
            return true;
        }
        return false;
    }

    // Combo — called on successful delivery
    registerCombo() {
        this.comboCount++;
        this.comboTimer = this.comboMaxTime;

        if (this.comboCount >= 8) this.comboMultiplier = 4;
        else if (this.comboCount >= 5) this.comboMultiplier = 3;
        else if (this.comboCount >= 2) this.comboMultiplier = 2;
        else this.comboMultiplier = 1;
    }

    // Random event timer
    updateEvents(dt, currentLevel, enemies, playerPos, audio, ui) {
        this.eventTimer += dt * 1000;
        if (this.eventTimer >= this.eventInterval) {
            this.eventTimer = 0;
            if (Math.random() < 0.3) {
                this._triggerEvent(currentLevel, enemies, playerPos, audio, ui);
            }
        }
    }

    _triggerEvent(currentLevel, enemies, playerPos, audio, ui) {
        const events = ['dubbelpoang'];
        if (currentLevel >= 2) events.push('farinvasion');
        const event = events[Math.floor(Math.random() * events.length)];
        this.activeEvent = event;

        if (audio) audio.playSynth('event');

        if (event === 'dubbelpoang') {
            this.eventMultiplier = 2;
            if (ui) ui.showEventBanner('💫 DUBBELPOÄNG! 💫');

            this._setManagedTimeout(() => {
                this.eventMultiplier = 1;
                this.activeEvent = null;
                if (ui) ui.hideEventBanner();
            }, 10000);

        } else if (event === 'farinvasion') {
            if (ui) ui.showEventBanner('🐑 FÅRINVASION! 🐑');
            if (audio) audio.playSound('sheep');

            enemies.spawnBurst(8, playerPos, currentLevel);

            this._setManagedTimeout(() => {
                this.activeEvent = null;
                if (ui) ui.hideEventBanner();
            }, 3000);
        }
    }

    _setManagedTimeout(fn, delayMs) {
        const id = setTimeout(() => {
            this._timers.delete(id);
            fn();
        }, delayMs);
        this._timers.add(id);
        return id;
    }

    _clearManagedTimeouts() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
    }

    clearAll() {
        this._clearManagedTimeouts();
        this.powerups.forEach(p => this.scene.remove(p.model));
        this.powerups = [];
        this._removeShieldGlow();
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboMultiplier = 1;
        this.eventMultiplier = 1;
        this.eventTimer = 0;
        this.activeEvent = null;
        this.speedMultiplier = 1;
        this.hasShield = false;
        this.invertedControls = false;
        if (this._activeInput) this._activeInput.invertControls = false;
        this._clockBonus = false;
    }
}

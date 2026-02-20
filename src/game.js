import * as THREE from 'three';
import {
    createPlayer,
    createTruck,
    createHouse,
    createFurniture,
    EXTERNAL_FURNITURE_ENABLED
} from './models.js';
import { World } from './world.js';
import { InputHandler } from './input.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
import { Effects } from './effects.js';
import { EnemyManager } from './enemies.js';
import { PowerUpManager } from './powerups.js';
import { externalModelCatalog } from './external-model-catalog.js';
import { PLAYER_MOTION_PRESETS, VISUAL_PROFILE } from './visual-profile.js';
import { CURATED_FURNITURE_TYPES } from './asset-curation.js';

// ============================================================
// GAME — core orchestrator
// ============================================================

// Points per furniture type
const POINT_VALUES = {
    box: 1, cd: 1, plant: 2,
    lamp: 2, chair: 2, clock: 2, radio: 2,
    sofa: 3, bookshelf: 3, washer: 3, freezer: 3,
    tv: 5, console: 5, fridge: 4, guitar: 4,
    table: 3, mirror: 4, rug: 2, piano: 5, microwave: 3, vase: 2
};

const FURNITURE_TYPES = CURATED_FURNITURE_TYPES.length > 0
    ? [...CURATED_FURNITURE_TYPES]
    : ['box', 'sofa', 'lamp', 'plant', 'chair', 'fridge', 'table', 'washer', 'bookshelf', 'microwave'];
const PROCEDURAL_FURNITURE_SCALE = 1.3;
const PROCEDURAL_CARRY_SCALE_MULT = 1.5 / PROCEDURAL_FURNITURE_SCALE;
const PLAYER_MOTION = PLAYER_MOTION_PRESETS[VISUAL_PROFILE] || PLAYER_MOTION_PRESETS.premium_arcade_v2;

export class Game {
    constructor(scene, camera, quality = {}) {
        this.scene = scene;
        this.camera = camera;
        this.quality = quality;

        // State
        this.state = 'MENU'; // MENU, PLAYING, LEVEL_TRANSITION, GAME_OVER, VICTORY
        this.score = 0;
        this.timeLeft = 75;
        this.currentLevel = 1;
        this.maxLevel = 5;
        this.itemsDelivered = 0;
        this.levelGoal = 15;
        this.hasGracePeriod = false;
        this.sheepSpawnCount = 1;
        this.endlessElapsed = 0;

        // Modules
        this.world = new World(scene, quality);
        this.input = new InputHandler();
        this.audio = new AudioManager();
        this.ui = new UIManager();
        this.effects = new Effects(camera);
        this.enemies = new EnemyManager(scene);
        this.powerups = new PowerUpManager(scene);

        // Player
        this.playerModel = null;
        this.playerPos = new THREE.Vector3(0, 0, 0);
        this.playerSpeed = 11;
        this.playerKeyLight = null;
        this.playerRimLight = null;
        this.playerShadowBlob = null;
        this._playerAnimTime = 0;
        this._playerAnim = {
            state: 'idle',
            walkBlend: 0,
            carryBlend: 0,
            idleBlend: 1,
            pickupImpulse: 0,
            dropImpulse: 0,
        };

        // Furniture
        this.furnitureItems = []; // { model, type, isGold, baseScale }
        this.carriedItem = null;

        // Timers
        this._timerAcc = 0;
        this._sheepSpawnAcc = 0;
        this._powerUpSpawnAcc = 0;
        this._dogSpawnAcc = 0;
        this._difficultyAcc = 0;
        this._externalUpgradeQueued = false;
        this._externalUpgradeApplied = false;
        this._furnitureUpgradeTimer = null;
        this._furnitureUpgradeAttemptsLeft = 0;
        this._timeouts = new Set();

        // Setup
        this._setup();
    }

    _setup() {
        // UI callbacks
        this.ui.onStart = () => this.startGame();
        this.ui.onRestart = () => this.restartGame();
        this.ui.onNextLevel = () => this.nextLevel();

        try {
            // Build world
            this.world.create(1);

            // Create player
            this.playerModel = createPlayer();
            this.playerModel.position.set(0, 0, 0);
            this.scene.add(this.playerModel);
            this._resetPlayerAnimationState();
            this._createPlayerPresentation();
        } catch (err) {
            console.error('Game setup failed, keeping menu interactive:', err);
        }

        // Show start screen
        this.ui.showStartScreen();

        // Swap in imported Unity models as soon as catalog finishes loading.
        this._queueExternalModelUpgrade();
    }

    startGame() {
        this._clearManagedTimeouts();

        if (!this.playerModel || !this.world.truckModel || !this.world.houseModel) {
            try {
                this._clearAll();
                this.world.create(1);
                this.playerModel = createPlayer();
                this.playerModel.position.set(0, 0, 0);
                this.scene.add(this.playerModel);
                this._resetPlayerAnimationState();
                this._createPlayerPresentation();
            } catch (err) {
                console.error('Failed to recover world on start:', err);
                return;
            }
        }

        this.state = 'PLAYING';
        this.score = 0;
        this.timeLeft = 75;
        this.currentLevel = 1;
        this.itemsDelivered = 0;
        this.sheepSpawnCount = 1;
        this.endlessElapsed = 0;

        // Clear previous
        this.enemies.clearAll();
        this.powerups.clearAll();
        this._clearFurniture();

        // Reset player
        this.playerPos.set(0, 0, 0);
        this.playerModel.position.set(0, 0, 0);
        this.carriedItem = null;
        this._resetPlayerAnimationState();

        // Grace period
        this.hasGracePeriod = true;
        this._setManagedTimeout(() => { this.hasGracePeriod = false; }, 3000);

        // Reset timers
        this._timerAcc = 0;
        this._sheepSpawnAcc = 0;
        this._powerUpSpawnAcc = 0;
        this._dogSpawnAcc = 0;
        this._difficultyAcc = 0;

        // Spawn initial furniture
        this._spawnFurniture(5);

        // Audio
        this.audio.resume();
        this.audio.startMusic();

        // UI
        this.ui.hideStartScreen();
        this.ui.updateHUD(this.score, this.timeLeft, this.currentLevel, this.maxLevel,
            this.itemsDelivered, this.levelGoal, 0, 1);
    }

    restartGame() {
        this.audio.stopAll();
        // Remove all 3D objects and rebuild
        this._clearAll();
        this._setup();
        this.startGame();
    }

    _clearAll() {
        this._clearManagedTimeouts();
        if (this._furnitureUpgradeTimer) {
            clearInterval(this._furnitureUpgradeTimer);
            this._furnitureUpgradeTimer = null;
        }
        this.enemies.clearAll();
        this.powerups.clearAll();
        this._clearFurniture();
        if (this.playerShadowBlob) {
            this.playerShadowBlob.geometry.dispose();
            this.playerShadowBlob.material.dispose();
            this.playerShadowBlob = null;
        }

        // Remove world objects
        // Simply clear the scene of everything except camera
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
    }

    _createPlayerPresentation() {
        this.playerKeyLight = new THREE.PointLight(0xfff0d8, this.quality.lowPower ? 0.48 : 0.58, 7.8, 2);
        this.playerKeyLight.castShadow = false;
        this.playerKeyLight.position.set(0, 2.2, 0.8);
        this.scene.add(this.playerKeyLight);

        this.playerRimLight = new THREE.PointLight(0x8fd6ff, this.quality.lowPower ? 0.28 : 0.36, 6.2, 2);
        this.playerRimLight.castShadow = false;
        this.playerRimLight.position.set(-0.8, 1.7, -0.8);
        this.scene.add(this.playerRimLight);

        const shadowGeo = new THREE.CircleGeometry(0.6, 22);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        });
        this.playerShadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
        this.playerShadowBlob.rotation.x = -Math.PI / 2;
        this.playerShadowBlob.position.set(0, 0.03, 0);
        this.scene.add(this.playerShadowBlob);
    }

    _resetPlayerAnimationState() {
        this._playerAnimTime = 0;
        this._playerAnim.state = 'idle';
        this._playerAnim.walkBlend = 0;
        this._playerAnim.carryBlend = 0;
        this._playerAnim.idleBlend = 1;
        this._playerAnim.pickupImpulse = 0;
        this._playerAnim.dropImpulse = 0;
        const rig = this.playerModel?.userData?.animRig;
        if (!rig) return;
        [rig.armL, rig.armR, rig.legL, rig.legR, rig.head].forEach((part) => {
            if (!part) return;
            part.rotation.set(0, 0, 0);
            part.position.y = part.userData?.baseY ?? part.position.y;
        });
    }

    _pulsePlayerAction(type) {
        if (type === 'pickup') {
            this._playerAnim.pickupImpulse = 1;
        } else if (type === 'drop') {
            this._playerAnim.dropImpulse = 1;
        }
    }

    _clearFurniture() {
        this.furnitureItems.forEach(f => this.scene.remove(f.model));
        this.furnitureItems = [];
        if (this.carriedItem) {
            this.scene.remove(this.carriedItem.model);
            this.carriedItem = null;
        }
    }

    _setManagedTimeout(fn, delayMs) {
        const id = setTimeout(() => {
            this._timeouts.delete(id);
            fn();
        }, delayMs);
        this._timeouts.add(id);
        return id;
    }

    _clearManagedTimeouts() {
        this._timeouts.forEach(id => clearTimeout(id));
        this._timeouts.clear();
        this.hasGracePeriod = false;
    }

    _spawnFurniture(count = 1) {
        let spawned = 0;
        let attempts = 0;
        const maxAttempts = Math.max(6, count * 8);
        while (spawned < count && attempts < maxAttempts) {
            if (this._spawnOneFurniture()) {
                spawned++;
            }
            attempts++;
        }
        if (spawned < count && this.state === 'PLAYING') {
            this._setManagedTimeout(() => {
                if (this.state === 'PLAYING') {
                    this._spawnFurniture(count - spawned);
                }
            }, 700);
        }
    }

    _applyGoldTint(model) {
        model.traverse(child => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.emissive = new THREE.Color(0xFFD700);
                child.material.emissiveIntensity = 0.3;
            }
        });
    }

    _spawnOneFurniture() {
        const type = FURNITURE_TYPES[Math.floor(Math.random() * FURNITURE_TYPES.length)];
        const model = createFurniture(type);
        if (!model) {
            return false;
        }
        if (EXTERNAL_FURNITURE_ENABLED && externalModelCatalog.ready && !model?.userData?.externalModel) {
            this._scheduleFurnitureUpgradeRetries();
        }

        // Spawn in a ring around truck (outside truck collision radius)
        const truckPos = this.world.truckPos;
        const angle = Math.random() * Math.PI * 2;
        const dist = 3.5 + Math.random() * 2;  // ring from 3.5 to 5.5 from truck center
        const rx = truckPos.x + Math.cos(angle) * dist;
        const rz = truckPos.z + Math.sin(angle) * dist;
        model.position.set(rx, 0, rz);
        if (!model?.userData?.externalModel) {
            model.scale.set(PROCEDURAL_FURNITURE_SCALE, PROCEDURAL_FURNITURE_SCALE, PROCEDURAL_FURNITURE_SCALE);  // Slightly larger for visibility
        }
        this.scene.add(model);

        const isGold = Math.random() < 0.1;
        const item = {
            model,
            type,
            isGold,
            baseScale: model?.userData?.externalModel ? null : model.scale.clone(),
        };

        if (isGold) {
            this._applyGoldTint(model);

            // Auto-remove gold after 8s if not picked up, spawn replacement
            this._setManagedTimeout(() => {
                if (this.furnitureItems.includes(item) && this.carriedItem !== item) {
                    this.scene.remove(model);
                    const idx = this.furnitureItems.indexOf(item);
                    if (idx >= 0) this.furnitureItems.splice(idx, 1);
                    // Spawn replacement so player doesn't run out
                    this._spawnOneFurniture();
                }
            }, 8000);
        }

        this.furnitureItems.push(item);
        return true;
    }

    _queueExternalModelUpgrade() {
        if (this._externalUpgradeQueued || this._externalUpgradeApplied) return;
        this._externalUpgradeQueued = true;
        externalModelCatalog.whenReady().then(() => {
            this._externalUpgradeQueued = false;
            this._applyExternalModelUpgrade();
        });
    }

    _replaceWorldModel(key, factory, fallbackPosition, fallbackRotationY) {
        const next = factory();
        if (!next?.userData?.externalModel) return false;

        const current = this.world[key];
        const pos = current ? current.position.clone() : fallbackPosition.clone();
        const rotY = current ? current.rotation.y : fallbackRotationY;

        if (current) this.scene.remove(current);
        this.world[key] = next;
        this.world[key].position.copy(pos);
        this.world[key].rotation.y = rotY;
        this.scene.add(this.world[key]);
        return true;
    }

    _upgradeExistingFurnitureModels() {
        if (!EXTERNAL_FURNITURE_ENABLED) return false;
        if (this.furnitureItems.length === 0) return false;

        let anyReplaced = false;
        this.furnitureItems.forEach((item) => {
            const next = createFurniture(item.type);
            if (!next?.userData?.externalModel) return;

            next.position.copy(item.model.position);
            next.rotation.copy(item.model.rotation);
            this.scene.remove(item.model);
            this.scene.add(next);
            item.model = next;
            item.baseScale = null;
            if (item.isGold) this._applyGoldTint(item.model);
            anyReplaced = true;
        });

        if (this.carriedItem) {
            this.carriedItem.model.position.x = this.playerPos.x;
            this.carriedItem.model.position.z = this.playerPos.z;
            this.carriedItem.model.position.y = 1.8 + this.effects.getCarryOffset();
        }

        return anyReplaced;
    }

    _scheduleFurnitureUpgradeRetries(maxAttempts = 10) {
        this._furnitureUpgradeAttemptsLeft = Math.max(this._furnitureUpgradeAttemptsLeft, maxAttempts);
        if (this._furnitureUpgradeTimer) return;

        this._furnitureUpgradeTimer = setInterval(() => {
            if (this._furnitureUpgradeAttemptsLeft <= 0 || !externalModelCatalog.ready) {
                clearInterval(this._furnitureUpgradeTimer);
                this._furnitureUpgradeTimer = null;
                return;
            }
            this._furnitureUpgradeAttemptsLeft--;
            this._upgradeExistingFurnitureModels();

            const pendingFallbacks = this.furnitureItems.some(item => !item.model?.userData?.externalModel);
            if (!pendingFallbacks) {
                clearInterval(this._furnitureUpgradeTimer);
                this._furnitureUpgradeTimer = null;
            }
        }, 800);
    }

    _applyExternalModelUpgrade() {
        if (this._externalUpgradeApplied || !externalModelCatalog.ready) return;

        let changed = false;

        const nextPlayer = createPlayer();
        if (nextPlayer?.userData?.externalModel && this.playerModel) {
            nextPlayer.position.copy(this.playerModel.position);
            nextPlayer.rotation.copy(this.playerModel.rotation);
            this.scene.remove(this.playerModel);
            this.playerModel = nextPlayer;
            this.scene.add(this.playerModel);
            this._resetPlayerAnimationState();
            changed = true;
        }

        changed = this._replaceWorldModel('truckModel', createTruck, this.world.truckPos, Math.PI / 4) || changed;
        changed = this._replaceWorldModel('houseModel', createHouse, this.world.housePos, -Math.PI / 6) || changed;
        if (EXTERNAL_FURNITURE_ENABLED) {
            changed = this._upgradeExistingFurnitureModels() || changed;
            this._scheduleFurnitureUpgradeRetries(12);
        }

        if (changed) {
            this._externalUpgradeApplied = true;
        }
    }

    // ============================================================
    // UPDATE LOOP (called every frame)
    // ============================================================
    update(dt) {
        if (this.state !== 'PLAYING') return;

        this.input.update();

        // ---- Player Movement ----
        this._updatePlayer(dt);

        // ---- Interaction (pickup/drop) ----
        if (this.input.actionJustPressed) {
            this._handleInteraction();
        }

        // ---- Timer ----
        this._timerAcc += dt;
        if (this._timerAcc >= 1) {
            this._timerAcc -= 1;
            this._updateTimer();
        }

        // ---- Enemies ----
        this._sheepSpawnAcc += dt;
        if (this._sheepSpawnAcc >= 3) {
            this._sheepSpawnAcc = 0;
            if (this.state === 'PLAYING') {
                this.enemies.spawnSheep(
                    this.sheepSpawnCount,
                    this.currentLevel,
                    this.playerPos
                );
            }
        }

        const { hitPlayer: hitBySheep, roadkills } = this.enemies.update(
            dt, this.playerPos, this.currentLevel,
            this.hasGracePeriod, this.powerups.hasShield, this.powerups.speedMultiplier > 1, this.world
        );

        if (roadkills && roadkills.length > 0) {
            roadkills.forEach(rk => {
                this.audio.playSound('roadkill');

                // Add points
                let basePoints = rk.isBoss ? 500 : 50;
                const comboMult = this.powerups.comboMultiplier;
                const totalPoints = basePoints * comboMult;
                this.score += totalPoints;

                // Show text
                let pointLabel = `VÄGMORD! +${totalPoints}`;
                if (comboMult > 1) pointLabel += ` 🔥x${comboMult}`;

                const screenPos = this._worldToScreen(rk.pos);
                this.ui.showFloatingPoints(screenPos.x, screenPos.y - 80, pointLabel, 'mega');
            });
        }

        if (hitBySheep) {
            this.audio.playSound('sheep');
            this._gameOver('KROCKAD AV FÅR!');
            return;
        }

        // ---- Dog ----
        this._dogSpawnAcc += dt;
        if (this._dogSpawnAcc >= 15) {
            this._dogSpawnAcc = 0;
            if (Math.random() < 0.2) {
                this.enemies.spawnDog(this.playerPos, this.audio);
                this.ui.showAnnouncement('🐕 VALLHUND!');
            }
        }

        // ---- Power-ups ----
        this._powerUpSpawnAcc += dt;
        if (this._powerUpSpawnAcc >= 12) {
            this._powerUpSpawnAcc = 0;
            this.powerups.spawnPowerUp();
        }

        this.powerups.update(dt, this.playerPos, this.audio, this.ui, this.input);

        // Check clock bonus
        if (this.powerups.consumeClockBonus()) {
            this.timeLeft = Math.min(this.timeLeft + 10, 99);
        }

        // Events
        this.powerups.updateEvents(dt, this.currentLevel, this.enemies, this.playerPos, this.audio, this.ui);

        // ---- Difficulty ----
        this._difficultyAcc += dt;
        if (this._difficultyAcc >= 20) {
            this._difficultyAcc = 0;
            this.sheepSpawnCount = Math.min(8, this.sheepSpawnCount + 1);
        }

        // ---- Auto-replenish furniture if running low ----
        const availableFurniture = this.furnitureItems.filter(f => f !== this.carriedItem).length;
        if (availableFurniture < 2) {
            this._spawnFurniture(3 - availableFurniture);
        }

        // ---- Effects ----
        this.effects.update(dt);
        this.effects.applyWalkBob(this.playerModel, this.input.isMoving, !!this.carriedItem);
        this._animatePlayerMotion(dt);

        // ---- Ambient particles ----
        this.world.updateParticles(dt);

        // ---- Gold item shimmer ----
        const time = Date.now() * 0.001;
        this.furnitureItems.forEach(f => {
            if (f.isGold) {
                this.effects.updateGoldShimmer(f.model, time);
            }
        });

        // ---- Update HUD ----
        this.ui.updateHUD(
            this.score, Math.ceil(this.timeLeft),
            this.currentLevel, this.maxLevel,
            this.itemsDelivered, this.levelGoal,
            this.powerups.comboCount, this.powerups.comboMultiplier
        );
    }

    _updatePlayer(dt) {
        const speed = this.playerSpeed * (this.powerups.speedMultiplier || 1);

        // In 3D isometric: keyboard up = -Z, down = +Z, left = -X, right = +X
        // But with isometric camera, we need to rotate input to match camera angle
        // Camera looks from (+X, +Y, +Z) toward origin, so:
        // Screen-right = world (+X, 0, -Z) direction
        // Screen-down = world (+X, 0, +Z) direction
        // For isometric feel, rotate input by 45 degrees (camera angle)

        const angle = -Math.PI / 4; // 45 degree rotation for isometric
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const inputX = this.input.dx;
        const inputZ = this.input.dy;

        const worldDx = inputX * cos - inputZ * sin;
        const worldDz = inputX * sin + inputZ * cos;

        this.playerPos.x += worldDx * speed * dt;
        this.playerPos.z += worldDz * speed * dt;

        // Clamp to bounds
        this.world.clampToBounds(this.playerPos);

        // Resolve collisions with obstacles (rocks, trees, truck, house)
        this.world.resolveCollisions(this.playerPos, 0.5);

        // Update model position
        this.playerModel.position.x = this.playerPos.x;
        this.playerModel.position.z = this.playerPos.z;

        if (this.playerShadowBlob) {
            this.playerShadowBlob.position.x = this.playerPos.x;
            this.playerShadowBlob.position.z = this.playerPos.z;
        }
        if (this.playerKeyLight) {
            this.playerKeyLight.position.set(this.playerPos.x + 0.1, 2.15, this.playerPos.z + 0.85);
        }
        if (this.playerRimLight) {
            this.playerRimLight.position.set(this.playerPos.x - 0.95, 1.65, this.playerPos.z - 0.9);
        }

        // Face direction
        if (Math.abs(worldDx) > 0.1 || Math.abs(worldDz) > 0.1) {
            this.playerModel.rotation.y = Math.atan2(worldDx, worldDz);
        }

        // Update carried item position (scaled up for visibility)
        if (this.carriedItem) {
            this.carriedItem.model.position.x = this.playerPos.x;
            this.carriedItem.model.position.z = this.playerPos.z;
            this.carriedItem.model.position.y = 1.8 + this.effects.getCarryOffset();
        }
    }

    _animatePlayerMotion(dt) {
        const rig = this.playerModel?.userData?.animRig;
        if (!rig) {
            const moving = this.input.isMoving;
            const carrying = !!this.carriedItem;
            const targetLean = moving ? (carrying ? 0.045 : 0.07) : 0;
            this._playerAnimTime += dt * (moving ? 7.6 : 3.4);
            const sway = Math.sin(this._playerAnimTime * 1.7) * targetLean;
            this.playerModel.rotation.z = THREE.MathUtils.lerp(
                this.playerModel.rotation.z || 0,
                sway,
                Math.min(1, dt * 7.2)
            );
            return;
        }

        const moving = this.input.isMoving;
        const carrying = !!this.carriedItem;
        const nextState = moving ? (carrying ? 'carryWalk' : 'walk') : 'idle';
        this._playerAnim.state = nextState;

        const blendFactor = Math.min(1, dt * PLAYER_MOTION.blendSpeed);
        const targetWalk = nextState === 'walk' ? 1 : 0;
        const targetCarry = nextState === 'carryWalk' ? 1 : 0;
        const targetIdle = nextState === 'idle' ? 1 : 0;

        this._playerAnim.walkBlend = THREE.MathUtils.lerp(this._playerAnim.walkBlend, targetWalk, blendFactor);
        this._playerAnim.carryBlend = THREE.MathUtils.lerp(this._playerAnim.carryBlend, targetCarry, blendFactor);
        this._playerAnim.idleBlend = THREE.MathUtils.lerp(this._playerAnim.idleBlend, targetIdle, blendFactor);

        this._playerAnim.pickupImpulse = Math.max(0, this._playerAnim.pickupImpulse - dt * PLAYER_MOTION.pickupKickDecay);
        this._playerAnim.dropImpulse = Math.max(0, this._playerAnim.dropImpulse - dt * PLAYER_MOTION.dropSettleDecay);

        const gaitSpeed = moving ? (carrying ? 7.4 : 9.2) : 3.2;
        this._playerAnimTime += dt * gaitSpeed;
        const gaitSin = Math.sin(this._playerAnimTime);
        const gaitCos = Math.cos(this._playerAnimTime);

        const walkStride = gaitSin * PLAYER_MOTION.walkStride * this._playerAnim.walkBlend;
        const carryStride = gaitSin * PLAYER_MOTION.carryStride * this._playerAnim.carryBlend;
        const legStride = walkStride + carryStride;
        const armSwingAmp = (PLAYER_MOTION.walkArmSwing * this._playerAnim.walkBlend)
            + (PLAYER_MOTION.carryArmSwing * this._playerAnim.carryBlend);
        const carryLift = PLAYER_MOTION.carryArmLift * this._playerAnim.carryBlend;
        const pickupKick = Math.sin((1 - this._playerAnim.pickupImpulse) * Math.PI) * this._playerAnim.pickupImpulse;
        const dropSettle = Math.sin((1 - this._playerAnim.dropImpulse) * Math.PI) * this._playerAnim.dropImpulse;

        rig.legL.rotation.x = legStride;
        rig.legR.rotation.x = -legStride;

        rig.armL.rotation.x = -gaitSin * armSwingAmp - carryLift + pickupKick * 0.26 - dropSettle * 0.14;
        rig.armR.rotation.x = gaitSin * armSwingAmp - carryLift - pickupKick * 0.12 + dropSettle * 0.16;
        rig.armL.rotation.z = -PLAYER_MOTION.bodyLean * (this._playerAnim.walkBlend * 0.45 + this._playerAnim.carryBlend * 0.2);
        rig.armR.rotation.z = PLAYER_MOTION.bodyLean * (this._playerAnim.walkBlend * 0.45 + this._playerAnim.carryBlend * 0.2);

        const breath = Math.sin(this._playerAnimTime * 0.8) * PLAYER_MOTION.idleBreath * this._playerAnim.idleBlend;
        rig.head.rotation.x = (gaitCos * PLAYER_MOTION.headNod * (this._playerAnim.walkBlend + this._playerAnim.carryBlend * 0.5))
            + breath
            + pickupKick * 0.1
            - dropSettle * 0.12;

        if (this.playerShadowBlob?.material) {
            const motionBlend = Math.max(this._playerAnim.walkBlend, this._playerAnim.carryBlend);
            this.playerShadowBlob.material.opacity = 0.18 + motionBlend * 0.06 + dropSettle * 0.04;
        }
    }

    _handleInteraction() {
        if (this.carriedItem) {
            // ---- DROP ----
            if (this.world.isInHouseZone(this.playerPos)) {
                // Successful delivery!
                let basePoints = POINT_VALUES[this.carriedItem.type] || 1;
                if (this.carriedItem.isGold) basePoints *= 10;

                const comboMult = this.powerups.comboMultiplier;
                const eventMult = this.powerups.eventMultiplier;
                const totalPoints = basePoints * comboMult * eventMult;

                this.score += totalPoints;
                this.itemsDelivered++;

                // Combo
                this.powerups.registerCombo();

                // Sound
                this.audio.playSynth('deliver');
                if (this.powerups.comboCount >= 2) {
                    this.audio.playSynth('combo', this.powerups.comboCount);
                }

                // Floating points
                let pointLabel = `+${totalPoints}`;
                if (comboMult > 1) pointLabel += ` 🔥x${comboMult}`;
                if (this.carriedItem.isGold) pointLabel += ' ⭐';
                if (eventMult > 1) pointLabel += ' 💫';

                const type = comboMult >= 4 ? 'mega' : comboMult >= 2 ? 'combo' : this.carriedItem.isGold ? 'gold' : '';
                // Project to screen for floating text
                const screenPos = this._worldToScreen(this.playerPos);
                this.ui.showFloatingPoints(screenPos.x, screenPos.y - 50, pointLabel, type);

                // Remove item
                this.scene.remove(this.carriedItem.model);
                const idx = this.furnitureItems.indexOf(this.carriedItem);
                if (idx >= 0) this.furnitureItems.splice(idx, 1);
                this.carriedItem = null;
                this._pulsePlayerAction('drop');

                // Check level completion
                if (this.currentLevel < this.maxLevel && this.itemsDelivered >= this.levelGoal) {
                    this._completeLevel();
                } else {
                    this._spawnOneFurniture();
                }
            } else {
                // Drop on ground — it will slide back to truck area after 10s
                this.audio.playSynth('drop');
                this.carriedItem.model.position.y = 0;
                if (this.carriedItem.model?.userData?.externalModel) {
                    // External Unity assets can break if their scale is reassigned at runtime.
                } else if (this.carriedItem.baseScale) {
                    this.carriedItem.model.scale.copy(this.carriedItem.baseScale);
                } else {
                    this.carriedItem.model.scale.set(1, 1, 1);
                }
                const droppedItem = this.carriedItem;
                this.carriedItem = null;
                this._pulsePlayerAction('drop');

                // Auto-recall dropped items back to truck zone after 10s
                this._setManagedTimeout(() => {
                    if (this.furnitureItems.includes(droppedItem) && this.carriedItem !== droppedItem) {
                        const truckPos = this.world.truckPos;
                        droppedItem.model.position.set(
                            truckPos.x + (Math.random() - 0.5) * 6,
                            0,
                            truckPos.z + (Math.random() - 0.5) * 4
                        );
                    }
                }, 10000);
            }
        } else {
            // ---- PICK UP ----
            let closest = null;
            let minDist = 3;

            this.furnitureItems.forEach(item => {
                const dist = Math.sqrt(
                    (this.playerPos.x - item.model.position.x) ** 2 +
                    (this.playerPos.z - item.model.position.z) ** 2
                );
                if (dist < minDist) {
                    minDist = dist;
                    closest = item;
                }
            });

            if (closest) {
                this.carriedItem = closest;
                if (this.carriedItem.model?.userData?.externalModel) {
                    // Keep original scale untouched for imported assets.
                } else if (this.carriedItem.baseScale) {
                    this.carriedItem.model.scale.set(
                        this.carriedItem.baseScale.x * PROCEDURAL_CARRY_SCALE_MULT,
                        this.carriedItem.baseScale.y * PROCEDURAL_CARRY_SCALE_MULT,
                        this.carriedItem.baseScale.z * PROCEDURAL_CARRY_SCALE_MULT
                    );
                } else {
                    this.carriedItem.model.scale.set(1.5, 1.5, 1.5);
                }
                this.audio.playSynth('pickup');
                this._pulsePlayerAction('pickup');
            }
        }
    }

    _worldToScreen(worldPos) {
        const vector = worldPos.clone();
        vector.project(this.camera);
        return {
            x: (vector.x * 0.5 + 0.5) * window.innerWidth,
            y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
        };
    }

    _updateTimer() {
        // Endless mode on final level
        if (this.currentLevel >= this.maxLevel) {
            this.endlessElapsed++;
            this.sheepSpawnCount = Math.min(5, 1 + Math.floor(this.endlessElapsed / 15));
            return;
        }

        this.timeLeft--;
        if (this.timeLeft <= 0) {
            this._gameOver('TIDEN TOG SLUT!');
        }
    }

    _gameOver(reason) {
        this.state = 'GAME_OVER';
        this.audio.stopMusic();

        // Play the "loouser" audio clip on game over!
        this.audio.playSound('loouser');

        if (reason.includes('FÅR')) {
            this.audio.playSound('roadkill');
            this.effects.shake(300, 0.5);
        }

        this.ui.showGameOver(reason, this.score, this.currentLevel);
    }

    _completeLevel() {
        // Time bonus
        const timeBonus = Math.max(0, this.timeLeft);
        this.score += timeBonus;

        // Confetti!
        this.ui.spawnConfetti();

        if (this.currentLevel >= this.maxLevel) {
            // Victory line
            this.audio.playSound('recommend');

            // Victory!
            this.audio.playLevelJingle(this.currentLevel);
            this.state = 'VICTORY';
            this.audio.stopMusic();
            this.ui.showVictory(this.score);
        } else {
            // Announcer voice line!
            this.audio.playSound('animals');

            this.audio.playLevelJingle(this.currentLevel);
            this.state = 'LEVEL_TRANSITION';
            this.ui.showLevelComplete(this.currentLevel, timeBonus);
        }
    }

    nextLevel() {
        this._clearManagedTimeouts();
        this.currentLevel++;
        this.itemsDelivered = 0;
        this.timeLeft = 55;
        this.sheepSpawnCount = 1;
        this._difficultyAcc = 0;

        // Clear enemies
        this.enemies.clearAll();

        // Clear and respawn furniture for new level
        this._clearFurniture();
        this._spawnFurniture(5);
        this._resetPlayerAnimationState();

        // Grace period
        this.hasGracePeriod = true;
        this._setManagedTimeout(() => { this.hasGracePeriod = false; }, 3000);

        // Switch environment
        this.world.switchLevel(this.currentLevel);

        // UI
        this.ui.hideLevelComplete();
        this.state = 'PLAYING';
    }
}

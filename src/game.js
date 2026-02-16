import * as THREE from 'three';
import { createPlayer, createFurniture } from './models.js';
import { World } from './world.js';
import { InputHandler } from './input.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
import { Effects } from './effects.js';
import { EnemyManager } from './enemies.js';
import { PowerUpManager } from './powerups.js';

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

const FURNITURE_TYPES = [
    'sofa', 'box', 'box', 'box', 'box',
    'tv', 'lamp', 'plant', 'bookshelf', 'chair',
    'fridge', 'console', 'freezer', 'cd', 'radio', 'guitar', 'clock', 'washer',
    'table', 'mirror', 'rug', 'piano', 'microwave', 'vase'
];

export class Game {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

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
        this.world = new World(scene);
        this.input = new InputHandler();
        this.audio = new AudioManager();
        this.ui = new UIManager();
        this.effects = new Effects(camera);
        this.enemies = new EnemyManager(scene);
        this.powerups = new PowerUpManager(scene);

        // Player
        this.playerModel = null;
        this.playerPos = new THREE.Vector3(0, 0, 0);
        this.playerSpeed = 10;

        // Furniture
        this.furnitureItems = []; // { model, type, isGold }
        this.carriedItem = null;

        // Timers
        this._timerAcc = 0;
        this._sheepSpawnAcc = 0;
        this._powerUpSpawnAcc = 0;
        this._dogSpawnAcc = 0;
        this._difficultyAcc = 0;

        // Setup
        this._setup();
    }

    _setup() {
        // Build world
        this.world.create(1);

        // Create player
        this.playerModel = createPlayer();
        this.playerModel.position.set(0, 0, 0);
        this.scene.add(this.playerModel);

        // UI callbacks
        this.ui.onStart = () => this.startGame();
        this.ui.onRestart = () => this.restartGame();
        this.ui.onNextLevel = () => this.nextLevel();

        // Show start screen
        this.ui.showStartScreen();
    }

    startGame() {
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

        // Grace period
        this.hasGracePeriod = true;
        setTimeout(() => { this.hasGracePeriod = false; }, 3000);

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
        this.enemies.clearAll();
        this.powerups.clearAll();
        this._clearFurniture();

        // Remove world objects
        // Simply clear the scene of everything except camera
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
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

    _spawnFurniture(count = 1) {
        for (let i = 0; i < count; i++) {
            this._spawnOneFurniture();
        }
    }

    _spawnOneFurniture() {
        const type = FURNITURE_TYPES[Math.floor(Math.random() * FURNITURE_TYPES.length)];
        const model = createFurniture(type);

        // Spawn in a ring around truck (outside truck collision radius)
        const truckPos = this.world.truckPos;
        const angle = Math.random() * Math.PI * 2;
        const dist = 3.5 + Math.random() * 2;  // ring from 3.5 to 5.5 from truck center
        const rx = truckPos.x + Math.cos(angle) * dist;
        const rz = truckPos.z + Math.sin(angle) * dist;
        model.position.set(rx, 0, rz);
        model.scale.set(1.3, 1.3, 1.3);  // Slightly larger for visibility
        this.scene.add(model);

        const isGold = Math.random() < 0.1;
        const item = { model, type, isGold };

        if (isGold) {
            // Tint gold
            model.traverse(child => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.emissive = new THREE.Color(0xFFD700);
                    child.material.emissiveIntensity = 0.3;
                }
            });

            // Auto-remove gold after 8s if not picked up, spawn replacement
            setTimeout(() => {
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

        const hitBySheep = this.enemies.update(
            dt, this.playerPos, this.currentLevel,
            this.hasGracePeriod, this.powerups.hasShield, this.world
        );

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
        this.effects.applyWalkBob(this.playerModel, this.input.isMoving);

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
                this.carriedItem.model.scale.set(1, 1, 1);
                const droppedItem = this.carriedItem;
                this.carriedItem = null;

                // Auto-recall dropped items back to truck zone after 10s
                setTimeout(() => {
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
                this.carriedItem.model.scale.set(1.5, 1.5, 1.5);
                this.audio.playSynth('pickup');
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
            // Victory!
            this.audio.playLevelJingle(this.currentLevel);
            this.state = 'VICTORY';
            this.audio.stopMusic();
            this.ui.showVictory(this.score);
        } else {
            this.audio.playLevelJingle(this.currentLevel);
            this.state = 'LEVEL_TRANSITION';
            this.ui.showLevelComplete(this.currentLevel, timeBonus);
        }
    }

    nextLevel() {
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

        // Grace period
        this.hasGracePeriod = true;
        setTimeout(() => { this.hasGracePeriod = false; }, 3000);

        // Switch environment
        this.world.switchLevel(this.currentLevel);

        // UI
        this.ui.hideLevelComplete();
        this.state = 'PLAYING';
    }
}

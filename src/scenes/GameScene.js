export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init() {
        // Reset all state on scene start/restart
        this.score = 0;
        this.timeLeft = 60;
        this.isGameOver = false;
        this.isGameStarted = false;
        this.hasGracePeriod = false;
        this.sheepSpawnCount = 1;
        this.tileWidth = 64;
        this.tileHeight = 32;
        this.carriedItem = null;

        // Level system
        this.currentLevel = 1;
        this.itemsDelivered = 0;
        this.levelGoal = 15; // Items needed per level
        this.maxLevel = 5;
    }

    create() {
        // Create isometric grid
        this.createGround();

        // Create Zones
        this.createZones();

        // Player
        const pPos = this.isoToScreen(2, 2);
        this.player = this.physics.add.sprite(pPos.x, pPos.y, 'player');
        this.player.setOrigin(0.5, 0.85);
        this.player.setScale(0.8);
        this.player.setCollideWorldBounds(true);

        // Custom properties for isometric movement
        this.player.isoX = 2;
        this.player.isoY = 2;

        // Furniture Group
        this.furnitureGroup = this.add.group();

        // Sheep Group
        this.sheepGroup = this.add.group();
        this.time.addEvent({
            delay: 2000,
            callback: this.spawnSheep,
            callbackScope: this,
            loop: true
        });

        // Prepare UI
        this.createUI();


        // Background music (plays always)
        this.bgMusic = this.sound.add('bgmusic', { loop: true, volume: 0.4 });

        // Level complete jingles (one-shot sounds)
        this.levelJingles = [
            this.sound.add('level1', { volume: 0.8 }),
            this.sound.add('level2', { volume: 0.8 }),
            this.sound.add('level3', { volume: 0.8 }),
            this.sound.add('level4', { volume: 0.8 }),
            this.sound.add('level5', { volume: 0.8 })
        ];
        this.roadkillSound = this.sound.add('roadkill', { volume: 0.7 });

        // Show Start Screen
        this.createStartScreen();

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.input.keyboard.on('keydown-SPACE', () => this.handleInteraction());
        this.input.keyboard.on('keydown-ENTER', () => {
            if (!this.isGameStarted) this.startGame();
            if (this.isGameOver) this.restartGame();
        });
    }

    startGame() {
        this.isGameStarted = true;
        this.startOverlay.setVisible(false);

        // Clear any pre-spawned sheep
        this.sheepGroup.clear(true, true);

        // Grace period - no collisions for first 3 seconds
        this.hasGracePeriod = true;
        this.time.delayedCall(3000, () => {
            this.hasGracePeriod = false;
        });

        // Ensure game has focus for keyboard input
        this.game.canvas.focus();
        window.focus();

        // Start background music
        if (this.bgMusic && !this.bgMusic.isPlaying) {
            this.bgMusic.play();
        }

        this.spawnFurniture();

        // Timer
        this.timerEvent = this.time.addEvent({
            delay: 1000,
            callback: this.updateTimer,
            callbackScope: this,
            loop: true
        });

        // Sheep Difficulty Scaler - start slower
        this.sheepSpawnCount = 1;
        this.difficultyEvent = this.time.addEvent({
            delay: 10000, // Changed from 5s to 10s
            callback: () => {
                this.sheepSpawnCount += 1; // Changed from *= 2 to += 1 for smoother ramp
                // Cap to prevent complete chaos
                if (this.sheepSpawnCount > 16) this.sheepSpawnCount = 16;
            },
            loop: true
        });

        // Adjust camera to fit house
        this.cameras.main.setZoom(0.8);
        this.cameras.main.centerOn(this.cameras.main.width / 2 + 100, this.cameras.main.height / 2);
    }

    restartGame() {
        this.scene.restart();
    }

    createStartScreen() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        this.startOverlay = this.add.container(0, 0);

        const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
        const title = this.add.text(width / 2, height / 2 - 50, 'FLYTTSMART', {
            fontSize: '64px',
            fill: '#00AEEF',
            fontFamily: 'Fredoka One',
            stroke: '#fff',
            strokeThickness: 2
        }).setOrigin(0.5);

        const subtitle = this.add.text(width / 2, height / 2 + 20, 'Flytta möblerna till huset!', {
            fontSize: '24px',
            fill: '#fff',
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5);

        const startBtn = this.add.text(width / 2, height / 2 + 100, 'Press ENTER to Start', {
            fontSize: '32px',
            fill: '#fff',
            backgroundColor: '#27ae60',
            padding: { x: 20, y: 10 },
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        startBtn.on('pointerdown', () => this.startGame());

        this.startOverlay.add([bg, title, subtitle, startBtn]);
        this.startOverlay.setDepth(1000);
    }

    createGround() {
        // Use single cohesive background
        const bg = this.add.image(this.cameras.main.width / 2, this.cameras.main.height / 2, 'ground_bg');
        bg.setOrigin(0.5, 0.5);
        bg.setDepth(-1000);

        // Scale to cover screen if needed (assuming 1024x1024 or similar)
        // increased scale to ensure house fits
        bg.setScale(3);
    }

    createZones() {
        // Move truck more to the left (Iso: -x, +y)
        const truckPos = this.isoToScreen(-2, 8);
        this.truck = this.add.image(truckPos.x, truckPos.y, 'truck');
        this.truck.setOrigin(0.5, 0.85);
        this.truck.setDepth(truckPos.y);

        const housePos = this.isoToScreen(8, -2);
        this.house = this.add.image(housePos.x, housePos.y, 'house');
        this.house.setOrigin(0.5, 0.85);
        this.house.setDepth(housePos.y);

        this.truckZone = { x: -2, y: 8, radius: 3 };
        this.houseZone = { x: 8, y: -2, radius: 3 };
    }

    spawnFurniture() {
        const types = ['sofa', 'box', 'tv'];
        for (let i = 0; i < 3; i++) {
            const type = types[Phaser.Math.Between(0, 2)];
            const rx = Phaser.Math.FloatBetween(-1, 2);
            const ry = Phaser.Math.FloatBetween(5, 7);

            const pos = this.isoToScreen(rx, ry);
            const item = this.add.sprite(pos.x, pos.y, type);
            item.setOrigin(0.5, 0.75);
            item.isoX = rx;
            item.isoY = ry;
            item.itemType = type;
            item.setDepth(pos.y);
            this.furnitureGroup.add(item);
        }
    }

    spawnSheep() {
        if (!this.isGameStarted || this.isGameOver) return;

        // Spawn multiple based on difficulty
        const count = this.sheepSpawnCount || 1;

        for (let i = 0; i < count; i++) {
            // Spawn randomly around the edges of the isometric map
            // Map is roughly -5 to 15 in iso coordinates
            const edges = ['top', 'bottom', 'left', 'right'];

            let sx, sy;
            let attempts = 0;
            let tooClose = true;

            // Try to find a spawn position not too close to player
            while (tooClose && attempts < 10) {
                const edge = edges[Phaser.Math.Between(0, 3)];

                switch (edge) {
                    case 'top': sx = Phaser.Math.Between(-5, 15); sy = -5; break;
                    case 'bottom': sx = Phaser.Math.Between(-5, 15); sy = 15; break;
                    case 'left': sx = -5; sy = Phaser.Math.Between(-5, 15); break;
                    case 'right': sx = 15; sy = Phaser.Math.Between(-5, 15); break;
                }

                // Check distance to player (in isometric coordinates)
                const distToPlayer = Math.sqrt(
                    Math.pow(sx - this.player.isoX, 2) +
                    Math.pow(sy - this.player.isoY, 2)
                );

                // Require at least 5 units away from player
                tooClose = distToPlayer < 5;
                attempts++;
            }

            const pos = this.isoToScreen(sx, sy);
            const sheep = this.add.sprite(pos.x, pos.y, 'sheep');
            sheep.isoX = sx;
            sheep.isoY = sy;

            // Scale sheep based on level: starts at 0.4, grows 0.15 per level
            const sheepScale = 0.4 + (this.currentLevel - 1) * 0.15;
            sheep.setScale(sheepScale);
            sheep.sheepScale = sheepScale; // Store for collision radius

            // Pick a random target on the opposite side to walk towards
            const targetX = Phaser.Math.Between(-5, 15);
            const targetY = Phaser.Math.Between(-5, 15);

            const dx = targetX - sx;
            const dy = targetY - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            sheep.vx = (dx / dist) * 0.05; // speed
            sheep.vy = (dy / dist) * 0.05;

            this.sheepGroup.add(sheep);
            this.physics.add.existing(sheep);
        }
    }

    updateSheep(dt) {
        this.sheepGroup.children.iterate(sheep => {
            if (!sheep) return;

            sheep.isoX += sheep.vx;
            sheep.isoY += sheep.vy;

            const pos = this.isoToScreen(sheep.isoX, sheep.isoY);
            sheep.x = pos.x;
            sheep.y = pos.y;
            sheep.setDepth(sheep.y);

            // Bounds check - remove if too far out
            if (sheep.isoX < -10 || sheep.isoX > 20 || sheep.isoY < -10 || sheep.isoY > 20) {
                sheep.destroy();
                return;
            }

            // Check collision with player (unless grace period)
            if (!this.hasGracePeriod) {
                // Use isometric distance - more reliable than screen pixels
                const isoDist = Phaser.Math.Distance.Between(
                    this.player.isoX, this.player.isoY,
                    sheep.isoX, sheep.isoY
                );
                // Collision radius: tighter to avoid ghost hits
                if (isoDist < 1.2) {
                    this.gameOver("KROCKAD AV FÅR!");
                }
            }
        });
    }

    gameOver(reason) {
        this.isGameOver = true;
        if (this.timerEvent) this.timerEvent.destroy();
        if (this.difficultyEvent) this.difficultyEvent.destroy();

        // Play roadkill sound if died from sheep
        if (reason.includes('FÅR')) {
            this.roadkillSound.play();
        }

        // Stop background music
        if (this.bgMusic) {
            this.bgMusic.stop();
        }

        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 40, 'GAME OVER\n' + reason, { fontSize: '48px', fill: '#ff0000', fontFamily: 'Fredoka One', stroke: '#fff', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setDepth(2000);

        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 40, 'Highscore: ' + this.highscore, { fontSize: '32px', fill: '#f1c40f', fontFamily: 'Fredoka One' }).setOrigin(0.5).setDepth(2000);

        const restart = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 120, 'Press ENTER to Restart', { fontSize: '32px', fill: '#fff', backgroundColor: '#000', padding: 10, fontFamily: 'Fredoka One' }).setOrigin(0.5).setInteractive().setDepth(2000);
        restart.on('pointerdown', () => this.restartGame());
    }

    update(time, delta) {
        if (!this.isGameStarted || this.isGameOver) return;

        this.handleMovement();
        this.updateSheep(delta);
        this.updateDepthSorting();
    }

    handleMovement() {
        const speed = 0.10;
        let dx = 0;
        let dy = 0;

        if (this.cursors.up.isDown || this.wasd.up.isDown) {
            dx -= speed;
            dy -= speed;
        } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
            dx += speed;
            dy += speed;
        }

        if (this.cursors.left.isDown || this.wasd.left.isDown) {
            dx -= speed;
            dy += speed;
        } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
            dx += speed;
            dy -= speed;
        }

        if (dx !== 0 || dy !== 0) {
            this.player.isoX += dx;
            this.player.isoY += dy;

            const min = -1.5;
            const max = 11.5;
            this.player.isoX = Phaser.Math.Clamp(this.player.isoX, min, max);
            this.player.isoY = Phaser.Math.Clamp(this.player.isoY, min, max);

            if (dx > dy) {
                this.player.setFlipX(true);
            } else if (dx < dy) {
                this.player.setFlipX(false);
            }

            const screenPos = this.isoToScreen(this.player.isoX, this.player.isoY);
            this.player.x = screenPos.x;
            this.player.y = screenPos.y;

            if (this.carriedItem) {
                this.carriedItem.isoX = this.player.isoX;
                this.carriedItem.isoY = this.player.isoY;
                this.carriedItem.x = this.player.x;
                this.carriedItem.y = this.player.y - 60;
                this.carriedItem.setDepth(this.player.depth + 1);
            }
        }
    }

    handleInteraction() {
        if (!this.isGameStarted) return;

        if (this.carriedItem) {
            const distToHouse = Phaser.Math.Distance.Between(this.player.isoX, this.player.isoY, this.houseZone.x, this.houseZone.y);
            if (distToHouse < 2.5) {
                this.score += 10;
                this.itemsDelivered++;
                this.updateUI();

                // Remove the delivered item
                this.carriedItem.destroy();
                this.carriedItem = null;

                // Check for level completion (Level 5 continues until timer runs out)
                if (this.currentLevel < this.maxLevel && this.itemsDelivered >= this.levelGoal) {
                    this.completeLevel();
                } else {
                    // Spawn new item
                    this.spawnOneFurniture();
                }
            } else {
                // Drop on ground if not delivered
                this.carriedItem.y = this.player.y;
                this.carriedItem = null;
            }
        } else {
            let closest = null;
            let minC = 1.5;

            this.furnitureGroup.children.iterate(item => {
                const dist = Phaser.Math.Distance.Between(this.player.isoX, this.player.isoY, item.isoX, item.isoY);
                if (dist < minC) {
                    minC = dist;
                    closest = item;
                }
            });

            if (closest) {
                this.carriedItem = closest;
            }
        }
    }

    spawnOneFurniture() {
        const types = ['sofa', 'box', 'tv'];
        const type = types[Phaser.Math.Between(0, 2)];
        const rx = Phaser.Math.FloatBetween(-1, 2);
        const ry = Phaser.Math.FloatBetween(5, 7);

        const pos = this.isoToScreen(rx, ry);
        const item = this.add.sprite(pos.x, pos.y, type);
        item.setOrigin(0.5, 0.75);
        item.isoX = rx;
        item.isoY = ry;
        item.itemType = type;
        item.setDepth(pos.y); // Set initial depth
        this.furnitureGroup.add(item);
    }

    updateDepthSorting() {
        this.player.setDepth(this.player.y);
        this.furnitureGroup.children.iterate(item => {
            if (item !== this.carriedItem) {
                item.setDepth(item.y);
            }
        });
    }

    isoToScreen(x, y) {
        const screenX = (x - y) * this.tileWidth + this.cameras.main.width / 2;
        const screenY = (x + y) * this.tileHeight + this.cameras.main.height / 4;
        return { x: screenX, y: screenY };
    }

    createUI() {
        this.scoreText = this.add.text(16, 16, 'Poäng: 0', { fontSize: '32px', fill: '#000', fontFamily: 'Fredoka One' });
        this.timerText = this.add.text(16, 50, 'Tid: 60', { fontSize: '32px', fill: '#000', fontFamily: 'Fredoka One' });
        this.levelText = this.add.text(16, 84, 'Bana 1 (0/15)', { fontSize: '28px', fill: '#000', fontFamily: 'Fredoka One' });
    }

    updateTimer() {
        this.timeLeft--;
        this.timerText.setText('Tid: ' + this.timeLeft);
        if (this.timeLeft <= 0) {
            this.isGameOver = true;

            // Always Game Over when timer ends (even on final level)
            const message = this.currentLevel >= this.maxLevel ?
                'TIDEN TOG SLUT!\nFinal Poäng: ' + this.score :
                'GAME OVER';

            this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, message, {
                fontSize: '56px',
                fill: '#ff0000',
                fontFamily: 'Fredoka One',
                stroke: '#fff',
                strokeThickness: 4,
                align: 'center'
            }).setOrigin(0.5).setDepth(2000);

            const restart = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 100, 'Press ENTER to Restart', {
                fontSize: '32px',
                fill: '#fff',
                backgroundColor: '#000',
                padding: 10,
                fontFamily: 'Fredoka One'
            }).setOrigin(0.5).setInteractive().setDepth(2000);
            restart.on('pointerdown', () => this.restartGame());
        }
    }

    completeLevel() {
        if (this.currentLevel >= this.maxLevel) {
            // Victory!
            this.victory();
        } else {
            // Play level complete jingle
            this.playLevelJingle(this.currentLevel);

            // Next level
            this.pauseGame();
            this.createLevelTransitionScreen();
        }
    }

    pauseGame() {
        this.isGameStarted = false;
        if (this.timerEvent) this.timerEvent.paused = true;
        if (this.difficultyEvent) this.difficultyEvent.paused = true;
    }

    resumeGame() {
        this.isGameStarted = true;
        if (this.timerEvent) this.timerEvent.paused = false;
        if (this.difficultyEvent) this.difficultyEvent.paused = false;
    }

    createLevelTransitionScreen() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        this.levelTransitionOverlay = this.add.container(0, 0);

        const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
        const title = this.add.text(width / 2, height / 2 - 60, `BANA ${this.currentLevel} KLAR!`, {
            fontSize: '56px',
            fill: '#27ae60',
            fontFamily: 'Fredoka One',
            stroke: '#fff',
            strokeThickness: 3
        }).setOrigin(0.5);

        const nextLevel = this.currentLevel + 1;
        const subtitle = this.add.text(width / 2, height / 2 + 20, `Fåren blir större nu!`, {
            fontSize: '28px',
            fill: '#fff',
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5);

        const continueBtn = this.add.text(width / 2, height / 2 + 100, `Press ENTER för Bana ${nextLevel}`, {
            fontSize: '28px',
            fill: '#fff',
            backgroundColor: '#3498db',
            padding: { x: 20, y: 10 },
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        continueBtn.on('pointerdown', () => this.nextLevel());

        this.input.keyboard.once('keydown-ENTER', () => this.nextLevel());

        this.levelTransitionOverlay.add([bg, title, subtitle, continueBtn]);
        this.levelTransitionOverlay.setDepth(2000);
    }

    nextLevel() {
        if (this.levelTransitionOverlay) {
            this.levelTransitionOverlay.destroy();
        }

        this.currentLevel++;
        this.itemsDelivered = 0;

        // Reset difficulty for new level
        this.sheepSpawnCount = 1;

        // Clear sheep
        this.sheepGroup.clear(true, true);

        // Add grace period
        this.hasGracePeriod = true;
        this.time.delayedCall(3000, () => {
            this.hasGracePeriod = false;
        });

        this.updateUI();
        this.resumeGame();
    }

    victory() {
        this.isGameOver = true;
        if (this.timerEvent) this.timerEvent.destroy();
        if (this.difficultyEvent) this.difficultyEvent.destroy();

        this.createVictoryScreen();
    }

    createVictoryScreen() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);
        const title = this.add.text(width / 2, height / 2 - 80, 'DU VANN!', {
            fontSize: '72px',
            fill: '#f1c40f',
            fontFamily: 'Fredoka One',
            stroke: '#fff',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(2000);

        const scoreText = this.add.text(width / 2, height / 2, `Slutpoäng: ${this.score}`, {
            fontSize: '36px',
            fill: '#fff',
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2000);

        const subtitle = this.add.text(width / 2, height / 2 + 50, 'Alla 5 banor klarade!', {
            fontSize: '28px',
            fill: '#2ecc71',
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2000);

        const restart = this.add.text(width / 2, height / 2 + 120, 'Press ENTER to Restart', {
            fontSize: '32px',
            fill: '#fff',
            backgroundColor: '#3498db',
            padding: 10,
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setInteractive().setDepth(2000);

        restart.on('pointerdown', () => this.restartGame());
    }

    playLevelJingle(level) {
        // Play level complete jingle
        const jingleIndex = level - 1;
        if (this.levelJingles && this.levelJingles[jingleIndex]) {
            this.levelJingles[jingleIndex].play();
        }
    }

    updateUI() {
        this.scoreText.setText('Poäng: ' + this.score);
        if (this.currentLevel >= this.maxLevel) {
            this.levelText.setText(`Bana ${this.currentLevel} - FINAL!`);
        } else {
            this.levelText.setText(`Bana ${this.currentLevel} (${this.itemsDelivered}/${this.levelGoal})`);
        }
    }
}

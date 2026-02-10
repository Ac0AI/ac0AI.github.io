export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init() {
        // Reset all state on scene start/restart
        this.score = 0;
        this.timeLeft = 45;
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
        this.levelGoal = 15;
        this.maxLevel = 5;

        // Highscore (no longer using localStorage)
        this.highscore = 0;
        this.initialsSubmitted = false;
        this.playerInitials = '';

        // Power-ups
        this.hasShield = false;
        this.speedMultiplier = 1;

        // Points per furniture type
        this.pointValues = {
            box: 1, cd: 1, plant: 2,
            lamp: 2, chair: 2, clock: 2, radio: 2,
            sofa: 3, bookshelf: 3, washer: 3, freezer: 3,
            tv: 5, console: 5, fridge: 4, guitar: 4
        };
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

        // Power-up Group
        this.powerUpGroup = this.add.group();
        this.time.addEvent({
            delay: 12000,
            callback: this.spawnPowerUp,
            callbackScope: this,
            loop: true
        });

        // Dog spawn (rare - every 15s, 20% chance)
        this.time.addEvent({
            delay: 15000,
            callback: () => {
                if (!this.isGameStarted || this.isGameOver) return;
                if (Phaser.Math.Between(1, 5) === 1) {
                    this.spawnDog();
                }
            },
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
        // Stop all sounds to prevent double music
        this.sound.stopAll();
        this.scene.restart();
    }

    createStartScreen() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const cx = width / 2;
        const cy = height / 2;

        this.startOverlay = this.add.container(0, 0);

        // Dark overlay
        const bg = this.add.rectangle(cx, cy, width, height, 0x1a1a2e, 0.92);

        // Floating emoji decorations
        const emojis = ['📦', '🛋️', '📺', '🪑', '🐑', '🚚', '🏠', '🎮', '💡', '📚'];
        const floatingEmojis = [];
        emojis.forEach((emoji, i) => {
            const ex = Phaser.Math.Between(40, width - 40);
            const ey = Phaser.Math.Between(30, height - 30);
            const e = this.add.text(ex, ey, emoji, {
                fontSize: `${Phaser.Math.Between(20, 36)}px`
            }).setOrigin(0.5).setAlpha(0.15);
            floatingEmojis.push(e);

            // Gentle float animation
            this.tweens.add({
                targets: e,
                y: ey + Phaser.Math.Between(-20, 20),
                x: ex + Phaser.Math.Between(-15, 15),
                duration: Phaser.Math.Between(2000, 4000),
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                delay: i * 200
            });
        });

        // Title with drop-in animation
        const title = this.add.text(cx, cy - 100, '🚚 FLYTTSMART 🏠', {
            fontSize: '52px',
            fill: '#00AEEF',
            fontFamily: 'Fredoka One',
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5).setScale(0.3).setAlpha(0);

        this.tweens.add({
            targets: title,
            scaleX: 1, scaleY: 1, alpha: 1,
            duration: 800, ease: 'Back.easeOut'
        });

        // Tagline
        const tagline = this.add.text(cx, cy - 40, 'Flytta möblerna — Undvik fåren!', {
            fontSize: '22px',
            fill: '#f1c40f',
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: tagline, alpha: 1,
            duration: 600, delay: 500
        });

        // Instructions box
        const instructions = this.add.text(cx, cy - 20,
            '🎯 Bär saker från 🚚 till 🏠\n' +
            '⬆️⬇️⬅️➡️  Flytta  |  SPACE  Plocka/Släpp\n' +
            '⭐ Samla power-ups  |  🐑 Undvik fåren!', {
            fontSize: '16px',
            fill: '#ccc',
            fontFamily: 'Fredoka One',
            align: 'center',
            lineSpacing: 8
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: instructions, alpha: 1,
            duration: 600, delay: 800
        });

        // Start button with pulse
        const startBtn = this.add.text(cx, cy + 70, '▶  STARTA SPELET', {
            fontSize: '30px',
            fill: '#fff',
            backgroundColor: '#27ae60',
            padding: { x: 24, y: 12 },
            fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0);

        this.tweens.add({
            targets: startBtn, alpha: 1,
            duration: 400, delay: 1200,
            onComplete: () => {
                this.tweens.add({
                    targets: startBtn,
                    scaleX: 1.05, scaleY: 1.05,
                    yoyo: true, repeat: -1,
                    duration: 600, ease: 'Sine.easeInOut'
                });
            }
        });

        startBtn.on('pointerdown', () => this.startGame());
        startBtn.on('pointerover', () => startBtn.setStyle({ backgroundColor: '#2ecc71' }));
        startBtn.on('pointerout', () => startBtn.setStyle({ backgroundColor: '#27ae60' }));

        // Leaderboard header
        const lbTitle = this.add.text(cx, cy + 130, '🏆 TOPPLISTA', {
            fontSize: '22px', fill: '#f1c40f', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: lbTitle, alpha: 1,
            duration: 600, delay: 1400
        });

        // Load leaderboard from Firebase
        const lbTexts = [];
        const lbLoading = this.add.text(cx, cy + 160, 'Laddar...', {
            fontSize: '16px', fill: '#888', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: lbLoading, alpha: 1,
            duration: 400, delay: 1500
        });

        try {
            const db = firebase.database();
            db.ref('leaderboard').orderByChild('score').limitToLast(5).once('value', (snapshot) => {
                lbLoading.destroy();
                const scores = [];
                snapshot.forEach(child => {
                    scores.push(child.val());
                });
                scores.sort((a, b) => b.score - a.score);

                if (scores.length === 0) {
                    const noScores = this.add.text(cx, cy + 160, 'Inga poäng ännu!', {
                        fontSize: '16px', fill: '#888', fontFamily: 'Fredoka One'
                    }).setOrigin(0.5);
                    lbTexts.push(noScores);
                    this.startOverlay.add(noScores);
                } else {
                    const medals = ['🥇', '🥈', '🥉'];
                    scores.forEach((entry, i) => {
                        const medal = medals[i] || '  ';
                        const color = i === 0 ? '#f1c40f' : i < 3 ? '#bdc3c7' : '#fff';
                        const txt = this.add.text(cx, cy + 158 + (i * 24),
                            `${medal} ${entry.name}  ${entry.score}p  (Bana ${entry.level || '?'})`, {
                            fontSize: '16px', fill: color, fontFamily: 'Fredoka One'
                        }).setOrigin(0.5);
                        lbTexts.push(txt);
                        this.startOverlay.add(txt);
                    });
                }
            });
        } catch (e) {
            lbLoading.setText('Kunde inte ladda topplista');
        }

        this.startOverlay.add([bg, ...floatingEmojis, title, tagline, instructions, startBtn, lbTitle, lbLoading]);
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
        const types = ['sofa', 'box', 'box', 'box', 'box', 'box', 'tv', 'lamp', 'plant', 'bookshelf', 'chair', 'fridge', 'console', 'freezer', 'cd', 'radio', 'guitar', 'clock', 'washer'];
        for (let i = 0; i < 3; i++) {
            const type = types[Phaser.Math.Between(0, types.length - 1)];
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

            const sheepSpeed = 0.03 + (this.currentLevel * 0.005);
            sheep.vx = (dx / dist) * sheepSpeed;
            sheep.vy = (dy / dist) * sheepSpeed;
            sheep.isBoss = false;

            this.sheepGroup.add(sheep);
            this.physics.add.existing(sheep);
        }

        // Boss sheep on level 5 (10% chance per spawn)
        if (this.currentLevel >= 5 && Phaser.Math.Between(1, 10) === 1) {
            const edge = Phaser.Math.Between(0, 3);
            let bx, by;
            switch (edge) {
                case 0: bx = Phaser.Math.Between(-5, 15); by = -5; break;
                case 1: bx = Phaser.Math.Between(-5, 15); by = 15; break;
                case 2: bx = -5; by = Phaser.Math.Between(-5, 15); break;
                case 3: bx = 15; by = Phaser.Math.Between(-5, 15); break;
            }
            const bpos = this.isoToScreen(bx, by);
            const boss = this.add.sprite(bpos.x, bpos.y, 'sheep');
            boss.isoX = bx;
            boss.isoY = by;
            boss.setScale(1.2);
            boss.setTint(0xff4444);
            boss.isBoss = true;
            boss.vx = 0;
            boss.vy = 0;
            this.sheepGroup.add(boss);
            this.physics.add.existing(boss);
        }
    }

    updateSheep(dt) {
        this.sheepGroup.children.iterate(sheep => {
            if (!sheep) return;

            // Sheep AI: chasing behavior on level 3+
            if (this.currentLevel >= 3 && !sheep.isBoss) {
                const chaseStrength = this.currentLevel >= 4 ? 0.0008 : 0.0004;
                const toDx = this.player.isoX - sheep.isoX;
                const toDy = this.player.isoY - sheep.isoY;
                const toDist = Math.sqrt(toDx * toDx + toDy * toDy) || 1;
                sheep.vx += (toDx / toDist) * chaseStrength;
                sheep.vy += (toDy / toDist) * chaseStrength;
            }
            if (sheep.isBoss) {
                const toDx = this.player.isoX - sheep.isoX;
                const toDy = this.player.isoY - sheep.isoY;
                const toDist = Math.sqrt(toDx * toDx + toDy * toDy) || 1;
                sheep.vx = (toDx / toDist) * 0.04;
                sheep.vy = (toDy / toDist) * 0.04;
            }
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

            // Check collision with player (unless grace period or shield)
            if (!this.hasGracePeriod && !this.hasShield) {
                const isoDist = Phaser.Math.Distance.Between(
                    this.player.isoX, this.player.isoY,
                    sheep.isoX, sheep.isoY
                );
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

        // Update highscore in memory
        if (this.score > this.highscore) {
            this.highscore = this.score;
        }

        // Play roadkill sound if died from sheep
        if (reason.includes('FÅR')) {
            this.roadkillSound.play();
        }

        // Stop background music
        if (this.bgMusic) {
            this.bgMusic.stop();
        }

        const cx = this.cameras.main.width / 2;
        const cy = this.cameras.main.height / 2;

        // Dark overlay
        this.add.rectangle(cx, cy, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.75).setDepth(2000);

        this.add.text(cx, 40, 'GAME OVER', {
            fontSize: '48px', fill: '#ff0000', fontFamily: 'Fredoka One',
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5).setDepth(2001);

        this.add.text(cx, 90, reason, {
            fontSize: '28px', fill: '#fff', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2001);

        this.add.text(cx, 130, `Poäng: ${this.score}  |  Bana: ${this.currentLevel}`, {
            fontSize: '24px', fill: '#3498db', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2001);

        // === INITIALS INPUT ===
        this.add.text(cx, 175, 'Skriv 3 initialer för topplistan:', {
            fontSize: '22px', fill: '#f1c40f', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2001);

        this.playerInitials = '';
        this.initialsSubmitted = false;

        const boxWidth = 50;
        const boxGap = 15;
        const startX = cx - (boxWidth + boxGap);

        this.initialBoxes = [];
        this.initialLetters = [];
        for (let i = 0; i < 3; i++) {
            const bx = startX + i * (boxWidth + boxGap);
            const box = this.add.rectangle(bx, 220, boxWidth, 55, 0x333333)
                .setStrokeStyle(3, i === 0 ? 0xf1c40f : 0x666666)
                .setDepth(2001);
            const letter = this.add.text(bx, 220, '_', {
                fontSize: '36px', fill: '#fff', fontFamily: 'Fredoka One'
            }).setOrigin(0.5).setDepth(2002);
            this.initialBoxes.push(box);
            this.initialLetters.push(letter);
        }

        this.add.text(cx, 260, '(Backspace = ångra)', {
            fontSize: '14px', fill: '#888', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2001);

        this.submitStatusText = this.add.text(cx, 290, '', {
            fontSize: '22px', fill: '#2ecc71', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2001);

        this.input.keyboard.on('keydown', (event) => {
            if (this.initialsSubmitted) {
                if (event.key === 'Enter') this.restartGame();
                return;
            }
            const key = event.key.toUpperCase();
            if (/^[A-ZÅÄÖ0-9]$/.test(key) && this.playerInitials.length < 3) {
                this.playerInitials += key;
                const idx = this.playerInitials.length - 1;
                this.initialLetters[idx].setText(key);
                this.initialBoxes[idx].setStrokeStyle(3, 0x2ecc71);
                if (idx + 1 < 3) {
                    this.initialBoxes[idx + 1].setStrokeStyle(3, 0xf1c40f);
                }
                if (this.playerInitials.length === 3) {
                    this.initialsSubmitted = true;
                    this.submitStatusText.setText('Sparar...');
                    this.submitScore(this.playerInitials, this.score, this.currentLevel);
                }
            }
            if (event.key === 'Backspace' && this.playerInitials.length > 0) {
                const idx = this.playerInitials.length - 1;
                this.initialLetters[idx].setText('_');
                this.initialBoxes[idx].setStrokeStyle(3, 0xf1c40f);
                if (idx + 1 < 3) {
                    this.initialBoxes[idx + 1].setStrokeStyle(3, 0x666666);
                }
                this.playerInitials = this.playerInitials.slice(0, -1);
            }
        });

        // === LEADERBOARD ===
        this.leaderboardY = 320;
        this.add.text(cx, this.leaderboardY, '🏆 TOPPLISTA 🏆', {
            fontSize: '26px', fill: '#f1c40f', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setDepth(2001);

        this.loadLeaderboard();

        const restart = this.add.text(cx, cy + 280, '🔄 ENTER = Spela igen', {
            fontSize: '26px', fill: '#fff', backgroundColor: '#27ae60',
            padding: { x: 20, y: 10 }, fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(2001);
        restart.on('pointerdown', () => this.restartGame());
    }

    submitScore(initials, score, level) {
        if (!window.leaderboardDB) {
            if (this.submitStatusText) this.submitStatusText.setText('Ingen databas');
            return;
        }
        const ref = window.leaderboardDB.ref('leaderboard');
        ref.push({
            name: initials,
            score: score,
            level: level,
            date: new Date().toISOString()
        }).then(() => {
            if (this.submitStatusText) this.submitStatusText.setText(`✅ ${initials} sparad!`);
            this.loadLeaderboard();
        }).catch(err => {
            console.log('Could not save score:', err);
            if (this.submitStatusText) this.submitStatusText.setText('Kunde inte spara');
        });
    }

    loadLeaderboard() {
        if (!window.leaderboardDB) return;
        const cx = this.cameras.main.width / 2;
        const ref = window.leaderboardDB.ref('leaderboard');
        ref.orderByChild('score').limitToLast(10).once('value', (snapshot) => {
            const scores = [];
            snapshot.forEach(child => { scores.push(child.val()); });
            scores.sort((a, b) => b.score - a.score);
            if (this.leaderboardTexts) {
                this.leaderboardTexts.forEach(t => t.destroy());
            }
            this.leaderboardTexts = [];
            scores.forEach((entry, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                const color = i < 3 ? '#f1c40f' : '#ccc';
                const txt = this.add.text(cx, this.leaderboardY + 35 + (i * 28),
                    `${medal} ${entry.name}  ${entry.score}p  (Bana ${entry.level || '?'})`, {
                    fontSize: '18px', fill: color, fontFamily: 'Fredoka One'
                }).setOrigin(0.5).setDepth(2001);
                this.leaderboardTexts.push(txt);
            });
            if (scores.length === 0) {
                const txt = this.add.text(cx, this.leaderboardY + 40,
                    'Inga poäng än!', {
                    fontSize: '18px', fill: '#aaa', fontFamily: 'Fredoka One'
                }).setOrigin(0.5).setDepth(2001);
                this.leaderboardTexts.push(txt);
            }
        });
    }


    update(time, delta) {
        if (!this.isGameStarted || this.isGameOver) return;

        this.handleMovement();
        this.updateSheep(delta);
        this.updatePowerUps();
        this.updateDepthSorting();
    }

    // === POWER-UPS ===
    spawnPowerUp() {
        const types = ['powerup_coffee', 'powerup_clock', 'powerup_shield'];
        const type = types[Phaser.Math.Between(0, types.length - 1)];
        const rx = Phaser.Math.FloatBetween(0, 3);
        const ry = Phaser.Math.FloatBetween(3, 7);
        const pos = this.isoToScreen(rx, ry);

        const pu = this.add.sprite(pos.x, pos.y, type);
        pu.setOrigin(0.5, 0.75);
        pu.isoX = rx;
        pu.isoY = ry;
        pu.powerUpType = type;
        pu.setDepth(pos.y);

        // Glowing pulse animation
        this.tweens.add({
            targets: pu, scaleX: 1.3, scaleY: 1.3,
            yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut'
        });

        if (!this.powerUpGroup) {
            this.powerUpGroup = this.add.group();
        }
        this.powerUpGroup.add(pu);

        // Auto-remove after 8 seconds
        this.time.delayedCall(8000, () => {
            if (pu && pu.active) {
                this.tweens.add({
                    targets: pu, alpha: 0, duration: 500,
                    onComplete: () => pu.destroy()
                });
            }
        });
    }

    updatePowerUps() {
        if (!this.powerUpGroup) return;

        this.powerUpGroup.children.iterate(pu => {
            if (!pu || !pu.active) return;

            const dist = Phaser.Math.Distance.Between(
                this.player.isoX, this.player.isoY, pu.isoX, pu.isoY
            );

            if (dist < 1.5) {
                this.activatePowerUp(pu.powerUpType);
                pu.destroy();
            }
        });
    }

    activatePowerUp(type) {
        const cx = this.cameras.main.width / 2;
        let label = '';

        if (type === 'powerup_coffee') {
            label = '☕ TURBO!';
            this.speedMultiplier = 2;
            this.time.delayedCall(5000, () => { this.speedMultiplier = 1; });
        } else if (type === 'powerup_clock') {
            label = '⏰ +10 SEK!';
            this.timeLeft = Math.min(this.timeLeft + 10, 99);
        } else if (type === 'powerup_shield') {
            label = '🛡️ SKÖLD!';
            this.hasShield = true;
            // Visual shield indicator
            if (this.shieldGlow) this.shieldGlow.destroy();
            this.shieldGlow = this.add.circle(this.player.x, this.player.y, 30, 0x3498db, 0.3).setDepth(this.player.depth - 1);
            this.time.delayedCall(5000, () => {
                this.hasShield = false;
                if (this.shieldGlow) { this.shieldGlow.destroy(); this.shieldGlow = null; }
            });
        }

        // Show power-up text
        const puText = this.add.text(cx, 100, label, {
            fontSize: '36px', fill: '#f1c40f', fontFamily: 'Fredoka One',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(3000);
        this.tweens.add({
            targets: puText, y: 60, alpha: 0,
            duration: 1500, onComplete: () => puText.destroy()
        });
    }

    // === DOG ===
    spawnDog() {
        const cx = this.cameras.main.width / 2;

        // Announce
        const announce = this.add.text(cx, 80, '🐕 VALLHUND!', {
            fontSize: '36px', fill: '#e67e22', fontFamily: 'Fredoka One',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(3000);
        this.tweens.add({
            targets: announce, y: 50, alpha: 0,
            duration: 2000, onComplete: () => announce.destroy()
        });

        // Spawn dog from random edge
        const edge = Phaser.Math.Between(0, 3);
        let dx, dy;
        switch (edge) {
            case 0: dx = Phaser.Math.Between(-3, 12); dy = -5; break;
            case 1: dx = Phaser.Math.Between(-3, 12); dy = 15; break;
            case 2: dx = -5; dy = Phaser.Math.Between(-3, 12); break;
            case 3: dx = 15; dy = Phaser.Math.Between(-3, 12); break;
        }

        const pos = this.isoToScreen(dx, dy);
        const dog = this.add.sprite(pos.x, pos.y, 'dog');
        dog.isoX = dx;
        dog.isoY = dy;
        dog.setDepth(pos.y);

        // Dog chases each sheep and removes it
        const chaseSheep = () => {
            const sheepList = this.sheepGroup.children.getArray().filter(s => s && s.active);
            if (sheepList.length === 0) {
                // All sheep gone, dog runs off screen
                this.tweens.add({
                    targets: dog, alpha: 0, duration: 800,
                    onComplete: () => dog.destroy()
                });
                return;
            }

            // Find nearest sheep
            let nearest = sheepList[0];
            let minDist = Infinity;
            sheepList.forEach(s => {
                const d = Phaser.Math.Distance.Between(dog.isoX, dog.isoY, s.isoX, s.isoY);
                if (d < minDist) { minDist = d; nearest = s; }
            });

            // Tween dog to sheep position
            const targetPos = this.isoToScreen(nearest.isoX, nearest.isoY);
            this.tweens.add({
                targets: dog,
                x: targetPos.x, y: targetPos.y,
                duration: 400,
                onUpdate: () => { dog.setDepth(dog.y); },
                onComplete: () => {
                    // Remove the sheep
                    if (nearest && nearest.active) {
                        nearest.destroy();
                    }
                    // Chase next sheep after short delay
                    this.time.delayedCall(200, chaseSheep);
                }
            });
        };

        // Start chasing after brief pause
        this.time.delayedCall(300, chaseSheep);
    }

    handleMovement() {
        const speed = 0.10 * this.speedMultiplier;
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

            // Update shield glow position
            if (this.shieldGlow) {
                this.shieldGlow.x = this.player.x;
                this.shieldGlow.y = this.player.y;
            }
        }
    }

    handleInteraction() {
        if (!this.isGameStarted) return;

        if (this.carriedItem) {
            const distToHouse = Phaser.Math.Distance.Between(this.player.isoX, this.player.isoY, this.houseZone.x, this.houseZone.y);
            if (distToHouse < 2.5) {
                const points = this.pointValues[this.carriedItem.itemType] || 1;
                this.score += points;
                this.itemsDelivered++;
                this.updateUI();

                // Show points earned
                const ptText = this.add.text(this.player.x, this.player.y - 80, `+${points}`, {
                    fontSize: '28px', fill: '#2ecc71', fontFamily: 'Fredoka One',
                    stroke: '#000', strokeThickness: 2
                }).setOrigin(0.5).setDepth(3000);
                this.tweens.add({
                    targets: ptText, y: ptText.y - 40, alpha: 0,
                    duration: 800, onComplete: () => ptText.destroy()
                });

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
        const types = ['sofa', 'box', 'box', 'box', 'tv', 'lamp', 'plant', 'bookshelf', 'chair', 'fridge', 'console', 'freezer', 'cd', 'radio', 'guitar', 'clock', 'washer'];
        const type = types[Phaser.Math.Between(0, types.length - 1)];
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

        // Volume control (top-right corner)
        const camW = this.cameras.main.width;
        this.musicVolume = parseFloat(localStorage.getItem('flyttsmart_volume')) || 0.4;

        // Mute button
        this.muteBtn = this.add.text(camW - 50, 16, '🔊', { fontSize: '32px' })
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0)
            .setDepth(3000);

        this.muteBtn.on('pointerdown', () => {
            if (this.bgMusic) {
                if (this.bgMusic.volume > 0) {
                    this.bgMusic.setVolume(0);
                    this.muteBtn.setText('🔇');
                    localStorage.setItem('flyttsmart_volume', '0');
                } else {
                    this.bgMusic.setVolume(this.musicVolume || 0.4);
                    this.muteBtn.setText('🔊');
                    localStorage.setItem('flyttsmart_volume', String(this.musicVolume || 0.4));
                }
            }
        });

        // Volume down
        this.volDown = this.add.text(camW - 130, 16, '➖', { fontSize: '28px' })
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0)
            .setDepth(3000);

        this.volDown.on('pointerdown', () => {
            this.musicVolume = Math.max(0, this.musicVolume - 0.1);
            if (this.bgMusic) {
                this.bgMusic.setVolume(this.musicVolume);
                this.muteBtn.setText(this.musicVolume > 0 ? '🔊' : '🔇');
            }
            localStorage.setItem('flyttsmart_volume', String(this.musicVolume));
        });

        // Volume up
        this.volUp = this.add.text(camW - 90, 16, '➕', { fontSize: '28px' })
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0)
            .setDepth(3000);

        this.volUp.on('pointerdown', () => {
            this.musicVolume = Math.min(1, this.musicVolume + 0.1);
            if (this.bgMusic) {
                this.bgMusic.setVolume(this.musicVolume);
                this.muteBtn.setText('🔊');
            }
            localStorage.setItem('flyttsmart_volume', String(this.musicVolume));
        });
    }

    updateTimer() {
        // Level 5 is endless - no timer, just increasing difficulty
        if (this.currentLevel >= this.maxLevel) {
            if (!this.endlessElapsed) this.endlessElapsed = 0;
            this.endlessElapsed++;
            this.timerText.setText('∞ ENDLESS');
            // More sheep over time: 1 -> 2 -> 3 -> 4 -> 5
            this.sheepSpawnCount = Math.min(5, 1 + Math.floor(this.endlessElapsed / 15));
            return;
        }

        this.timeLeft--;
        this.timerText.setText('Tid: ' + this.timeLeft);
        if (this.timeLeft <= 0) {
            this.isGameOver = true;
            this.sound.stopAll();

            const message = 'TIDEN TOG SLUT!';

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
        // Time bonus: remaining seconds = bonus points
        const timeBonus = this.timeLeft;
        if (timeBonus > 0) {
            this.score += timeBonus;
            // Show bonus text
            const cx = this.cameras.main.width / 2;
            const cy = this.cameras.main.height / 2 - 50;
            const bonusText = this.add.text(cx, cy, `+${timeBonus} TIDSBONUS!`, {
                fontSize: '36px', fill: '#2ecc71', fontFamily: 'Fredoka One',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0.5).setDepth(2500);
            this.tweens.add({
                targets: bonusText,
                y: cy - 80,
                alpha: 0,
                duration: 2000,
                ease: 'Power2',
                onComplete: () => bonusText.destroy()
            });
        }

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
        this.timeLeft = 45;

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

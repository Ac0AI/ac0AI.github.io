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

        // Combo system
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboMaxTime = 4000; // 4 seconds to keep combo alive
        this.comboMultiplier = 1;

        // Random events
        this.eventTimer = 0;
        this.eventInterval = 25000; // every 25s
        this.activeEvent = null;
        this.eventMultiplier = 1;

        // Points per furniture type
        this.pointValues = {
            box: 1, cd: 1, plant: 2,
            lamp: 2, chair: 2, clock: 2, radio: 2,
            sofa: 3, bookshelf: 3, washer: 3, freezer: 3,
            tv: 5, console: 5, fridge: 4, guitar: 4
        };
    }

    create() {
        // Create background
        this.createGround();

        // Create Zones
        this.createZones();

        // Player - starts at center of screen
        const cx = this.cameras.main.width / 2;
        const cy = this.cameras.main.height / 2;
        this.player = this.physics.add.sprite(cx, cy, 'player');
        this.player.setOrigin(0.5, 0.85);
        this.player.setScale(0.8);
        this.player.setCollideWorldBounds(true);

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

        // Create synth sound effects (Web Audio API)
        this.createSynthSounds();

        // Clear previous sounds to prevent duplicates on restart
        this.sound.removeAll();

        // Background music - use saved volume or default
        this.musicVolume = parseFloat(localStorage.getItem('flyttsmart_volume')) || 0.25;
        this.bgMusic = this.sound.add('bgmusic', { loop: true, volume: this.musicVolume });

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
            delay: 20000, // Slower ramp
            callback: () => {
                this.sheepSpawnCount += 1;
                if (this.sheepSpawnCount > 8) this.sheepSpawnCount = 8;
            },
            loop: true
        });

        // No zoom needed for top-down
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
        const title = this.add.text(cx, cy - 130, '🚚 FLYTTSMART 🏠', {
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
        const tagline = this.add.text(cx, cy - 70, 'Flytta möblerna — Undvik fåren!', {
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
        const startBtn = this.add.text(cx, cy + 60, '▶  STARTA SPELET', {
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
        const lbTitle = this.add.text(cx, cy + 120, '🏆 TOPPLISTA', {
            fontSize: '22px', fill: '#f1c40f', fontFamily: 'Fredoka One'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: lbTitle, alpha: 1,
            duration: 600, delay: 1400
        });

        // Load leaderboard from Firebase
        const lbTexts = [];
        const lbLoading = this.add.text(cx, cy + 150, 'Laddar...', {
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
                    const noScores = this.add.text(cx, cy + 150, 'Inga poäng ännu!', {
                        fontSize: '16px', fill: '#888', fontFamily: 'Fredoka One'
                    }).setOrigin(0.5);
                    lbTexts.push(noScores);
                    this.startOverlay.add(noScores);
                } else {
                    const medals = ['🥇', '🥈', '🥉'];
                    scores.forEach((entry, i) => {
                        const medal = medals[i] || '  ';
                        const color = i === 0 ? '#f1c40f' : i < 3 ? '#bdc3c7' : '#fff';
                        const txt = this.add.text(cx, cy + 148 + (i * 24),
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
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        // Level-to-background mapping
        this.levelBackgrounds = {
            1: 'ground_bg',
            2: 'ground_bg_autumn',
            3: 'ground_bg_winter',
            4: 'ground_bg_night',
            5: 'ground_bg_volcano'
        };

        const bgKey = this.levelBackgrounds[this.currentLevel] || 'ground_bg';
        this.bgImage = this.add.image(w / 2, h / 2, bgKey);
        this.bgImage.setOrigin(0.5, 0.5);
        this.bgImage.setDepth(-1000);

        // Scale to cover full viewport
        const scaleX = w / this.bgImage.width;
        const scaleY = h / this.bgImage.height;
        this.bgImage.setScale(Math.max(scaleX, scaleY) * 1.1);
    }

    switchBackground(level) {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;
        const bgKey = this.levelBackgrounds[level] || 'ground_bg';

        // Create new background on top
        const newBg = this.add.image(w / 2, h / 2, bgKey);
        newBg.setOrigin(0.5, 0.5);
        newBg.setDepth(-1000);
        const scaleX = w / newBg.width;
        const scaleY = h / newBg.height;
        newBg.setScale(Math.max(scaleX, scaleY) * 1.1);
        newBg.setAlpha(0);

        // Crossfade
        const oldBg = this.bgImage;
        this.bgImage = newBg;

        this.tweens.add({
            targets: newBg, alpha: 1,
            duration: 800, ease: 'Power2'
        });
        this.tweens.add({
            targets: oldBg, alpha: 0,
            duration: 800, ease: 'Power2',
            onComplete: () => oldBg.destroy()
        });
    }

    createZones() {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        // Truck bottom-left, closer to road
        const truckX = 300;
        const truckY = h - 180;
        this.truck = this.add.image(truckX, truckY, 'truck');
        this.truck.setOrigin(0.5, 0.85);
        this.truck.setDepth(truckY);

        // House mid-right, closer to road
        const houseX = w - 320;
        const houseY = h / 2 - 80;
        this.house = this.add.image(houseX, houseY, 'house');
        this.house.setOrigin(0.5, 0.85);
        this.house.setDepth(houseY);

        this.truckZone = { x: truckX, y: truckY, radius: 80 };
        this.houseZone = { x: houseX, y: houseY, radius: 80 };
    }

    spawnFurniture() {
        const types = ['sofa', 'box', 'box', 'box', 'box', 'box', 'tv', 'lamp', 'plant', 'bookshelf', 'chair', 'fridge', 'console', 'freezer', 'cd', 'radio', 'guitar', 'clock', 'washer'];
        for (let i = 0; i < 3; i++) {
            const type = types[Phaser.Math.Between(0, types.length - 1)];
            // Spawn near the truck area (truck is at 300, h-180)
            const rx = Phaser.Math.FloatBetween(230, 380);
            const ry = Phaser.Math.FloatBetween(this.cameras.main.height - 240, this.cameras.main.height - 140);

            const item = this.add.sprite(rx, ry, type);
            item.setOrigin(0.5, 0.75);
            item.itemType = type;
            item.setDepth(ry);
            this.furnitureGroup.add(item);
        }
    }

    spawnSheep() {
        if (!this.isGameStarted || this.isGameOver) return;

        const count = this.sheepSpawnCount || 1;
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        for (let i = 0; i < count; i++) {
            let sx, sy;
            let attempts = 0;
            let tooClose = true;

            // Spawn at screen edges, not too close to player
            while (tooClose && attempts < 10) {
                const edge = Phaser.Math.Between(0, 3);
                switch (edge) {
                    case 0: sx = Phaser.Math.Between(0, w); sy = -30; break;
                    case 1: sx = Phaser.Math.Between(0, w); sy = h + 30; break;
                    case 2: sx = -30; sy = Phaser.Math.Between(0, h); break;
                    case 3: sx = w + 30; sy = Phaser.Math.Between(0, h); break;
                }
                const distToPlayer = Phaser.Math.Distance.Between(sx, sy, this.player.x, this.player.y);
                tooClose = distToPlayer < 150;
                attempts++;
            }

            const sheep = this.add.sprite(sx, sy, 'sheep');

            const sheepScale = 0.4 + (this.currentLevel - 1) * 0.15;
            sheep.setScale(sheepScale);

            // Random target on the other side of screen
            const targetX = Phaser.Math.Between(0, w);
            const targetY = Phaser.Math.Between(0, h);
            const dx = targetX - sx;
            const dy = targetY - sy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const sheepSpeed = 1.0 + (this.currentLevel * 0.3);
            sheep.vx = (dx / dist) * sheepSpeed;
            sheep.vy = (dy / dist) * sheepSpeed;
            sheep.isBoss = false;

            this.sheepGroup.add(sheep);
            this.physics.add.existing(sheep);

            // Cute wobble animation
            this.tweens.add({
                targets: sheep,
                angle: { from: -8, to: 8 },
                duration: 300 + Phaser.Math.Between(0, 200),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Boss sheep on level 5
        if (this.currentLevel >= 5 && Phaser.Math.Between(1, 10) === 1) {
            const edge = Phaser.Math.Between(0, 3);
            let bx, by;
            switch (edge) {
                case 0: bx = Phaser.Math.Between(0, w); by = -30; break;
                case 1: bx = Phaser.Math.Between(0, w); by = h + 30; break;
                case 2: bx = -30; by = Phaser.Math.Between(0, h); break;
                case 3: bx = w + 30; by = Phaser.Math.Between(0, h); break;
            }
            const boss = this.add.sprite(bx, by, 'sheep');
            boss.setScale(1.2);
            boss.setTint(0xff4444);
            boss.isBoss = true;
            boss.vx = 0;
            boss.vy = 0;
            this.sheepGroup.add(boss);
            this.physics.add.existing(boss);

            // Boss wobble - slower, bigger
            this.tweens.add({
                targets: boss,
                angle: { from: -5, to: 5 },
                scaleX: { from: 1.2, to: 1.3 },
                scaleY: { from: 1.2, to: 1.1 },
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    updateSheep(dt) {
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

        this.sheepGroup.children.iterate(sheep => {
            if (!sheep) return;

            // Sheep AI: chasing behavior on level 3+
            if (this.currentLevel >= 3 && !sheep.isBoss) {
                const chaseStrength = this.currentLevel >= 4 ? 0.05 : 0.02;
                const toDx = this.player.x - sheep.x;
                const toDy = this.player.y - sheep.y;
                const toDist = Math.sqrt(toDx * toDx + toDy * toDy) || 1;
                sheep.vx += (toDx / toDist) * chaseStrength;
                sheep.vy += (toDy / toDist) * chaseStrength;
            }
            if (sheep.isBoss) {
                const toDx = this.player.x - sheep.x;
                const toDy = this.player.y - sheep.y;
                const toDist = Math.sqrt(toDx * toDx + toDy * toDy) || 1;
                sheep.vx = (toDx / toDist) * 2.0;
                sheep.vy = (toDy / toDist) * 2.0;
            }

            sheep.x += sheep.vx;
            sheep.y += sheep.vy;
            sheep.setDepth(sheep.y);

            // Bounds check - remove if way off screen
            if (sheep.x < -100 || sheep.x > w + 100 || sheep.y < -100 || sheep.y > h + 100) {
                sheep.destroy();
                return;
            }

            // Collision with player (pixel distance)
            if (!this.hasGracePeriod && !this.hasShield) {
                const dist = Phaser.Math.Distance.Between(
                    this.player.x, this.player.y,
                    sheep.x, sheep.y
                );
                if (dist < 40) {
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
            // Screen shake!
            this.cameras.main.shake(300, 0.015);
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

        this.handleMovement(delta);
        this.updateSheep(delta);
        this.updatePowerUps();
        this.updateDepthSorting();
        this.updateCombo(delta);
        this.updateEventTimer(delta);
        this.updateTimerUrgency();
    }

    // === POWER-UPS ===
    spawnPowerUp() {
        const types = ['powerup_coffee', 'powerup_clock', 'powerup_shield'];
        const type = types[Phaser.Math.Between(0, types.length - 1)];
        const rx = Phaser.Math.FloatBetween(100, this.cameras.main.width - 100);
        const ry = Phaser.Math.FloatBetween(100, this.cameras.main.height - 100);

        const pu = this.add.sprite(rx, ry, type);
        pu.setOrigin(0.5, 0.75);
        pu.powerUpType = type;
        pu.setDepth(ry);

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
                this.player.x, this.player.y, pu.x, pu.y
            );

            if (dist < 50) {
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
        // Max 1 dog at a time
        if (this.activeDog) return;
        this.activeDog = true;

        const cx = this.cameras.main.width / 2;
        const w = this.cameras.main.width;
        const h = this.cameras.main.height;

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
            case 0: dx = Phaser.Math.Between(0, w); dy = -30; break;
            case 1: dx = Phaser.Math.Between(0, w); dy = h + 30; break;
            case 2: dx = -30; dy = Phaser.Math.Between(0, h); break;
            case 3: dx = w + 30; dy = Phaser.Math.Between(0, h); break;
        }

        const dog = this.add.sprite(dx, dy, 'dog');
        dog.setDepth(dy);

        // Dog chases each sheep and removes it
        const chaseSheep = () => {
            const sheepList = this.sheepGroup.children.getArray().filter(s => s && s.active);
            if (sheepList.length === 0) {
                this.tweens.add({
                    targets: dog, alpha: 0, duration: 800,
                    onComplete: () => { this.activeDog = false; dog.destroy(); }
                });
                return;
            }

            // Find nearest sheep
            let nearest = sheepList[0];
            let minDist = Infinity;
            sheepList.forEach(s => {
                const d = Phaser.Math.Distance.Between(dog.x, dog.y, s.x, s.y);
                if (d < minDist) { minDist = d; nearest = s; }
            });

            // Tween dog to sheep position
            this.tweens.add({
                targets: dog,
                x: nearest.x, y: nearest.y,
                duration: 400,
                onUpdate: () => { dog.setDepth(dog.y); },
                onComplete: () => {
                    if (nearest && nearest.active) {
                        nearest.destroy();
                    }
                    this.time.delayedCall(200, chaseSheep);
                }
            });
        };

        this.time.delayedCall(300, chaseSheep);
    }

    handleMovement(delta) {
        // Delta-time movement: same speed regardless of framerate, smoother steps
        const pixelsPerSecond = 480 * this.speedMultiplier;
        const speed = pixelsPerSecond * (delta / 1000);
        let dx = 0;
        let dy = 0;

        if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= speed;
        if (this.cursors.down.isDown || this.wasd.down.isDown) dy += speed;
        if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= speed;
        if (this.cursors.right.isDown || this.wasd.right.isDown) dx += speed;

        if (dx !== 0 || dy !== 0) {
            // Normalize diagonal movement
            if (dx !== 0 && dy !== 0) {
                dx *= 0.707;
                dy *= 0.707;
            }

            this.player.x += dx;
            this.player.y += dy;

            // Clamp to screen bounds
            this.player.x = Phaser.Math.Clamp(this.player.x, 30, this.cameras.main.width - 30);
            this.player.y = Phaser.Math.Clamp(this.player.y, 30, this.cameras.main.height - 30);

            if (dx < 0) this.player.setFlipX(true);
            else if (dx > 0) this.player.setFlipX(false);

            // Bouncy walk + waddle animation (simulates stepping)
            if (!this.walkTween || !this.walkTween.isPlaying()) {
                this.walkTween = this.tweens.add({
                    targets: this.player,
                    scaleY: { from: 0.8, to: 0.72 },
                    scaleX: { from: 0.8, to: 0.86 },
                    angle: { from: -6, to: 6 },
                    duration: 100,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }

            if (this.carriedItem) {
                this.carriedItem.x = this.player.x;
                this.carriedItem.y = this.player.y - 60;
                this.carriedItem.setDepth(this.player.depth + 1);
            }

            // Update shield glow position
            if (this.shieldGlow) {
                this.shieldGlow.x = this.player.x;
                this.shieldGlow.y = this.player.y;
            }
        } else {
            // Stop walk animation when idle
            if (this.walkTween && this.walkTween.isPlaying()) {
                this.walkTween.stop();
                this.player.setScale(0.8);
                this.player.angle = 0;
            }
        }
    }

    handleInteraction() {
        if (!this.isGameStarted) return;

        if (this.carriedItem) {
            const distToHouse = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.houseZone.x, this.houseZone.y);
            if (distToHouse < this.houseZone.radius) {
                let basePoints = this.pointValues[this.carriedItem.itemType] || 1;

                // Gold item bonus
                if (this.carriedItem.isGold) basePoints *= 10;

                // Apply combo multiplier
                const comboMult = this.comboMultiplier;
                // Apply event multiplier
                const eventMult = this.eventMultiplier;
                const totalPoints = basePoints * comboMult * eventMult;

                this.score += totalPoints;
                this.itemsDelivered++;

                // Combo system
                this.comboCount++;
                this.comboTimer = this.comboMaxTime;
                this.updateComboMultiplier();

                this.updateUI();

                // Play deliver sound
                this.playSynth('deliver');

                // Show points earned with combo info
                let pointLabel = `+${totalPoints}`;
                if (comboMult > 1) pointLabel += ` 🔥x${comboMult}`;
                if (this.carriedItem.isGold) pointLabel += ' ⭐';
                if (eventMult > 1) pointLabel += ' 💫';

                const ptColor = comboMult >= 4 ? '#ff4444' : comboMult >= 3 ? '#ff8800' : comboMult >= 2 ? '#f1c40f' : '#2ecc71';
                const ptSize = Math.min(28 + comboMult * 4, 48);
                const ptText = this.add.text(this.player.x, this.player.y - 80, pointLabel, {
                    fontSize: `${ptSize}px`, fill: ptColor, fontFamily: 'Fredoka One',
                    stroke: '#000', strokeThickness: 3
                }).setOrigin(0.5).setDepth(3000);
                this.tweens.add({
                    targets: ptText, y: ptText.y - 50, alpha: 0,
                    duration: 1000, ease: 'Power2', onComplete: () => ptText.destroy()
                });

                this.carriedItem.destroy();
                this.carriedItem = null;

                if (this.currentLevel < this.maxLevel && this.itemsDelivered >= this.levelGoal) {
                    this.completeLevel();
                } else {
                    this.spawnOneFurniture();
                }
            } else {
                // Drop on ground
                this.playSynth('drop');
                this.carriedItem.y = this.player.y;
                this.carriedItem = null;
            }
        } else {
            let closest = null;
            let minC = 80; // pixel pickup range

            this.furnitureGroup.children.iterate(item => {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
                if (dist < minC) {
                    minC = dist;
                    closest = item;
                }
            });

            if (closest) {
                this.carriedItem = closest;
                this.playSynth('pickup');
            }
        }
    }

    spawnOneFurniture() {
        const types = ['sofa', 'box', 'box', 'box', 'box', 'box', 'tv', 'lamp', 'plant', 'bookshelf', 'chair', 'fridge', 'console', 'freezer', 'cd', 'radio', 'guitar', 'clock', 'washer'];
        const type = types[Phaser.Math.Between(0, types.length - 1)];
        // Spawn near the truck area (truck is at 300, h-180)
        const rx = Phaser.Math.FloatBetween(230, 380);
        const ry = Phaser.Math.FloatBetween(this.cameras.main.height - 240, this.cameras.main.height - 140);

        const item = this.add.sprite(rx, ry, type);
        item.setOrigin(0.5, 0.75);
        item.itemType = type;
        item.setDepth(ry);
        item.isGold = false;

        // 10% chance of gold variant
        if (Phaser.Math.Between(1, 10) === 1) {
            item.isGold = true;
            item.setTint(0xFFD700);
            // Sparkle animation
            this.tweens.add({
                targets: item,
                scaleX: { from: 1, to: 1.2 },
                scaleY: { from: 1, to: 1.2 },
                alpha: { from: 1, to: 0.7 },
                yoyo: true, repeat: -1,
                duration: 400, ease: 'Sine.easeInOut'
            });
            // Gold items disappear after 8s
            this.time.delayedCall(6000, () => {
                if (item && item.active && item !== this.carriedItem) {
                    this.tweens.add({
                        targets: item, alpha: 0, duration: 2000,
                        onComplete: () => {
                            if (item !== this.carriedItem) item.destroy();
                        }
                    });
                }
            });
            // Announce gold item
            const announce = this.add.text(this.cameras.main.width / 2, 120, '⭐ GULDMÖBEL! ⭐', {
                fontSize: '30px', fill: '#FFD700', fontFamily: 'Fredoka One',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(3000);
            this.tweens.add({
                targets: announce, y: 90, alpha: 0,
                duration: 2000, onComplete: () => announce.destroy()
            });
        }

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

    createUI() {
        this.scoreText = this.add.text(16, 16, 'Poäng: 0', { fontSize: '32px', fill: '#000', fontFamily: 'Fredoka One' });
        this.timerText = this.add.text(16, 50, 'Tid: 60', { fontSize: '32px', fill: '#000', fontFamily: 'Fredoka One' });
        this.levelText = this.add.text(16, 84, 'Bana 1 (0/15)', { fontSize: '28px', fill: '#000', fontFamily: 'Fredoka One' });

        // Volume control (top-right corner)
        const camW = this.cameras.main.width;
        this.musicVolume = parseFloat(localStorage.getItem('flyttsmart_volume')) || 0.25;

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
                    this.bgMusic.setVolume(this.musicVolume || 0.25);
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

        // Combo UI text
        this.comboText = this.add.text(16, 118, '', {
            fontSize: '28px', fill: '#f1c40f', fontFamily: 'Fredoka One',
            stroke: '#000', strokeThickness: 3
        }).setDepth(3000).setVisible(false);
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
            this.spawnConfetti();
            this.victory();
        } else {
            // Play level complete jingle
            this.playLevelJingle(this.currentLevel);

            // Confetti!
            this.spawnConfetti();

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

        // Switch background
        this.switchBackground(this.currentLevel);

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
        // Update combo UI
        if (this.comboText) {
            if (this.comboCount >= 2) {
                const color = this.comboMultiplier >= 4 ? '#ff4444' : this.comboMultiplier >= 3 ? '#ff8800' : '#f1c40f';
                this.comboText.setText(`🔥 x${this.comboMultiplier} COMBO!`);
                this.comboText.setColor(color);
                this.comboText.setVisible(true);
            } else {
                this.comboText.setVisible(false);
            }
        }
    }

    // === SYNTH SOUND EFFECTS (Web Audio API) ===
    createSynthSounds() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.audioCtx = null;
        }
    }

    playSynth(type) {
        if (!this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        // Resume context if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'pickup') {
            // Short rising chirp
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'deliver') {
            // Happy two-tone chime
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523, now); // C5
            osc.frequency.setValueAtTime(659, now + 0.1); // E5
            osc.frequency.setValueAtTime(784, now + 0.2); // G5
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'drop') {
            // Low thud
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'combo') {
            // Ascending chime scaled by combo
            const baseFreq = 400 + (this.comboCount * 50);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.15);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'event') {
            // Dramatic fanfare
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(554, now + 0.1);
            osc.frequency.setValueAtTime(659, now + 0.2);
            osc.frequency.setValueAtTime(880, now + 0.3);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
    }

    // === COMBO SYSTEM ===
    updateComboMultiplier() {
        if (this.comboCount >= 8) this.comboMultiplier = 4;
        else if (this.comboCount >= 5) this.comboMultiplier = 3;
        else if (this.comboCount >= 2) this.comboMultiplier = 2;
        else this.comboMultiplier = 1;

        // Play combo sound when multiplier changes
        if (this.comboCount >= 2) {
            this.playSynth('combo');
        }
    }

    updateCombo(delta) {
        if (this.comboTimer > 0) {
            this.comboTimer -= delta;
            if (this.comboTimer <= 0) {
                this.comboCount = 0;
                this.comboMultiplier = 1;
                this.comboTimer = 0;
                this.updateUI();
            }
        }
    }

    // === RANDOM EVENTS ===
    updateEventTimer(delta) {
        this.eventTimer += delta;
        if (this.eventTimer >= this.eventInterval) {
            this.eventTimer = 0;
            // 30% chance of event
            if (Phaser.Math.Between(1, 100) <= 30) {
                this.triggerRandomEvent();
            }
        }
    }

    triggerRandomEvent() {
        const events = ['dubbelpoang', 'farinvasion'];
        const event = events[Phaser.Math.Between(0, events.length - 1)];
        this.activeEvent = event;

        this.playSynth('event');

        const cx = this.cameras.main.width / 2;

        if (event === 'dubbelpoang') {
            this.eventMultiplier = 2;

            // Banner
            const banner = this.add.text(cx, 50, '💫 DUBBELPOÄNG! 💫', {
                fontSize: '36px', fill: '#FFD700', fontFamily: 'Fredoka One',
                stroke: '#000', strokeThickness: 5,
                backgroundColor: '#2c3e50', padding: { x: 16, y: 8 }
            }).setOrigin(0.5).setDepth(3000).setAlpha(0);

            this.tweens.add({
                targets: banner, alpha: 1, y: 60,
                duration: 400, ease: 'Back.easeOut'
            });

            // End after 10s
            this.time.delayedCall(10000, () => {
                this.eventMultiplier = 1;
                this.activeEvent = null;
                this.tweens.add({
                    targets: banner, alpha: 0, y: 30,
                    duration: 400, onComplete: () => banner.destroy()
                });
            });

        } else if (event === 'farinvasion') {
            // Banner
            const banner = this.add.text(cx, 50, '🐑 FÅRINVASION! 🐑', {
                fontSize: '36px', fill: '#ff4444', fontFamily: 'Fredoka One',
                stroke: '#000', strokeThickness: 5,
                backgroundColor: '#2c3e50', padding: { x: 16, y: 8 }
            }).setOrigin(0.5).setDepth(3000).setAlpha(0);

            this.tweens.add({
                targets: banner, alpha: 1, y: 60,
                duration: 400, ease: 'Back.easeOut'
            });

            // Screen shake for drama
            this.cameras.main.shake(200, 0.008);

            // Spawn burst of sheep
            const savedCount = this.sheepSpawnCount;
            this.sheepSpawnCount = 8;
            this.spawnSheep();
            this.sheepSpawnCount = savedCount;

            this.time.delayedCall(3000, () => {
                this.activeEvent = null;
                this.tweens.add({
                    targets: banner, alpha: 0, y: 30,
                    duration: 400, onComplete: () => banner.destroy()
                });
            });
        }
    }

    // === TIMER URGENCY ===
    updateTimerUrgency() {
        if (this.currentLevel >= this.maxLevel) return; // Endless mode, no urgency

        if (this.timeLeft <= 10 && this.timeLeft > 0) {
            // Pulse timer text red
            if (!this.timerUrgencyTween || !this.timerUrgencyTween.isPlaying()) {
                this.timerText.setColor('#ff0000');
                this.timerUrgencyTween = this.tweens.add({
                    targets: this.timerText,
                    scaleX: { from: 1, to: 1.15 },
                    scaleY: { from: 1, to: 1.15 },
                    duration: 300,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        } else {
            if (this.timerUrgencyTween && this.timerUrgencyTween.isPlaying()) {
                this.timerUrgencyTween.stop();
                this.timerText.setScale(1);
                this.timerText.setColor('#000');
            }
        }
    }

    // === CONFETTI on level clear ===
    spawnConfetti() {
        const w = this.cameras.main.width;
        const colors = [0xff4444, 0xf1c40f, 0x2ecc71, 0x3498db, 0xe67e22, 0x9b59b6];

        for (let i = 0; i < 40; i++) {
            const color = colors[Phaser.Math.Between(0, colors.length - 1)];
            const x = Phaser.Math.Between(0, w);
            const size = Phaser.Math.Between(4, 10);
            const confetti = this.add.rectangle(x, -10, size, size * 2, color)
                .setDepth(4000)
                .setAngle(Phaser.Math.Between(0, 360));

            this.tweens.add({
                targets: confetti,
                y: this.cameras.main.height + 20,
                x: x + Phaser.Math.Between(-80, 80),
                angle: Phaser.Math.Between(-360, 360),
                duration: Phaser.Math.Between(1500, 3000),
                ease: 'Power1',
                delay: Phaser.Math.Between(0, 500),
                onComplete: () => confetti.destroy()
            });
        }
    }
}

import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';
import { Mover, Furniture, House, Truck } from './entities.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();

        this.renderer = new Renderer(this.ctx, this.canvas.width, this.canvas.height);
        this.input = new InputHandler();

        this.lastTime = 0;
        this.score = 0;
        this.timeLeft = 60;
        this.isPlaying = false;

        this.setupUI();

        window.addEventListener('resize', () => this.resize());

        // Game Entities
        this.mover = new Mover(2, 2);
        this.furniture = [];
        this.house = new House(6, -2); // Positioned top-rightish
        this.truck = new Truck(0, 6); // Positioned bottom-leftish

        // Bounds for player
        this.bounds = { minX: -2, maxX: 10, minY: -2, maxY: 10 };

        // Start loop
        requestAnimationFrame((ts) => this.loop(ts));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.renderer) {
            this.renderer.width = this.canvas.width;
            this.renderer.height = this.canvas.height;
        }
    }

    setupUI() {
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
    }

    startGame() {
        this.score = 0;
        this.timeLeft = 60;
        this.isPlaying = true;
        this.furniture = [];
        this.mover = new Mover(2, 2);

        // Spawn initial furniture
        this.spawnFurniture();

        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('game-hud').classList.remove('hidden');
        document.getElementById('mobile-controls').classList.remove('hidden');

        this.updateUI();
    }

    endGame() {
        this.isPlaying = false;
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('game-hud').classList.add('hidden');
        document.getElementById('mobile-controls').classList.add('hidden');
        document.getElementById('final-score').innerText = `Score: ${this.score}`;
    }

    spawnFurniture() {
        // Spawn randomly near the truck
        const types = ['sofa', 'box', 'tv'];
        for (let i = 0; i < 3; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const x = this.truck.x + Math.random() * 2;
            const y = this.truck.y + Math.random() * 2;
            this.furniture.push(new Furniture(type, x, y));
        }
    }

    update(dt) {
        if (!this.isPlaying) return;

        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.endGame();
            return;
        }

        const inputData = this.input.getInput();
        this.mover.update(dt, inputData, this.bounds);

        // Interaction: Pick up / Drop
        if (inputData.action && !this.input.prevAction) {
            if (this.mover.carrying) {
                // Drop
                const item = this.mover.carrying;
                item.x = this.mover.x;
                item.y = this.mover.y;
                item.z = 0;

                // Check if in House zone
                if (this.checkCollision(item, this.house)) {
                    if (!item.placed) {
                        this.score += 10;
                        item.placed = true;
                        // Respawn new item to keep flow going
                        this.spawnOneItem();
                    }
                }

                this.mover.carrying = null;
            } else {
                // Pick up
                // Find closest furniture
                let closest = null;
                let minDist = 1.5; // Pickup range

                for (let f of this.furniture) {
                    if (f.placed) continue; // Can't pick up delivered items
                    const dist = Math.hypot(f.x - this.mover.x, f.y - this.mover.y);
                    if (dist < minDist) {
                        closest = f;
                        minDist = dist;
                    }
                }

                if (closest) {
                    this.mover.carrying = closest;
                    closest.pickedUp = true;
                }
            }
        }
        this.input.prevAction = inputData.action;

        this.updateUI();
    }

    spawnOneItem() {
        const types = ['sofa', 'box', 'tv'];
        const type = types[Math.floor(Math.random() * types.length)];
        const x = this.truck.x + Math.random() * 2;
        const y = this.truck.y + Math.random() * 2;
        this.furniture.push(new Furniture(type, x, y));
    }

    checkCollision(a, b) {
        // Simple AABB logic in world coords
        return a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
    }

    draw() {
        this.renderer.clear();

        // Draw ground (large area)
        for (let x = -5; x < 15; x += 2) {
            for (let y = -5; y < 15; y += 2) {
                this.renderer.drawSprite('tile', x, y);
            }
        }

        // Draw Truck & House
        this.renderer.drawSprite('house', this.house.x, this.house.y);
        this.renderer.drawSprite('truck', this.truck.x, this.truck.y);

        // Draw Furniture (sort by Y + X + Z for depth)
        // Simple depth sort: screen Y roughly corresponds to world X + Y
        const entities = [...this.furniture];
        // Add player to sort list
        entities.push(this.mover);

        entities.sort((a, b) => {
            const screenYA = (a.x + a.y);
            const screenYB = (b.x + b.y);
            return screenYA - screenYB;
        });

        for (let e of entities) {
            if (e === this.mover) {
                this.renderer.drawSprite('mover', e.x, e.y, !e.facingRight);
                if (e.carrying) {
                    // Draw carried item on top relative to mover
                    // Adjust height (z)
                    // Currently renderer doesn't support Z, so we cheat by drawing it after/above
                    // But actually we need to draw it at e.x, e.y but shifted up
                    // For now, let's just draw it.
                    this.renderer.drawSprite(e.carrying.type, e.x, e.y - 2); // -2 is "up" in world-ish
                }
            } else {
                if (!e.pickedUp) {
                    this.renderer.drawSprite(e.type, e.x, e.y);
                }
            }
        }
    }

    loop(ts) {
        const dt = (ts - this.lastTime) / 1000;
        this.lastTime = ts;

        this.update(dt);
        this.draw();

        requestAnimationFrame((ts) => this.loop(ts));
    }

    updateUI() {
        document.getElementById('score').innerText = `Score: ${this.score}`;
        document.getElementById('timer').innerText = `Time: ${Math.ceil(this.timeLeft)}`;
    }
}

window.game = new Game();

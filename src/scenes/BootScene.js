export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        this.load.image('sprites', 'assets/sprites.png');
        this.load.image('ground_bg', 'assets/ground_bg.png');

        // Level music
        this.load.audio('level1', 'assets/level1.mp3');
        this.load.audio('level2', 'assets/level2.mp3');
        this.load.audio('level3', 'assets/level3.mp3');
        this.load.audio('level4', 'assets/level4.mp3');
        this.load.audio('level5', 'assets/level5.mp3');

        // Sound effects
        this.load.audio('roadkill', 'assets/roadkill.mp3');
    }

    create() {
        // Generate textures procedurally to ensure transparency and sharpness
        this.createProceduralTextures();

        this.scene.start('GameScene');
    }

    createProceduralTextures() {
        // Player - cute little mover
        const playerG = this.make.graphics({ x: 0, y: 0, add: false });

        // Body (Blue Overalls)
        playerG.fillStyle(0x3498db, 1);
        playerG.fillRoundedRect(10, 20, 28, 24, 8); // Rounder body

        // Head (Peach skin)
        playerG.fillStyle(0xffccaa, 1);
        playerG.fillCircle(24, 14, 10);

        // Cap (Dark Blue)
        playerG.fillStyle(0x2980b9, 1);
        playerG.arc(24, 14, 10, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(0), false);
        playerG.fillPath();
        playerG.fillRect(14, 14, 20, 4); // Brim

        // Eyes
        playerG.fillStyle(0x000000, 1);
        playerG.fillCircle(20, 14, 1.5);
        playerG.fillCircle(28, 14, 1.5);

        // Legs
        playerG.fillStyle(0x2c3e50, 1);
        playerG.fillRoundedRect(14, 40, 8, 12, 2);
        playerG.fillRoundedRect(26, 40, 8, 12, 2);

        playerG.generateTexture('player', 48, 56);
        playerG.destroy();

        // Sofa - red couch
        const sofaG = this.make.graphics({ x: 0, y: 0, add: false });
        sofaG.fillStyle(0xe74c3c, 1);
        sofaG.fillRoundedRect(0, 10, 64, 30, 6);
        sofaG.fillStyle(0xc0392b, 1);
        sofaG.fillRoundedRect(0, 0, 64, 18, 4);
        sofaG.fillStyle(0x2c3e50, 1); // Legs
        sofaG.fillRect(4, 36, 8, 8);
        sofaG.fillRect(52, 36, 8, 8);
        sofaG.generateTexture('sofa', 64, 44);
        sofaG.destroy();

        // Box - cardboard box
        const boxG = this.make.graphics({ x: 0, y: 0, add: false });
        boxG.fillStyle(0xf39c12, 1);
        boxG.fillRect(0, 0, 40, 40);
        boxG.lineStyle(2, 0xe67e22);
        boxG.strokeRect(0, 0, 40, 40);
        boxG.lineStyle(2, 0xd35400);
        boxG.lineBetween(0, 8, 40, 8); // Flap
        boxG.lineBetween(20, 8, 20, 40); // Split
        boxG.generateTexture('box', 40, 40);
        boxG.destroy();

        // TV
        const tvG = this.make.graphics({ x: 0, y: 0, add: false });
        tvG.fillStyle(0x2c3e50, 1);
        tvG.fillRect(0, 0, 50, 35);
        tvG.fillStyle(0x3498db, 1); // Screen
        tvG.fillRect(4, 4, 42, 24);
        tvG.fillStyle(0x34495e, 1); // Base
        tvG.fillRect(20, 30, 10, 5);
        tvG.generateTexture('tv', 50, 35);
        tvG.destroy();

        // Environment
        const tileG = this.make.graphics({ x: 0, y: 0, add: false });
        tileG.fillStyle(0xffffff, 0.1); // Slight highlight
        // Draw diamond manually: Top, Right, Bottom, Left
        const points = [
            { x: 32, y: 0 },
            { x: 64, y: 16 },
            { x: 32, y: 32 },
            { x: 0, y: 16 }
        ];
        tileG.fillPoints(points, true);
        tileG.generateTexture('tile', 64, 32);
        tileG.destroy();

        // Truck
        const truckG = this.make.graphics({ x: 0, y: 0, add: false });
        // Cargo area
        truckG.fillStyle(0x8e44ad, 1);
        truckG.fillRect(0, 10, 120, 70);
        // Cab
        truckG.fillStyle(0x9b59b6, 1);
        truckG.fillRect(120, 35, 50, 45);
        // Wheels
        truckG.fillStyle(0x2c3e50, 1);
        truckG.fillCircle(30, 80, 15);
        truckG.fillCircle(90, 80, 15);
        truckG.fillCircle(145, 80, 15);
        // Window
        truckG.fillStyle(0x87CEEB, 1);
        truckG.fillRect(125, 40, 35, 20);
        truckG.generateTexture('truck', 180, 100);
        truckG.destroy();

        // House
        const houseG = this.make.graphics({ x: 0, y: 0, add: false });
        // Roof
        houseG.fillStyle(0xc0392b, 1);
        houseG.fillTriangle(100, 0, 0, 60, 200, 60);
        // Body
        houseG.fillStyle(0x27ae60, 1);
        houseG.fillRect(10, 60, 180, 90);
        // Door
        houseG.fillStyle(0x8B4513, 1);
        houseG.fillRect(80, 90, 40, 60);
        // Window
        houseG.fillStyle(0x87CEEB, 1);
        houseG.fillRect(30, 80, 35, 35);
        houseG.fillRect(135, 80, 35, 35);
        houseG.generateTexture('house', 200, 150);
        houseG.destroy();
        // Sheep - Fluffy Cloud Style
        const sheepG = this.make.graphics({ x: 0, y: 0, add: false });

        // Body Fluff (White Circles)
        sheepG.fillStyle(0xffffff, 1);
        const fluffOffsets = [
            { x: 30, y: 30, r: 25 },
            { x: 50, y: 30, r: 25 },
            { x: 70, y: 30, r: 25 },
            { x: 30, y: 50, r: 25 },
            { x: 50, y: 50, r: 25 },
            { x: 70, y: 50, r: 25 },
            { x: 20, y: 40, r: 20 },
            { x: 80, y: 40, r: 20 },
            { x: 40, y: 20, r: 20 },
            { x: 60, y: 20, r: 20 },
            { x: 40, y: 60, r: 20 },
            { x: 60, y: 60, r: 20 }
        ];

        fluffOffsets.forEach(fluff => {
            sheepG.fillCircle(fluff.x, fluff.y, fluff.r);
        });

        // Head (Black Face)
        sheepG.fillStyle(0x1a1a1a, 1);
        sheepG.fillRoundedRect(75, 25, 35, 30, 10);

        // Ears
        sheepG.fillEllipse(75, 30, 15, 8);
        sheepG.fillEllipse(110, 30, 15, 8);

        // Legs
        sheepG.fillStyle(0x1a1a1a, 1);
        sheepG.fillRoundedRect(30, 65, 8, 15, 2);
        sheepG.fillRoundedRect(60, 65, 8, 15, 2);
        sheepG.fillRoundedRect(45, 70, 8, 10, 2); // back leg visual
        sheepG.fillRoundedRect(75, 70, 8, 10, 2);

        // Eyes
        sheepG.fillStyle(0xffffff, 1);
        sheepG.fillCircle(85, 35, 3);
        sheepG.fillCircle(100, 35, 3);

        sheepG.generateTexture('sheep', 120, 90);
        sheepG.destroy();
    }
}

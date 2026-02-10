export class Renderer {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.spriteSheet = new Image();
        this.spriteSheet.src = 'assets/sprites.png';
        this.loaded = false;

        this.spriteSheet.onload = () => {
            this.loaded = true;
            console.log('Sprites loaded');
        };

        // Grid is 4x4, 160x160 cells (640x640 total)
        // Row 1: Mover (4 angles)
        // Row 2: Sofa, Box, TV, Plant
        // Row 3: Tile, Grass, Wall, Window
        // Row 4: Truck (2 slots), House (2 slots)

        this.sprites = {
            mover: { x: 0, y: 0, w: 160, h: 160, ox: 80, oy: 140 },

            // Furniture
            sofa: { x: 0, y: 160, w: 160, h: 160, ox: 80, oy: 120 },
            box: { x: 160, y: 160, w: 160, h: 160, ox: 80, oy: 120 },
            tv: { x: 320, y: 160, w: 160, h: 160, ox: 80, oy: 120 },

            // Environment
            tile: { x: 0, y: 320, w: 160, h: 160, ox: 80, oy: 80 },  // Diamond tile

            // Large Structures (2 tiles wide = 320px)
            truck: { x: 0, y: 480, w: 320, h: 160, ox: 160, oy: 140 },
            house: { x: 320, y: 480, w: 320, h: 160, ox: 160, oy: 140 },
        };
    }

    // Convert Cartesian WORLD coordinates to Isometric SCREEN coordinates
    worldToScreen(x, y) {
        // Iso projection: 
        // screenX = (x - y) * tile_width/2
        // screenY = (x + y) * tile_height/2
        // We'll use a standard 2:1 ratio
        const tileW = 64; // Logical tile width
        const tileH = 32; // Logical tile height (half of width)

        const screenX = (x - y) * tileW + this.width / 2;
        const screenY = (x + y) * tileH + this.height / 4;

        return { x: screenX, y: screenY };
    }

    drawSprite(name, x, y, flip = false) {
        if (!this.loaded) return;

        const sprite = this.sprites[name];
        if (!sprite) return;

        const pos = this.worldToScreen(x, y);

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        if (flip) {
            this.ctx.scale(-1, 1);
        }

        this.ctx.drawImage(
            this.spriteSheet,
            sprite.x, sprite.y, sprite.w, sprite.h,
            -sprite.ox, -sprite.oy, sprite.w, sprite.h // Draw centered at bottom
        );
        this.ctx.restore();
    }

    // Debug draw for physics body
    drawRect(x, y, w, h, color = 'rgba(255,0,0,0.5)') {
        const p1 = this.worldToScreen(x, y);
        const p2 = this.worldToScreen(x + w, y);
        const p3 = this.worldToScreen(x + w, y + h);
        const p4 = this.worldToScreen(x, y + h);

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.lineTo(p4.x, p4.y);
        this.ctx.closePath();
        this.ctx.fill();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }
}

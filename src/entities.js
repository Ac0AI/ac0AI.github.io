export class Entity {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.z = 0; // vertical position for throwing/jumping
        this.vz = 0;
    }

    update(dt) {
        // Basic physics stub
    }
}

export class Mover extends Entity {
    constructor(x, y) {
        super(x, y, 0.8, 0.8); // Slightly smaller than 1x1 tile
        this.speed = 4;
        this.carrying = null;
        this.facingRight = true;
    }

    update(dt, input, bounds) {
        // Movement
        this.x += input.x * this.speed * dt;
        this.y += input.y * this.speed * dt;

        // Bounds check
        if (this.x < bounds.minX) this.x = bounds.minX;
        if (this.x > bounds.maxX) this.x = bounds.maxX;
        if (this.y < bounds.minY) this.y = bounds.minY;
        if (this.y > bounds.maxY) this.y = bounds.maxY;

        // Facing direction
        if (input.x > 0) this.facingRight = true;
        if (input.x < 0) this.facingRight = false;

        // Update carried item position
        if (this.carrying) {
            this.carrying.x = this.x;
            this.carrying.y = this.y;
            this.carrying.z = 1.5; // Lifted up
        }
    }
}

export class Furniture extends Entity {
    constructor(type, x, y) {
        super(x, y, 0.8, 0.8);
        this.type = type; // 'sofa', 'box', 'tv'
        this.pickedUp = false;
        this.placed = false; // Successfully in house
    }
}

export class House extends Entity {
    constructor(x, y) {
        super(x, y, 4, 4); // 4x4 tiles big
    }
}

export class Truck extends Entity {
    constructor(x, y) {
        super(x, y, 4, 2); // 4x2 tiles big
    }
}

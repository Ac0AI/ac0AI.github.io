export class InputHandler {
    constructor() {
        this.keys = {};
        this.touchActive = false;
        this.joystickData = { x: 0, y: 0, active: false };
        this.actionPressed = false;

        this.setupKeyboardListeners();
        this.setupTouchListeners();
    }

    setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') e.preventDefault(); // Prevent scrolling
            this.keys[e.code] = true;
            if (e.code === 'Space' || e.code === 'KeyE') {
                this.actionPressed = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            if (e.code === 'Space' || e.code === 'KeyE') {
                this.actionPressed = false;
            }
        });
    }

    setupTouchListeners() {
        const joystickZone = document.getElementById('joystick-zone');
        const stick = document.getElementById('joystick-stick');
        const actionBtn = document.getElementById('action-btn');

        if (!joystickZone || !stick || !actionBtn) return;

        // Joystick logic
        let startX, startY;
        const maxDist = 40; // Max joystick travel distance based on CSS

        joystickZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            this.joystickData.active = true;
            this.touchActive = true;
        });

        joystickZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.joystickData.active) return;

            const touch = e.changedTouches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
            const angle = Math.atan2(dy, dx);

            const moveX = Math.cos(angle) * distance;
            const moveY = Math.sin(angle) * distance;

            stick.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

            // Normalize -1 to 1
            this.joystickData.x = moveX / maxDist;
            this.joystickData.y = moveY / maxDist;
        });

        joystickZone.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.joystickData.active = false;
            this.joystickData.x = 0;
            this.joystickData.y = 0;
            stick.style.transform = `translate(-50%, -50%)`;
        });

        // Action Button
        actionBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.actionPressed = true;
            this.touchActive = true;
        });

        actionBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.actionPressed = false;
        });
    }

    getInput() {
        let x = 0;
        let y = 0;

        if (this.keys['ArrowUp'] || this.keys['KeyW']) y -= 1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) y += 1;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) x -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) x += 1;

        if (this.joystickData.active) {
            x = this.joystickData.x;
            y = this.joystickData.y;
        }

        // Normalize vector if length > 1 (so diagonal isn't faster)
        const len = Math.sqrt(x * x + y * y);
        if (len > 1) {
            x /= len;
            y /= len;
        }

        return { x, y, action: this.actionPressed };
    }
}

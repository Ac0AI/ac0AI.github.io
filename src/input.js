// Input handler for keyboard + touch (virtual joystick)

export class InputHandler {
    constructor() {
        this.keys = {};
        this.dx = 0;
        this.dy = 0;
        this.actionPressed = false;
        this.actionJustPressed = false;
        this._prevAction = false;
        this.invertControls = false;

        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') {
                e.preventDefault();
                this.actionPressed = true;
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            if (e.code === 'Space') {
                this.actionPressed = false;
            }
        });

        // Touch joystick
        this._touchId = null;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._joystickDx = 0;
        this._joystickDy = 0;
        this._targetJoystickDx = 0;
        this._targetJoystickDy = 0;

        const joystickArea = document.getElementById('joystick-area');
        const joystickKnob = document.getElementById('joystick-knob');
        const actionBtn = document.getElementById('action-btn');

        if (joystickArea) {
            joystickArea.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.changedTouches[0];
                this._touchId = touch.identifier;
                const rect = joystickArea.getBoundingClientRect();
                this._touchStartX = rect.left + rect.width / 2;
                this._touchStartY = rect.top + rect.height / 2;
            }, { passive: false });

            window.addEventListener('touchmove', (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    if (touch.identifier === this._touchId) {
                        const maxDist = 50;
                        let tdx = touch.clientX - this._touchStartX;
                        let tdy = touch.clientY - this._touchStartY;
                        const dist = Math.sqrt(tdx * tdx + tdy * tdy);
                        if (dist > maxDist) {
                            tdx = (tdx / dist) * maxDist;
                            tdy = (tdy / dist) * maxDist;
                        }
                        this._targetJoystickDx = tdx / maxDist;
                        this._targetJoystickDy = tdy / maxDist;
                        if (joystickKnob) {
                            joystickKnob.style.transform = `translate(${tdx}px, ${tdy}px)`;
                        }
                    }
                }
            }, { passive: false });

            const resetJoystick = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this._touchId) {
                        this._touchId = null;
                        this._targetJoystickDx = 0;
                        this._targetJoystickDy = 0;
                        if (joystickKnob) {
                            joystickKnob.style.transform = 'translate(0px, 0px)';
                        }
                    }
                }
            };
            window.addEventListener('touchend', resetJoystick);
            window.addEventListener('touchcancel', resetJoystick);
        }

        if (actionBtn) {
            actionBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.actionPressed = true;
                actionBtn.classList.add('is-pressed');
            }, { passive: false });
            actionBtn.addEventListener('touchend', () => {
                this.actionPressed = false;
                actionBtn.classList.remove('is-pressed');
            });
            actionBtn.addEventListener('touchcancel', () => {
                this.actionPressed = false;
                actionBtn.classList.remove('is-pressed');
            });
        }
    }

    update() {
        const stickSmoothing = 0.32;
        this._joystickDx += (this._targetJoystickDx - this._joystickDx) * stickSmoothing;
        this._joystickDy += (this._targetJoystickDy - this._joystickDy) * stickSmoothing;

        if (Math.abs(this._joystickDx) < 0.01) this._joystickDx = 0;
        if (Math.abs(this._joystickDy) < 0.01) this._joystickDy = 0;

        // Keyboard movement
        let kx = 0, ky = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) ky -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) ky += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) kx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) kx += 1;

        // Combine keyboard + joystick
        this.dx = kx || this._joystickDx;
        this.dy = ky || this._joystickDy;

        // Apply invert
        if (this.invertControls) {
            this.dx = -this.dx;
            this.dy = -this.dy;
        }

        // Normalize diagonal
        const mag = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (mag > 1) {
            this.dx /= mag;
            this.dy /= mag;
        }

        // Action edge detection
        this.actionJustPressed = this.actionPressed && !this._prevAction;
        this._prevAction = this.actionPressed;
    }

    get isMoving() {
        return Math.abs(this.dx) > 0.1 || Math.abs(this.dy) > 0.1;
    }
}

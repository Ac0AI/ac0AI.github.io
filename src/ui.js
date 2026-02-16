import { Leaderboard } from './firebase.js';

// UI overlay manager — manages all HTML screens

export class UIManager {
    constructor() {
        this.leaderboard = new Leaderboard();

        // Cache elements
        this.el = {
            hud: document.getElementById('hud'),
            score: document.getElementById('score'),
            timer: document.getElementById('timer'),
            level: document.getElementById('level'),
            combo: document.getElementById('combo'),
            startScreen: document.getElementById('start-screen'),
            startBtn: document.getElementById('start-btn'),
            startLeaderboard: document.getElementById('start-leaderboard'),
            gameoverScreen: document.getElementById('gameover-screen'),
            gameoverReason: document.getElementById('gameover-reason'),
            gameoverStats: document.getElementById('gameover-stats'),
            initialBoxes: document.getElementById('initial-boxes'),
            submitStatus: document.getElementById('submit-status'),
            gameoverLeaderboard: document.getElementById('gameover-leaderboard'),
            restartBtn: document.getElementById('restart-btn'),
            levelScreen: document.getElementById('level-screen'),
            levelCompleteTitle: document.getElementById('level-complete-title'),
            levelBonus: document.getElementById('level-bonus'),
            levelSubtitle: document.getElementById('level-subtitle'),
            nextLevelBtn: document.getElementById('next-level-btn'),
            victoryScreen: document.getElementById('victory-screen'),
            victoryScore: document.getElementById('victory-score'),
            victoryRestartBtn: document.getElementById('victory-restart-btn'),
            eventBanner: document.getElementById('event-banner'),
            powerupToast: document.getElementById('powerup-toast'),
            floatingPoints: document.getElementById('floating-points'),
        };

        // Callbacks
        this.onStart = null;
        this.onRestart = null;
        this.onNextLevel = null;

        this._setupButtons();
        this._loadStartLeaderboard();

        // Initials state
        this._initials = '';
        this._initialsSubmitted = false;
        this._keyListener = null;
    }

    _setupButtons() {
        this.el.startBtn.addEventListener('click', () => {
            if (this.onStart) this.onStart();
        });

        this.el.restartBtn.addEventListener('click', () => {
            if (this.onRestart) this.onRestart();
        });

        this.el.nextLevelBtn.addEventListener('click', () => {
            if (this.onNextLevel) this.onNextLevel();
        });

        this.el.victoryRestartBtn.addEventListener('click', () => {
            if (this.onRestart) this.onRestart();
        });

        // Enter key for starting/restarting
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (!this.el.startScreen.classList.contains('hidden') && this.onStart) {
                    this.onStart();
                } else if (!this.el.levelScreen.classList.contains('hidden') && this.onNextLevel) {
                    this.onNextLevel();
                } else if (!this.el.victoryScreen.classList.contains('hidden') && this.onRestart) {
                    this.onRestart();
                }
            }
        });
    }

    async _loadStartLeaderboard() {
        const scores = await this.leaderboard.loadScores(5);
        this._renderLeaderboard(this.el.startLeaderboard, scores);
    }

    _renderLeaderboard(container, scores) {
        if (scores.length === 0) {
            container.innerHTML = '<div class="lb-entry">Inga poäng ännu!</div>';
            return;
        }
        const medals = ['🥇', '🥈', '🥉'];
        container.innerHTML = scores.map((entry, i) => {
            const medal = medals[i] || `${i + 1}.`;
            const cls = i === 0 ? 'gold' : i < 3 ? 'silver' : '';
            return `<div class="lb-entry ${cls}">${medal} ${entry.name}  ${entry.score}p  (Bana ${entry.level || '?'})</div>`;
        }).join('');
    }

    // === SCREEN MANAGEMENT ===
    showStartScreen() {
        this.el.startScreen.classList.remove('hidden');
        this.el.hud.classList.add('hidden');
        this.el.gameoverScreen.classList.add('hidden');
        this.el.levelScreen.classList.add('hidden');
        this.el.victoryScreen.classList.add('hidden');
    }

    hideStartScreen() {
        this.el.startScreen.classList.add('hidden');
        this.el.hud.classList.remove('hidden');
    }

    showGameOver(reason, score, level) {
        this.el.gameoverScreen.classList.remove('hidden');
        this.el.hud.classList.add('hidden');
        this.el.gameoverReason.textContent = reason;
        this.el.gameoverStats.textContent = `Poäng: ${score}  |  Bana: ${level}`;

        // Setup initials input
        this._initials = '';
        this._initialsSubmitted = false;
        this.el.submitStatus.textContent = '';
        this.el.initialBoxes.innerHTML = '';

        for (let i = 0; i < 3; i++) {
            const b = document.createElement('div');
            b.className = 'initial-box' + (i === 0 ? ' active' : '');
            b.textContent = '_';
            b.dataset.index = i;
            this.el.initialBoxes.appendChild(b);
        }

        // Remove previous listener
        if (this._keyListener) {
            window.removeEventListener('keydown', this._keyListener);
        }

        this._keyListener = (e) => {
            if (this._initialsSubmitted) {
                if (e.key === 'Enter' && this.onRestart) this.onRestart();
                return;
            }

            const key = e.key.toUpperCase();
            if (/^[A-ZÅÄÖ0-9]$/.test(key) && this._initials.length < 3) {
                this._initials += key;
                const idx = this._initials.length - 1;
                const boxes = this.el.initialBoxes.children;
                boxes[idx].textContent = key;
                boxes[idx].classList.remove('active');
                boxes[idx].classList.add('filled');
                if (idx + 1 < 3) boxes[idx + 1].classList.add('active');

                if (this._initials.length === 3) {
                    this._initialsSubmitted = true;
                    this.el.submitStatus.textContent = 'Sparar...';
                    this._submitScore(this._initials, score, level);
                }
            }

            if (e.key === 'Backspace' && this._initials.length > 0) {
                const idx = this._initials.length - 1;
                const boxes = this.el.initialBoxes.children;
                boxes[idx].textContent = '_';
                boxes[idx].classList.remove('filled');
                boxes[idx].classList.add('active');
                if (idx + 1 < 3) {
                    boxes[idx + 1].classList.remove('active');
                }
                this._initials = this._initials.slice(0, -1);
            }
        };
        window.addEventListener('keydown', this._keyListener);

        // Load leaderboard
        this._loadGameOverLeaderboard();
    }

    async _submitScore(name, score, level) {
        const ok = await this.leaderboard.submitScore(name, score, level);
        this.el.submitStatus.textContent = ok ? `✅ ${name} sparad!` : 'Kunde inte spara';
        if (ok) this._loadGameOverLeaderboard();
    }

    async _loadGameOverLeaderboard() {
        const scores = await this.leaderboard.loadScores(10);
        this._renderLeaderboard(this.el.gameoverLeaderboard, scores);
    }

    showLevelComplete(levelNum, timeBonus) {
        this.el.levelScreen.classList.remove('hidden');
        this.el.hud.classList.add('hidden');
        this.el.levelCompleteTitle.textContent = `BANA ${levelNum} KLAR!`;
        this.el.levelBonus.textContent = timeBonus > 0 ? `+${timeBonus} TIDSBONUS!` : '';
        const nextLevel = levelNum + 1;
        this.el.nextLevelBtn.textContent = `▶ Bana ${nextLevel}`;
    }

    hideLevelComplete() {
        this.el.levelScreen.classList.add('hidden');
        this.el.hud.classList.remove('hidden');
    }

    showVictory(score) {
        this.el.victoryScreen.classList.remove('hidden');
        this.el.hud.classList.add('hidden');
        this.el.victoryScore.textContent = `Slutpoäng: ${score}`;
    }

    // === HUD ===
    updateHUD(score, timeLeft, level, maxLevel, itemsDelivered, levelGoal, comboCount, comboMultiplier) {
        this.el.score.textContent = `Poäng: ${score}`;

        if (level >= maxLevel) {
            this.el.timer.textContent = '∞ ENDLESS';
            this.el.timer.classList.remove('urgent');
        } else {
            this.el.timer.textContent = `Tid: ${timeLeft}`;
            if (timeLeft <= 10 && timeLeft > 0) {
                this.el.timer.classList.add('urgent');
            } else {
                this.el.timer.classList.remove('urgent');
            }
        }

        if (level >= maxLevel) {
            this.el.level.textContent = `Bana ${level} - FINAL!`;
        } else {
            this.el.level.textContent = `Bana ${level} (${itemsDelivered}/${levelGoal})`;
        }

        if (comboCount >= 2) {
            const color = comboMultiplier >= 4 ? '#ff4444' : comboMultiplier >= 3 ? '#ff8800' : '#f1c40f';
            this.el.combo.textContent = `🔥 x${comboMultiplier} COMBO!`;
            this.el.combo.style.color = color;
            this.el.combo.classList.remove('hidden');
        } else {
            this.el.combo.classList.add('hidden');
        }
    }

    // === TOAST / BANNERS ===
    showPowerUpToast(text) {
        this.el.powerupToast.textContent = text;
        this.el.powerupToast.classList.remove('hidden');
        // Reset animation
        this.el.powerupToast.style.animation = 'none';
        void this.el.powerupToast.offsetHeight;
        this.el.powerupToast.style.animation = '';
        setTimeout(() => {
            this.el.powerupToast.classList.add('hidden');
        }, 1500);
    }

    showEventBanner(text) {
        this.el.eventBanner.textContent = text;
        this.el.eventBanner.classList.remove('hidden');
    }

    hideEventBanner() {
        this.el.eventBanner.classList.add('hidden');
    }

    showAnnouncement(text) {
        const el = document.createElement('div');
        el.className = 'announce-text';
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2000);
    }

    // === FLOATING POINTS ===
    showFloatingPoints(screenX, screenY, text, type = '') {
        const el = document.createElement('div');
        el.className = `float-point ${type}`;
        el.textContent = text;
        el.style.left = `${screenX}px`;
        el.style.top = `${screenY}px`;
        this.el.floatingPoints.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    // === CONFETTI ===
    spawnConfetti() {
        const colors = ['#ff4444', '#f1c40f', '#2ecc71', '#3498db', '#e67e22', '#9b59b6'];
        for (let i = 0; i < 40; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = `${Math.random() * 100}vw`;
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = `${Math.random() * 0.5}s`;
            piece.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;
            piece.style.width = `${4 + Math.random() * 6}px`;
            piece.style.height = `${8 + Math.random() * 12}px`;
            document.body.appendChild(piece);
            setTimeout(() => piece.remove(), 3000);
        }
    }
}

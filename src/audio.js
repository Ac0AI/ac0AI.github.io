// Audio manager — Web Audio API synths + HTML5 audio for music/sfx

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.bgMusic = null;
        this.volume = parseFloat(localStorage.getItem('flyttsmart_volume')) || 0.25;
        this.muted = false;
        this.sounds = {};

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('No Web Audio API');
        }

        // Preload audio files
        this._preloadAudio();
        this._setupVolumeControls();
    }

    _preloadAudio() {
        const files = {
            bgmusic: 'assets/fs.mp3',
            level1: 'assets/Level 1.mp3',
            level2: 'assets/Level 2.mp3',
            level3: 'assets/Level 3.mp3',
            level4: 'assets/Level 4.mp3',
            level5: 'assets/Level 5.mp3',
            roadkill: 'assets/Roadkill.mp3',
            faisty: 'assets/faisty.mp3',
            gangnam: 'assets/gangnam style.mp3',
            move: 'assets/what a move.mp3',
            animals: 'assets/you guys are animals.mp3',
            loouser: 'assets/LOOUSER.mp3',
            recommend: 'assets/MOVESMART I WOULD RECOMMEND.mp3',
            sheep: 'assets/sheep.wav',
            dog: 'assets/dog.wav',
            cat: 'assets/cat.wav',
        };

        Object.entries(files).forEach(([key, path]) => {
            const audio = new Audio(path);
            audio.preload = 'auto';
            if (key === 'bgmusic') {
                audio.loop = true;
                audio.volume = this.volume;
                this.bgMusic = audio;
            } else {
                audio.volume = key.startsWith('level') ? 0.8 : 0.5;
            }
            this.sounds[key] = audio;
        });
    }

    _setupVolumeControls() {
        const muteBtn = document.getElementById('mute-btn');
        const volDown = document.getElementById('vol-down');
        const volUp = document.getElementById('vol-up');

        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.muted = !this.muted;
                if (this.bgMusic) {
                    this.bgMusic.volume = this.muted ? 0 : this.volume;
                }
                muteBtn.textContent = this.muted ? '🔇' : '🔊';
            });
        }

        if (volDown) {
            volDown.addEventListener('click', () => {
                this.volume = Math.max(0, this.volume - 0.1);
                if (this.bgMusic && !this.muted) this.bgMusic.volume = this.volume;
                localStorage.setItem('flyttsmart_volume', String(this.volume));
            });
        }

        if (volUp) {
            volUp.addEventListener('click', () => {
                this.volume = Math.min(1, this.volume + 0.1);
                if (this.bgMusic && !this.muted) this.bgMusic.volume = this.volume;
                localStorage.setItem('flyttsmart_volume', String(this.volume));
                if (document.getElementById('mute-btn')) {
                    document.getElementById('mute-btn').textContent = '🔊';
                    this.muted = false;
                }
            });
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    startMusic() {
        this.resume();
        if (this.bgMusic) {
            this.bgMusic.currentTime = 0;
            this.bgMusic.play().catch(() => { });
        }
    }

    stopMusic() {
        if (this.bgMusic) {
            this.bgMusic.pause();
            this.bgMusic.currentTime = 0;
        }
    }

    stopAll() {
        this.stopMusic();
        Object.values(this.sounds).forEach(s => {
            s.pause();
            s.currentTime = 0;
        });
    }

    playSound(key) {
        const sound = this.sounds[key];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => { });
        }
    }

    playLevelJingle(level) {
        this.playSound(`level${level}`);
    }

    // === SYNTH SOUNDS (Web Audio API) ===
    playSynth(type, comboCount = 0) {
        if (!this.ctx) return;
        this.resume();

        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        switch (type) {
            case 'pickup':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;

            case 'deliver':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523, now);
                osc.frequency.setValueAtTime(659, now + 0.1);
                osc.frequency.setValueAtTime(784, now + 0.2);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.start(now);
                osc.stop(now + 0.35);
                break;

            case 'drop':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                osc.start(now);
                osc.stop(now + 0.12);
                break;

            case 'combo':
                const baseFreq = 400 + (comboCount * 50);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(baseFreq, now);
                osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.15);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;

            case 'event':
                osc.type = 'square';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554, now + 0.1);
                osc.frequency.setValueAtTime(659, now + 0.2);
                osc.frequency.setValueAtTime(880, now + 0.3);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                break;
        }
    }
}

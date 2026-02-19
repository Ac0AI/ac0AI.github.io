// Firebase leaderboard integration
const LOCAL_LB_KEY = 'flyttsmart_leaderboard_local';
const REMOTE_TIMEOUT_MS = 2500;

function withTimeout(promise, ms = REMOTE_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
}

export class Leaderboard {
    constructor() {
        this.db = window.leaderboardDB || null;
    }

    _readLocalScores() {
        try {
            const raw = localStorage.getItem(LOCAL_LB_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    _writeLocalScores(scores) {
        try {
            localStorage.setItem(LOCAL_LB_KEY, JSON.stringify(scores));
        } catch {
            // Ignore localStorage write failures.
        }
    }

    _getLocalTop(limit = 10) {
        const scores = this._readLocalScores();
        scores.sort((a, b) => (b.score || 0) - (a.score || 0));
        return scores.slice(0, limit);
    }

    async loadScores(limit = 10) {
        if (!this.db) return this._getLocalTop(limit);
        try {
            const snapshot = await withTimeout(this.db.ref('leaderboard')
                .orderByChild('score')
                .limitToLast(limit)
                .once('value'));

            const scores = [];
            snapshot.forEach(child => {
                scores.push(child.val());
            });
            scores.sort((a, b) => b.score - a.score);
            return scores;
        } catch (e) {
            console.warn('Could not load leaderboard:', e);
            return this._getLocalTop(limit);
        }
    }

    async submitScore(name, score, level) {
        const entry = {
            name,
            score,
            level,
            date: new Date().toISOString()
        };

        // Always keep a local mirror for localhost/offline dev.
        const local = this._readLocalScores();
        local.push(entry);
        local.sort((a, b) => (b.score || 0) - (a.score || 0));
        this._writeLocalScores(local.slice(0, 100));

        if (!this.db) return true;

        try {
            await withTimeout(this.db.ref('leaderboard').push(entry));
            return true;
        } catch (e) {
            console.warn('Could not save score:', e);
            return true;
        }
    }
}

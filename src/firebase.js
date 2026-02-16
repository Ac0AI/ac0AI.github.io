// Firebase leaderboard integration

export class Leaderboard {
    constructor() {
        this.db = window.leaderboardDB || null;
    }

    async loadScores(limit = 10) {
        if (!this.db) return [];
        try {
            const snapshot = await this.db.ref('leaderboard')
                .orderByChild('score')
                .limitToLast(limit)
                .once('value');

            const scores = [];
            snapshot.forEach(child => {
                scores.push(child.val());
            });
            scores.sort((a, b) => b.score - a.score);
            return scores;
        } catch (e) {
            console.warn('Could not load leaderboard:', e);
            return [];
        }
    }

    async submitScore(name, score, level) {
        if (!this.db) return false;
        try {
            await this.db.ref('leaderboard').push({
                name,
                score,
                level,
                date: new Date().toISOString()
            });
            return true;
        } catch (e) {
            console.warn('Could not save score:', e);
            return false;
        }
    }
}

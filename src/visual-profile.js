export const VISUAL_PROFILE = 'premium_arcade_v2';

export const POSTFX_PRESETS = {
    premium_arcade_v2: {
        toneMappingExposure: 1.85,
        bloom: {
            strength: { lowPower: 0.18, normal: 0.28 },
            radius: { lowPower: 0.3, normal: 0.42 },
            threshold: { lowPower: 0.5, normal: 0.5 },
        },
        vignette: {
            innerStopPct: 72,
            outerAlpha: 0.12,
        },
        adaptive: {
            sampleWindowSec: 3.5,
            fpsThreshold: 49,
            pixelRatioStep: 0.2,
            bloomDegradeScale: 0.74,
        },
    },
};

export const LIGHTING_PRESETS = {
    premium_arcade_v2: {
        levels: [
            // Level 1: Bright sunny day — vivid greens, blue sky
            {
                ground: 0x5dd832,
                fog: 0xa8dff8,
                fogDensity: 0.0028,
                ambient: 0xffffff,
                ambientIntensity: 1.1,
                dirLight: 0xfff8e8,
                dirIntensity: 1.8,
                sky: 0x58b8f0,
                fillFactor: 0.45,
                hemiIntensity: 0.75,
                rimIntensity: 0.5,
                ringOpacity: 0.32,
                discOpacity: 0.12,
            },
            // Level 2: Golden autumn — warm oranges, golden light
            {
                ground: 0xe8b848,
                fog: 0xf0d898,
                fogDensity: 0.0038,
                ambient: 0xfff4e0,
                ambientIntensity: 0.85,
                dirLight: 0xffe8b0,
                dirIntensity: 1.4,
                sky: 0xe8a840,
                fillFactor: 0.38,
                hemiIntensity: 0.6,
                rimIntensity: 0.35,
                ringOpacity: 0.3,
                discOpacity: 0.1,
            },
            // Level 3: Snowy winter — crisp whites, cool blues
            {
                ground: 0xf0f0f8,
                fog: 0xe8eef8,
                fogDensity: 0.004,
                ambient: 0xe0e8ff,
                ambientIntensity: 0.95,
                dirLight: 0xf0f4ff,
                dirIntensity: 1.2,
                sky: 0x88b8e8,
                fillFactor: 0.4,
                hemiIntensity: 0.65,
                rimIntensity: 0.4,
                ringOpacity: 0.28,
                discOpacity: 0.1,
            },
            // Level 4: Magical night — deep blues with glowing accents
            {
                ground: 0x1a4a2a,
                fog: 0x101838,
                fogDensity: 0.005,
                ambient: 0x6666cc,
                ambientIntensity: 0.55,
                dirLight: 0x9999dd,
                dirIntensity: 0.8,
                sky: 0x0c1430,
                fillFactor: 0.4,
                hemiIntensity: 0.5,
                rimIntensity: 0.4,
                ringOpacity: 0.35,
                discOpacity: 0.14,
            },
            // Level 5: Epic sunset — dramatic oranges and reds
            {
                ground: 0x5a3a1a,
                fog: 0x682810,
                fogDensity: 0.004,
                ambient: 0xff7744,
                ambientIntensity: 0.65,
                dirLight: 0xffa060,
                dirIntensity: 1.5,
                sky: 0x401808,
                fillFactor: 0.35,
                hemiIntensity: 0.55,
                rimIntensity: 0.38,
                ringOpacity: 0.35,
                discOpacity: 0.13,
            },
        ],
        ground: {
            size: 200,
            segments: 40,
            grassPatchCount: { lowPower: 26, normal: 40 },
            tuftCount: { lowPower: 52, normal: 80 },
            flowerCount: { lowPower: 24, normal: 45 },
        },
        path: {
            steps: 16,
            jitter: 0.62,
            radius: { min: 0.45, max: 0.82 },
            opacity: 0.085,
            yBase: 0.012,
            yStep: 0.00022,
        },
        zones: {
            ringWidth: 0.18,
            ringEmissiveMul: 0.58,
            ringIntensity: 0.44,
            discEmissiveMul: 0.28,
            discIntensity: 0.26,
            yRing: 0.03,
            yDisc: 0.019,
        },
        beacons: {
            truckLightIntensity: 1.5,
            houseLightIntensity: 1.3,
            truckRadius: 18,
            houseRadius: 19,
            truckPulse: { speed: 2.9, amount: 0.25 },
            housePulse: { speed: 2.4, amount: 0.28, phase: 1.3 },
        },
        particles: {
            size: 0.18,
            opacity: 0.72,
        },
    },
};

export const UI_PRESETS = {
    premium_arcade_v2: {
        timings: {
            fastMs: 170,
            baseMs: 240,
            slowMs: 340,
            toastMs: 1500,
            announcementMs: 2000,
            floatPointMs: 1200,
        },
        cssVars: {
            '--ui-motion-fast': '170ms',
            '--ui-motion-base': '240ms',
            '--ui-motion-slow': '340ms',
            '--ui-overlay-blur': '10px',
            '--ui-grid-opacity': '0.42',
            '--ui-card-border': 'rgba(154, 215, 247, 0.32)',
            '--ui-card-shadow': '0 20px 45px rgba(0, 0, 0, 0.46)',
            '--hud-pill-border': 'rgba(204, 239, 255, 0.3)',
        },
    },
};

export const PLAYER_MOTION_PRESETS = {
    premium_arcade_v2: {
        blendSpeed: 7.5,
        walkStride: 0.66,
        carryStride: 0.44,
        walkArmSwing: 0.54,
        carryArmSwing: 0.22,
        carryArmLift: 0.2,
        idleBreath: 0.03,
        pickupKickDecay: 2.8,
        dropSettleDecay: 2.2,
        bodyLean: 0.14,
        headNod: 0.05,
    },
};

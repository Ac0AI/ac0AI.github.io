export const CURATED_FURNITURE_BY_TYPE = Object.freeze({
    box: ['box', 'box_b'],
    sofa: ['couch_large', 'couch_medium', 'couch_small', 'l_couch', 'couch_medium-mwgq94zhdz', 'couch_small-x9msj0gtb5'],
    tv: [], // use procedural
    lamp: ['ceiling_light', 'lamp', 'light_ceiling', 'light_chandelier', 'light_cube', 'light_desk', 'light_floor', 'light_icosahedron', 'light_stand', 'table_lamp', 'traffic_light', 'trafficlight_b'],
    plant: ['cactus', 'houseplant', 'dead_houseplant', 'houseplant-iblx2jz90o', 'houseplant-vtjh4irl4w', 'houseplant-bfloqiv5up', 'houseplant-dveij0xnpx', 'houseplant-f6gpjbegg0'],
    bookshelf: ['shelf_large', 'shelf_small', 'drawer', 'shelf_small-tfdguv2rye', 'drawer-8xzqezl2w3', 'drawer-g1h0wnchqf', 'drawer-n3eri89oeo', 'drawer-t4udbyp90c'],
    chair: ['chair', 'stool', 'bench', 'chair-rlyhe93nne'],
    fridge: ['kitchen_fridge'],
    console: [], // procedural
    freezer: [], // procedural
    cd: [], // procedural
    radio: [], // procedural
    guitar: [], // procedural
    clock: [], // procedural
    washer: ['washing_machine'],
    table: ['table_round_large', 'table_round_small', 'night_stand', 'table_round_small-57w671wvs2', 'night_stand-08s1j15jcx', 'night_stand-7cobkfclnv'],
    mirror: [], // procedural
    rug: ['rug', 'round_rug'],
    piano: [], // procedural
    microwave: [], // procedural
    vase: [], // procedural
    bed: ['bed_king', 'bed_single', 'bunk_bed'],
    toilet: ['toilet', 'bathroom_sink', 'bathtub', 'kitchen_sink'],
    trash: ['dumpster', 'trashcan', 'trashcan_large', 'trashcan_small', 'trashcan_small-zwytk2smba', 'trashcan-xswahu252t'],
    misc: ['toilet_paper_stack', 'square_plate', 'towel_rack', 'fire_hydrant', 'fireplace']
});

export const CURATED_ROLE_MODELS = Object.freeze({
    player: ['man'],
    dog: ['pug'],
    truck: ['stationwagon', 'car_hatchback', 'taxi', 'police_car'],
    building: ['building', 'building_b', 'watertower', 'building-7lmept2icd', 'building-t3oyvk6veu', 'building-bbh2bg73qm', 'building-g15lpkh4li', 'building-otrsya6pan', 'building-qohhglftam'],
    sheep: ['sheep', 'cow', 'horse', 'llama', 'pig', 'zebra'] // Include other animals into the sheep array!
});

export const CURATED_FURNITURE_TYPES = Object.freeze(
    Object.entries(CURATED_FURNITURE_BY_TYPE)
        .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
        .map(([type]) => type)
);

export const MAX_WORLD_RADIUS_PER_TYPE = Object.freeze({
    default: 2.8,
    truck: 4.8,
    building: 6.6,
    sheep: 1.8,
    box: 0.95,
    sofa: 1.7,
    tv: 1.45,
    lamp: 1.25,
    plant: 1.25,
    bookshelf: 1.45,
    chair: 1.15,
    fridge: 1.45,
    console: 1.1,
    freezer: 1.45,
    cd: 0.75,
    radio: 1.0,
    guitar: 1.15,
    clock: 1.05,
    washer: 1.35,
    table: 1.85,
    mirror: 1.35,
    rug: 1.95,
    piano: 1.95,
    microwave: 0.95,
    vase: 0.9,
    bed: 2.3,
    toilet: 1.5,
    trash: 1.4,
    misc: 1.5
});

export const MAX_WORLD_OFFSET_PER_TYPE = Object.freeze({
    default: 3.2,
    truck: 6.8,
    building: 8.4,
    sheep: 2.1,
    box: 1.6,
    sofa: 2.1,
    tv: 1.95,
    lamp: 1.85,
    plant: 1.9,
    bookshelf: 2.0,
    chair: 1.75,
    fridge: 2.0,
    console: 1.6,
    freezer: 2.0,
    cd: 1.5,
    radio: 1.7,
    guitar: 1.85,
    clock: 1.7,
    washer: 1.95,
    table: 2.2,
    mirror: 2.0,
    rug: 2.3,
    piano: 2.35,
    microwave: 1.6,
    vase: 1.55,
    bed: 2.8,
    toilet: 1.8,
    trash: 1.8,
    misc: 1.9
});

const TARGET_DIMENSIONS_PER_TYPE = Object.freeze({
    default: { targetHeight: 0.7, maxExtent: 1.0, maxVertices: 26000 },
    truck: { targetHeight: 1.7, maxExtent: 4.9, maxVertices: 56000 },
    building: { targetHeight: 4.4, maxExtent: 6.1, maxVertices: 62000 },
    sheep: { targetHeight: 1.1, maxExtent: 1.6, maxVertices: 26000 },
    box: { targetHeight: 0.52, maxExtent: 0.8, maxVertices: 18000 },
    sofa: { targetHeight: 0.82, maxExtent: 1.3, maxVertices: 22000 },
    tv: { targetHeight: 0.68, maxExtent: 1.05, maxVertices: 20000 },
    lamp: { targetHeight: 1.0, maxExtent: 0.7, maxVertices: 22000 },
    plant: { targetHeight: 0.84, maxExtent: 0.9, maxVertices: 20000 },
    bookshelf: { targetHeight: 1.08, maxExtent: 0.95, maxVertices: 22000 },
    chair: { targetHeight: 0.85, maxExtent: 0.8, maxVertices: 18000 },
    fridge: { targetHeight: 1.15, maxExtent: 0.95, maxVertices: 22000 },
    console: { targetHeight: 0.42, maxExtent: 0.72, maxVertices: 18000 },
    freezer: { targetHeight: 0.62, maxExtent: 1.05, maxVertices: 22000 },
    cd: { targetHeight: 0.18, maxExtent: 0.5, maxVertices: 16000 },
    radio: { targetHeight: 0.38, maxExtent: 0.65, maxVertices: 18000 },
    guitar: { targetHeight: 0.92, maxExtent: 0.62, maxVertices: 22000 },
    clock: { targetHeight: 0.56, maxExtent: 0.75, maxVertices: 18000 },
    washer: { targetHeight: 0.84, maxExtent: 0.9, maxVertices: 22000 },
    table: { targetHeight: 0.75, maxExtent: 1.25, maxVertices: 24000 },
    mirror: { targetHeight: 1.0, maxExtent: 0.82, maxVertices: 20000 },
    rug: { targetHeight: 0.17, maxExtent: 1.35, maxVertices: 22000 },
    piano: { targetHeight: 0.88, maxExtent: 1.35, maxVertices: 24000 },
    microwave: { targetHeight: 0.36, maxExtent: 0.7, maxVertices: 18000 },
    vase: { targetHeight: 0.6, maxExtent: 0.55, maxVertices: 18000 },
    bed: { targetHeight: 0.9, maxExtent: 2.2, maxVertices: 30000 },
    toilet: { targetHeight: 0.8, maxExtent: 0.8, maxVertices: 20000 },
    trash: { targetHeight: 0.9, maxExtent: 1.0, maxVertices: 20000 },
    misc: { targetHeight: 0.6, maxExtent: 0.6, maxVertices: 20000 }
});

export const MODEL_VALIDATION_LIMITS = Object.freeze({
    MAX_WORLD_RADIUS_PER_TYPE,
    MAX_WORLD_OFFSET_PER_TYPE,
    TARGET_DIMENSIONS_PER_TYPE,
});

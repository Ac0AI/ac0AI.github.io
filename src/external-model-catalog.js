import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/loaders/GLTFLoader.js';
import { CURATED_FURNITURE_BY_TYPE, CURATED_ROLE_MODELS } from './asset-curation.js';

function includesAny(text, needles) {
    const t = String(text || '').toLowerCase();
    return needles.some(n => t.includes(n));
}

function hasTag(meta, tag) {
    return Array.isArray(meta?.tags) && meta.tags.includes(tag);
}

function isPortableFurniture(meta) {
    if (!meta || !meta.id) return false;
    const id = String(meta.id).toLowerCase();
    const blocked = [
        'tv_wall',
        'door_frame',
        'door_',
        '_door',
        'wall_',
        '_wall',
        'building',
        'terrace',
    ];
    return !blocked.some(token => id.includes(token));
}

class ExternalModelCatalog {
    constructor() {
        this.loader = new GLTFLoader();
        this._skeletonCloneFn = null;
        this.templates = new Map();
        this.loading = new Map();
        this.models = [];
        this.modelById = new Map();
        this.furniture = [];
        this._furnitureSourceCache = new Map();
        this.roleId = {
            player: null,
            truck: null,
            building: null,
            dog: null,
            sheep: null,
        };
        this.animalIds = {
            sheep: [],
            dog: [],
        };
        this._ready = false;
        this._readyPromise = this._init();
    }

    async _init() {
        try {
            await this._initOptionalRuntimeModules();

            const res = await fetch('assets/models/game/manifest.json', { cache: 'no-store' });
            if (!res.ok) return;

            const data = await res.json();
            this.models = Array.isArray(data.models) ? data.models : [];
            this.modelById = new Map(this.models.map(m => [m.id, m]));
            this.furniture = this.models.filter(m => hasTag(m, 'furniture') && isPortableFurniture(m));

            const playerFallback = this._findIdPreferStatic(
                m => includesAny(m.id, ['u_body_', 'character']) && !includesAny(m.id, ['dog'])
            );
            const truckFallback = this._findIdPreferStatic(
                m => (
                    (hasTag(m, 'vehicle') && !includesAny(m.id, ['wheel']))
                    || (includesAny(m.id, ['van', 'truck']) && !includesAny(m.id, ['wheel']))
                )
            );
            const buildingFallback = this._findIdPreferStatic(
                m => hasTag(m, 'building') || includesAny(m.id, ['building', 'house'])
            );
            const dogFallback = this._findIdPreferStatic(
                m => includesAny(m.id, ['dog']) || hasTag(m, 'animal')
            );
            const sheepFallback = this._findIdPreferStatic(
                m => (hasTag(m, 'animal') || includesAny(m.id, ['sheep', 'cow', 'horse', 'llama', 'pig', 'zebra']))
                    && !includesAny(m.id, ['dog'])
            );

            this.roleId.player = await this._pickFirstLoadableId(this._candidateRoleIds('player', playerFallback));
            this.roleId.truck = await this._pickFirstLoadableId(this._candidateRoleIds('truck', truckFallback));
            this.roleId.building = await this._pickFirstLoadableId(this._candidateRoleIds('building', buildingFallback));
            this.roleId.dog = await this._pickFirstLoadableId(this._candidateRoleIds('dog', dogFallback));
            this.roleId.sheep = await this._pickFirstLoadableId(this._candidateRoleIds('sheep', sheepFallback));

            this.animalIds.dog = await this._collectLoadableIds([
                ...this._collectCuratedIds('dog'),
                this.roleId.dog
            ]);
            this.animalIds.sheep = await this._collectLoadableIds([
                ...this._collectCuratedIds('sheep'),
                this.roleId.sheep
            ]);

            const essentialRoleIds = [
                this.roleId.player,
                this.roleId.truck,
                this.roleId.building,
            ];
            if (essentialRoleIds.some(id => !id)) {
                console.warn('External model catalog missing one or more essential role ids.');
                return;
            }

            const curatedFurnitureIds = Object.values(CURATED_FURNITURE_BY_TYPE)
                .flat()
                .filter(Boolean);
            const idSet = new Set([
                ...essentialRoleIds,
                this.roleId.dog,
                this.roleId.sheep,
                ...this.animalIds.dog,
                ...this.animalIds.sheep,
                ...curatedFurnitureIds,
            ].filter(id => this.modelById.has(id)));

            await Promise.all([...idSet].map(id => this._loadById(id)));

            const missingEssentialTemplate = essentialRoleIds.some(id => !this.templates.has(id));
            if (missingEssentialTemplate) {
                console.warn('External model catalog could not load one or more essential role templates.');
                return;
            }
            this._ready = true;
        } catch (err) {
            console.warn('External model catalog failed to load:', err);
        }
    }

    async _initOptionalRuntimeModules() {
        try {
            const meshoptMod = await import('https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/libs/meshopt_decoder.module.js');
            if (meshoptMod?.MeshoptDecoder) {
                this.loader.setMeshoptDecoder(meshoptMod.MeshoptDecoder);
            }
        } catch (err) {
            console.warn('Meshopt decoder unavailable, external compressed models may be skipped.', err);
        }

        try {
            const skelMod = await import('https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/utils/SkeletonUtils.js');
            const cloneFn = skelMod?.SkeletonUtils?.clone;
            if (typeof cloneFn === 'function') {
                this._skeletonCloneFn = cloneFn;
            }
        } catch (err) {
            console.warn('SkeletonUtils unavailable, using basic clone fallback.', err);
        }
    }

    _findId(predicate) {
        const m = this.models.find(predicate);
        return m ? m.id : null;
    }

    _findIdPreferStatic(predicate) {
        const hits = this.models.filter(predicate);
        if (hits.length === 0) return null;
        const staticHit = hits.find(m => includesAny(m.id, ['_static']));
        return (staticHit || hits[0]).id;
    }

    _pickCuratedRoleId(role) {
        const curated = CURATED_ROLE_MODELS[role];
        if (!Array.isArray(curated) || curated.length === 0) return null;
        const pick = curated.find(id => this.modelById.has(id));
        return pick || null;
    }

    _collectCuratedIds(role) {
        const curated = CURATED_ROLE_MODELS[role];
        if (!Array.isArray(curated) || curated.length === 0) return [];
        return curated.filter(id => this.modelById.has(id));
    }

    _candidateRoleIds(role, fallbackId = null) {
        const curated = this._collectCuratedIds(role);
        const list = [...curated];
        if (fallbackId && !list.includes(fallbackId) && this.modelById.has(fallbackId)) {
            list.push(fallbackId);
        }
        return list;
    }

    async _pickFirstLoadableId(ids = []) {
        for (const id of ids) {
            if (!id || !this.modelById.has(id)) continue;
            const loaded = await this._loadById(id);
            if (loaded) return id;
        }
        return null;
    }

    async _collectLoadableIds(ids = []) {
        const unique = [...new Set((ids || []).filter(id => id && this.modelById.has(id)))];
        if (unique.length === 0) return [];
        await Promise.all(unique.map(id => this._loadById(id)));
        return unique.filter(id => this.templates.has(id));
    }

    async _loadById(id) {
        if (this.templates.has(id)) return this.templates.get(id);
        if (this.loading.has(id)) return this.loading.get(id);
        const meta = this.models.find(m => m.id === id);
        if (!meta || !meta.file) return null;

        const pending = this._loadGLTF(meta.file)
            .then((scene) => {
                if (scene) this.templates.set(id, scene);
                return scene;
            })
            .finally(() => {
                this.loading.delete(id);
            });

        this.loading.set(id, pending);
        return pending;
    }

    _loadGLTF(url) {
        return new Promise((resolve) => {
            this.loader.load(
                url,
                (gltf) => resolve((gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]))) || null),
                undefined,
                () => resolve(null)
            );
        });
    }

    whenReady() {
        return this._readyPromise;
    }

    get ready() {
        return this._ready;
    }

    cloneRole(role) {
        const id = this.roleId[role];
        if (!id) return null;
        return this.cloneById(id);
    }

    cloneAnimal(kind = 'dog') {
        if (kind === 'dog') {
            const picks = this.animalIds.dog;
            if (Array.isArray(picks) && picks.length > 0) {
                const loaded = picks.filter(id => this.templates.has(id));
                const source = loaded.length > 0 ? loaded : picks;
                const id = source[Math.floor(Math.random() * source.length)];
                return this.cloneById(id);
            }
            return this.cloneRole('dog');
        }
        if (kind === 'sheep') {
            const picks = this.animalIds.sheep;
            if (Array.isArray(picks) && picks.length > 0) {
                const loaded = picks.filter(id => this.templates.has(id));
                const source = loaded.length > 0 ? loaded : picks;
                const id = source[Math.floor(Math.random() * source.length)];
                return this.cloneById(id);
            }
            return this.cloneRole('sheep');
        }
        return null;
    }

    cloneById(id) {
        const template = this.templates.get(id);
        if (!template) {
            // Fire and forget lazy fetch for future spawns.
            this._loadById(id);
            return null;
        }
        if (!template) return null;
        if (typeof this._skeletonCloneFn === 'function') {
            return this._skeletonCloneFn(template);
        }
        return template.clone(true);
    }

    _getFurnitureSourceForType(type) {
        if (this._furnitureSourceCache.has(type)) {
            return this._furnitureSourceCache.get(type);
        }

        const curatedIds = CURATED_FURNITURE_BY_TYPE[type];
        if (Array.isArray(curatedIds)) {
            const curatedSource = curatedIds.length > 0
                ? curatedIds
                    .map(id => this.modelById.get(id))
                    .filter(meta => meta && hasTag(meta, 'furniture') && isPortableFurniture(meta))
                : [];
            this._furnitureSourceCache.set(type, curatedSource);
            return curatedSource;
        }

        const typeToHints = {
            sofa: ['sofa', 'lounge_chair'],
            box: ['box'],
            tv: ['tv', 'camera'],
            lamp: ['lamp'],
            plant: ['flower'],
            bookshelf: ['closet', 'dresser'],
            chair: ['chair'],
            fridge: ['fridge'],
            console: ['camera', 'coffee_machine'],
            freezer: ['fridge'],
            cd: ['dish'],
            radio: ['musical_instrument', 'camera'],
            guitar: ['musical_instrument'],
            clock: ['camera'],
            washer: [],
            table: ['table', 'desk', 'coffee_table'],
            mirror: ['door_frame'],
            rug: ['bed', 'clothes'],
            piano: ['musical_instrument'],
            microwave: ['microwave'],
            vase: ['flower'],
        };

        const hints = typeToHints[type] || [];
        const candidates = hints.length > 0
            ? this.furniture.filter(m => includesAny(m.id, hints) || hints.some(h => hasTag(m, h)))
            : [];
        const source = candidates.length > 0 ? candidates : this.furniture;
        this._furnitureSourceCache.set(type, source);
        return source;
    }

    cloneFurnitureForType(type) {
        if (this.furniture.length === 0) return null;
        const source = this._getFurnitureSourceForType(type);
        if (!source || source.length === 0) return null;
        const loaded = source.filter(meta => this.templates.has(meta.id));
        const pool = loaded.length > 0 ? loaded : source;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return pick ? this.cloneById(pick.id) : null;
    }
}

export const externalModelCatalog = new ExternalModelCatalog();

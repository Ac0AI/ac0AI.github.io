import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
    console.error('Usage: node build-manifest.mjs <output-dir>');
    process.exit(1);
}

const files = fs
    .readdirSync(outDir)
    .filter((f) => f.toLowerCase().endsWith('.glb'))
    .sort((a, b) => a.localeCompare(b));

function inferTags(id) {
    if (id.includes('_furniture_')) return ['furniture'];
    if (id.includes('_building_')) return ['building', 'environment'];
    if (id.includes('_van_') || id.includes('_car_')) return ['vehicle'];
    if (id.includes('_dog_')) return ['character', 'animal'];
    if (id.includes('_body_')) return ['character'];
    return ['misc'];
}

const manifest = {
    models: files.map((file) => {
        const id = path.basename(file, '.glb').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return {
            id,
            file: `assets/models/game/${file}`,
            scale: 1,
            yOffset: 0,
            tags: inferTags(id),
        };
    }),
};

fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
);

console.log(`Wrote manifest with ${manifest.models.length} model(s).`);

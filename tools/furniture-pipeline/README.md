# Furniture Pipeline (Unity Asset Store -> Web Game)

Detta flode ar gjort for att halla bra kvalitet men fungera pa MacBook M1 8GB i webblasare.

## 1) Hamta modeller fran Unity Asset Store

Jag kan inte ladda ner Unity Asset Store-paket at dig automatiskt eftersom det kraver ditt konto och licensgodkannande.

Gor sa har:

1. Kop/frihamta paketet i Unity Asset Store med ditt konto.
2. Importera paketet i ett Unity-projekt.
3. Exportera valda prefabs/modeller till `.glb` eller `.gltf`.
4. Lagg filerna i:
   - `assets/models/raw`

Tips for export:
- Behall endast de modeller du ska anvanda.
- Skala till meter-baserad storlek i Unity innan export.
- Ta bort onodiga material/texturer.

## 2) Optimera for webb

Kor fran projektroten:

```bash
chmod +x tools/furniture-pipeline/ingest-unity-furniture.sh
tools/furniture-pipeline/ingest-unity-furniture.sh
```

Detta gor:
- Mesh-optimering (`meshopt`)
- Geometri-forenkling (forsiktig standard)
- WebP-komprimering av texturer
- Max texturstorlek `1024`
- Rapport per modell (`*.inspect.txt`)
- Manifest-fil for spelintegration (`assets/models/game/manifest.json`)

## 3) Justera quality budget

Miljovariabler:

```bash
TEXTURE_SIZE=1024 SIMPLIFY_RATIO=0.92 SIMPLIFY_ERROR=0.0009 tools/furniture-pipeline/ingest-unity-furniture.sh
```

Rekommenderad budget:
- Vanliga props: <= 1.5k trianglar
- Storre props: <= 3k trianglar
- 1-2 material per modell
- 512-1024 px texturer

## 4) Nasta steg i spelet

Nar modellerna ligger i `assets/models/game` och `manifest.json` ar skapad, kan vi koppla in dem i runtime sa att de ersatter eller kompletterar dina procedurala mobler.

## 5) Riggade modeller (gubbe/djur) utan skinned-glitch

Om en karaktar/djurmodell ar riggad (`JOINTS_0` / `WEIGHTS_0`) kan den bli instabil i web-runtime och ge mega-polygoner.
Anvand statisk konvertering:

```bash
tools/furniture-pipeline/convert-fbx-static.sh <input.fbx> <output_id>
```

Exempel:

```bash
tools/furniture-pipeline/convert-fbx-static.sh \
  assets/models/unity_source/body/Assets/ithappy/Creative_Characters_FREE/Meshes/Body/Body_010.fbx \
  u_body_body_010_static

tools/furniture-pipeline/convert-fbx-static.sh \
  assets/models/unity_source/dog/Assets/ithappy/Animals_FREE/Meshes/Dog_001.fbx \
  u_dog_dog_001_static
```

Detta gor:
- FBX -> OBJ (tar bort skin/bones)
- OBJ -> GLB
- Web-optimering med gltf-transform
- Ny `manifest.json` for runtime

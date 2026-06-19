# Cocos Creator 3.x — Reference tecnico

Appunti operativi acquisiti lavorando su FunWarriors (CC 3.8.8, TypeScript, Box2D).

---

## Formato file `.scene`

Le scene sono JSON con un array piatto di oggetti. Ogni oggetto ha un indice implicito (posizione nell'array) usato come `__id__` per i riferimenti interni.

```json
[
  { "__type__": "cc.SceneAsset", "scene": { "__id__": 1 } },   // [0]
  { "__type__": "cc.Scene", "_children": [{ "__id__": 2 }], "_globals": { "__id__": 74 } },  // [1]
  { "__type__": "cc.Node", "_name": "Canvas", "_components": [...], "_children": [...] },    // [2]
  ...
]
```

**Regole chiave:**
- L'array inizia sempre con `cc.SceneAsset` (index 0) → `cc.Scene` (index 1) → `cc.Node` Canvas (index 2)
- Ogni componente è un oggetto separato con `"node": { "__id__": N }` che punta al suo nodo
- L'ultimo blocco è sempre `cc.SceneGlobals` (copiare da una scena esistente)
- I nodi figli sono elencati con `_children: [{ "__id__": N }, ...]`
- I componenti di un nodo sono elencati con `_components: [{ "__id__": N }, ...]`

**CRITICO — eliminazione di nodi dalla scena:**  
Quando si rimuove un blocco di K oggetti che inizia all'indice S dall'array, **tutti i riferimenti `__id__` con valore ≥ S+K devono essere decrementati di K** — altrimenti CC3 va in crash con `TypeError: Cannot read properties of undefined (reading '__type__')`.

Checklist per rimozione sicura:
1. Rimuovere il riferimento `{"__id__": S}` dal `_children` del nodo padre
2. Rimuovere fisicamente i K oggetti dall'array (con PowerShell o script — non a mano)
3. Eseguire un regex replace su `"__id__": N` → `"__id__": N-K` per tutti N ≥ S+K
4. Verificare che i `"_id"` stringa degli oggetti eliminati non compaiano più nel file

```powershell
# Fix __id__ refs dopo eliminazione di K oggetti a partire da indice S
$content = [regex]::Replace($content, '"__id__": (\d+)', {
    param($m); $n = [int]$m.Groups[1].Value
    if ($n -ge ($S + $K)) { '"__id__": ' + ($n - $K) } else { $m.Value }
})
```

---

## Tipo componente per script custom

Il tipo di un componente script custom non è il nome della classe ma una stringa UUID derivata dal file `.meta`. Per trovarlo:

1. Aprire `assets/scripts/NomeScript.ts.meta`
2. Leggere il campo `"uuid"` → es. `"94892kS2iNCTr8dWkJgf9G+"`
3. Usarlo come `"__type__"` nel file `.scene`

**Valori FunWarriors:**
| Script | `__type__` nella scena |
|--------|------------------------|
| Track.ts | `"94892kS2iNCTr8dWkJgf9G+"` |
| GameManager.ts | `"87d25ILG0BIuKHr0QTJifr8"` |
| BgFill.ts | `"44d8f1JRRpNFYX05U2jj7o0"` |

---

## Widget — `_alignFlags` bitmask

```
TOP=1  VCENTER=2  BOTTOM=4  LEFT=8  HCENTER=16  RIGHT=32
```

**ATTENZIONE:** i valori CC3 reali sono DIVERSI da quelli di CC2. Non usare LEFT=1/RIGHT=2/TOP=4/BOTTOM=8.

| Combinazione | Calcolo | Valore |
|---|---|---|
| Fullscreen (top+bottom+left+right) | 1+4+8+32 | **45** |
| Top-left (top+left) | 1+8 | **9** |
| Top-right (top+right) | 1+32 | **33** |
| Bottom-left (bottom+left) | 4+8 | **12** |
| Bottom-right (bottom+right) | 4+32 | **36** |
| Top-center (top+hcenter) | 1+16 | **17** |
| Canvas fullscreen (`_alignMode=2` ALWAYS) | | **45** |

La struttura completa di un Widget fullscreen:
```json
{
  "__type__": "cc.Widget",
  "node": { "__id__": N },
  "_enabled": true,
  "__prefab": null,
  "_alignFlags": 45,
  "_target": null,
  "_left": 0, "_right": 0, "_top": 0, "_bottom": 0,
  "_horizontalCenter": 0, "_verticalCenter": 0,
  "_isAbsLeft": true, "_isAbsRight": true,
  "_isAbsTop": true, "_isAbsBottom": true,
  "_isAbsHorizontalCenter": true, "_isAbsVerticalCenter": true,
  "_originalWidth": 0, "_originalHeight": 0,
  "_alignMode": 2,
  "_lockFlags": 0
}
```

---

## Camera con sfondo scuro

```json
{
  "__type__": "cc.Camera",
  "_color": { "__type__": "cc.Color", "r": 18, "g": 18, "b": 32, "a": 255 },
  "_clearFlags": 7,
  "_projection": 0,
  "_orthoHeight": 360,
  "_near": 0, "_far": 2000,
  "_priority": 0
}
```

---

## GUI responsive — Widget fullscreen + offset dagli angoli

Il pattern corretto per una GUI che si adatta a qualsiasi schermo:

```
Canvas  (UITransform 720×1280, Widget alignFlags=45 ALWAYS)
  └─ UILayer  (Widget alignFlags=45 fullscreen ALWAYS)
       └─ HUD  (Widget alignFlags=45 fullscreen ALWAYS)
            ├─ ScoreSec     Widget alignFlags=9  (LEFT+TOP)    left=80  top=40
            ├─ RoundSec     Widget alignFlags=33 (RIGHT+TOP)   right=80 top=40
            ├─ NextSec      Widget alignFlags=12 (LEFT+BOTTOM) left=80  bottom=40
            ├─ VersionSec   Widget alignFlags=17 (TOP+HCENTER) top=40
            └─ FullscreenBtn Widget alignFlags=36 (RIGHT+BOTTOM) right=80 bottom=40
```

**Gotcha critico — Design Resolution Mismatch:**
Il Canvas `UITransform._contentSize` nella scena DEVE corrispondere alla design resolution usata a runtime (`view.setDesignResolutionSize`). Se i due valori divergono (es. scena ha 1280×720 landscape ma runtime usa 720×1280 portrait), il Widget calcola le posizioni su dimensioni sbagliate → elementi fuori posto o al centro.

**Soluzione:** Canvas `_contentSize: {width: 720, height: 1280}` + `setDesignResolutionSize(720, 1280, FIXED_HEIGHT)` a runtime.

**Posizioni design 720×1280 (angoli ± margini):**
| Angolo | x | y |
|--------|---|---|
| top-left (left=80, top=40) | -280 | 600 |
| top-right (right=80, top=40) | 280 | 600 |
| bottom-left (left=80, bottom=40) | -280 | -600 |
| bottom-right (right=80, bottom=40) | 280 | -600 |
| Timer (20% della launch zone) | 0 | -544 |

**Nell'editor:** impostare Design Resolution 720×1280 Fixed Height in Project Settings → le posizioni Widget editor = runtime.

---

## Sprite.SizeMode — `sizeMode`

**Problema**: se si assegna `spriteFrame` prima di impostare la `sizeMode`, il componente `UITransform` viene sovrascritto con le dimensioni native dello sprite.

**Soluzione**: impostare `sizeMode = 2` (CUSTOM) PRIMA di assegnare `spriteFrame`.

Nei file `.scene` il campo è `"_sizeMode": 2` nel componente `cc.Sprite`.

```json
{
  "__type__": "cc.Sprite",
  "_sizeMode": 2,
  "_spriteFrame": null
}
```

---

## Ordine nodi nel Canvas (z-order)

L'ordine nell'array `_children` determina il rendering (ultimo = sopra):

```
Canvas
  ├─ Camera
  ├─ BgLayer        ← sfondo, z più basso
  ├─ Track          ← Track.ts — pista funnel (Graphics + PolygonCollider2D muri)
  ├─ GameLayer      ← creato a runtime — warriors, Rope, VFX esplosioni/burst
  ├─ UILayer        ← creato a runtime — HUD, timer, NEXT, tutorial, game-over,
  │                    floating scores, RedFlash, DebugPanel
  └─ GameManager    ← GameManager.ts + InputController.ts (addComponent), nessun rendering
```

`GameLayer` e `UILayer` sono figli di `Canvas` (= `this.node.parent` dal GameManager). Non usare `this.node.parent` per spawnare nodi a runtime — usare `this.gameLayer` o `this.uiLayer`.


## Coordinate di design (720×1280, FIXED_HEIGHT)

| Costante | Valore design | Formula |
|---|---|---|
| `TRACK_W` | 691 | `TRACK_H × 6/10 × 1.2` (+20% larghezza) |
| `TRACK_H` | 960 | `min(75% altezza, (10/6) × 95% larghezza)` |
| `TRACK_BOTTOM_Y` | -640 | `-height / 2` |
| `TRACK_TOP_Y` | 320 | `TRACK_BOTTOM_Y + TRACK_H` |
| `GAME_OVER_LINE_Y` | -160 | `(TRACK_BOTTOM_Y + TRACK_TOP_Y) / 2` — solo fallback: la soglia reale di game-over deriva dal nodo editor `GameOverLine` (vedi TECH.md v0.8.41) |
| `FUNNEL_OFFSET` | 72 | `TRACK_W × funnelPct / 200` (a 25%) |
| Timer Y | -544 | `TRACK_BOTTOM_Y + (GAME_OVER_LINE_Y - TRACK_BOTTOM_Y) × 0.2` |

---

## Property decorator per Inspector

```typescript
@property({ type: CCFloat, range: [0, 50, 1], slide: true, tooltip: '...' })
funnelPercentage: number = 25;
```

Il valore viene salvato nella scena come campo dell'oggetto componente:
```json
{ "__type__": "94892kS...", "funnelPercentage": 25, ... }
```

---

## Pattern find-or-create nodi da scena

```typescript
// GameManager.start() — usa nodi già presenti nella scena se esistono
this.gameLayer = this.node.parent!.getChildByName('GameLayer')
    ?? (() => { const n = new Node('GameLayer'); n.setParent(this.node.parent!); return n; })();

// HUD — legge Label da nodi scena, altrimenti crea runtime
const existingHud = this.uiLayer.getChildByName('HUD');
if (existingHud) {
    this.scoreLabel = existingHud.getChildByName('ScoreSec')?.getChildByName('ScoreValue')?.getComponent(Label) ?? null;
    // ...
    return;
}
// altrimenti: crea tutto programmaticamente
```

---

## SceneGlobals

Ogni scena termina con un `cc.SceneGlobals`. Può essere copiato identico tra scene:

```json
{
  "__type__": "cc.SceneGlobals",
  "ambient": { ... },
  "shadows": { ... },
  "skybox": { ... },
  "fog": { ... },
  "occlusion": null,
  "_id": ""
}
```

---

## Prefab — formato file e workflow

**Regola di design (sempre):** un componente reiterabile (righe di tabella/leaderboard, item di liste) = **un solo prefab istanziato N volte**, mai N nodi duplicati a mano nella scena. Così una modifica al layout/stile si fa una volta sola sul prefab e si propaga a tutte le istanze.

### Asset prefab (`.prefab` + `.prefab.meta`) — formato VERIFICATO

Un file `.prefab` è un array piatto JSON come le scene, ma la radice è `cc.Prefab` (non `cc.SceneAsset`). Riferimento nel progetto: `assets/prefabs/PsychoSparkle.prefab`.

```jsonc
[
  { "__type__": "cc.Prefab", "_name": "X", "data": { "__id__": 1 },          // [0]
    "optimizationPolicy": 0, "persistent": false },
  { "__type__": "cc.Node", "_name": "X", "_parent": null,                     // [1] root
    "_children": [...], "_components": [...],
    "_prefab": { "__id__": <PrefabInfo della radice> }, "_id": "" },
  // ...nodi figli: come i nodi di scena ma "_prefab": { "__id__": <PrefabInfo> } e "_id": ""
  // ...componenti: come in scena ma "__prefab": { "__id__": <CompPrefabInfo> } e "_id": ""
  { "__type__": "cc.CompPrefabInfo", "fileId": "<22-char>" },                 // uno per OGNI componente
  { "__type__": "cc.PrefabInfo",                                             // uno per OGNI nodo
    "root": { "__id__": 1 }, "asset": { "__id__": 0 },
    "fileId": "<22-char>", "instance": null, "targetOverrides": null }
]
```

Regole chiave dell'asset:
- Ogni **nodo** ha un `cc.PrefabInfo` dedicato (`root`→radice, `asset`→`{__id__:0}`, `fileId` univoco nel prefab, `instance: null`); il nodo lo referenzia con `_prefab`.
- Ogni **componente** ha un `cc.CompPrefabInfo` con `fileId` univoco; il componente lo referenzia con `__prefab`.
- Tutti gli `_id` (nodi/componenti) sono `""`: l'identità nel prefab è il `fileId`.
- Il `.meta` (`importer: "prefab"`) porta lo `uuid` dell'asset e `userData.syncNodeName`.

### Istanza di un prefab DENTRO una scena — formato VERIFICATO (forma collassata)

Un'istanza prefab in scena **non riserializza i figli**: il nodo-istanza è uno **stub** (solo `_parent` + `_prefab`); tutto il contenuto viene dal prefab. Le differenze per-istanza (nome, posizione, ecc.) sono `propertyOverrides`. Per riga servono questi oggetti consecutivi:

```jsonc
// 1) nodo stub
{ "__type__": "cc.Node", "_objFlags": 0,
  "_parent": { "__id__": <container> },
  "_prefab": { "__id__": <PrefabInfo> }, "__editorExtras__": {} },
// 2) PrefabInfo dell'istanza
{ "__type__": "cc.PrefabInfo",
  "root": { "__id__": <stub> },
  "asset": { "__uuid__": "<uuid prefab>", "__expectedType__": "cc.Prefab" },
  "fileId": "<fileId della RADICE nel prefab>",     // = root fileId del prefab
  "instance": { "__id__": <PrefabInstance> },
  "targetOverrides": null, "nestedPrefabInstanceRoots": null },
// 3) PrefabInstance — fileId UNIVOCO per istanza
{ "__type__": "cc.PrefabInstance", "fileId": "<22-char univoco>",
  "prefabRootNode": null, "mountedChildren": [], "mountedComponents": [],
  "propertyOverrides": [ {"__id__": ovrName}, {"__id__": ovrLpos}, {"__id__": ovrLrot}, {"__id__": ovrEuler} ],
  "removedComponents": [] },
// 4) un override + un TargetInfo per ogni proprietà (di norma _name, _lpos, _lrot, _euler)
{ "__type__": "CCPropertyOverrideInfo", "targetInfo": { "__id__": <TargetInfo> },
  "propertyPath": ["_name"], "value": "Row2" },
{ "__type__": "cc.TargetInfo", "localID": ["<fileId della radice nel prefab>"] }
```

Note importanti:
- `__type__` dell'override è **`CCPropertyOverrideInfo`** (senza `cc.`), il TargetInfo è `cc.TargetInfo`. `localID` = `[fileId radice]` (per override sulla radice dell'istanza).
- Più override possono condividere lo **stesso** `cc.TargetInfo` (es. tutti puntano al fileId radice) oppure averne uno per ciascuno: entrambe valide.
- Se il container ha un `cc.Layout`, gli `_lpos` sono **ricalcolati dal Layout** al load → i valori serializzati sono placeholder.
- **Editing append-only sicuro**: aggiungere istanze a una scena esistente = appendere questi oggetti in coda all'array (preservando gli `__id__` esistenti), poi aggiungere i loro `__id__` a `container._children` e ai binding `@property` (es. `rowNodes`). Mai inserire/rimuovere a metà array senza rinumerare (vedi regola CRITICA sopra). Usare uno script che fa `JSON.parse`→modifica→`JSON.stringify` (la scena è JSON valido). `cc.SceneGlobals` resta referenziato per `__id__` anche se non è più l'ultimo elemento.

Alternativa sempre valida: creare prefab e istanze **dall'editor** (trascina nodo in `assets/` per il prefab; trascina il prefab in scena per ogni istanza).

---

## Modale prefab (best practice CC 3.8 — verificata su doc ufficiale)

Pattern per pannelli modali (pausa, game over, win — vedi `PausePanel`/`EndPanel` + `scripts/gen-ui-panels.js`):

- **Root**: `Widget` fullscreen (`alignFlags=45`) + `UIOpacity` (per il fade in/out) + **`cc.BlockInputEvents`** (intercetta tap/click nel suo bounding box → impedisce che passino agli elementi sotto; è IL componente per le modali, nessuna API) + il componente comportamentale.
- **Dim backdrop**: `Sprite` bianco builtin (`20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941`) tintato nero con alpha, `_type=0` (SIMPLE) + `Widget` fullscreen → niente `Graphics`.
- **Card**: `Sprite` SLICED su `wood.png` con i testi/pulsanti come figli.
- Pulsanti: `button.png` (SLICED) + `cc.Button` + Label figlia.

**Gotcha `onLoad` (CRITICO) — pattern attuale (v0.10.17+):** `PausePanel`/`EndPanel` **NON** fanno più `this.node.active = false` in `onLoad` (rimosso). `onLoad` ora solo imposta `UIOpacity._opacity = 0` e aggancia i bottoni; scatta alla **prima attivazione**, cioè quando `open()`/`show()` fanno `active = true` (sincrono, prima del render → niente flash). **Regola: lasciare i nodi modali INATTIVI (`active = false`) nell'editor** — così non si accavallano nella Scene view (niente bisogno di opacity-trick né dell'occhio). Identico al pattern di `Settings`, dove il controller sta su un nodo sempre attivo e nasconde il figlio `Dialog`.

**Binding OBBLIGATORio via `@property`:** con i nodi inattivi, il resolver auto (`getComponentsInChildren`) può non trovarli. Quindi i 3 pannelli vanno trascinati negli slot `@property` di `GameManager` (`pausePanel`/`gameOverPanel`/`victoryPanel`) → riferimento serializzato, trovati anche da spenti. `_wirePanels()` salta la ricerca se lo slot è già valorizzato.

**Storico (pre-v0.10.17):** prima il pattern era opposto — `onLoad` faceva `active=false` per auto-nascondersi, quindi le istanze andavano lasciate **ATTIVE** in editor (con `UIOpacity._opacity=0` per non vederle). Se si lasciavano inattive, `onLoad` non partiva mai e al primo `show()` si ri-nascondevano. Questo NON vale più.

---

## Checklist scrittura scena manuale

1. Pianifica l'array e assegna ID sequenziali a tutti i nodi e componenti
2. Ogni nodo: `_type`, `_name`, `_parent.__id__`, `_children[]`, `_components[]`, `_lpos/rot/scale`, `_layer`, `_id` (stringa unica)
3. Ogni componente: `__type__`, `node.__id__`, `_enabled`, `__prefab: null`
4. `_layer` nodi UI: `33554432`; nodi mondo: `1073741824`
5. Canvas: pos `(640, 360, 0)` + UITransform + Canvas + Widget (alignFlags=45)
6. Camera: pos `(0, 0, 1000)`, `_orthoHeight=360`
7. SceneGlobals come ultimo elemento dell'array (referenziato da `cc.Scene._globals`)
8. Verificare che ogni `__id__` referenziato esista nell'array

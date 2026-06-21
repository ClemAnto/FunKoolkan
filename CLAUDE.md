# FunKoolkan — Contesto progetto

Progetto Cocos Creator 3.8.8, TypeScript, gioco puzzle-arcade per portali HTML5. **Nato come fork tecnico di FunWarriors** (stessa base: merge + lancio stile Suika/curling) con **reskin a tema maya** (Kukulkan) e dinamiche di gioco in evoluzione. Tutta l'infrastruttura riutilizzabile (PortalAdapter Poki/CrazyGames/GameDistribution, leaderboard, build/pack, resize, VFX, onboarding) è ereditata da FunWarriors.

## Documenti di riferimento

| File | Scopo | Quando usare / aggiornare |
|------|-------|--------------------------|
| `GDD.md` | Specifica completa del game design: regole, meccaniche, formule, asset necessari, stile visivo. | Consultare prima di implementare feature nuove. Aggiornare solo se cambia il design del gioco. |
| `ROADMAP.md` | Piano di sviluppo per fasi con checkbox avanzamento e decisioni tecniche prese. | Consultare per capire cosa è già implementato e cosa manca. Aggiornare le checkbox a ogni milestone completata. |
| `MEMO.md` | Parametri fisici calibrati, gotcha CC 3.8, coordinate di riferimento, workflow build/test. | Consultare sempre prima di toccare fisica, coordinate o workflow. Aggiornare quando si calibra un parametro o si scopre un nuovo gotcha. |
| `TECH.md` | Decisioni architetturali non ovvie e il perché dietro a esse. | Consultare se si tocca l'architettura. Aggiornare quando si prende una decisione strutturale rilevante. |
| `COCOS.md` | Reference tecnico sul formato `.scene` CC3: UUID encoding, Widget flags, struttura HUD, coordinate design. | Consultare quando si scrive o modifica un file `.scene` manualmente. Aggiornare se si scoprono nuovi dettagli del formato. |

## Stack
- Cocos Creator 3.8.8
- TypeScript strict mode
- Box2D (fisica 2D)
- Build target: HTML5

## Nodi della scena
- **Non modificare via codice** la posizione né la scala di nodi già impostati nell'editor, salvo eccezioni esplicitamente indicate. I valori dell'editor sono autoritativi per layout e proporzioni.
- Le conversioni world → local devono usare la trasformata reale del nodo (`worldPosition` / `worldScale`), non costanti hardcoded.

## Niente disegno programmatico (regola ferrea)
- **Ogni elemento visivo — UI *e* gameplay (rune, moai, bombe, scudo, arena, VFX) — è un prefab autorato nell'editor.** Lo script attacca solo comportamento (stato, fisica, tween, animazioni); non costruisce gerarchie visive.
- **Vietato `Graphics`** e la costruzione/configurazione da codice di nodi visivi (`Sprite`, `Label`, `UITransform`, `addComponent` di render) per disegnare contenuto. Cocos è editor-first: questa regola è più stretta del progetto precedente, di proposito. **`Graphics` ammesso SOLO per test/debug** (es. visualizzare hitbox, path, gizmo temporanei): mai in contenuto di gioco shippato.
- **Spawn runtime** → `instantiate(prefab)` + **object pooling** (`NodePool`), mai costruzione manuale del nodo.
- **Lecito da codice** sulle *istanze* spawnate: posizione, scala, rotazione, opacità, animazioni, tween, fisica. Resta invariato il vincolo che i **nodi già in scena dall'editor** non si toccano in posizione/scala (sezione sopra).
- **Eccezioni ammesse** (solo queste, e restano prefab-based): `ParticleSystem2D` autorato nell'editor; **Sprite con texture tiled/sliced** stirato/ruotato per connessioni dinamiche (es. la catena di mana Alba↔Tramonto); prefab-segmento istanziato N volte lungo un path. Niente `Graphics` nemmeno qui.
- Coerente con: niente VFX via `Graphics` (`UIOpacity` non funziona su `Graphics`), una classe per effetto, un solo prefab per componenti reiterati.

## Convenzioni di codice
- Component classes in PascalCase
- File scripts: PascalCase.ts (es. GameManager.ts)
- Cartelle: lowercase (managers/, entities/, utils/)
- Decoratori @ccclass con stesso nome della classe
- Log (console.log/warn/error) sempre in inglese
- **Dipendenze tra nodi/componenti**: SEMPRE via `@property` (target) assegnata **esplicitamente nell'editor**, MAI `getChildByName`/lookup per nome. Il nome di un nodo non è un contratto: rinominarlo non deve rompere il codice. (Lo stesso vale per i parametri configurabili: `@property`, non costanti hardcoded nel codice di scena.)

## Remote control
Se la chat è aperta da qualche minuto (sessione di sviluppo attiva), avvia automaticamente il remote-control così possiamo continuare la conversazione tramite app

## Versioning
- La versione è definita in due posti: `package.json` (campo `version`) e `GameManager.ts` (costante `VERSION`) — devono essere sempre allineati.
- **Ad ogni `npm run serve` incrementa la patch** (`0.1.x → 0.1.x+1`) in entrambi i file prima di buildare.

## Comando di chiusura sessione
Quando l'utente scrive **"OK Chiudo"** (o varianti come "Ok chiudo"), significa che sta per cambiare chat. Aggiornare immediatamente tutti gli `.md` rilevanti con quanto scoperto/cambiato nella sessione corrente prima di rispondere.

## Stato attuale
Fase 1 — **Prototipo arena/launcher in corso** (2026-06-21). Forkato da FunWarriors il 2026-06-19; game design rifondato (Rapa Nui/moai, vedi `GDD.md` v0.3). **Il codice del core NON è più quello FunWarriors**: riscritta l'arena responsive + prospettiva + il lancio.

**Fatto (greybox core):** arena responsive (`FitScale`), **prospettiva modello B** (vera 1-punto: fisica piatta in ground space + render omografico, le rune rimpiccioliscono/convergono verso l'alto), bordi Box2D rounded-rect (`ArenaBounds`, costruiti in ground space), **launcher slingshot** (`StoneLauncher`: ancorato al nodo launcher, traiettoria fisica-accurata, ±67.5°), rune come prefab (`Rune` + `Stone` mapper, corpo ruota → nodo `rotation`, angolo pieno ±180 via `atan2`), **NEXT completo** (gemma casuale + anteprima + animazioni pop-in/out, swap al tap, reload del loaded ritardato 1s, no-spin al lancio), traiettoria allungata/colorata-per-gemma dietro al launcher. Debug OFF in scena. Parametri/gotcha/calibrazioni in **MEMO.md → sezione FunKoolkan**.

**Refactor architetturale + core magnetismo (sessione 2026-06-21, v0.1.25):** Spezzato il monolite in classi **specializzate** (no monoliti): **`StoneLauncher`** = solo lancio (input/mira/slingshot/loaded/traiettoria), **`NextPreview`** = anteprima NEXT, **`ArenaManager`** = coordinatore (coda current/next + swap launcher↔NEXT + config/driver magnete). **`GameManager` SVUOTATO a placeholder** (motore FunWarriors merge/powerup/~3650 righe rimosso, resta solo `VERSION`; infra riusabile — VFXManager/Settings/pannelli/leaderboard/Portal — **mantenuta**). **Core magnetismo** = classe **`Magnet`** (sui poli dawn/sunset in editor + sulle stone a runtime), modello **PETRIFICAZIONE**: la stone libera è attratta a **corto raggio** (`attractGap` pochi px) verso il magnete **più vicino**; quando i bordi si toccano e resta **near-still 2s** → si **pietrifica** (snap sul contorno + `Static`, insensibile agli altri magneti); **albero `parent`** radicato ai poli; magnet **inverso `repel`**; debug cerchio-polo/albero/log. Modello ispirato a SuperSlide15 (forza solo lontano, niente forza al contatto → niente jitter). **`DepthSort`** Y-sorta StoneLayer (poli+stone in profondità). **`config/RuneTypes.ts`** = 6 tipi runa `{id,name,color}` = fonte di verità (3 attivi via `numGemTypes`). Rename scena: `WarriorsLayer→StoneLayer`, `Crossbow*→StoneLauncher*`. **`ROADMAP.md` riscritta** per FunKoolkan.

**Aperti:** (1) **feel magnetismo** da tarare in playtest (forza/raggio/delay; la "rottura per impatto forte" è accantonata col modello petrify, ri-aggiungibile con un "un-petrify"); (2) **shear della gemma** dalla scala anisotropa → scelta di design (arte piatta / split / no-rotazione); (3) **file warrior-only orfani** (`Warrior`, `SpawnManager`, i 4 powerup-effect+sparkle, `DebugPanel`, `InputController`, `OnboardingHints`-merge): codice morto, non rompono la build, da rimuovere — ma **tenere** gli effetti/Settings riusabili; (4) build pulito a editor chiuso (una texture rifiutata da `etcpack`). Modello prospettico C nel git history (`f61282b`).

**Design (in `GDD.md` v0.3):** tema **Rapa Nui/moai** (NON maya), stile **cartoon** (Mario/Puzzle Bobble), fondo blu-grigio-scuro. **Niente merge.** Core = **circuito di mana**: si lanciano **rune rotonde con gemma colorata**; una catena monocromatica che collega i moai-polo **Alba/Tramonto** chiude il circuito → **scarica** che dissolve la catena e **rompe lo scudo a lastre** del boss **Koolkan** (moai colossale corrotto); scudo rotto → runa a traiettoria libera lo abbatte → **round up**. Bombe dall'idolo **Make-make** (a raggio / di-colore); **moai-spawner** = pressione; **overflow = game over**. Due deep-research (06-19/20): rischio rifiuto originalità sceso a **basso-medio, guidato dalla presentazione**.

**Cosa è già pronto (ereditato da FunWarriors):** gameplay completo (merge + lancio), HUD, pannelli end-game, powerup, audio/VFX/juice, onboarding in-gameplay, rework resize/fullscreen, e **integrazione portali completa** — adapter Poki/CrazyGames/**GameDistribution** (`PortalAdapter`), leaderboard riutilizzabile, script `pack:crazygames`/`pack:gamedistribution`, overlay rotate. Dettagli tecnici in MEMO/TECH/COCOS.

**Reset di fork già applicati:** `package.json` (name/version/uuid), `VERSION=0.1.0`, `GD gameId`→placeholder, `LeaderboardConfig.BACKEND='mock'` (niente Firebase finché non se ne crea uno nuovo per FunKoolkan), rimossi `submission/`/`CRAZYGAMES.md`/`GAMEDISTRIBUTION.md` (storia FunWarriors).

**Da fare (prossimi passi):**
- **Chiudere i TBD di design** (GDD §22): n° colori (6 definiti in `RuneTypes`, 3 attivi — resta lo scaling per round), n°/ritmo dei moai-spawner, tipi di bomba, formula punteggio, prefill iniziale.
- ~~Riscrivere `ROADMAP.md`~~ ✅ fatto (piano per fasi FunKoolkan).
- **Core magnetismo + poli + petrificazione** ✅ greybox fatto (validare il feel in playtest). **Prossimo**: chiusura del **circuito** (rilevare quando una catena monocromatica tocca **entrambi** i poli, sull'albero `Magnet.parent`) → **scarica/ondata di mana** → dissoluzione catena → danno allo **scudo di Koolkan**; poi spawner, bombe Make-make, punteggio, overflow.
- **Reskin asset**: rune-gemma tonde, moai (poli Alba/Tramonto, spawner, boss Koolkan, idolo Make-make), arena/ahu, HUD scudo.
- Quando serve la leaderboard online: creare un **nuovo progetto Firebase** e impostare `LeaderboardConfig` (chiavi + `BACKEND='firestore'`).
- Per i portali: registrare il gioco su GD/altri e impostare il relativo `gameId`.

> NB: la pubblicazione di FunWarriors (gioco GD #73510, SDK verificato) resta nel progetto **FunWarriors** separato. Qui si riparte da zero come prodotto.
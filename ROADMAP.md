# Roadmap Tecnica — FunKoolkan

> Piano di sviluppo per fasi (Cocos Creator 3.8.8, TypeScript). Stima realistica part-time (~10-15h/sett).
> **Riscritta da zero il 2026-06-21** (design rifondato Rapa Nui/moai), poi **riallineata al core v0.4 il 2026-06-26**.
> La vecchia roadmap FunWarriors (gameplay merge-based) è stata sostituita: la sua storia dettagliata resta nel git history del progetto FunWarriors e nei commit pre-fork.
>
> ⚠️ **CORE ATTIVO = v0.4 "LOOP COLONNE / AKU / RISVEGLIO" (GDD §5-§6, fonte autorevole).** Ai lati dell'altare di **Koolkan dormiente** ci sono **2 colonne sacre** di pietre rettangolari marcate per colore (con **HP**). Gli **Aku** vi salgono e **pregano** (1 spirito/5s; **10 spiriti totali → risveglio**). Una runa **ferma sul TEE** trasforma le stone stesso-tipo nell'**HOUSE** (+ catena breve **quasi a contatto** fuori) in **`RaisingStar`** che colpiscono **solo** le pietre-colonna dello stesso colore ed **elettrizzano gli Aku sopra**. **Obiettivo round = abbattere le colonne** (= completare il round → reset totale, colonne ricostruite più alte). Koolkan **sveglio** spawna rune sempre più veloci (pressione, non fail); **ucciso solo all'ultimo round**. **Overflow rune = game over.**
>
> 🔧 **Eredità di codice riusabile dal core curling**: detection HOUSE/TEE (`House.ts`), `CurlingScorer`, `RaisingStar`, VFX `ManaLightning`/white-flash, scaffold **Aku** (`AkuAku`+spawner+behavior+morte, v0.2.5). ⏸️ Il **circuito di mana** (glue/poli/magnetismo) è **parcheggiato** come bonus futuro — codice in repo, vedi **Appendice A**.

## Stack tecnologico

- **Engine**: Cocos Creator 3.8.8
- **Linguaggio**: TypeScript (strict mode)
- **Fisica**: Box2D (gravità = 0; arena fisica piatta in *ground space* + render omografico — prospettiva modello B)
- **Build target**: HTML5 (Web Mobile + Desktop), portrait primario 720×1280
- **SDK portale**: CrazyGames (primario) / Poki / GameDistribution — adapter ereditati
- **Version control**: Git
- **Versione attuale**: **v0.2.7** (core ridefinito a **GDD v0.4** il 2026-06-26)

## Legenda

- ✅ fatto · 🔄 in corso · ⬜ da fare · ⏸️ rimandato/end-game
- **(ereditato)** = infrastruttura riusata da FunWarriors, già funzionante
- **(nuovo)** = codice/asset specifici di FunKoolkan, da scrivere

---

## Quadro per fasi

| Fase | Obiettivo | Stato |
|------|-----------|-------|
| 0. Fork + infrastruttura ereditata | Base tecnica pulita (portali, leaderboard, resize, VFX, HUD) | ✅ chiusa |
| 1. Prototipo arena + launcher | Arena responsive + prospettiva + lancio runa giocabile | 🔄 in corso |
| 2. Core v0.4 — colonne / Aku / risveglio | curling→TEE→`RaisingStar`→colonne (HP) + Aku in preghiera + gauge di risveglio (il "make-or-break") | 🔄 in corso |
| 3. Loop completo greybox | round + ricostruzione colonne + bombe + spawner + overflow + punteggio + boss finale | ⬜ |
| 4. Reskin asset + UI (Rapa Nui cartoon) | Look finale + VFX `RaisingStar` + Koolkan che si risveglia | ⬜ |
| 5. Polish + juice + bilanciamento | "Premium feel" + playtest esterni | ⬜ |
| 6. Pubblicazione | Submission portali + marketing | ⬜ |

---

## FASE 0 — Fork e infrastruttura ereditata ✅ *(chiusa 2026-06-19)*

**Obiettivo**: ripartire da FunWarriors con una base tecnica pulita e rimarchiata, senza la storia di pubblicazione del progetto precedente.

- [x] Fork tecnico da FunWarriors (`beff484`)
- [x] Reset di fork: `package.json` (name/version/uuid), `VERSION=0.1.0`, `GD gameId`→placeholder
- [x] `LeaderboardConfig.BACKEND='mock'` (niente Firebase finché non se ne crea uno nuovo per FunKoolkan)
- [x] Rimossi `submission/`/`CRAZYGAMES.md`/`GAMEDISTRIBUTION.md` (storia FunWarriors)
- [x] Rebrand funzionale (`5c70e1e`): deploy origin, titoli, nomi zip, privacy

**Infrastruttura riusabile già pronta (da reskinnare, non riscrivere):**
- [x] **Integrazione portali completa** — `PortalAdapter` Poki/CrazyGames/GameDistribution, switch a 3 vie, flag `PORTAL`
- [x] **Leaderboard riusabile** — astrazione `LeaderboardService` (Firestore/Null/Mock), scena `Ranking`, NameEntry arcade
- [x] **Resize/fullscreen** — rework dichiarativo via Widget + freeze fisica + re-pin
- [x] **VFX/juice pipeline** — VFXManager (screen shake, flash, slowmo, floating score 4 tier), TrailEffect, particelle
- [x] **HUD + pannelli modali** — MainMenu, EndPanel (game over/victory), PausePanel, Settings
- [x] **Onboarding in-gameplay** — `OnboardingHints` (hint contestuali skippabili)
- [x] **Audio** — AudioManager persistente, musica per-scena lazy, enum SFX
- [x] **Build/pack** — `pack:crazygames`/`pack:gamedistribution`, optimize-images, patch-html, deploy GitHub Pages

---

## FASE 1 — Prototipo arena + launcher 🔄 *(in corso — dal 2026-06-19)*

**Obiettivo**: arena responsive con prospettiva e lancio della runa "che si sente bene". È il greybox dell'**infrastruttura di gioco** (non ancora del core meccanico).

### Fatto

- [x] **Arena responsive** — `FitScale` (scala uniforme) su Arena; Background + ArenaSprite figli di Arena
- [x] **Prospettiva modello B** (vera 1-punto) — fisica piatta in ground space + render omografico; X converge verso l'alto, rune rimpiccioliscono/convergono; `config/Perspective.ts` (projectX/Y, sizeX/Y, unproject)
- [x] **Bordi Box2D rounded-rect** — `ArenaBounds` costruito direttamente in ground space; trapezio visibile proiettato
- [x] **Launcher slingshot** — `StoneLauncher`: ancorato al nodo launcher, spawn + traiettoria + direzione derivati dalla sua posizione; velocità via Jacobian dell'inversa omografica; ±67.5°
- [x] **Runa come prefab** — `Rune` + `Stone` mapper; corpo Box2D ruota → nodo `rotation`; angolo pieno ±180 via `atan2` dal quaternione
- [x] **NEXT completo** — gemma casuale (`numGemTypes=3`) + anteprima del prossimo + animazioni pop-in/out a fasi; **swap al tap** sul NEXT; reload del loaded ritardato 1s; **no-spin** al lancio
- [x] **Traiettoria** — pallini piatti (ellisse ground-tilt) colorati per gemma, renderizzati **dietro** al launcher, coda allungata (3000 step, alpha floor 120)
- [x] Debug OFF in scena (`debugStones=false`, `ArenaBounds.showDebugOutline=false`)
- [x] Parametri calibrati e gotcha documentati in **MEMO.md → sezione FunKoolkan**
- [x] **Strumenti di authoring (v0.2.1)** — `EditMode` (drag stone) + `EditPanel` (palette rune: drag→spawn su arena, **SAVE/LOAD** layout in localStorage) + **toggle DEBUG globale** (`DebugDraw`, persistito) + `Rune.gemType` impostabile da editor (enum `RuneKind`). Coordinamento EditMode↔EditPanel via modulo `EditState` (niente reference da cablare). Trigger curling rifinito: scatta **solo quando la stone si ferma** sul TEE (`CurlingScorer` `restSpeed=10`).

### Aperti (da chiudere per dichiarare la Fase 1 conclusa)

- [ ] **Shear della gemma** dalla scala anisotropa (`gem.scale.y=0.5` × `sizeYFactor`): la rotazione del corpo è corretta (±180), ma una rotazione dentro scala non uniforme si renderizza distorta. **Scelta di design** da prendere: (A) arte gemma piatta/radiale, (B) split base/gemma, (C) niente rotazione della gemma. Vedi MEMO §gotcha.
- [ ] **Rimuovere i file warrior-only orfani** — `InputController`, `Warrior`, `SpawnManager`, i 4 powerup-effect (+sparkle), `DebugPanel`, `OnboardingHints`-merge: codice morto dopo lo svuotamento del `GameManager` (non rompono la build). ⚠️ **Tenere** gli effetti/Settings/pannelli riusabili.
- [x] **Refactor architetturale** (sessione 2026-06-21): split `StoneLauncher`/`NextPreview`/`ArenaManager`, `GameManager` svuotato a placeholder, `DepthSort`, `config/RuneTypes.ts`.

> Modello prospettico C (taper mite) resta nel git history (`f61282b`) se servisse tornare indietro.

---

## FASE 2 — Core v0.4: colonne / Aku / risveglio 🔄 *(in corso — il "make-or-break")*

**Obiettivo**: validare il **feel** del loop che fa vivere o morire il gioco — **doppia pressione** (gauge di risveglio vs overflow) + soddisfazione del colpo curling→`RaisingStar`→colonna. Tutto in greybox (rune-gemma semplici, colonne/Koolkan placeholder).

### Pre-requisito: chiudere le decisioni di design (GDD §22)

- [ ] **Danno a Koolkan all'ultimo round** (probabile: colonne giù → star **retargettano** Koolkan)
- [ ] **Numeri**: HP per pietra, pietre per colonna, di quanto si alza al round-up, n° Aku/pietre per chiudere il round
- [ ] **Raggio catena fuori-house** ("quasi a contatto")
- [ ] **N° colori iniziale + scaling per round**
- [ ] **N° / comportamento moai-spawner** (quanti, ritmo, colore) + relazione con lo spawn-rune di Koolkan sveglio
- [ ] **Tipi di bomba** esatti (oltre raggio / colore)
- [ ] **Formula punteggio** (star/pietra/Aku + combo + completamento round + abbattimento)
- [ ] **Prefill iniziale** dell'arena
- [ ] Aggiornare **GDD §22** man mano che si chiudono

### Già in repo (riusare, non riscrivere)

- [x] **Detection HOUSE/TEE** — `House.ts` (zone = ellisse dello sprite a schermo, no Box2D); getter `houseArea`/`teeArea`, `collectStonesInHouse/OnTee`
- [x] **Trigger curling** — `CurlingScorer` (stone **Dynamic** ferma sul TEE sotto `restSpeed` per `restDelay`s)
- [x] **`RaisingStar`** — la stone colpita svanisce in star che vola lungo una bezier nel bersaglio (v0.2.8: **cubo-colonna più in alto dello stesso colore**; mira al centro della faccia rivolta al giocatore)
- [x] **VFX** — `ManaLightning` (bolt a sprite-segmento), `SparkBurst`/`ImpactFlash` (da `resources`), white hit-flash (`SpriteFlash.effect` + `Stone.flashWhite`)
- [x] **Aku** — `AkuAku` (anim hop/squash, ombra, blink, 8 varianti) + `AkuAkuSpawner` (NodePool, corpo Box2D) + `AkuAkuBehavior` (wander/dance/hit/eliminate) + morte elettrizzata/calciato-fuori (v0.2.5)

### Da fare — il colpo e le colonne *(nuovo)*

- [x] **Colonne sacre** *(v0.2.7 scaffold + v0.2.8 HP)* — `ColumnCube`/`Column`/`RoundManager`; pila marcata per colore; **3 HP per cubo** (`HP_MAX`), flash+rimbalzo al colpo, shatter a 0; resta da posare le 2 colonne ai lati dell'altare + tarare HP/altezze
- [x] **Bersaglio star = SOLO pietre-colonna dello stesso colore** *(v0.2.8)* — `RaisingStar` mira al **cubo più in alto** dello stesso `type` (registro `ColumnCube.all` + `reserve`/`release`: quantità prenotata ≤ HP, altrimenti scende al cubo dopo; ri-target a mezz'aria); niente più Aku/Koolkan
- [x] **Catena fuori-house** *(2026-06-26 ter, NON buildato)* — `CurlingScorer` ora **propaga la scossa**: ogni stone colpita la passa a tutte le stone **stesso-tipo** con **gap bordo-bordo < 1/4 del proprio diametro** (`CHAIN_REACH=0.5`×raggio, ground space). BFS ricorsiva (`_shock`/`_propagate`/`_staggerDelay`) con `Set` anti-doppione; ogni anello ha il suo bolt staggerato e diventa `RaisingStar`. Raggio ancora da tarare in playtest
- [ ] **No-match → valvola** — se non esiste pietra-colonna di quel colore, lo star **non parte** ma la stone sul TEE (+ connesse nell'HOUSE) si distrugge comunque (anti-overflow color-indipendente)
- [ ] **Pietra-colonna con HP** — più colpi per romperla; al crollo, l'**Aku sopra si elettrizza** (collegamento colonna→Aku presente)

### Da fare — Aku e gauge di risveglio *(nuovo)*

- [ ] **Aku in preghiera sulla colonna** — gli Aku salgono e si posizionano sulle colonne (oggi vagano in arena) → nuovo stato "preghiera"
- [ ] **Gauge di risveglio** — ogni Aku in preghiera emette **1 spirito/5s**; **10 spiriti totali → risveglio**; gauge **monotòna**, reset solo al round-up; VFX **spirito che vola** dalla colonna a Koolkan
- [ ] **Stati Koolkan** — **dormiente** → **sveglio** (boato) → comincia a **far spuntare rune** a ritmo crescente

### Validazione

- [ ] Playtest interno del feel: la **doppia pressione** (gauge vs overflow) è eccitante o opprimente? centrare il TEE col curling è soddisfacente? la catena breve è giusta?
- [ ] **Milestone Fase 2**: il core "lancia → fermi sul TEE → `RaisingStar` sulle colonne → Aku giù → tieni Koolkan addormentato" è giocabile e *si sente bene* in greybox

---

## FASE 3 — Loop completo greybox ⬜

**Obiettivo**: tutto il loop di gioco giocabile in greybox — boss/risveglio, round, ricostruzione colonne, bombe, spawner, overflow, punteggio.

### Boss Koolkan — risveglio e abbattimento (il hook di marketing)

- [ ] **Gauge di risveglio = "meter" della missione** nell'HUD (10 spiriti); telegrafata forte
- [ ] **Koolkan sveglio** spawna rune a ritmo crescente (pressione verso l'overflow) — **non** è un fail
- [ ] **Riaddormentamento = completare il round** (abbattere le colonne) → **round-up** che resetta tutto (Koolkan dorme, gauge azzerata)
- [ ] **Abbattimento Koolkan SOLO all'ultimo round** (risveglio inevitabile) — meccanismo finale (probabile retarget star a colonne giù), **TBD §22**

### Round e colonne

- [ ] **Round progression** — riuso del sistema a round di FunWarriors; **completare il round = abbattere le 2 colonne**
- [ ] **Ricostruzione colonne più alte** al round-up (più pietre/HP)
- [ ] **Scaling per round** (GDD §13): colonne più alte/HP, più Aku / ritmo di preghiera, più colori, ritmo spawner, timer di lancio

### Statue-attori dell'arena

- [ ] **Idolo di Make-make** — colpito → sblocca **bomba** sul prossimo lancio → cooldown (visivamente "spento")
- [ ] **Bombe** — a raggio (distrugge tutto nel raggio) e di colore (distrugge tutte le rune del colore colpito); tipi finali da §22
- [ ] **Moai-spawner** (nemici) — immettono nuove rune nel tempo, ritmo crescente = la pressione (coordinato con lo spawn di Koolkan sveglio)

### Fine partita

- [ ] **Overflow → game over** — riuso della logica "linea/soglia dinamica" di FunWarriors; soglia e feedback da tarare
- [ ] **Punteggio** — implementare la formula decisa in §22 (star/pietra/Aku + combo + completamento round + bonus abbattimento); riuso dei tier floating score
- [ ] **Milestone Fase 3**: loop completo `lancio → TEE → RaisingStar → colonne giù → round up (Koolkan dorme)`, con risveglio/bombe/spawner/overflow, in greybox

---

## FASE 4 — Reskin asset + UI (Rapa Nui cartoon) ⬜

**Obiettivo**: il gioco assomiglia al prodotto finale. Stile **cartoon simpatico** (Super Mario / Puzzle Bobble), tema **Isola di Pasqua**, fondo **blu-grigio-scuro**.
> Regola ferrea: ogni elemento visivo è **prefab autorato in editor** (no disegno programmatico, no `Graphics` se non per debug). Vedi CLAUDE.md.

- [ ] **Direzione artistica finale** — livello di stilizzazione, palette gemme definitiva
- [ ] **Runa** — 1 base rotonda di pietra + N gemme luminose colorate (N = n° colori) + micro-glifi (ridondanza daltonici)
- [ ] **Statue/entità** (~6-7 asset + stati): **Koolkan** (boss, stati **dormiente/sveglio/abbattuto**), idolo **Make-make** (carica/scarica), **colonne sacre** (pietre marcate per colore, varie altezze), **Aku-aku** (8 varianti già scaffolded, v0.2.5), **moai-spawner**. *(Moai Alba/Tramonto solo se si riattiva il circuito — Appendice A.)* Distinte per **scala + luce + gemma**
- [ ] **Background** — isola/ahu vulcanico, fondo blu-grigio-scuro (fa risaltare le scariche)
- [ ] **VFX chiave** — la **scarica `RaisingStar`** dalla casa alle colonne + il **risveglio del colosso**: differenziatore visivo e **screenshot di copertina**. + esplosione bomba, dissoluzione rune, **pietra-colonna che si sbriciola**, **Aku elettrizzato**, **spirito di preghiera** che sale a Koolkan
- [ ] **HUD** — **gauge di risveglio** (nuovo, prominente) + **stato colonne** + reskin pannelli ereditati (MainMenu/End/Pause/Settings/Ranking)
- [ ] **Audio reskin** Rapa Nui/polinesiano — whoosh di pietra, runa sul TEE, **scarica `RaisingStar`** (suono-chiave), pietra-colonna che si sbriciola, **preghiera degli Aku** + Aku elettrizzato, bomba, **risveglio di Koolkan** (boato), abbattimento, overflow heartbeat/tamburo; 1-2 loop musicali a tema
- [ ] **Milestone Fase 4**: look e audio finali; la thumbnail telegrafa **Koolkan che si risveglia + `RaisingStar` sulle colonne**

---

## FASE 5 — Polish, juice, bilanciamento ⬜

**Obiettivo**: il gioco si sente "premium" ed è divertente da rigiocare.

- [ ] **Juice** — riadattare VFX ereditati (screen shake, slowmo, floating score tier, trail) a `RaisingStar`/colonne/bombe/risveglio
- [ ] **Onboarding in-gameplay** reskinnato — colonne + gauge di risveglio telegrafate forte, hint contestuali
- [ ] **Interferenze di Koolkan** ⏸️ (end-game): pietrificazione rune (inerti), scambio colore di rune/spawner (round avanzati)
- [ ] **Playtest con 5-10 persone esterne** (il test più importante — non saltare)
- [ ] **Bilanciamento**: HP/altezza colonne per round, soglie gauge, raggio catena, n° Aku/ritmo preghiera, ritmo spawner, curva timer, soglia overflow
- [ ] **Milestone Fase 5**: esperienza rifinita e divertente ripetutamente

---

## FASE 6 — Pubblicazione ⬜

**Obiettivo**: gioco pubblicato sui portali. Infrastruttura SDK già pronta dalla Fase 0.

### Pre-submission

- [ ] **deep-research #3** sull'originalità del **core v0.4** (angolo **tower-defense + physics-shooter**) — le due ricerche 06-19/20 erano sul *core a circuito*, ora superato

### Leaderboard online (quando serve)

- [ ] **Nuovo progetto Firebase** per FunKoolkan + config in `LeaderboardConfig` (chiavi + `BACKEND='firestore'`) — oggi `'mock'`
- [ ] In alternativa: leaderboard nativa del portale (CrazyGames/Poki) lato admin

### Portali e marketing

- [ ] [manuale] Registrare il gioco su CrazyGames/Poki/GameDistribution + impostare il `gameId` relativo
- [ ] **Thumbnail** (cruciale per l'originalità percepita): telegrafa **Koolkan che si risveglia + scarica `RaisingStar` sulle colonne** (+ Aku), moai inconfondibili, nessuna iconografia da "bubble/color matcher"
- [ ] Screenshots gameplay (3-5) + trailer GIF breve (lancio → TEE → `RaisingStar` → colonna che crolla → Aku che cade)
- [ ] Descrizione EN + tag (puzzle, physics, arcade — **evitare** "bubble")
- [ ] Build ottimizzata (<20MB), test cross-browser + device reali
- [ ] **Submit** + iterare su feedback portale

> NB: la pubblicazione di FunWarriors (gioco GD #73510, SDK verificato) resta nel progetto **FunWarriors** separato. Qui si riparte da zero come prodotto.

---

## Rischi principali e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| **Feel del core**: centrare il TEE col curling difficile/fortuito | Alta | Alto | Prototipare per primo (Fase 2); anteprima traiettoria; il tee-shot **pulisce sempre** (anche senza match colonna) → mai uno spreco totale |
| **Catena fuori-house troppo lunga svuota l'arena** | Media | Medio | Tenerla "quasi a contatto" (raggio corto), così l'overflow resta una minaccia |
| **Doppia pressione (gauge + overflow) opprimente** | Media | Alto | Telegrafare bene la gauge; il risveglio è recuperabile completando il round (non un fail) |
| **Restare a secco del colore giusto** = frustrazione | Media | Medio | NEXT eventualmente pesato verso i colori delle colonne; la gauge dà tempo; bombe come valvola |
| **Primo impatto "ennesimo color matcher"** (motivo del rifiuto FunWarriors) | Media | Alto | Boss/colonne/Aku/`RaisingStar` dominanti in anteprima e primi 10s; tema moai inconfondibile; fondo freddo; deep-research #3 |
| **Shear gemma / rotazione in prospettiva** | Media | Basso | Scelta di design in Fase 1 (arte piatta / split / no-rotazione) |
| **Asset art (cartoon coerente: Koolkan + colonne + Aku + idolo + N gemme + VFX)** | Media | Medio | Greybox prima; commissionare/AI-gen dopo aver validato il feel |
| **Scope creep** | Alta | Alto | Rispettare "out of scope v1" (GDD §21); interferenze di Koolkan e bonus circuito sono end-game/parcheggiati |

---

## Prossime azioni concrete

> Aggiornato al 2026-06-26 — app v0.2.7. Core ridefinito a **v0.4** (loop colonne/Aku/risveglio, GDD §5-§6): design formalizzato, prossimo blocco = implementarlo sul codice esistente (curling/`RaisingStar`/Aku già in repo). Fase 1 quasi chiusa (resta shear gemma + ritiro `InputController`).

1. **Implementare il core v0.4** (Fase 2): **colonne sacre** (prefab + HP) + target star = **pietre-colonna** stesso-colore (oggi mira Aku/Koolkan) + **elettrif. Aku** sulla colonna colpita + ~~catena fuori-house~~ ✅ fatta + **ricostruzione colonne più alte** al round-up.
2. **Aku in preghiera + gauge di risveglio** (10 spiriti, 1/5s per Aku) + stati **sleep/wake** di Koolkan + **spawn-rune** di Koolkan sveglio.
3. **Chiudere i TBD** (GDD §22): danno a Koolkan all'ultimo round, numeri (HP pietre / soglie gauge / raggio catena / n° Aku-pietre per round), n° colori + scaling, spawner, bombe, punteggio, prefill.
4. **Validare il feel** (Milestone Fase 2): doppia pressione, curling soddisfacente, catena breve giusta.
5. Poi: loop completo (Fase 3: bombe Make-make, overflow, punteggio, boss finale), reskin (Fase 4), polish (Fase 5).
6. **Chiudere la Fase 1**: strategia anti-shear della gemma; ritirare `InputController` e i file warrior-only orfani.
7. **Pre-submission**: deep-research #3 sul core v0.4.

---

## Appendice A — ⏸️ Bonus futuro: circuito di mana (parcheggiato 2026-06-22)

> Core originale (GDD v0.3), **parcheggiato** perché "collegare i poli" non divertiva. Il codice resta in repo; riattivabile come **modalità/bonus**. Dettagli design in GDD §6/§9 (marcate parcheggiate) e memoria `project-glue-mechanic`.

**Già implementato (riusabile se si riattiva):**
- [x] **Poli Alba/Tramonto** (`Magnet` sul nodo in editor) — corpo circolare KINEMATIC solido + magnetico per qualsiasi colore
- [x] **Magnetismo + connettività** (`Magnet`, modello **PETRIFICAZIONE** ispirato a SuperSlide15) — attrazione a corto raggio verso il magnete valido più vicino → near-still 2s → **pietrifica** (snap + `Static`); **albero `parent`** radicato ai poli = la catena; niente forza al contatto (no jitter). Vedi MEMO §Magnetismo
- [x] **Tolleranza di conduzione** = `snapGap` + `petrifyDelay`/`petrifyMaxSpeed`

**Mancava (se si riattiva):**
- [ ] **Chiusura del circuito** — check "stessa catena monocromatica tocca Alba E Tramonto" (camminando l'albero) → **ondata di mana** → dissoluzione catena (+punti)
- [ ] **Path che si illumina** durante la costruzione
- [ ] **Poli avanzati**: cambiano posizione ogni round → mobili → lanciabili

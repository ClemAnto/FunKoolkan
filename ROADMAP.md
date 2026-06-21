# Roadmap Tecnica — FunKoolkan

> Piano di sviluppo per fasi (Cocos Creator 3.8.8, TypeScript). Stima realistica part-time (~10-15h/sett).
> **Riscritta da zero il 2026-06-21** per il design rifondato (GDD v0.3: tema Rapa Nui/moai, core = **circuito di mana**, boss **Koolkan** a scudo, **niente merge**).
> La vecchia roadmap FunWarriors (gameplay merge-based) è stata sostituita: la sua storia dettagliata resta nel git history del progetto FunWarriors e nei commit pre-fork.

## Stack tecnologico

- **Engine**: Cocos Creator 3.8.8
- **Linguaggio**: TypeScript (strict mode)
- **Fisica**: Box2D (gravità = 0; arena fisica piatta in *ground space* + render omografico — prospettiva modello B)
- **Build target**: HTML5 (Web Mobile + Desktop), portrait primario 720×1280
- **SDK portale**: CrazyGames (primario) / Poki / GameDistribution — adapter ereditati
- **Version control**: Git
- **Versione attuale**: **v0.1.23**

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
| 2. Core meccanico — circuito di mana | Conduzione + magnetismo + poli + scarica (il "make-or-break") | ⬜ prossima |
| 3. Loop completo greybox | Boss/scudo + bombe + spawner + round + game-over + punteggio | ⬜ |
| 4. Reskin asset + UI (Rapa Nui cartoon) | Look finale + VFX scarica di mana | ⬜ |
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

### Aperti (da chiudere per dichiarare la Fase 1 conclusa)

- [ ] **Shear della gemma** dalla scala anisotropa (`gem.scale.y=0.5` × `sizeYFactor`): la rotazione del corpo è corretta (±180), ma una rotazione dentro scala non uniforme si renderizza distorta. **Scelta di design** da prendere: (A) arte gemma piatta/radiale, (B) split base/gemma, (C) niente rotazione della gemma. Vedi MEMO §gotcha.
- [ ] **Ritirare `InputController`** (legacy, inerte): cerca ancora `Crossbow` per nome → warning innocuo. Rimuoverlo o sostituirlo con l'input del nuovo launcher.

> Modello prospettico C (taper mite) resta nel git history (`f61282b`) se servisse tornare indietro.

---

## FASE 2 — Core meccanico: circuito di mana ⬜ *(prossima — il "make-or-break")*

**Obiettivo**: validare il **feel** della meccanica che fa vivere o morire il gioco — conduzione monocromatica + magnetismo + poli fissi. Tutto in greybox (rune-gemma colorate semplici, poli a placeholder). È il prototipo che la deep-research indica come priorità assoluta.

### Pre-requisito: chiudere le decisioni di design (GDD §22)

- [ ] **N° colori iniziale + scaling per round** (leva di difficoltà principale)
- [ ] **N° / comportamento moai-spawner** (quanti, ritmo, colore sputato)
- [ ] **Tipi di bomba** esatti (oltre raggio / colore)
- [ ] **Formula punteggio** (per-scarica scalata su lunghezza catena + combo + abbattimento)
- [ ] **Prefill iniziale** dell'arena
- [ ] Aggiornare **GDD §22** man mano che si chiudono

### Conduzione e poli

- [x] **Poli Alba/Tramonto** (dawn/sunset) — `@property` su StoneLauncher; ognuno ha un **corpo fisico circolare KINEMATIC** in ground space (le stone ci si appoggiano) + è magnetico per **qualsiasi** colore (classe `Magnet`, 2026-06-21)
- [x] **Magnetismo / connettività** (classe `Magnet`) — BFS sul contact-graph in ground space: stone vicina a un polo → `connected` (qualsiasi colore); espansione a stone dello **stesso colore** → diventano calamite same-color. Pull monodirezionale con **hold forte al contatto** (coppie attaccate difficili da separare, come richiesto) + settle-damping sui cluster. Riusa il modello forza del merge ereditato (`applyForceToCenter`, normalizzato 60fps). Vedi MEMO §Magnetismo
- 🔄 **Tolleranza di conduzione** — implementata come `magnetContactGap` (soglia "vicine conducono"); resta da **tarare** in playtest
- [ ] **Chiusura del circuito** → rilevare quando una catena monocromatica tocca **entrambi** i poli → **ondata di mana** lungo il path → **dissoluzione** dell'intera catena (+punti). *(La connettività per-polo c'è già; manca il check "stessa catena tocca Alba E Tramonto" + l'output dissoluzione)*
- 🔄 **Magnetismo same-color — taratura**: ⚠️ ora il pull è forte al contatto (per "non si separano"); va verificato in play che il pull a lungo raggio resti un **nudge** che non auto-assembla la catena al posto del giocatore (tarare `magnetForce`/`magnetRange`)
- [ ] **Path che si illumina** durante la costruzione (onboarding visivo, anche greybox)

### Validazione

- [ ] Playtest interno del feel: la catena via fisica è divertente o caotica? magnetismo giusto? i colori-ostacolo creano profondità?
- [ ] **Milestone Fase 2**: il core "lancia → costruisci ponte monocromatico → scarica" è giocabile e *si sente bene* in greybox

---

## FASE 3 — Loop completo greybox ⬜

**Obiettivo**: tutto il loop di gioco giocabile in greybox — boss, bombe, spawner, round, overflow, punteggio.

### Boss Koolkan + scudo (il hook di marketing)

- [ ] **Koolkan** (placeholder) con **scudo a lastre/tacche** visibili = "meter" della missione nell'HUD
- [ ] Ogni **ondata di mana** danneggia lo scudo (entità ∝ lunghezza catena — da tarare)
- [ ] Scudo esaurito → colpire Koolkan con runa a **traiettoria libera** (linea di tiro non ostruita) → **abbattimento** → round up

### Statue-attori dell'arena

- [ ] **Idolo di Make-make** — colpito → sblocca **bomba** sul prossimo lancio → cooldown (visivamente "spento")
- [ ] **Bombe** — a raggio (distrugge tutto nel raggio) e di colore (distrugge tutte le rune del colore colpito); tipi finali da §22
- [ ] **Moai-spawner** (nemici) — immettono nuove rune nel tempo, ritmo crescente = la pressione

### Progressione e fine partita

- [ ] **Round progression** — riuso del sistema a round di FunWarriors; ogni round abbatte Koolkan per avanzare
- [ ] **Scaling per round** (GDD §13): più lastre scudo, più colori, ritmo spawner, posizione poli, timer di lancio
- [ ] **Timer di lancio** che si riduce coi round (riuso ereditato)
- [ ] **Overflow → game over** — riuso della logica "linea/soglia dinamica" di FunWarriors; soglia e feedback da tarare
- [ ] **Punteggio** — implementare la formula decisa in §22 (per-scarica + combo + bonus abbattimento); riuso dei tier floating score
- [ ] **Milestone Fase 3**: loop completo `lancio → circuito → scarica → scudo → abbatti → round up`, con bombe/spawner/overflow, in greybox

---

## FASE 4 — Reskin asset + UI (Rapa Nui cartoon) ⬜

**Obiettivo**: il gioco assomiglia al prodotto finale. Stile **cartoon simpatico** (Super Mario / Puzzle Bobble), tema **Isola di Pasqua**, fondo **blu-grigio-scuro**.
> Regola ferrea: ogni elemento visivo è **prefab autorato in editor** (no disegno programmatico, no `Graphics` se non per debug). Vedi CLAUDE.md.

- [ ] **Direzione artistica finale** — livello di stilizzazione, palette gemme definitiva
- [ ] **Runa** — 1 base rotonda di pietra + N gemme luminose colorate (N = n° colori) + micro-glifi (ridondanza daltonici)
- [ ] **Statue** (~5-6 asset + stati): Moai Alba (solare), Moai Tramonto (lunare), idolo Make-make (carica/scarica), Koolkan (boss, scudo a lastre, fasi), moai-spawner. Distinte per **scala + luce + gemma**
- [ ] **Background** — isola/ahu vulcanico, fondo blu-grigio-scuro (fa risaltare l'arco di mana)
- [ ] **VFX chiave — ondata/scarica di mana** lungo il path: è il differenziatore visivo e **lo screenshot di copertina**. + esplosione bomba, dissoluzione gemme, lastra scudo che si stacca, abbattimento boss
- [ ] **HUD scudo** (nuovo, prominente) + reskin pannelli ereditati (MainMenu/End/Pause/Settings/Ranking)
- [ ] **Audio reskin** Rapa Nui/polinesiano — whoosh di pietra, click di mana, **scarica** (suono-chiave), bomba, scudo che si frantuma, abbattimento, overflow heartbeat/tamburo; 1-2 loop musicali a tema
- [ ] **Milestone Fase 4**: look e audio finali; la thumbnail telegrafa scarica Alba↔Tramonto + scudo che si rompe

---

## FASE 5 — Polish, juice, bilanciamento ⬜

**Obiettivo**: il gioco si sente "premium" ed è divertente da rigiocare.

- [ ] **Juice** — riadattare VFX ereditati (screen shake, slowmo, floating score tier, trail) alla scarica/scudo/bombe
- [ ] **Onboarding in-gameplay** reskinnato — poli telegrafati forte, path illuminato, hint contestuali
- [ ] **Interferenze di Koolkan** ⏸️ (end-game): pietrificazione gemme, scambio colore (round avanzati)
- [ ] **Poli avanzati** ⏸️: cambiano posizione ogni round → mobili → lanciabili
- [ ] **Playtest con 5-10 persone esterne** (il test più importante — non saltare)
- [ ] **Bilanciamento**: n° colori/round, ritmo spawner, forza/raggio magnetismo, lastre scudo per round, curva timer, soglia overflow
- [ ] **Milestone Fase 5**: esperienza rifinita e divertente ripetutamente

---

## FASE 6 — Pubblicazione ⬜

**Obiettivo**: gioco pubblicato sui portali. Infrastruttura SDK già pronta dalla Fase 0.

### Leaderboard online (quando serve)

- [ ] **Nuovo progetto Firebase** per FunKoolkan + config in `LeaderboardConfig` (chiavi + `BACKEND='firestore'`) — oggi `'mock'`
- [ ] In alternativa: leaderboard nativa del portale (CrazyGames/Poki) lato admin

### Portali e marketing

- [ ] [manuale] Registrare il gioco su CrazyGames/Poki/GameDistribution + impostare il `gameId` relativo
- [ ] **Thumbnail** (cruciale per l'originalità percepita): telegrafa **scarica Alba↔Tramonto + scudo che si rompe**, moai inconfondibili, nessuna iconografia da "bubble/color matcher"
- [ ] Screenshots gameplay (3-5) + trailer GIF breve (lancio → ponte → scarica → scudo che crolla)
- [ ] Descrizione EN + tag (puzzle, physics, arcade — **evitare** "bubble")
- [ ] Build ottimizzata (<20MB), test cross-browser + device reali
- [ ] **Submit** + iterare su feedback portale

> NB: la pubblicazione di FunWarriors (gioco GD #73510, SDK verificato) resta nel progetto **FunWarriors** separato. Qui si riparte da zero come prodotto.

---

## Rischi principali e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| **Feel del core**: catena monocromatica via fisica caotica/fortunosa | Alta | Alto | Prototipare per primo (Fase 2); magnetismo same-color + mira con traiettoria + tolleranza conduzione |
| **Magnetismo banalizza il puzzle** | Media | Alto | Nudge a corto raggio, tarato in prototipo; colori-ostacolo come profondità |
| **Primo impatto "ennesimo color matcher"** (motivo del rifiuto FunWarriors) | Media | Alto | Boss/scudo/scarica dominanti in anteprima e primi 10s; tema moai inconfondibile; fondo freddo |
| **Shear gemma / rotazione in prospettiva** | Media | Basso | Scelta di design in Fase 1 (arte piatta / split / no-rotazione) |
| **Asset art (cartoon coerente, ~6 statue + N gemme + VFX)** | Media | Medio | Greybox prima; commissionare/AI-gen dopo aver validato il feel |
| **Scope creep** | Alta | Alto | Rispettare "out of scope v1" (GDD §21); interferenze/poli mobili sono end-game (Fase 5) |

---

## Prossime azioni concrete

> Aggiornato al 2026-06-21 — v0.1.23. Fase 1 (prototipo arena/launcher) quasi chiusa: restano shear gemma + ritiro InputController. Fase 2 (core circuito di mana) è il prossimo blocco e la priorità di rischio #1.

1. **Chiudere la Fase 1**: decidere la strategia anti-shear della gemma; ritirare `InputController`.
2. **Chiudere i TBD di design** (GDD §22): n° colori + scaling, spawner, tipi bomba, punteggio, prefill — bloccano la Fase 2.
3. **Prototipo greybox del core** (Fase 2): conduzione (flood-fill monocromatico sul contact graph) + magnetismo same-color + poli fissi + scarica → **validare il feel**.
4. Solo dopo la validazione del feel: loop completo (Fase 3), poi reskin (Fase 4).
</content>
</invoke>

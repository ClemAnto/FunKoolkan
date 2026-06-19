# Game Design Document — FunWarriors

> Documento sintetico di game design. Versione 0.1 — da aggiornare durante lo sviluppo.

## 1. Concept in una frase

Un puzzle-arcade ibrido tra Suika Game e curling: lanci animaletti-guerrieri su una pista in salita, quelli uguali si attraggono e si fondono evolvendo, con progressione a round stile Tetris.

## 2. Pitch (per Poki/CrazyGames)

> Lancia i tuoi animaletti-guerrieri sulla pista del torneo! Quando due eroi uguali si toccano, si fondono in un guerriero più forte. Riempi la pista di evoluzioni, raggiungi il livello massimo della specie per scatenare un'esplosione di punti, ma attento: se un personaggio supera il nastro rosso, è game over!

## 3. Riferimenti

- **Suika Game** — meccanica core di merge per contatto
- **Tetris** — progressione per livelli con difficoltà e varietà crescente
- **Puzzle Bobble** — stile di lancio: fionda dal basso verso l'alto con controllo angolo+forza
- **Curling / Petanque** — attrito, mira, fisica di scivolamento
- **Biliardo** — rimbalzi laterali, prospettiva pseudo-3D

## 4. Target

- Piattaforma primaria: **Poki / CrazyGames** (portali HTML5 occidentali)
- Età: **8-14 anni** (sweet spot Poki), gender-neutral
- Dispositivi: desktop + mobile + tablet
- Orientamento: **portrait primario** (720×1280), landscape come adattamento
- Layout pista: altezza = `min(75% altezza schermo, 10/6 × 95% larghezza)`, larghezza = `altezza × 6/10 × 1.2` (≈691px a design 720×1280 — vedi `initLayout()` in Track.ts e COCOS.md), agganciata in basso al centro — si adatta a qualsiasi viewport senza bande nere
- Sessioni attese: **2-20 minuti** per partita, "una partita ancora" effect

## 5. Loop di gioco

1. La partita inizia con **3 warrior prefill** già posizionati nella parte alta della pista (tipi 0, 1, 2 — un warrior per tipo), dando al giocatore targets immediati per il merge
2. Il giocatore vede un personaggio in attesa di lancio (bottom center) e l'anteprima del prossimo (NEXT)
3. Mira con drag (angolo + forza visualizzati come freccia)
4. Rilascia → il personaggio scivola sulla pista
5. La pista è in **leggera salita verso il fondo (alto)** (finzione visiva): il damping rallenta e ferma il personaggio in alto — nessuna gravità fisica (vedi §9)
6. Personaggi dello stesso tipo+livello che si trovano vicini si **attraggono magneticamente** (raggio corto)
7. Dopo qualche centinaio di millisecondi di contatto, **due personaggi uguali si fondono** al centro nella loro evoluzione successiva
8. Il giocatore continua a lanciare, accumulando punti per ogni merge
9. **Game over** — tre casi distinti:
   - Il warrior lanciato **colpisce altri warrior già in gioco** e non supera la linea → game over immediato
   - Il warrior lanciato **non colpisce nessuno** e non supera la linea → malus punteggio + warrior riportato al launcher con fisica resettata
   - Un warrior già in gioco (crossedLine) il cui **centro scende sotto la linea** → game over immediato

## 6. Sistema di evoluzione

### Catena per ogni specie

Ogni specie ha una catena evolutiva a **4 livelli base**. Leone e Drago proseguono rispettivamente fino al livello 5 e al livello 6; quando una fusione supera il livello massimo della specie, la creatura **esplode** con bonus punti.

| Livello | Nome | Equipaggiamento | Raggio | Diametro | Note |
|---------|------|-----------------|--------|----------|------|
| 1 | **Cucciolo** | Nessun accessorio | 18px | 36px | Punto di partenza |
| 2 | **Apprendista** | Arma e scudo di legno | 22px | 44px | +22% diametro |
| 3 | **Soldato** | Arma vera (piccola) | 26px | 52px | +18% diametro |
| 4 | **Guerriero** | Elmetto/copricapo + arma più imponente | 31px | 62px | +19% diametro |
| 5 | **Campione** | — | 37px | 74px | +19% diametro, esplosione |
| 6 | **Eroe** | — | 45px | 90px | +22% diametro, esplosione |
| 7 | **Leggenda** | — | 54px | 108px | +20% diametro, esplosione |

### Specie disponibili (7 totali)

| # | Specie | Colore | Stile | Arma | Livello max 💥 | Introdotta al round |
|---|--------|--------|-------|------|----------------|---------------------|
| 1 | Rana | Verde | Agile | Pugnale | 3 — Soldato | 1 |
| 2 | Gatto | Arancione | Agile | Spada | 3 — Soldato | 1 |
| 3 | Gallina | Bianca | Comica | Lancia | 3 — Soldato | 1 |
| 4 | Lupo | Grigio | Robusto | Ascia | 4 — Guerriero | 3 |
| 5 | Aquila | Marrone | Fiera | Arco | 4 — Guerriero | 5 |
| 6 | Leone | Dorato | Regale | Mazza | 5 | 7 |
| 7 | Drago | Viola | Maestoso | Scettro di fuoco | 6 (vittoria) | 9 |

> 💥 = quando due warrior dello stesso tipo al livello max si fondono, la creatura risultante esplode con bonus punti (anziché restare in gioco).
> L'ordine 1→7 riflette la scala di rarità/potenza percepita, introdotta col progredire dei round.

### Regole di merge

- Si fondono **solo personaggi della stessa specie E dello stesso livello evolutivo**
- Una rana livello 2 + una rana livello 2 → una rana livello 3
- Una rana livello 2 + un gatto livello 2 → niente, restano separati
- Una rana livello 2 + una rana livello 3 → niente, restano separati

## 7. Progressione del gioco (round)

Stile Tetris: il gioco è endless ma diviso in **round di difficoltà crescente**. Si avanza al round successivo raggiungendo un numero di merge.

| Round | Specie disponibili | Personaggi lanciabili | Timer lancio | Note |
|-------|---------------------|------------------------|--------------|------|
| 1-2 | 3 specie (Rana, Gatto, Gallina) | Solo livello 1 | ~15s | Tutorial implicito, pace lento |
| 3-4 | 4 specie (+ Lupo) | Livello 1-2 | ~10s | Aumenta varietà |
| 5-6 | 5 specie (+ Aquila) | Livello 1-2 | ~8s | Drop più frequenti |
| 7-8 | 6 specie (+ Leone) | Livello 1-3 | ~5s | Difficoltà media-alta |
| 9-10 | 7 specie (+ Drago) | Livello 1-3 | ~4s | Tutte le specie attive |
| 11+ | 7 specie | Livello 1-3 | ~3s | Timer minimo, pressione massima |

**Regole di promozione tra round**: si avanza al round successivo dopo aver eseguito un numero di merge totali pari alla soglia del round corrente. Soglie da bilanciare in playtest (es. round 1 → 10 merge, round 2 → 25 merge, ecc.).

## 8. Sistema di punteggio

### Formula

```
Punti = 10 × 2^(livello_creatura - 1) × round_corrente × 2^(merge_nello_stesso_lancio - 1)
```

- **livello_creatura**: livello evolutivo della creatura risultante dal merge (1–7)
- **round_corrente**: numero del round in corso (1, 2, 3…)
- **merge_nello_stesso_lancio**: quanti merge ha generato questo lancio in totale (1° merge = ×1, 2° = ×2, 3° = ×4…)

### Valori base (round 1, primo merge del lancio)

| Merge | Livello creatura | Punti base |
|-------|-----------------|------------|
| 1 → 2 | 1 | 10 |
| 2 → 3 | 2 | 20 |
| 3 → 4 | 3 | 40 |
| 4 → 5 | 4 | 80 |
| 5 → 6 | 5 | 160 |
| 6 → 7 | 6 | 320 |

### Esempi

- Merge livello 4, round 3, primo del lancio: `10 × 2³ × 3 × 1 = 240 pt`
- Merge livello 2, round 5, secondo del lancio: `10 × 2¹ × 5 × 2 = 200 pt`
- Merge livello 1, round 1, terzo del lancio: `10 × 1 × 1 × 4 = 40 pt`

> **Punteggio massimo per merge singolo (senza combo):** il merge più alto è livello 6→7 (Drago — vittoria), che vale `10 × 2⁵ = 320 pt` base. Moltiplicato per il round corrente, il massimo teorico è **320 × round** — senza cap. Al round 11 (primo tier a timer minimo) vale già **3.520 pt**, che attiva il feedback di massima enfasi (≥ 1000 pt).

### Bonus speciali

I bonus si attivano quando la fusione supera il livello max della specie (la creatura esplode):

- **Esplosione lv5** (Lupo, Aquila): +500 pt bonus fisso
- **Esplosione lv6** (Leone): +1000 pt bonus fisso
- **Esplosione lv7** (Drago — vittoria): +2000 pt bonus fisso

#### Track Cleared!

Quando un warrior esplode (per fusione al livello max o per LevelBoost) e **non rimane nessun altro warrior in pista** (nessun warrior con `crossedLine = true`), il giocatore guadagna un bonus straordinario:

```
Bonus Track Cleared = 1000 × round_corrente
```

- Ottenibile **una sola volta per round** (il flag si resetta ad ogni avanzamento di round)
- Feedback visivo: banner floating con `+XXXXX` in gold (68px, outline nera) + scritta "Track Cleared!" bianca (30px) sotto — pop-in con `backOut`, fluttua su 140px e sfuma in ~1.8s
- Non si attiva in caso di vittoria (esplosione Drago)

### Feedback visivo del punteggio

Ad ogni merge appare un **floating score** nel punto di fusione. Dimensione, colore e FX scalano in base all'entità del punteggio ottenuto:

Sotto i 1000 pt: solo variazione di testo e colore, nessun FX di scena.
Da 1000 pt in su: effetti particellari e di scena in scala crescente.

Tutti gli FX sono implementabili nativamente in Cocos Creator: particelle (`ParticleSystem`), shake via offset camera, flash via overlay node con animazione opacità, slowmo via `director.getScheduler().setTimeScale()`.

#### Tier v1 (6 tier attivi)

| # | Soglia | Testo | Colore | FX |
|---|--------|-------|--------|----|
| 1 | < 50 pt | piccolo | bianco | — |
| 2 | 50–299 pt | medio | giallo | — |
| 3 | 300–999 pt | grande, bold | rosso | — |
| 4 | 1000–3999 pt | molto grande | oro | scintille + lampo leggero |
| 5 | 4000–11999 pt | enorme | oro con outline | esplosione + coriandoli + shake + lampo + slowmo leggero (×0.8 da 10.000 pt) |
| 6 | ≥ 12000 pt | massivo, pulsante | arcobaleno | esplosione max + coriandoli + shake forte + lampo + slowmo (×0.5) |

> Riferimento: merge Drago lv6→7 (vittoria) al round 11 vale 3.520 pt senza combo. Con 2 combo consecutivi ~7.040 pt, con 3 ~14.080 pt — quindi la fascia ≥ 10.000 pt è reale ma rara.

Il floating score sale verso l'alto e svanisce in ~1s. Punteggi ≥ 1000 pt restano visibili ~2s; punteggi ≥ 4000 pt restano visibili ~3s.

#### Tier futuri (12 tier — riferimento per evoluzione)

> Da implementare in una versione successiva per maggiore granularità visiva.

| # | Soglia | Testo | Colore | FX |
|---|--------|-------|--------|----|
| 1 | < 20 pt | minuscolo | grigio | — |
| 2 | 20–49 pt | piccolo | bianco | — |
| 3 | 50–149 pt | piccolo | giallo pallido | — |
| 4 | 150–299 pt | medio | giallo | — |
| 5 | 300–599 pt | grande | arancione | — |
| 6 | 600–999 pt | grande, bold | rosso | — |
| 7 | 1000–1999 pt | molto grande | oro | scintille leggere |
| 8 | 2000–3999 pt | enorme | oro | scintille medie + lampo leggero |
| 9 | 4000–9999 pt | enorme, bold | oro/arancione | esplosione + coriandoli + shake medio |
| 10 | 10000–11999 pt | massivo | oro con outline | esplosione grande + coriandoli + shake forte + lampo + slowmo (×0.8) |
| 11 | 12000–14999 pt | massivo, animato | arcobaleno | esplosione grande + coriandoli + shake forte + lampo + slowmo (×0.6) |
| 12 | ≥ 15000 pt | massivo, pulsante | arcobaleno luminoso | esplosione max + coriandoli + shake forte + lampo + slowmo (×0.4) |

## 9. Fisica e controlli

### Input
- **Mouse e touch sono equivalenti**: tutte le interazioni descritte funzionano identicamente con dito (touch) o puntatore (mouse)

### Meccanica di lancio (stile fionda + Puzzle Bobble)
Il lancio si ispira a **Puzzle Bobble** per la direzione (sempre verso l'alto dalla base) e a una **fionda/elastico** per il controllo di forza e angolo:

1. **Press** sul personaggio in attesa
2. **Drag verso il basso** (o in diagonale basso-sinistra / basso-destra) per caricare la fionda
3. Vengono visualizzati due indicatori sovrapposti: una **corda elastica** sul lato del drag (dal personaggio verso il punto di tocco) e una **freccia di direzione** sul lato opposto (dal personaggio verso la traiettoria di lancio); entrambi scalano cromaticamente verde → rosso con la forza caricata. La freccia è composta da un'asta sottile + testa di freccia riempita, e scala in lunghezza con la forza
4. La **direzione di lancio è opposta al drag**: drag in basso → lancio verso l'alto; drag in basso-sinistra → lancio in alto-destra
5. La **lunghezza del drag** determina la forza del lancio (più si tira, più si carica)
6. **Rilascio** → il personaggio viene proiettato nella direzione opposta con la forza caricata
7. **Soglia minima**: se al rilascio la distanza del drag è inferiore a una soglia minima, il lancio viene annullato e il personaggio rimane in attesa. La soglia minima è calibrata in modo che **qualsiasi lancio valido sia sempre sufficiente a far superare la linea di game over**, indipendentemente dalla direzione — in assenza di ostacoli
8. **Soglia massima**: la forza è cappata a una distanza massima di drag — trascinare oltre non aumenta la potenza; la corda visiva smette di allungarsi a indicare il cap raggiunto

### Timer di lancio
- Il giocatore ha un tempo limitato per effettuare il lancio, visualizzato come conto alla rovescia
- Allo scadere del timer: **lancio automatico** nella direzione corrente del drag con forza media
- **Round 1**: 15 secondi
- Il timer si riduce progressivamente avanzando di round, fino a un **minimo di 3 secondi** nei round avanzati
- La curva di riduzione è da bilanciare in playtest (es. lineare, esponenziale, a gradini)

#### Feedback visivo del timer
Il timer è **poco visibile quando il tempo è abbondante** e si accende progressivamente man mano che scade:

| Tempo rimanente | Visibilità | Aspetto |
|----------------|------------|---------|
| > 10s | quasi invisibile | opacità bassa (~20%), colore neutro |
| 6–10s | visibile | opacità piena, colore bianco/giallo |
| 3–5s | in evidenza | colore arancione, leggero pulse |
| ≤ 2s | critico | colore rosso, pulse rapido |

#### Feedback audio del timer
- **Ultimi 5 secondi**: inizia un **ticchettio** sincronizzato con ogni secondo che passa
- Il ticchettio accelera o si intensifica negli ultimi 2 secondi
- Si interrompe immediatamente al lancio

### Fisica
- Engine: **Box2D** integrato in Cocos Creator
- Tutti i personaggi hanno **hitbox circolare** (la sagoma sopra è solo rendering)
- **Gravità**: ignorata — nessuna forza gravitazionale applicata ai personaggi

#### Superficie
- Il rallentamento è controllato dal **damping lineare** del rigidbody (non da un attrito di superficie), producendo il comportamento di scivolata + smorzamento progressivo tipico del bowling/curling

#### Pareti e bordi
- **Pareti laterali**: rimbalzo **consistente ed elastico** (restituzione ~0.8, attrito basso ~0.05) — il personaggio rimbalza con poca perdita di energia, consentendo traiettorie di rimbalzo utili strategicamente
- **Fondo pista** (parete in alto): **alto smorzamento** (restituzione ~0.1, attrito alto ~0.8) — il personaggio perde quasi tutta la velocità all'impatto e si ferma vicino al fondo
- **Ingresso pista** (in basso): muro invisibile sotto il punto di lancio, il personaggio non può tornare indietro

#### Stabilità dei personaggi in pista
- I personaggi fermi sono **molto stabili**: quando si fermano (`forceStop`) il `linearDamping` passa da 0.5 a 12, assorbendo gli urti senza proiettarli via
- Il personaggio lanciato **trasferisce poca energia cinetica** ai personaggi colpiti — l'impatto è morbido, non una bocciata da biliardo
- I personaggi si spostano leggermente per colpo ma si fermano in ~0.3s
- Un sistema di **settling** rileva quando tutti i personaggi in pista sono fermi (velocità < soglia) e solo allora abilita il lancio successivo — impedisce lanci multipli sovrapposti

### Magnetismo
- Attivo **esclusivamente** tra personaggi che possono fondersi: **stessa specie E stesso livello evolutivo**
- Nessuna attrazione tra specie diverse o livelli diversi, anche se visivamente vicini
- Raggio: gap **superficie-superficie** di ~30px (scalato col layout) — non centro-centro, così funziona a qualsiasi livello/dimensione (dettagli in MEMO.md)
- Forza: **quadratica con la prossimità** — quasi impercettibile a distanza, molto più forte a contatto ravvicinato; evita il "teletrasporto" mantenendo l'effetto di aggancio
- Soglia di merge: dopo **~300ms di contatto continuo**, fusione
- Nuovo personaggio appare al **centro geometrico** dei due fondenti, con piccola animazione di scale-up + flash

## 10. Game over

La linea di game over è visualizzata come **nastro rosso** orizzontale a metà pista.

### Regole di attraversamento

- **Lancio valido**: il personaggio lanciato deve **superare completamente la linea dal basso verso l'alto** per entrare in gioco — il turno è considerato ok
- **Game over**: se il personaggio lanciato non supera completamente la linea (rimane sotto o si ferma sulla linea) → game over immediato

### Rimbalzo oltre la linea

Se un personaggio già in gioco, a seguito di rimbalzi, **riattraversa la linea dall'alto verso il basso** (il **centro** del cerchio resta sotto la linea per 3 frame consecutivi — filtro anti-jitter, vedi TECH.md):
- Causa **game over immediato** (stessa conseguenza del mancato attraversamento dal basso)
- **Feedback visivo**: flash rosso semitrasparente (~0.3s) prima della schermata di game over

> **Decisione di design (2026-05-09):** il malus a punteggio è stato rimosso in favore del game over immediato — rende la linea rossa un confine rigido e aumenta la tensione strategica.

### Schermata di fine partita
- Punteggio finale, round raggiunto, "Riprova", "Menu"

## 11. UI / HUD

### In partita
- **Top-left**: punteggio corrente
- **Top-right**: round (con ring di progresso merge)
- **Bottom-center**: personaggio in attesa di lancio (balestra) + traiettoria + timer
- **NEXT**: anteprima prossimo personaggio, nodo `NextPreview` figlio di Track (tap = swap col launcher)
- **Mid-pista**: nastro rosso (linea game over) — quota definita dal nodo editor `GameOverLine`, non da una costante (vedi TECH.md)

### Animazione del round
Quando il round avanza, il numero del round nel HUD fa un breve effetto per segnalare il cambio: scale-up → bounce → ritorno a dimensione normale, con un flash leggero sul testo. Dura ~0.5s.

### Animazione del punteggio (contachilometri)
Ad ogni merge il punteggio nel HUD non salta al valore finale, ma **si incrementa gradualmente** come un contatore/odometro:
- La velocità di incremento scala con l'entità del bonus: punteggi piccoli si sommano velocemente (~0.3s), punteggi grandi più lentamente (~1–1.5s) per enfatizzare la crescita
- Se arriva un nuovo merge mentre il contatore sta ancora scorrendo, il contatore **accelera** e parte dal nuovo valore target senza reset
- Durante lo scroll il testo del punteggio può avere un leggero glow o pulse per attirare l'attenzione

### Schermate
- **Splash/menu** (`MainMenu.scene`): titolo, PLAY, LEADERBOARD, Best Score, versione
- **Game over / Victory** (prefab modali, `EndPanel`): Score, Round, Best (o NEW BEST), **un solo pulsante Continue** → leaderboard (se attiva) → menu
- **Pause** (prefab modale, `PausePanel`): Resume, Restart, Menu
- ~~Tutorial popup~~ — rimosso in v0.8.22

## 12. Audio

- **Musica di sottofondo**: 1-2 loop tematici (medievale-festivo, ma leggero), volume moderato
- **SFX**:
  - Lancio (whoosh)
  - Personaggio che si ferma (thud morbido)
  - Magnetismo (suono di "click magnetico")
  - Merge (chime ascendente, varia con livello evolutivo)
  - Esplosione livello 5 (boom festoso + cheer del pubblico)
  - Avvicinamento al game over (heartbeat sottile)
  - Game over (trombetta triste comica)
  - Nuovo round (fanfara breve)

## 13. Stile visivo

- **Direzione**: cartoon kawaii, "giocattoloso", colori saturi e allegri
- **Riferimento attuale**: mockup con castello medievale + tendoni + bandiere
- **Decisione finale stile**: aperta, da rivalutare con prototipo giocabile
- **Personaggi**: chibi tondeggianti su base circolare con numero del livello evolutivo visibile
- **Pista**: superficie liscia tipo ghiaccio chiaro o legno laccato
- **Background**: festa/torneo medievale (decorativo, non distrae)

## 14. Asset necessari (stima)

### Sprite personaggi

Tutti gli sprite sono già presenti in `assets/warriors/`.

| Specie | Livelli | Sprite |
|--------|---------|--------|
| Rana, Gatto, Gallina | lv1–3 | 3 × 3 = 9 |
| Lupo, Aquila | lv1–4 | 2 × 4 = 8 |
| Leone | lv1–5 | 5 |
| Drago | lv1–6 | 6 |
| **Totale** | | **28** |

### Animazioni personaggi
- Idle (respiro leggero) — per ogni sprite
- Squash on landing
- Pop on merge
- Esplosione bonus — 1 animazione base (blackhole VFX), parametri scalati per tier
- Esplosione malus (rimbalzo oltre la linea)

### VFX particellari
**3 asset particellari** riutilizzati con parametri variabili (`startSize`, `totalParticles`, `duration`) per ogni tier:
- **Scintille** — usato nei tier 4–6 con intensità crescente
- **Esplosione** — usato nei tier 5–6 con scala e densità crescenti; variante per esplosioni bonus Campione/Eroe/Leggenda
- **Coriandoli** — usato nei tier 5–6, con gravità
- **Aura magnetismo** — asset dedicato (piccolo, sempre uguale)

### VFX di scena (nessun asset esterno — implementati via codice)
- Screen shake (offset camera)
- Flash/lampo positivo (overlay node, opacità animata)
- Flash rosso malus (overlay node rosso)
- Slowmo (`timeScale`)

### UI
- Label punteggio (animazione contachilometri)
- Label round (animazione bounce al cambio)
- Timer (4 stati visivi: quasi invisibile → pulse rosso)
- Corda elastica della fionda (drawn proceduralmente o sprite)
- Indicatore forza/angolo di lancio
- Anteprima NEXT personaggio
- Nastro rosso (linea game over)
- Floating score labels (12 varianti di stile testo/colore)
- Pulsanti: Gioca, Riprova, Menu, Pausa, Settings, Audio, Info — ~8 elementi
- Popup tutorial (3–4 schermate)
- Schermata splash, game over, pausa

### Background
- 1 illustrazione fissa (festa/torneo medievale)
- Eventuali layer parallax

### Audio
| SFX | Descrizione |
|-----|-------------|
| Lancio | Whoosh alla partenza |
| Landing | Thud morbido all'arresto |
| Magnetismo | Click magnetico |
| Merge (×6) | Chime ascendente, una variante per livello evolutivo |
| Esplosione lv5 (Lupo/Aquila) | Boom medio |
| Esplosione lv6 (Leone) | Boom grande |
| Esplosione lv7 (Drago — vittoria) | Boom epico |
| Malus | Suono negativo (buzz/clang) |
| Ticchettio timer | Tick sincronizzato, ultimi 5s |
| Avvicinamento game over | Heartbeat sottile |
| Game over | Trombetta triste comica |
| Nuovo round | Fanfara breve |

- **Totale SFX: ~17** (escludendo varianti merge)
- **Musica**: 1–2 loop tematici (medievale-festivo)

## 15. AURA Powerup *(ex LevelBoost — riscritto v0.8.19)*

Powerup attivabile via debug (futuro: condizione automatica). Ha precedenza su WildRiver e PsychoForce — li disattiva se attivi.

### Attivazione e durata

- Si attiva sul warrior in rampa tramite pulsante AURA nel debug panel
- VFX: anello esterno arancione (r×3.8), anello interno giallo pulsante (r×2.4), cerchio d'influenza schiacciato 50% verticalmente (prospettiva)
- Scintille dorate emesse ogni 0.12s attorno al warrior
- Al lancio parte il timer di **1.5 secondi** (`AURA_DURATION`), allo scadere l'aura si stacca (fade-out)
- L'aura **non** si spegne quando il warrior si ferma (`settled`) — il timer è l'unica scadenza (fix 2026-05-26, vedi MEMO); gli effetti zap già in propagazione continuano fino al completamento

### Forza repulsiva

Il warrior con AURA respinge i warrior vicini con forza proporzionale alla vicinanza:
- Range: `AURA_REPEL_RANGE = 160 px` (design space, baseline Dragon)
- Range per specie **quadratico** (v0.8.55): `160 × k²` con `k = (type+1)/7` → depotenzia molto le specie basse (Frog≈2%, Dragon=100%)
- Forza massima al centro: `AURA_REPEL_FORCE = 500 px` (scalata da `LAYOUT_SCALE`)
- Formula: `f = baseF × (1 − dist/range)`, direzione radiale verso l'esterno

### Meccanica di zap (warrior in range)

> **v0.8.55 — depotenziamento specie basse**: lo zap è disabilitato per `type < AURA_ZAP_MIN_TYPE` (=2, cioè Frog e Cat). Queste specie fanno **solo repulsione**, niente zap/auto-merge.

I warrior che restano nel cerchio d'influenza per **≥ 0.2s** (`AURA_ZAPP_HOLD`) vengono "zappati":

1. **Collasso** — il warrior si rimpicciolisce (scale 1.5→0 in 0.18s) e il corpo Box2D viene distrutto
2. **Scintilla** — appare una scintilla `120 × energy^0.35 px` colorata come la specie sorgente
3. **Salita** — la scintilla sale di 150px in 0.9s (`quadOut`)
4. **Flash** — scale pop 2× poi ritorno a 1× (0.15s)
5. **Volo cadenzato** — le scintille partono verso il target una alla volta:
   - Delay cumulativo: `gap(k) = 500ms × 0.6^k` → `cumDelay(i) = 1.25 × (1 − 0.6^i)` s
   - Durante il volo: scia di dot `112px`, stessa tinta della scintilla
   - Se il target originale è scomparso (merge), la scintilla si re-direziona verso il miglior target disponibile della stessa specie
6. **Timer freeze** — dal momento della prima scintilla registrata al momento dell'ultima arrivata, il timer di lancio è congelato

### Ricerca del target

- Stessa specie (`type`), `crossedLine = true`, `node.isValid`, `!merging`
- Tra tutti i candidati: scelto quello con la **Y canvas più alta** (il più in alto nella pista)
- La ricerca avviene al momento del volo (non al momento del collasso) per massimizzare la validità del target

### Sistema di evoluzione energetica

Ogni scintilla porta l'energia del warrior sorgente: `energy = 2^(level−1)`

Quando tutte le scintille destinate a un target sono arrivate:
```
energiaIniziale = 2^(target.level − 1)
energiaFinale   = energiaIniziale + Σ(energie scintille ricevute)
livelloFinale   = floor(log₂(energiaFinale)) + 1
```
- Se `livelloFinale ≤ maxLevel`: il target evolve in place (destroy + spawn al livello finale, animazione bubble)
- Se `livelloFinale > maxLevel`: esplosione blackhole come da merge standard

### Punteggio

- **Per ogni scintilla che colpisce il target**: `5 × round × 2^(level−1)` — floating score compare sul target al momento dell'impatto
- **Bonus evoluzione target**: `20 × round × (livelloFinale − livelloIniziale)` — floating score compare sopra il target; applicato sia nel ramo normale che nel ramo blackhole; contribuisce al round progress

### Feedback visivo sul target

- Al colpo di ogni scintilla: **flash giallo** (tint 140ms) + **saltello** 28px su `bounceY` + **pulse di scala** `1.0 + 0.10 × energy^0.35` (proporzionale all'energia della scintilla) che ritorna a 1.0 in 0.24s
- All'evoluzione: `flashMerge` standard (0.32s) seguito da **animazione bubble** (scale 1.38→0.88→1.05→1.0 in ~430ms)
- Alla fine dell'aura: `_restoreAuraScales()` riporta a 1.0 l'`animScale` di qualsiasi warrior rimasto con scala distorta (chiamato da tutti e 4 i punti di cleanup)

### Parametri tecnici

| Parametro | Valore | File |
|-----------|--------|------|
| `AURA_DURATION` | 1.5s | `AuraEffect.ts` |
| `AURA_REPEL_RANGE` | 160 px (baseline Dragon) | `GameManager.ts` — range quadratico (v0.8.55): `160 × ((type+1)/7)²` |
| `AURA_REPEL_FORCE` | 500 px | `GameManager.ts` |
| `AURA_ZAPP_HOLD` | 0.2s | `GameManager.ts` |
| `AURA_ZAP_MIN_TYPE` | 2 (v0.8.55) | `GameManager.ts` — sotto questa specie solo repulsione, niente zap |
| Stagger primo gap | 500ms | formula `1.25×(1−0.6^i)` s |
| Dimensione scintilla | `120 × energy^0.35` px | `GameManager.ts _zappWarrior` |
| Trail dot size | 112px | `GameManager.ts _flySparkToTarget` |

### VFX

- Aura outer: sprite `aura.png`, r×3.8, `Color(255,130,20)`, opacità 75
- Aura inner: sprite `aura.png`, r×2.4, `Color(255,220,55)`, opacità 140, pulse ±20%
- Range ring: r×2 wide, height=r (50% squish), `Color(255,200,60)`, opacità **12** (molto trasparente), pulse ±6%; ampiezza range dipende dalla specie: `_auraRangeForType(type) = 160 × ((type+1)/7)²` px (Dragon = 160px baseline, scaling quadratico v0.8.55)
- Scintille: sprite `sparkle.png`, ogni 0.12s, palette arancio/oro
- Scintilla zap: sprite `sparkle.png`, colore specie sorgente, additive blend; **twinkle**: pulse opacità 230↔135, 0.11s per step (ciclo 0.22s — shimmer durante salita e volo)
- Trail: dot `sparkle.png` 112px, stessa tinta scintilla, fade 0.22s

---

## 16. WildRiver Powerup

Powerup automatico: il launcher si incendia di sangue e al primo contatto con un warrior in pista scatena una cascata WRS (WildRiver Sparkle) che si propaga per contagio, poi implode accumulando punti.

### Condizioni di attivazione

Il WR si attiva sul warrior in rampa **solo se tutte e tre le condizioni sono soddisfatte**:

1. **≥ 8 warrior della stessa specie del launcher** sono già in pista (`crossedLine = true`)
2. **Cooldown 10 tiri** — devono essere passati almeno 10 lanci dall'ultimo WR
3. **Nessun altro powerup sul launcher** — il launcher non deve avere un'aura *(ex levelBoost)* attiva

### Flusso WRS

1. Il launcher porta l'effetto `WildRiverEffect` (aura rossa) mentre è in rampa
2. Al lancio, il warrior diventa "WR launcher" e al primo contatto fisico con un warrior in pista propaga `WildRiverSparkleEffect` (contagio per contatto e prossimità)
3. Il contagio si espande ai warrior vicini della stessa specie e di tipo qualsiasi (via proximity check ogni 0.08s, soglia `+60px` oltre i raggi)
4. Quando il launcher si ferma, scatta la cascade di implosione WRS: i warrior contagiati implodono in ordine inverso di contagio, con moltiplicatore punti crescente (`+1.5×` per warrior)

### Parametri

| Parametro | Valore |
|-----------|--------|
| Soglia specie in pista | ≥ 8 |
| Cooldown tra WR | 10 lanci |
| Proximity check interval | 0.08s |
| Proximity margin | 60px oltre i raggi |
| Contact delay spread | 0s (immediato) |
| Proximity delay spread | 0.15s |
| Moltiplicatore implosione | +1.5× per warrior, start ×1 |
| Punti per warrior WRS | `10 × round × implodeK` |

---

## 17. PsychoForce e Brotherhood Powerup

> Specifiche operative complete in MEMO.md (sezioni "PsychoForce Powerup" e "Brotherhood Powerup"). Qui solo il design.

### PsychoForce (v0.8.9)

Powerup "jolly": crea spazio prima della endline permettendo **merge cross-species** per 5 secondi. Il launcher con PF, al contatto con un warrior in pista, contagia a cascata i warrior in una fascia orizzontale (±35% `TRACK_W` attorno alla Y di contatto). I warrior infetti (tinta ciano) possono fondersi con specie diverse di pari livello; il tipo risultante è quello del warrior **non** portatore. L'infezione scade dopo 5s (`EXPIRE_SECS`). WR e PF sono mutuamente esclusivi.

### Brotherhood (v0.8.55)

Powerup automatico anti-affollamento: con **≥ 25 warrior in pista** (e doppio cooldown: 10 lanci **e** 10 merge dall'ultimo trigger) il launcher porta l'effetto Brotherhood; al primo contatto scatena una **cascata di implosioni** su tutti i warrior dello stesso tipo del bersaglio, ognuna con punti + vortice attrattivo. Non crea merge sopra il maxLevel di specie.

---

## 18. Out of scope per la v1

Per mantenere lo scope realistico, **NON** includiamo nella v1:
- Multiplayer
- Skin/cosmetics
- ~~Achievements/leaderboard cloud~~ → la **leaderboard Firebase è stata implementata** (top-10, scena Ranking, spegnibile via `LEADERBOARD_ENABLED` per i portali); restano fuori gli achievements
- Eventi stagionali
- Pubblicità rewarded (solo banner/interstitial Poki SDK base)
- Personalizzazione personaggi
- Modalità di gioco alternative

> Tutte queste sono ottime feature per una v2 dopo aver validato il core.

## 19. Monetizzazione

- **Revenue share Poki/CrazyGames** via SDK ufficiale
- Banner ad + interstitial tra partite (frequenza moderata, mai durante il gameplay)
- Nessuna IAP nella v1

## 20. Metriche di successo

KPI da monitorare dopo il lancio:
- **D1 retention**: target >35% (media Poki ~30%)
- **Sessione media**: target >4 minuti
- **Partite per sessione**: target >2.5
- **Completion rate round 1-3**: target >70% (per validare onboarding)

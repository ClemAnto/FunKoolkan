# Game Design Document — FunKoolkan

> Documento di game design. Versione 0.3 (tema cambiato in **Rapa Nui / Isola di Pasqua** il 2026-06-19). Sostituisce il design maya. Il **merge è eliminato**, la meccanica core è il **circuito di mana**. Le sezioni **(ereditato)** descrivono infrastruttura riusata da FunWarriors; quelle **TBD** sono da definire in prototipo/playtest.
>
> ⚠️ **PIVOT 2026-06-22 — il core in prototipo è ora il CURLING (non più il circuito di mana).** Costruire strutture per unire i due poli non divertiva → il **circuito di mana** descritto qui sotto (catena Alba↔Tramonto + scarica) è **parcheggiato come bonus futuro**. **Nuovo core**: al centro dell'arena un'area **HOUSE** con un **TEE** al centro; quando una stone si **ferma sul TEE**, tutte le stone **dello stesso colore** dentro/che toccano l'**HOUSE** si trasformano in **proiettili di energia** verso **Koolkan** (la stone sul TEE è l'ultimo proiettile; le altre di colore diverso restano). Boss Koolkan a scudo, idolo Make-make/bombe, moai-spawner, overflow=game over, reskin Rapa Nui **restano validi**: cambia solo *come si carica il colpo* (curling invece di circuito topologico). Dettaglio curling da formalizzare in v0.4.
>
> **Nome**: il gioco resta **FunKoolkan**; **Koolkan** è il nome del **boss** (moai colossale corrotto) — il nome coniato è invisibile come etimologia maya al giocatore e funziona da brand distintivo (decisione 2026-06-19).

## 1. Concept in una frase

Un puzzle-arcade fisico a tema **Isola di Pasqua**: lanci **rune** rotonde con gemma colorata in un'arena per costruire un **ponte di gemme dello stesso colore** che colleghi due grandi moai guardiani (**Alba** e **Tramonto**); quando il circuito si chiude, un'**ondata di mana** percorre la catena e la dissolve. Sopravvivi alla pressione dei moai-spawner che sputano rune, frantuma lo **scudo di pietra di Koolkan** (il moai colossale corrotto) con le scariche e abbattilo per avanzare di round.

## 2. Pitch (per CrazyGames/Poki/GameDistribution)

> Risveglia il mana degli antenati! Lancia le rune nell'arena sacra e costruisci catene di gemme dello stesso colore tra il **Moai dell'Alba** e il **Moai del Tramonto**: quando i due guardiani si collegano, un'ondata di energia ancestrale incenerisce la catena. Colpisci l'idolo di **Make-make** per liberare bombe e farti spazio, resisti ai moai corrotti che inondano l'arena, e frantuma lo scudo di pietra di **Koolkan** finché non lo abbatti.

## 3. Differenziazione (esito deep-research, 2026-06-19)

Il motivo del rifiuto di FunWarriors su CrazyGames era "non abbastanza diverso" (originalità = criterio formale di approvazione e di eleggibilità ai ricavi). Diagnosi:

- **Rischio di base**: ogni mattone meccanico appartiene a generi saturi — cluster-collapse (SameGame/Collapse!), "lancia e fai esplodere colori uguali" (bubble shooter/Zuma), physics-drop (Suika). Il pericolo maggiore è il **primo impatto**: un revisore può archiviare a colpo d'occhio come "ennesimo color/bubble shooter".
- **Difesa**: nessun competitor identificato fonde **circuit-completion + physics-launch in arena + spawner ambientali + boss-a-scudo**. La combinazione è il vero elemento distintivo.
- **Leve di originalità percepita a basso costo** (incorporate nel design):
  1. **Circuito Alba↔Tramonto** come win-condition topologica (non a conteggio) → esce dal bucket "color shooter".
  2. **Boss Koolkan a scudo** come hook, da rendere dominante in anteprima/primi 10s/screenshot.
  3. **Statue come attori dell'arena** (Make-make=bomba, moai corrotti=spawner) → arena dinamica assente nei cloni di genere.
  4. **Polish + identità Rapa Nui fortissima** (la scarica di mana è lo screenshot da copertina).
- **Evitare**: nomi/icone generici o confondibili (mai "Bubble…").

### Verifica post-redesign (deep-research #2, 2026-06-19)

Ricerca rifatta sul core aggiornato (circuito + scudo-boss). **Verdetto: rischio rifiuto per originalità sceso da MEDIO-ALTO a BASSO-MEDIO**, ora **guidato dalla presentazione** più che dalla meccanica.

- I puzzle "completamento circuito" reali (*Connect Current Wires*, *Electricity Chain*, PuzzleBaron Circuits) sono tutti **grid-tap statici, senza fisica** → la nostra distinzione regge.
- I "puzzle che alimentano un boss" (*Tower Swap* su CrazyGames, *Witching Stone*) sono **a griglia / a turni**, non physics-arena.
- **Nessun titolo fonde i 4 pilastri**: la fusione è libera.
- ⚠️ **Rischio residuo #1 = primo impatto**: a colpo d'occhio può sembrare un matcher di gemme. La ricerca aveva segnalato *Bubble Tower 3D* (lancio + colore, **azteco**) come collisione su CrazyGames. **Il cambio tema da maya a moai azzera quella collisione** (i moai non si confondono con un matcher azteco) e rafforza l'iconicità a colpo d'occhio. Mitigazione confermata: **fondo blu-grigio-scuro** + arco di mana/boss in primo piano (vedi §18).
- La review è **soggettiva**: si passa se il revisore percepisce il loop nuovo. **Leve decisive**: thumbnail che telegrafa la **scarica Alba↔Tramonto + scudo che si rompe**; iconografia moai inconfondibile; nome coniato.

## 4. Target *(ereditato)*

- Piattaforma primaria: **CrazyGames** (dove è avvenuto il rifiuto), poi **Poki / GameDistribution**.
- Età: **8-14 anni**, gender-neutral.
- Dispositivi: desktop + mobile + tablet.
- Orientamento: **portrait primario** (720×1280), landscape come adattamento.
- Layout arena: derivato da `initLayout()` (Track.ts), agganciato in basso al centro, responsivo senza bande nere (vedi MEMO/COCOS).
- Sessioni attese: **2-20 minuti**, effetto "una partita ancora".

## 5. Loop di gioco

1. La partita inizia con l'arena che mostra i due **moai-polo** (Alba e Tramonto) in posizione fissa e qualche runa di prefill.
2. Il giocatore vede un **runa** in attesa di lancio (bottom center) + anteprima **NEXT**.
3. Mira con drag (angolo + forza, stile fionda/Puzzle Bobble — vedi §11).
4. Rilascia → il runa scivola nell'arena (fisica Box2D, nessuna gravità — §11).
5. Le gemme **dello stesso colore si attraggono** (magnetismo a corto raggio — §7) → si formano grappoli monocromatici.
6. Quando una **catena contigua di gemme dello stesso colore collega il Moai dell'Alba al Moai del Tramonto**, il circuito si chiude → **ondata di mana** lungo il path → tutte le rune della catena si dissolvono (+punti).
7. Ogni scarica **danneggia lo scudo di pietra del Koolkan** (una o più tacche/lastre, §12).
8. I **moai-spawner (nemici)** immettono nuove rune nel tempo; il ritmo cresce → l'arena tende a riempirsi.
9. Quando i colori sbagliati intasano l'arena, il giocatore colpisce l'**idolo di Make-make** per ottenere una **bomba** e aprirsi spazio (§10).
10. Quando lo **scudo del Koolkan è esaurito**, basta colpirlo con una **runa qualsiasi a traiettoria libera** per abbatterlo → **round up** (difficoltà crescente, §13).
11. **Game over**: l'arena si riempie oltre la soglia (overflow) in qualsiasi momento — condizione esatta **TBD** (eredita la logica "linea/soglia" di FunWarriors, vedi §13). È un **endless a punteggio** scandito dai round/boss.

## 6. Meccanica core — il circuito di mana

### Regola di conduzione

- Il mana passa **solo attraverso gemme dello stesso colore** adiacenti/in contatto.
- Il circuito si chiude quando esiste una **catena contigua monocromatica** che tocca **entrambi i poli** (Alba e Tramonto).
- Alla chiusura: **ondata di mana** che percorre il path e **dissolve l'intera catena** che collega i due poli.
- I poli sono **neutri** (terminali): accettano qualsiasi colore, purché la catena che li unisce sia di **un solo colore** da capo a capo.

### Profondità di gioco

- I colori "sbagliati" diventano **ostacoli** da aggirare nel routing del ponte → è questo che distingue FunKoolkan da un connect-the-dots banale.
- **Tolleranza di conduzione**: gemme "vicine" conducono (non serve contatto pixel-perfect) — parametro di feel, **TBD in prototipo**.

> **Riuso tecnico (ereditato)**: la logica di merge di FunWarriors già rileva "stesso tipo a contatto". Si ricicla l'impianto (Box2D + contact graph) cambiando l'output: invece di fondere coppie, si fa un **flood-fill sul grafo di contatto** per trovare il componente connesso monocromatico e verificare se tocca entrambi i poli.

## 7. Runa (i pezzi lanciati)

- **Aspetto**: una **runa rotonda** di pietra, uguale per tutte, con una **gemma colorata luminosa sopra**. La gemma è il **portatore di colore** (lettura istantanea + look premium): la pietra è neutra/grigia, il colore vive nella gemma che brilla. Forma rotonda = hitbox circolare (coerente con la fisica ereditata).
- **Accessibilità**: ogni colore porta un **micro-glifo / forma distintiva** sulla gemma (ridondanza per daltonici).
- **Palette gemme**: colori saturi e luminosi (verde, turchese, ambra, rosso, viola…); set iniziale e numero esatto **TBD** (vedi §13: il n° di colori è una leva di difficoltà).
- **Magnetismo**: le gemme **dello stesso colore si attraggono** → catene più organiche, meno casualità nel piazzamento.
  - ⚠️ **Taratura critica**: deve essere un **nudge a corto raggio**, non uno *snap* forte. Troppo aggressivo → l'arena si auto-organizza in blob monocromatici e annulla la profondità degli "ostacoli di colore". Deve **assistere l'assemblaggio**, non costruire la catena al posto del giocatore. Parametri (raggio + forza) **TBD in prototipo**; base riusata dall'attrazione del merge di FunWarriors.

## 8. Statue — tassonomia

Tutto il mondo è fatto di **statue di pietra che prendono vita**: è la coerenza forte del tema moai. Per evitare confusione, le statue si distinguono per **scala**, **colore/luce** (benevole = luminose; corrotte = scure/crepate) e per la **gemma** (solo i runa lanciabili hanno la gemma colorata).

| Schieramento | Statua | Ruolo |
|---|---|---|
| 🌅 **Buone** | **Moai dell'Alba** | Polo del circuito (terminale) — motivo solare |
| | **Moai del Tramonto** | Polo del circuito (terminale) — motivo lunare |
| | **Idolo di Make-make** | Colpito → rilascia una **bomba** → si ricarica (§10) |
| 🪨 **Cattive** | **Koolkan** | Boss: moai colossale corrotto con scudo di pietra / bersaglio dell'abbattimento (§12) |
| | **Moai-spawner** | Moai corrotti che sputano nuove rune nel tempo (la pressione) |

## 9. Poli (Alba / Tramonto)

- **1 coppia** di poli: **Moai dell'Alba** (motivo solare) + **Moai del Tramonto** (motivo lunare), neutri (accettano qualsiasi colore). Mantengono la dualità che funzionava col Sole/Luna, in chiave Rapa Nui.
- **Round iniziali**: poli **fissi** in posizione, per semplificare il gameplay e l'onboarding.
- **Round avanzati**: i poli **cambiano posizione** a ogni round, poi diventano **mobili** (si spostano durante il gioco) o addirittura **lanciabili** dal giocatore — escalation di difficoltà e novità.
- ⚠️ Servono **poli telegrafati forte** e il **path che si illumina** mentre lo costruisci (onboarding visivo). La logica sottostante resta una polarità chiara (un terminale "emette", l'altro "riceve").

## 10. Bomba (idolo di Make-make)

- Colpendo l'**idolo di Make-make** (con un runa lanciato) si **sblocca una bomba**: il **prossimo lancio diventa una bomba mirabile** che esplode dove la indirizzi → valvola di sfogo per quando i colori sbagliati intasano l'arena, e **secondo scopo del lancio** (a volte miri all'idolo, non solo a costruire la catena).
- **Tipi di bomba diversi** (Make-make può darne uno a caso o tipi diversi — **TBD**):
  - **Bomba a raggio**: distrugge **tutto** nel raggio d'esplosione.
  - **Bomba di colore**: distrugge **tutte le rune del colore colpito** all'impatto.
  - Altri tipi possibili **TBD**.
- Dopo l'uso, l'idolo entra in **ricarica** (cooldown): "spento" visivamente (occhi/gemma spenti) finché non torna disponibile.
- VFX a tema: idolo colpito → scossa di mana / dardo di pietra.

## 11. Fisica e controlli *(ereditato — da FunWarriors)*

> Il sistema di lancio, fisica e responsività è riusato. Cambia il "cosa" si lancia (runa invece di warrior) e il "cosa succede al contatto" (conduzione invece di merge). Dettagli completi in MEMO/TECH.

- **Input**: mouse e touch equivalenti.
- **Lancio (fionda + Puzzle Bobble)**: press sul runa → drag verso il basso/diagonale → direzione di lancio **opposta al drag**, lunghezza drag = forza (cappata); soglia minima sotto la quale il lancio si annulla; **traiettoria con anteprima** (mira). Vedi GDD FunWarriors §9 per i dettagli operativi, ancora validi.
- **Timer di lancio**: conto alla rovescia che si riduce coi round (pressione crescente); allo scadere, lancio automatico. Curva **TBD** (vedi §13).
- **Fisica**: Box2D, **gravità = 0**; hitbox circolare; damping lineare per lo scivolamento stile curling; pareti laterali elastiche (rimbalzi strategici), fondo smorzato; settling per abilitare il lancio successivo.
- **Mira a poli/idoli**: la fisica di lancio deve permettere di colpire con precisione i poli (se mobili/lanciabili), l'idolo Make-make e il Koolkan → l'anteprima di traiettoria è essenziale.

## 12. Boss Koolkan — scudo e abbattimento

Il "meter" della missione **è lo scudo del Koolkan** (non una barra separata): unifica rune dissolte, scariche e progresso boss in un solo indicatore leggibile.

- Il Koolkan ha uno **scudo di pietra** con **lastre/tacche grafiche visibili** (il giocatore legge a colpo d'occhio quanto ne resta).
- Ogni **ondata di mana** prodotta chiudendo un circuito **danneggia lo scudo** (stacca una o più lastre; entità **TBD**, probabilmente proporzionale alla lunghezza della catena = rune dissolte).
- A **scudo esaurito**, Koolkan è scoperto: basta **colpirlo con un runa lanciato qualsiasi** — con **traiettoria libera** (linea di tiro non ostruita) — per **abbatterlo**.
- Abbattuto Koolkan → **round up**.
- **Escalation per round** (§13): più lastre di scudo, poli che si spostano, nuovi spawner, più colori.
- Numeri (lastre per round, danno per scarica) **TBD**.

## 13. Progressione e difficoltà

Struttura a **round** (riusa il sistema di FunWarriors): ogni round si **abbatte il Koolkan** per avanzare; ogni nuovo round è più duro. Leve di scaling (valori **TBD in playtest**):

| Leva | Effetto sulla difficoltà |
|---|---|
| **Scudo di Koolkan** (lastre) | Più lastre → più scariche/circuiti per abbatterlo |
| **N° di colori** delle gemme | Più colori → ponte monocromatico più difficile da completare |
| **Ritmo / n° di moai-spawner** | Più rune/sec → arena si riempie più in fretta |
| **Posizione poli** | Fissi → cambiano ogni round → mobili → lanciabili (§9) |
| **Timer di lancio** | Si riduce → gioco più frenetico |
| **Disponibilità bombe** | Ricarica più lenta dell'idolo Make-make nei round alti |
| **Interferenze di Koolkan** (§14) | Introdotte nei round avanzati |

- **Game over / overflow**: l'arena ha una soglia di riempimento oltre la quale si perde. Si eredita la logica "linea/soglia dinamica" di FunWarriors come base; soglia e feedback esatti **TBD**.

## 14. Interferenze del Koolkan *(round avanzati)*

Per i round avanzati, Koolkan interferisce attivamente, trasformando i moai-spawner da minaccia passiva ad attiva:

- **Pietrificazione**: ogni tot, Koolkan trasforma alcune gemme in **pietra grigia non conduttiva** (vanno rimosse con una bomba).
- **Scambio di colore**: Koolkan cambia il colore di alcune gemme / del flusso di uno spawner, sabotando il ponte in costruzione.
- Altre interferenze **TBD**. Sono una **feature di end-game**, non del tutorial.

## 15. Punteggio **(TBD)**

Da ridefinire per la nuova meccanica (la formula merge di FunWarriors non si applica). Direzione probabile:
- Punti per **scarica** scalati con la **lunghezza della catena** e il colore/round.
- Bonus per **catene multiple in un solo lancio** (combo).
- Bonus per l'**abbattimento del Koolkan** (fine round).
- Tier di **floating score + VFX** riusabili da FunWarriors (sistema a 4 tier + escalation spettacolo). Soglie **TBD**.

## 16. UI / HUD

- **Top-left**: punteggio.
- **Top-right**: round + progresso.
- **Scudo di Koolkan**: lastre grafiche visibili = "meter" della missione (elemento HUD nuovo, prominente); cala a ogni scarica.
- **Bottom-center**: runa in attesa di lancio + traiettoria + timer.
- **NEXT**: anteprima prossimo runa.
- **Indicatore poli**: Alba/Tramonto telegrafati; path che si illumina durante la costruzione.
- Schermate (ereditate, da reskinnare): MainMenu, EndPanel (game over/victory), PausePanel, Settings, Ranking/leaderboard.

## 17. Audio *(da reskinnare)*

Reskin tematico Rapa Nui/polinesiano degli SFX ereditati. Set probabile:
- Lancio (whoosh di pietra), runa che si ferma (thud di pietra), **click di mana** tra gemme uguali, **ondata di mana/scarica** alla chiusura del circuito (suono-chiave), **bomba** (idolo Make-make), spawn moai corrotto, **scudo che si frantuma** (lastra che si stacca), **abbattimento di Koolkan**, avvicinamento overflow (heartbeat/tamburo), game over, vittoria, nuovo round.
- Musica: 1-2 loop a tema polinesiano (percussioni, cori, flauti).

## 18. Stile visivo

- **Direzione artistica**: **cartoon simpatico e un po' buffo**, alla **Super Mario / Puzzle Bobble** — colorato, amichevole, espressivo; NON realistico né cupo. I moai hanno **facce buffe ed espressive** (occhioni, smorfie); i corrotti sono "cattivi simpatici" più che horror. Forme tondeggianti, outline morbidi, animazioni vivaci (squash & stretch, rimbalzi).
- **Tema**: **Isola di Pasqua / Rapa Nui** — moai, ahu (piattaforme cerimoniali), pietra vulcanica, totem, mana — filtrato attraverso questo stile cartoon.
- **Arena**: piattaforma/ahu cerimoniale; i due moai-polo (Alba/Tramonto) agli estremi.
- **Runa**: pietra **rotonda** con **gemma colorata luminosa sopra** + micro-glifo. Stile cartoon (outline morbido, faccina/espressione opzionale sulla pietra).
- **Leggibilità statue** (importante): distinguere a colpo d'occhio i ruoli — **scala** (piccoli=pezzi, grandi=poli, colossale=boss), **luce** (benevoli luminosi/dorati vs corrotti scuri/crepati), **gemma** (solo i pezzi lanciabili).
- **VFX chiave**: la **scarica/ondata di mana** lungo il path (arco di energia ancestrale) — è il differenziatore visivo e lo screenshot di marketing.
- **Palette / sfondo** (decisione 2026-06-19): fondo **blu-grigio-scuro** (NON il verde scuro consueto). Doppio scopo: fa **risaltare l'arco di mana** blu-bianco (l'elemento che comunica l'originalità) e **allontana visivamente** dai matcher "caldi/luminosi". Gemme, mana e moai-polo restano saturi/luminosi in contrasto sul fondo freddo.
- Resto della direzione di dettaglio (livello di stilizzazione) **TBD** col prototipo.

## 19. Asset necessari (stima preliminare) **(TBD)**

- **Runa**: 1 base rotonda di pietra + N gemme luminose colorate (N = n° colori) + micro-glifi. Riusa il sistema sprite di FunWarriors.
- **Statue**: Moai Alba, Moai Tramonto, idolo Make-make (stati: carica/scarica), Koolkan (boss, scudo a lastre, fasi), moai-spawner. ~5-6 asset + stati.
- **VFX**: ondata di mana/scarica (chiave), esplosione bomba, dissoluzione gemme, lastra di scudo che si stacca, abbattimento boss. Riusa il pipeline particellare ereditato.
- **Background**: isola/ahu vulcanico, fondo blu-grigio-scuro.
- **UI**: reskin pannelli + nuovo HUD scudo.
- **Audio**: vedi §17.

## 20. Rischi di feel e mitigazioni (da prototipare per primi)

| Rischio | Mitigazione |
|---|---|
| **Catena monocromatica via fisica = caotica/fortunosa** | Magnetismo same-color (§7) + mira con traiettoria + tolleranza di conduzione + eventuali "bracci" dei poli |
| **Magnetismo troppo forte banalizza il puzzle** | Tenerlo come nudge a corto raggio; tarare raggio/forza in prototipo |
| **Poli poco leggibili** | Telegrafia forte + path illuminato + onboarding in-gameplay |
| **Statue confuse fra loro** (tutto è un moai) | Distinguere per scala + luce + gemma (§18) |
| **Arena intasata frustrante** | Bombe dall'idolo Make-make (§10) come valvola di sfogo |
| **Primo impatto "ennesimo color matcher"** | Rendere boss/statue/scudo/mana immediatamente leggibili in anteprima e primi 10s (§3) |

## 21. Out of scope v1 / Monetizzazione / Metriche *(ereditato)*

- **Out of scope v1**: multiplayer, skin/cosmetics, achievements, eventi stagionali, IAP, modalità alternative.
- **Monetizzazione**: revenue share portale via SDK; banner + interstitial tra partite (mai durante il gameplay).
- **Leaderboard**: infrastruttura riusabile (Firestore/Null/Mock); per FunKoolkan serve **nuovo progetto Firebase** quando si attiva l'online (oggi `BACKEND='mock'`).
- **KPI**: D1 retention >35%, sessione media >4 min, partite/sessione >2.5, completion onboarding >70%.

## 22. Decisioni aperte (da chiudere prima della roadmap)

- ~~Nome player-facing~~ ✅ deciso: resta **FunKoolkan** (gioco); **Koolkan** = nome del boss.
- **N° colori iniziale + scaling per round**: TBD.
- **N° / comportamento moai-spawner** (quanti, ritmo, colore sputato): TBD.
- **Tipi di bomba esatti** (oltre raggio/colore): TBD.
- **Formula punteggio**: TBD.
- **Prefill iniziale dell'arena**: TBD.

---

> **Stato design**: tema convertito in Rapa Nui (2026-06-19). Core meccanico definito (circuito di mana + scudo-boss + round). Prossimo passo dopo aver chiuso le decisioni di §22: prototipo greybox della **meccanica core** (conduzione + magnetismo + poli fissi) per validare il feel — è il punto che fa vivere o morire il gioco.

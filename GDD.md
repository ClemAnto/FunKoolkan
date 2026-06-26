# Game Design Document — FunKoolkan

> Documento di game design. Versione 0.4 (loop **colonne / Aku / risveglio di Koolkan** definito il 2026-06-26). Tema **Rapa Nui / Isola di Pasqua** (2026-06-19, sostituisce il design maya). Il **merge è eliminato**. Le sezioni **(ereditato)** descrivono infrastruttura riusata da FunWarriors; quelle **TBD** sono da definire in prototipo/playtest.
>
> ⚠️ **EVOLUZIONE 2026-06-26 (v0.4) — il core è il LOOP COLONNE / AKU / RISVEGLIO.** È la naturale evoluzione del curling: la detection HOUSE/TEE e gli star (`RaisingStar`) restano, ma il **bersaglio cambia**. Ai due lati dell'altare di **Koolkan** (che inizia **addormentato**) ci sono **due colonne** di pietre rettangolari impilate, ognuna contrassegnata col **simbolo/colore di un tipo di runa**. Gli **Aku-aku** salgono sulle colonne e **pregano** per risvegliare Koolkan. Il giocatore lancia una runa: quando si **ferma sul TEE**, tutte le stone **stesso-tipo** nell'HOUSE (+ propagazione a catena alle stone stesso-tipo **quasi a contatto** fuori dall'house) diventano **star** che colpiscono **unicamente le pietre-colonna dello stesso colore** → erodono la colonna (le pietre hanno HP) ed **elettrizzano subito gli Aku** che vi stanno sopra. **Obiettivo del round = abbattere le colonne.** Dettaglio completo: **§5 + §6**. Il "curling → proiettili verso Koolkan" del pivot precedente è **superato** da questo (i proiettili vanno alle colonne, non a Koolkan, salvo l'ultimo round).
>
> ⚠️ **PIVOT 2026-06-22 — il core in prototipo è ora il CURLING (non più il circuito di mana).** Costruire strutture per unire i due poli non divertiva → il **circuito di mana** descritto qui sotto (catena Alba↔Tramonto + scarica) è **parcheggiato come bonus futuro**. **Nuovo core**: al centro dell'arena un'area **HOUSE** con un **TEE** al centro; quando una stone si **ferma sul TEE**, tutte le stone **dello stesso colore** dentro/che toccano l'**HOUSE** si trasformano in **proiettili di energia** verso **Koolkan** (la stone sul TEE è l'ultimo proiettile; le altre di colore diverso restano). Boss Koolkan a scudo, idolo Make-make/bombe, moai-spawner, overflow=game over, reskin Rapa Nui **restano validi**: cambia solo *come si carica il colpo* (curling invece di circuito topologico). Dettaglio curling da formalizzare in v0.4.
>
> **Nome**: il gioco resta **FunKoolkan**; **Koolkan** è il nome del **boss** (moai colossale corrotto) — il nome coniato è invisibile come etimologia maya al giocatore e funziona da brand distintivo (decisione 2026-06-19).

## 1. Concept in una frase

Un puzzle-arcade fisico a tema **Isola di Pasqua**: lanci **rune** rotonde con gemma colorata in un'arena (fisica curling, gravità 0) e le fai **fermare sul TEE** al centro per scatenare **star di energia** (`RaisingStar`) che abbattono le **colonne sacre** ai lati dell'altare. Sulle colonne gli **Aku-aku** pregano per **risvegliare Koolkan** (il moai colossale corrotto e dormiente): abbatti le colonne per zittire il rito e **completare il round** prima che l'arena si intasi di rune. Nell'ultimo round il risveglio è inevitabile → affronti e **abbatti Koolkan**.

## 2. Pitch (per CrazyGames/Poki/GameDistribution)

> **Non** risvegliare il colosso! Sull'altare dorme **Koolkan**, il gigante di pietra corrotto, e gli spiriti **Aku-aku** salgono sulle colonne sacre per ridestarlo con le loro preghiere. Lancia le **rune** nell'arena, fermale sul cuore della **casa** sacra e scatena le **scariche di mana** che frantumano le colonne ed elettrizzano gli Aku. Tieni il colosso addormentato round dopo round, libera bombe colpendo l'idolo di **Make-make** — e quando il risveglio diventa inevitabile, **abbatti Koolkan**.

## 3. Differenziazione (esito deep-research, 2026-06-19)

> ⚠️ **Le due deep-research qui sotto sono state condotte sul core a *circuito di mana* (2026-06-19), poi superato (curling → v0.4 loop colonne/Aku/risveglio).** Cosa **regge ancora** indipendentemente dal core: la diagnosi del rischio "primo impatto = ennesimo color shooter", e tutte le **leve di presentazione** (identità Rapa Nui, fondo blu-grigio-scuro, iconografia moai, niente "Bubble…", nome coniato). Cosa **andrebbe ri-verificato** sul core v0.4: la claim "nessun competitor fonde i pilastri" cambia bersaglio — il nuovo loop ha un sapore **tower-defense** (impedire il risveglio di un boss difendendo/abbattendo strutture) innestato su un physics-shooter, fusione diversa da quella ricercata. → **una deep-research #3 sul core v0.4 è consigliata** prima della submission (decisione aperta).

Il motivo del rifiuto di FunWarriors su CrazyGames era "non abbastanza diverso" (originalità = criterio formale di approvazione e di eleggibilità ai ricavi). Diagnosi:

- **Rischio di base**: ogni mattone meccanico appartiene a generi saturi — cluster-collapse (SameGame/Collapse!), "lancia e fai esplodere colori uguali" (bubble shooter/Zuma), physics-drop (Suika). Il pericolo maggiore è il **primo impatto**: un revisore può archiviare a colpo d'occhio come "ennesimo color/bubble shooter".
- **Difesa (core v0.4)**: nessun competitor noto fonde **physics-launch curling in arena + difesa "anti-risveglio" del boss (tower-defense-like) + spawner ambientali + nemici (Aku) che caricano la minaccia**. La combinazione resta il vero elemento distintivo (da ri-verificare con deep-research #3).
- **Leve di originalità percepita a basso costo** (incorporate nel design):
  1. **Difesa anti-risveglio** come win-condition (abbatti le colonne degli Aku per non far svegliare Koolkan) → twist tower-defense su un physics-shooter, fuori dal bucket "color shooter a conteggio".
  2. **Boss Koolkan dormiente** come hook: la minaccia incombente (gauge di risveglio) e l'eventuale risveglio sono lo spettacolo da anteprima/primi 10s/screenshot.
  3. **Statue/spiriti come attori dell'arena** (Aku che pregano sulle colonne, Make-make=bomba, moai corrotti=spawner) → arena dinamica assente nei cloni di genere.
  4. **Polish + identità Rapa Nui fortissima** (la scarica `RaisingStar` sulle colonne + il risveglio del colosso = screenshot da copertina).
- **Evitare**: nomi/icone generici o confondibili (mai "Bubble…").

### Verifica post-redesign (deep-research #2, 2026-06-19) — *sul core a circuito (storico)*

Ricerca rifatta sul core di allora (circuito + scudo-boss). **Verdetto di allora: rischio rifiuto per originalità sceso da MEDIO-ALTO a BASSO-MEDIO**, ora **guidato dalla presentazione** più che dalla meccanica. (Le voci meccaniche sotto si riferiscono al core a circuito; le tieni come precedente, non come verifica del core v0.4.)

- I puzzle "completamento circuito" reali (*Connect Current Wires*, *Electricity Chain*, PuzzleBaron Circuits) sono tutti **grid-tap statici, senza fisica** → la distinzione (di allora) reggeva.
- I "puzzle che alimentano un boss" (*Tower Swap* su CrazyGames, *Witching Stone*) sono **a griglia / a turni**, non physics-arena.
- **Nessun titolo fondeva i 4 pilastri** (del core a circuito).
- ⚠️ **Rischio residuo #1 = primo impatto** *(tuttora valido)*: a colpo d'occhio può sembrare un matcher di gemme. La ricerca aveva segnalato *Bubble Tower 3D* (lancio + colore, **azteco**) come collisione su CrazyGames. **Il cambio tema da maya a moai azzera quella collisione** e rafforza l'iconicità a colpo d'occhio. Mitigazione confermata: **fondo blu-grigio-scuro** + boss/scarica in primo piano (vedi §18).
- La review è **soggettiva**: si passa se il revisore percepisce il loop nuovo. **Leve decisive (aggiornate v0.4)**: thumbnail che telegrafa il **colosso Koolkan che si risveglia + la scarica `RaisingStar` che colpisce le colonne**; iconografia moai inconfondibile; nome coniato.

## 4. Target *(ereditato)*

- Piattaforma primaria: **CrazyGames** (dove è avvenuto il rifiuto), poi **Poki / GameDistribution**.
- Età: **8-14 anni**, gender-neutral.
- Dispositivi: desktop + mobile + tablet.
- Orientamento: **portrait primario** (720×1280), landscape come adattamento.
- Layout arena: derivato da `initLayout()` (Track.ts), agganciato in basso al centro, responsivo senza bande nere (vedi MEMO/COCOS).
- Sessioni attese: **2-20 minuti**, effetto "una partita ancora".

## 5. Loop di gioco *(v0.4 — colonne / Aku / risveglio)*

1. La partita inizia con **Koolkan addormentato** sul suo altare e, ai due lati, **due colonne** di pietre rettangolari impilate, ognuna marcata col **simbolo/colore di un tipo di runa**.
2. Gli **Aku-aku** arrivano **da fuori l'arena**, salgono sulle colonne e iniziano a **pregare**: ogni Aku che prega ininterrotto **emana uno spirito ogni 5s** verso Koolkan. A **10 spiriti** (totali, dunque più Aku = più veloce) Koolkan **si sveglia**. La gauge si **resetta a ogni round-up**.
3. Il giocatore vede una **runa** in attesa di lancio (bottom center) + anteprima **NEXT**; mira con drag (fionda/Puzzle Bobble, §11) e rilascia → la runa scivola nell'arena (Box2D, gravità 0, §11).
4. Quando una runa si **ferma sul TEE** (al centro dell'HOUSE): tutte le rune **dello stesso tipo** dentro/che toccano l'**HOUSE** — **più** quelle stesso-tipo **quasi a contatto** appena fuori (propagazione a catena a **breve distanza**) — si trasformano in **star** (`RaisingStar`).
5. **Bersaglio degli star = unicamente le pietre-colonna dello stesso colore/tipo**, nient'altro. Ogni star toglie **HP** a una pietra (le pietre **non** crollano in un colpo). Gli **Aku sopra la colonna colpita si elettrizzano subito** (perché *stanno sulla colonna*, non perché colpiti) → eliminati → smettono di pregare.
6. **Se non esistono pietre-colonna di quel colore**, lo star **non parte**: la runa sul TEE si distrugge comunque (insieme alle connesse nell'HOUSE). → il tee-shot è **sempre** una valvola di sfogo anti-overflow, anche senza match di colonna.
7. **Obiettivo del round = abbattere entrambe le colonne** (= **completare il round**). Raggiunto (n° pietre/Aku **TBD**) → **round up**: **reset totale** — Koolkan torna a **dormire**, la gauge di risveglio si **azzera**, le colonne vengono **ricostruite più alte** (più pietre/HP). Si riparte **identici** che si fosse svegliato o no.
8. **Se il rito non viene interrotto** (gauge a 10) → **Koolkan si sveglia** e comincia a **far spuntare rune** nell'arena, **sempre più velocemente**: è **solo pressione aggiuntiva** verso l'overflow, **non** un fallimento. Non c'è uno stato di "riaddormentamento" a sé — **completare il round** (passo 7) è ciò che lo rimette a dormire.
9. **Obiettivo finale = distruggere Koolkan**, ma **solo nell'ultimo round**, dove il risveglio è **inevitabile**. Negli altri round "basta" completare il round (abbattere le colonne), sveglio o meno. ⚠️ **TBD**: *come* si danneggia Koolkan nell'ultimo round (probabile: colonne giù → gli star **retargettano Koolkan**, riusando il fallback già in `RaisingStar`).
10. **Game over**: l'arena accumula **troppe rune** (overflow) — soglia/feedback esatti **TBD** (eredita la logica "linea/soglia" di FunWarriors, §13). È un **endless a punteggio** scandito dai round.

> ⚠️ Nota di tono: la gauge di risveglio è **monotòna** entro il round — sale più in fretta con più Aku, e si **rallenta** eliminando Aku (meno emettitori), ma non torna indietro fino al **round-up** (l'unico reset). La sciatteria iniziale si paga; il risveglio rende il round più duro ma resta recuperabile completandolo.

## 6. Meccanica core — colonne, Aku e risveglio di Koolkan *(v0.4)*

> Il **circuito di mana** (catena monocromatica Alba↔Tramonto) è **parcheggiato** come bonus futuro: codice in repo, descrizione nelle note di pivot e nella memoria `project-glue-mechanic`. Questa sezione descrive il core **attivo**.

### Gli attori

- **Koolkan**: il boss colossale, inizia **addormentato** sull'altare al centro/fondo. Si risveglia se il rito degli Aku non viene interrotto; è il bersaglio finale **solo nell'ultimo round**.
- **Colonne (2)**: ai due lati dell'altare, pile di **pietre rettangolari** marcate ciascuna col **simbolo/colore di un tipo di runa**. Sono il **bersaglio del round** e la **leva unica** del giocatore (abbatterle previene/inverte il risveglio). Ogni pietra ha **HP** (più colpi per romperla).
- **Aku-aku**: salgono sulle colonne e **pregano** → caricano la gauge di risveglio. Si **eliminano** elettrizzandoli (= colpendo la colonna su cui stanno) o spingendoli giù.

### La gauge di risveglio

- Ogni Aku che prega **ininterrotto** emette **1 spirito ogni 5s** che vola a Koolkan.
- A **10 spiriti totali** Koolkan **si sveglia** (più Aku contemporaneamente → carica più veloce).
- Si **resetta a ogni round-up**. **Monotòna** entro il round (vedi nota §5): la freni eliminando Aku, non la riavvolgi.
- Visualizzazione della gauge **TBD** (come comunicare "spiriti accumulati / risveglio imminente").

### Il colpo (riusa la detection curling)

- Runa **ferma sul TEE** → tutte le stone **stesso-tipo** nell'**HOUSE** + quelle stesso-tipo **quasi a contatto** appena fuori (catena a **breve distanza**, *non* tutta l'arena) → diventano **star** (`RaisingStar`).
- Gli star colpiscono **solo** le **pietre-colonna del proprio colore** → −HP alla pietra + **gli Aku su quella colonna si elettrizzano**.
- **Nessuna pietra-colonna di quel colore** → star non parte; la runa sul TEE si distrugge comunque con le connesse nell'HOUSE (valvola anti-overflow color-indipendente).

### Profondità di gioco

- **Vincolo di colore**: puoi danneggiare una colonna **solo** col suo colore → devi alternare i colori che alimenti al TEE (col NEXT casuale, gestione della scorta).
- **Doppia pressione interagente**: gauge di risveglio (Aku) **e** overflow (rune accumulate); se Koolkan si sveglia, spawna rune → accelera l'overflow → doom-loop leggibile.
- **Catena fuori dall'house corta** (quasi a contatto): è la valvola di sfogo *e* il momento "wow" alla Suika, ma tenuta corta perché l'overflow resti una minaccia.

> **Riuso tecnico**: la detection HOUSE/TEE (`House.ts`) e `RaisingStar` esistono già (v0.2.x). Da fare: ① bersaglio star = pietra-colonna stesso-tipo (oggi mira agli Aku/Koolkan); ② HP sulle pietre-colonna + ricostruzione "più alta" al round-up; ③ elettrificazione Aku sulla colonna colpita; ④ propagazione a catena fuori dall'house; ⑤ gauge spiriti + stati sleep/wake di Koolkan; ⑥ spawn rune di Koolkan sveglio.

## 7. Runa (i pezzi lanciati)

- **Aspetto**: una **runa rotonda** di pietra, uguale per tutte, con una **gemma colorata luminosa sopra**. La gemma è il **portatore di colore** (lettura istantanea + look premium): la pietra è neutra/grigia, il colore vive nella gemma che brilla. Forma rotonda = hitbox circolare (coerente con la fisica ereditata).
- **Accessibilità**: ogni colore porta un **micro-glifo / forma distintiva** sulla gemma (ridondanza per daltonici).
- **Palette gemme**: colori saturi e luminosi (verde, turchese, ambra, rosso, viola…); set iniziale e numero esatto **TBD** (vedi §13: il n° di colori è una leva di difficoltà).
- **Magnetismo**: le gemme **dello stesso colore si attraggono** → catene più organiche, meno casualità nel piazzamento.
  - ⚠️ **Taratura critica**: deve essere un **nudge a corto raggio**, non uno *snap* forte. Troppo aggressivo → l'arena si auto-organizza in blob monocromatici e annulla la profondità degli "ostacoli di colore". Deve **assistere l'assemblaggio**, non costruire la catena al posto del giocatore. Parametri (raggio + forza) **TBD in prototipo**; base riusata dall'attrazione del merge di FunWarriors.

## 8. Statue — tassonomia

Tutto il mondo è fatto di **statue di pietra che prendono vita**: è la coerenza forte del tema moai. Per evitare confusione, le statue si distinguono per **scala**, **colore/luce** (benevole = luminose; corrotte = scure/crepate) e per la **gemma** (solo i runa lanciabili hanno la gemma colorata).

| Schieramento | Statua / entità | Ruolo |
|---|---|---|
| 🌅 **Buone** | **Idolo di Make-make** | Colpito → rilascia una **bomba** → si ricarica (§10) |
| | *Moai dell'Alba / del Tramonto* | ⏸️ Poli del **circuito di mana** — parcheggiati col core a circuito (§6, §9) |
| 🪨 **Cattive** | **Koolkan** | Boss: moai colossale corrotto, **dormiente**; bersaglio finale (§12) |
| | **Colonne sacre (2)** | Pile di pietre marcate per colore — bersaglio del round; gli Aku vi salgono (§6) |
| | **Aku-aku** | Spiriti che pregano sulle colonne per risvegliare Koolkan (§6) |
| | **Moai-spawner** | Moai corrotti che sputano nuove rune nel tempo (la pressione) |

## 9. Poli (Alba / Tramonto) — ⏸️ *parcheggiati col circuito di mana*

> Sezione legata al **core a circuito** (§6), parcheggiato. Nel core v0.4 i due poli **non** sono usati (i bersagli sono le **colonne sacre**). Conservata per l'eventuale riattivazione del bonus circuito.

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

> Il sistema di lancio, fisica e responsività è riusato. Cambia il "cosa" si lancia (runa invece di warrior) e il "cosa succede quando si ferma" (scoring **curling**: runa sul TEE → `RaisingStar`, invece del merge). Dettagli completi in MEMO/TECH.

- **Input**: mouse e touch equivalenti.
- **Lancio (fionda + Puzzle Bobble)**: press sul runa → drag verso il basso/diagonale → direzione di lancio **opposta al drag**, lunghezza drag = forza (cappata); soglia minima sotto la quale il lancio si annulla; **traiettoria con anteprima** (mira). Vedi GDD FunWarriors §9 per i dettagli operativi, ancora validi.
- **Timer di lancio**: conto alla rovescia che si riduce coi round (pressione crescente); allo scadere, lancio automatico. Curva **TBD** (vedi §13).
- **Fisica**: Box2D, **gravità = 0**; hitbox circolare; damping lineare per lo scivolamento stile curling; pareti laterali elastiche (rimbalzi strategici), fondo smorzato; settling per abilitare il lancio successivo.
- **Mira a poli/idoli**: la fisica di lancio deve permettere di colpire con precisione i poli (se mobili/lanciabili), l'idolo Make-make e il Koolkan → l'anteprima di traiettoria è essenziale.

## 12. Boss Koolkan — dormiente, risveglio e abbattimento *(v0.4)*

> Il modello **"scudo a lastre come meter, danneggiato dalle ondate di mana"** (core a circuito) è **superato**. Nel core v0.4 la missione è **difensiva**: tenere Koolkan addormentato abbattendo le colonne; il "meter" è la **gauge di risveglio** (§6), non uno scudo.

- **Stato di base**: Koolkan **dorme** sull'altare. È inerte: non attacca, non spawna.
- **Minaccia (gauge di risveglio, §6)**: gli **Aku** che pregano sulle colonne caricano la gauge (1 spirito/5s ciascuno; 10 spiriti totali → risveglio). È questo il "meter" leggibile della tensione, **prominente in HUD** (§16).
- **Risveglio**: a gauge piena Koolkan **si sveglia** e inizia a **far spuntare rune** nell'arena, a ritmo crescente → pressione verso l'overflow. **Non** è un game-over: è difficoltà aggiuntiva, recuperabile **completando il round**.
- **Riaddormentamento = completare il round**: abbattere entrambe le colonne chiude il round → **round-up** che resetta tutto (Koolkan dorme, gauge azzerata, colonne ricostruite più alte), identico a chi non l'avesse mai svegliato (§5.7-§5.8).
- **Abbattimento (solo ultimo round)**: l'obiettivo finale — distruggere Koolkan — avviene **solo nell'ultimo round**, dove il risveglio è **inevitabile**. ⚠️ **TBD il meccanismo**: probabile che, abbattute le colonne, gli **star** (`RaisingStar`) **retargettino Koolkan** (riusa il fallback già presente) finché non lo si abbatte → vittoria. Resta da decidere se Koolkan abbia in quella fase una **barra HP/scudo** dedicata (eventuale ritorno mirato dell'idea "lastre" **solo** come HP del boss finale).
- **Escalation per round** (§13): colonne **più alte** (più pietre/HP), **più Aku / ritmo di preghiera** più rapido, più colori, più spawner.
- Numeri (pietre/HP per colonna, soglie gauge, danno star, condizione di vittoria finale) **TBD**.

## 13. Progressione e difficoltà

Struttura a **round** (riusa il sistema di FunWarriors): ogni round si **completa abbattendo le colonne** per avanzare (Koolkan si abbatte solo nell'ultimo, §12); ogni nuovo round è più duro. Leve di scaling (valori **TBD in playtest**):

| Leva | Effetto sulla difficoltà |
|---|---|
| **Altezza/HP delle colonne** | Più pietre/HP → più tee-shot a colore per abbatterle (cresce a ogni round-up) |
| **N° Aku / ritmo di preghiera** | Più Aku sulle colonne → gauge di risveglio più rapida (§6) |
| **N° di colori** delle gemme | Più colori → più difficile avere il colore giusto al TEE per la colonna giusta |
| **Ritmo / n° di moai-spawner** | Più rune/sec → arena si riempie più in fretta (+ spawn-rune di Koolkan sveglio) |
| **Timer di lancio** | Si riduce → gioco più frenetico |
| **Disponibilità bombe** | Ricarica più lenta dell'idolo Make-make nei round alti |
| **Interferenze di Koolkan** (§14) | Introdotte nei round avanzati |

- **Game over / overflow**: l'arena ha una soglia di riempimento oltre la quale si perde. Si eredita la logica "linea/soglia dinamica" di FunWarriors come base; soglia e feedback esatti **TBD**.

## 14. Interferenze del Koolkan *(round avanzati)*

Per i round avanzati, Koolkan interferisce attivamente, trasformando i moai-spawner da minaccia passiva ad attiva:

- **Pietrificazione**: ogni tot, Koolkan trasforma alcune rune in **pietra grigia inerte** (non matchano nessun colore/colonna; vanno rimosse con una bomba o ingombrano fino all'overflow).
- **Scambio di colore**: Koolkan cambia il colore di alcune rune / del flusso di uno spawner, sabotando il match col TEE/colonna che stai preparando.
- Altre interferenze **TBD**. Sono una **feature di end-game**, non del tutorial.

## 15. Punteggio **(TBD)**

Da ridefinire per la nuova meccanica (la formula merge di FunWarriors non si applica). Direzione probabile:
- Punti per **star generati da un tee-shot** (scalati col n° di stone coinvolte = house + catena), per **pietra-colonna distrutta** e per **Aku eliminato**.
- Bonus per **tee-shot multipli a catena** in un solo lancio (combo).
- Bonus per il **completamento del round** (colonne abbattute) e per l'**abbattimento del Koolkan** (ultimo round).
- Tier di **floating score + VFX** riusabili da FunWarriors (sistema a 4 tier + escalation spettacolo). Soglie **TBD**.

## 16. UI / HUD

- **Top-left**: punteggio.
- **Top-right**: round + progresso.
- **Gauge di risveglio di Koolkan**: "meter" della missione (elemento HUD nuovo, prominente) — comunica gli **spiriti accumulati** / il risveglio imminente (10 spiriti); si **azzera al round-up**. Forma di visualizzazione **TBD** (§6).
- **Stato delle colonne**: HP/pietre rimaste per ciascuna delle 2 colonne (obiettivo del round).
- **Bottom-center**: runa in attesa di lancio + traiettoria + timer.
- **NEXT**: anteprima prossimo runa.
- Schermate (ereditate, da reskinnare): MainMenu, EndPanel (game over/victory), PausePanel, Settings, Ranking/leaderboard.

## 17. Audio *(da reskinnare)*

Reskin tematico Rapa Nui/polinesiano degli SFX ereditati. Set probabile:
- Lancio (whoosh di pietra), runa che si ferma (thud di pietra), **runa sul TEE** (rintocco di attivazione), **scarica `RaisingStar`** che parte e colpisce la colonna (suono-chiave), **pietra-colonna che si sbriciola**, **preghiera degli Aku** (canto rituale che sale con la gauge) + **Aku elettrizzato**, **bomba** (idolo Make-make), spawn moai corrotto, **risveglio di Koolkan** (boato), **abbattimento di Koolkan** (ultimo round), avvicinamento overflow (heartbeat/tamburo), game over, vittoria, nuovo round.
- Musica: 1-2 loop a tema polinesiano (percussioni, cori, flauti).

## 18. Stile visivo

- **Direzione artistica**: **cartoon simpatico e un po' buffo**, alla **Super Mario / Puzzle Bobble** — colorato, amichevole, espressivo; NON realistico né cupo. I moai hanno **facce buffe ed espressive** (occhioni, smorfie); i corrotti sono "cattivi simpatici" più che horror. Forme tondeggianti, outline morbidi, animazioni vivaci (squash & stretch, rimbalzi).
- **Tema**: **Isola di Pasqua / Rapa Nui** — moai, ahu (piattaforme cerimoniali), pietra vulcanica, totem, mana — filtrato attraverso questo stile cartoon.
- **Arena**: piattaforma/ahu cerimoniale; al centro/fondo l'altare con **Koolkan dormiente**, ai lati le **due colonne sacre** (pietre marcate per colore) su cui salgono gli Aku.
- **Runa**: pietra **rotonda** con **gemma colorata luminosa sopra** + micro-glifo. Stile cartoon (outline morbido, faccina/espressione opzionale sulla pietra).
- **Leggibilità statue** (importante): distinguere a colpo d'occhio i ruoli — **scala** (piccoli=rune/Aku, medie=colonne/idolo, colossale=boss), **luce** (benevoli luminosi/dorati vs corrotti scuri/crepati), **gemma** (solo i pezzi lanciabili).
- **VFX chiave**: la **scarica `RaisingStar`** che vola dalla casa alle colonne (arco di energia ancestrale) + il **risveglio del colosso** — sono il differenziatore visivo e lo screenshot di marketing.
- **Palette / sfondo** (decisione 2026-06-19): fondo **blu-grigio-scuro** (NON il verde scuro consueto). Doppio scopo: fa **risaltare le scariche di mana** blu-bianche (l'elemento che comunica l'originalità) e **allontana visivamente** dai matcher "caldi/luminosi". Gemme, mana e statue restano saturi/luminosi in contrasto sul fondo freddo.
- Resto della direzione di dettaglio (livello di stilizzazione) **TBD** col prototipo.

## 19. Asset necessari (stima preliminare) **(TBD)**

- **Runa**: 1 base rotonda di pietra + N gemme luminose colorate (N = n° colori) + micro-glifi. Riusa il sistema sprite di FunWarriors.
- **Statue/entità**: idolo Make-make (stati carica/scarica), Koolkan (boss, stati **dormiente / sveglio / abbattuto**), **colonne sacre** (pietre marcate per colore, varie altezze per round), **Aku-aku** (già scaffolded, v0.2.5), moai-spawner; (*Moai Alba/Tramonto solo se si riattiva il circuito*). ~6-7 asset + stati.
- **VFX**: scarica **`RaisingStar`** (chiave), esplosione bomba, dissoluzione rune, **pietra-colonna che si sbriciola**, **Aku elettrizzato**, **spirito di preghiera** che sale a Koolkan, **risveglio** + **abbattimento** del boss. Riusa il pipeline particellare ereditato.
- **Background**: isola/ahu vulcanico, fondo blu-grigio-scuro.
- **UI**: reskin pannelli + nuovo HUD **gauge di risveglio** + stato colonne.
- **Audio**: vedi §17.

## 20. Rischi di feel e mitigazioni (da prototipare per primi)

| Rischio | Mitigazione |
|---|---|
| **Centrare il TEE col curling è troppo difficile/fortuito** | Tarare attrito/raggio TEE + anteprima traiettoria; il tee-shot pulisce *sempre* (anche senza match colonna) così non è mai uno spreco totale (§5.6) |
| **Catena fuori dall'house troppo lunga svuota l'arena** | Tenerla "quasi a contatto" (raggio corto), così l'overflow resta una minaccia (§6) |
| **Restare a secco del colore giusto = frustrazione** | NEXT eventualmente pesato verso i colori delle colonne; la gauge dà tempo; bombe come valvola |
| **Doppia pressione (gauge + overflow) opprimente** | Telegrafare bene la gauge; il risveglio è recuperabile completando il round, non un fail (§5.8) |
| **Statue confuse fra loro** (tutto è un moai) | Distinguere per scala + luce + gemma (§18) |
| **Arena intasata frustrante** | Bombe dall'idolo Make-make (§10) + tee-shot come valvole di sfogo |
| **Primo impatto "ennesimo color matcher"** | Rendere boss/colonne/Aku/scarica immediatamente leggibili in anteprima e primi 10s (§3) |

## 21. Out of scope v1 / Monetizzazione / Metriche *(ereditato)*

- **Out of scope v1**: multiplayer, skin/cosmetics, achievements, eventi stagionali, IAP, modalità alternative.
- **Monetizzazione**: revenue share portale via SDK; banner + interstitial tra partite (mai durante il gameplay).
- **Leaderboard**: infrastruttura riusabile (Firestore/Null/Mock); per FunKoolkan serve **nuovo progetto Firebase** quando si attiva l'online (oggi `BACKEND='mock'`).
- **KPI**: D1 retention >35%, sessione media >4 min, partite/sessione >2.5, completion onboarding >70%.

## 22. Decisioni aperte (da chiudere prima della roadmap)

- ~~Nome player-facing~~ ✅ deciso: resta **FunKoolkan** (gioco); **Koolkan** = nome del boss.
- ~~Core mechanic~~ ✅ deciso (v0.4): loop **colonne / Aku / risveglio** (§5-§6).
- ~~Riaddormentamento~~ ✅ deciso: non è uno stato a sé — **completare il round** (abbattere le colonne) rimette Koolkan a dormire; il round-up resetta tutto identico (§5.7-§5.8).
- **Danno a Koolkan nell'ultimo round (§5.9)**: probabile retarget degli star a colonne giù; confermare.
- **Visualizzazione gauge di risveglio** (10 spiriti): TBD.
- **Numeri colonne**: HP per pietra, pietre per colonna, quanto si alza al round-up; n° Aku/pietre per chiudere il round: TBD.
- **Tuning catena fuori dall'house**: raggio "quasi a contatto": TBD playtest.
- **N° colori iniziale + scaling per round**: TBD.
- **N° / comportamento moai-spawner** (quanti, ritmo, colore sputato): TBD — *e* relazione col nuovo spawn-rune di Koolkan sveglio.
- **Tipi di bomba esatti** (oltre raggio/colore): TBD.
- **Formula punteggio**: TBD.
- **Prefill iniziale dell'arena**: TBD.

---

> **Stato design**: tema Rapa Nui (2026-06-19). Core meccanico **v0.4** definito (2026-06-26): **loop colonne / Aku / risveglio di Koolkan** su base curling (§5-§6). Già in repo: detection HOUSE/TEE, `RaisingStar`, scaffold Aku (spawner+AI+morte, v0.2.5). Prossimo passo: prototipo greybox del loop completo (star → pietre-colonna con HP, elettrif. Aku, gauge di risveglio + spawn-rune di Koolkan sveglio) per validare il feel della **doppia pressione** (gauge vs overflow) — è il punto che fa vivere o morire il gioco.

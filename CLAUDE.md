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

## Convenzioni di codice
- Component classes in PascalCase
- File scripts: PascalCase.ts (es. GameManager.ts)
- Cartelle: lowercase (managers/, entities/, utils/)
- Decoratori @ccclass con stesso nome della classe
- Log (console.log/warn/error) sempre in inglese

## Remote control
Se la chat è aperta da qualche minuto (sessione di sviluppo attiva), avvia automaticamente il remote-control così possiamo continuare la conversazione tramite app

## Versioning
- La versione è definita in due posti: `package.json` (campo `version`) e `GameManager.ts` (costante `VERSION`) — devono essere sempre allineati.
- **Ad ogni `npm run serve` incrementa la patch** (`0.1.x → 0.1.x+1`) in entrambi i file prima di buildare.

## Comando di chiusura sessione
Quando l'utente scrive **"OK Chiudo"** (o varianti come "Ok chiudo"), significa che sta per cambiare chat. Aggiornare immediatamente tutti gli `.md` rilevanti con quanto scoperto/cambiato nella sessione corrente prima di rispondere.

## Stato attuale
Fase 0 — Bootstrap (v0.1.0). Progetto appena forkato da FunWarriors (2026-06-19).

**Cosa è già pronto (ereditato da FunWarriors):** gameplay completo (merge + lancio), HUD, pannelli end-game, powerup, audio/VFX/juice, onboarding in-gameplay, rework resize/fullscreen, e **integrazione portali completa** — adapter Poki/CrazyGames/**GameDistribution** (`PortalAdapter`), leaderboard riutilizzabile, script `pack:crazygames`/`pack:gamedistribution`, overlay rotate. Dettagli tecnici in MEMO/TECH/COCOS.

**Reset di fork già applicati:** `package.json` (name/version/uuid), `VERSION=0.1.0`, `GD gameId`→placeholder, `LeaderboardConfig.BACKEND='mock'` (niente Firebase finché non se ne crea uno nuovo per FunKoolkan), rimossi `submission/`/`CRAZYGAMES.md`/`GAMEDISTRIBUTION.md` (storia FunWarriors).

**Da fare (prossimi passi):**
- **Reskin maya**: sostituire sprite/sfondi/HUD a tema (Kukulkan, piramidi, giada); riscrivere `GDD.md`/`ROADMAP.md` per il nuovo design.
- **Dinamiche di gioco**: definire e implementare le meccaniche che cambiano rispetto a FunWarriors (da specificare).
- Quando serve la leaderboard online: creare un **nuovo progetto Firebase** e impostare `LeaderboardConfig` (chiavi + `BACKEND='firestore'`).
- Per i portali: registrare il gioco su GD/altri e impostare il relativo `gameId`.

> NB: la pubblicazione di FunWarriors (gioco GD #73510, SDK verificato) resta nel progetto **FunWarriors** separato. Qui si riparte da zero come prodotto.
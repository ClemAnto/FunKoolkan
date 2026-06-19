# Roadmap Tecnica — FunWarriors

> Roadmap di sviluppo in Cocos Creator (TypeScript). Stima realistica part-time. Aggiornata 2026-06-10 (v0.8.56).

## Stack tecnologico

- **Engine**: Cocos Creator 3.8.8
- **Linguaggio**: TypeScript (strict mode)
- **Fisica**: Box2D (modulo built-in di Cocos)
- **Build target**: HTML5 (Web Mobile + Desktop)
- **SDK portale**: Poki SDK (o CrazyGames SDK) — integrazione finale
- **Version control**: Git (repo privato GitHub/GitLab)
- **Asset pipeline**: PNG sprite + Aseprite/Photoshop, audio in OGG/MP3

## Stima totale realistica

- **Inizio**: 7 maggio 2026
- **10-15h/settimana** part-time

| Fase | Durata | Periodo | Milestone |
|------|--------|---------|-----------|
| 1. Setup + prototipo greybox | 2 settimane | 7–20 mag | Fisica + lancio fionda + merge funzionanti |
| 2. Core gameplay completo | 2 settimane | 21 mag–3 giu | Loop completo greybox |
| 3. Asset + UI definitiva | 3 settimane | 4–24 giu | Look finale |
| 4. Polish + audio + balancing | 2 settimane | 25 giu–8 lug | Esperienza rifinita |
| 5. Integrazione SDK + submission | 1 settimana | 9–15 lug | Build pubblicabile |

---

## Log sessioni recenti

### 2026-06-17 (v0.10.17) — CrazyGames RIGETTATO → pass di risottomissione
- ❌ **CrazyGames ha rigettato** la prima versione (mail generica, nessun motivo specifico). Diagnosi: non tecnico ma **first-impression/qualità**. Letti tutti i requisiti (7 pagine doc) + deep-research → **`CRAZYGAMES.md`** (requisiti + checklist + esito ricerca: clone/originalità e "land in gameplay" i rischi #1; risottomissione ammessa; route Basic Launch). Email di richiesta motivo **inviata**.
- 🗑️ **Scena Tutorial eliminata** → PLAY entra **diretto nel Game** (1 click). Rimossi Tutorial.scene/.ts, `fwResetTutorial`, storia ScrollView, build-script add-tutorial-*.
- 👆 **Onboarding in-gameplay** (`OnboardingHints.ts`, nodi iniettati via `scripts/add-onboarding-hints.js`): hint mano (press→carica→rilascia, `hud/hand.png`) al 1° turno; hint "Merge 2 warriors…" al drag, fade 1.5s dopo il lancio. Skippabili, una-tantum. Replay: doppio-tap SCORE / `fwShowHints()`.
- 🪟 **Modali**: tolto il self-hide (`active=false`) da `onLoad` di EndPanel/PausePanel → vanno **inattive in editor** + binding `@property` (COCOS.md aggiornato).
- 🏷️ **Powerup rinominati (PEGI12)**: Genocide→Brotherhood, BloodHood→WildRiver (rename completo, `scripts/rename-powerups.js`, ~600 edit).
- 🔒 **Trick QA spenti su build CrazyGames** (`PORTAL==='crazygames'`): replay onboarding + DebugPanel. Verifiche tecniche 🟢 tutte ok (168 file, user-select, audio iOS, no fullscreen btn, sfondi truecolor).
- 🚀 main pushato (`ced873b`), deploy v0.10.17 su GitHub Pages. Restano: asset marketing + dichiarare portrait alla submission.

### 2026-06-16/17 (v0.10.0 → v0.10.16) — Tutorial, audio per-traccia, fix fullscreen, ottimizzazioni loading, PRIMO SUBMIT CrazyGames
- 🚀 **Prima versione sottomessa a CrazyGames (2026-06-17)** — in QA review. main pushato (`60b1296`), deploy v0.10.16 su GitHub Pages.
- 📚 **Scena Tutorial = loading-cover**: 1° PLAY → Tutorial (precarica il Game con **%** sul nodo `LoadingLabel`) → **START** → Game; PLAY successivi → Game diretto. Flag "visto" legato alla `VERSION` (riappare ad ogni build/aggiornamento). **Storia (EN) in ScrollView** (`StoryPanel`). QA: `fwResetTutorial()`. Scena + nodi iniettati via `scripts/add-tutorial-*.js`.
- 🎬 **Fade al nero + spinner sul PLAY** (`FadeOverlay` iniettato in MainMenu.scene; spinner se il load non è immediato).
- 🔧 **Fullscreen/resize RISOLTO** (rework v0.10.18): centraggio **dichiarativo via Widget** (`World` HCENTER flags 60, `Track` 20) → il mondo fisico resta centrato a ogni risoluzione; `_recentreGameLayers` (snap manuale, era esso stesso fonte di offset) **rimosso**. Resize = freeze fisica+input + **re-pin posizione LOCALE** dei warrior allo unfreeze (i corpi b2 non seguono il layer). Rebuild muri + re-pin **solo a fisica accesa** (anti-crash broadphase): se l'unfreeze cade in pausa-Settings, tutto rinviato al resume → niente salto alla chiusura modale, niente crash `UpdatePairs`. One-shot `_refreshTrackGeometry` ri-armato a ogni cambio fullscreen → mondo Box2D rifatto al lancio successivo. Vedi MEMO/TECH §Resize.
- 🎵 **Audio per-traccia + AudioManager persistente** (`addPersistRootNode`): menu/tutorial = `menu.mp3` (loop taverna 15s seamless creato con ffmpeg), Game = `main.mp3`; **entrambe lazy** (fuori dal preload), musica continua tra scene, si interrompe entrando nel Game. Vedi MEMO/TECH.
- ⚡ **Ottimizzazioni caricamento**: musica lazy; immagini ridotte in-place (PNG **8.2→5.1MB**: warrior sheet a 1024, background/illustrazioni downscale, regole in `optimize-images.js`); `nativeCodeBundleMode=wasm` + `useSplashScreen=false` (in `build.js`/`pack-crazygames.js`); Firebase tolto dal boot (lazy via `_loadSdk`); **menu bg lazy** (in `resources/bg/`, `BgFill.refit()` dopo il load); loading screen HTML a **sola %** (ibrido: cosmetica durante l'engine, milestone reali engine-ready/scena-lanciata).
- 🔢 Bump 0.10.0 → **0.10.16**.

### 2026-06-15 (v0.9.1 → v0.10.0) — Integrazione CrazyGames + conformità + fix QA
- 🎯 **Decisione strategica**: la richiesta Poki era solo l'**account sviluppatore** (silenzio, nessuna risposta) — **non** un submit del gioco. Nessuna esclusività in gioco → si procede in parallelo su **CrazyGames** (dev portal self-service, niente attesa). Correzione: ovunque dicesse "submission Poki inviata" era la richiesta account.
- 🧩 **Adapter `CrazyGamesPortal`** (SDK v3) + `PortalProvider` switch a 3 vie + flag `PORTAL` esteso a `'crazygames'`. Vedi TECH.md.
- 📦 **`npm run pack:crazygames`** (`scripts/pack-crazygames.js`): build con `PORTAL='crazygames'` (ripristino flag in `finally`) + patch-html + zip. Si carica la **cartella** `build/web-mobile` nel QA tool (CrazyGames ospita i file). `dist/` in `.gitignore`. Vedi MEMO.
- ✅ **Conformità CrazyGames** (ricerca su docs.crazygames.com): size 16MB/161 file/path relativi/user-select/no tasti riservati/no link esterni/EN → tutto ok. Fix applicati:
  - **Niente ad al primo PLAY** + `preloadScene('Game')` (era: `commercialBreak` prima del caricamento → "PLAY non parte"). L'ad solo tra le partite.
  - **Mute audio solo su `adStarted`** (non alla richiesta): nuova firma `commercialBreak(onAdStart?)` su tutta la catena Portal.
  - **Toggle Fullscreen nascosto** su CrazyGames (custom fullscreen button vietati).
  - **Privacy Policy in-game** (`PrivacyPanel.ts`): requisito "user consent" — wiring editor in corso.
- 🐛 **Fix QA — riallineamento fullscreen**: i warriors non si rimappavano al resize (opzione A: remap normalizzato nel funnel quando il layout è stabile + `Warrior.rescaleToLayout`). Vedi MEMO.
- 🐛 **Fix QA — `v__VERSION__` nel loading**: patch-html ora gira anche in `pack-crazygames`.
- ⚙️ **Fisica consistente 144/165Hz**: tutte le forze per-frame normalizzate a 60fps (`FORCE_FPS_REF`, `× dt × 60`) — bilanciamento invariato a 60fps. Vedi MEMO.
- 🔢 Bump **0.9.1 → 0.10.0** (`package.json` + `GameManager.VERSION`).
- ℹ️ **Leaderboard nativa CrazyGames** (Leaderboards MVP) esiste: si terrà Firebase per il primo submit, migrazione alla nativa post-onboarding (va configurata lato admin CrazyGames). Vedi TECH.md.

### 2026-06-12 sera (v0.8.64) — Curva di difficoltà: rampa specie + linea game-over dinamica + fix banner round-up
- 📈 **Rampa specie nuova** (SpawnManager): allo sblocco la specie entra con una **coppia adiacente** nella bag (la prima non resta mai orfana — il giocatore vive subito il primo merge) e poi pesa 1 copia/bag, +1 a ogni rebuild fino a `bagMultiplier`. Risolve il gradino al round 5 (aquila): prima entrava subito a frequenza piena.
- 📏 **Linea game-over dinamica**: parte alzata di `GO_LINE_RAISE_FRAC=0.13 × TRACK_H` (tensione early) e scende di ¼ a ogni specie sbloccata (round 3/5/7/9) fino alla quota editor, che resta autoritativa come posizione FINALE. Larghezza segue il funnel alla sua quota (`funnelWidthRatioAt`). Discesa animata (1.4s) **dentro il freeze fisica del banner round-up** + `LineDescentEffect` (afterimage + flash additivo + scintille oro verso l'alto). Logica: nodo editor = ancora immobile (sprite disattivato), visuale = clone runtime `GameOverLineDyn`; soglia = quota editor + raise. Sicurezza check: la linea scende solo → può solo CONCEDERE crossing (contatori `y>=gol` per N frame), mai causare game-over/malus spuri; `framesBelowLine` azzerato sugli alzamenti (solo new-game/debug). Min-force non è un vincolo: il lancio debole che non supera la linea alzata passa dal normale malus failed-launch.
- ✔️ Verificato che timer e specie erano GIÀ disaccoppiati (timer cala ai round 2/4/6/8/11, specie ai 3/5/7/9) — corretta la formula obsoleta in questo file.
- 🐛 **Fix sync linea a layout instabile**: a `start()` la passata Widget/Canvas non è ancora avvenuta (gotcha CoordConverter) → la linea appariva più BASSA. Risolto con `_syncGoLineWhenStable`: sampler per-frame che applica il raise solo quando la worldPosition dell'ancora è ferma da 2 frame (cap 2s); riarmato su resize live e restore.
- 🔤 **Fix banner round-up**: numeri tagliati (Label CC3 ha `lineHeight` default 40 — clippava i fontSize 88, gotcha in MEMO) e "ombra" sotto il numero nei round specie = silhouette nera troppo vicina ai numeri → riga a -172, tinta viola scuro, respiro singolo di scala, testo col font MedievalSharp.
- ⏭️ **Da testare in serve/playtest**: linea dinamica a occhio (quote/larghezza), taratura `GO_LINE_RAISE_FRAC` (0.13), rampa specie al round 5.
- 🌐 Extra sessione: short link tester **tinyurl.com/funwarriors**; nota in MEMO sul refuso storico repo `FanWarriors`; submission Poki compilata (form /share).

### 2026-06-12 (v0.8.62) — Fix: proximity merge ignorava i warriors nati da merge
- 🐛 **Bug "warriors vicini ma niente merge"**: `_checkProximityMerge` (GameManager) scartava i warriors con `launched === false` — ma `launched` lo imposta solo `applyImpulse()`. I warriors creati da merge/evolve/powerup hanno `crossedLine`/`fired` ma mai `launched`, quindi il fallback di prossimità li saltava sempre. Il merge via contatto Box2D restava l'unica via, ma il collider ha diametro `2r` contro sprite largo `4r`: visivamente "attaccati" ≠ in contatto fisico. Fix: predicato `launched || crossedLine` (stesso usato in `Warrior.onBeginContact`); il warrior in attesa sul launcher resta escluso. Gotcha in MEMO.

### 2026-06-12 (v0.8.62) — Dialog settings in-game: Quit al posto di Restart
- 🔘 **Settings in Game**: il dialog ora ha **Close + Quit affiancati** (Close a `horizontalCenter: -190` in scena, Quit clonato a runtime in posizione speculare `+190`). Quit → MainMenu con **conferma in due step** (label `Sure?` al primo click, disarmo a ogni open). Hook `Settings.onRestart` → rinominato **`onQuit`** (restart resta nel PausePanel). Property serializzata `restartButton` → `quitButton` (null) in entrambe le scene.
- 🐛 **Gotcha scoperto** (in MEMO.md): il clone ereditava il Widget `alignMode: ALWAYS` del Close → risnappato sopra l'originale ogni frame; e `Widget.destroy()` da solo non basta (differito a fine frame) → serve `enabled = false` immediato.

### 2026-06-12 (v0.8.62, sessione parallela) — Tier 5/6 floating score + vortice "tornado" + ghost gomma + debug gesture
- 🏆 **Tier 5/6 floating score chiusi** (riformulati, vedi checkbox Fase 4): a 10k/12k pt font 72/84 + burst radiale viola (`_spawnScoreBurst`) + shake, in sync con lo slowmo — soglie condivise `SCORE_TIER5_PTS`/`SCORE_TIER6_PTS` esportate da VFXManager e usate da `_maybeScoreSlowmo`.
- 🌪️ **Blackhole VFX ridisegnato a tornado** (molte iterazioni con l'utente — dinamica e parametri finali in MEMO §Blackhole): texture unica `atom.png` (copiata dalla internal lib di Cocos in `resources/particles/`), nascite accelerate `(i/n)^0.35`, viaggi indipendenti (flusso continuo — il collasso sincronizzato è stato provato e cassato), quote che scendono verso un pozzo 30px sotto il centro spirale (inward+downward), bobble, centro spirale +30px (solo spirale), tinte specie/bianco. **Gerarchia per livello**: count `12×lv−16`, raggio `(30+27×lv)`, durata `×(0.5+0.07×lv)`, sotto lv5 NIENTE streak, giri 1.2–2.0 (vs 2–3.5) e viaggi ×1.25 più lenti — vorticino discreto per i livelli bassi, tornado pieno per Champion+. Flicker fiammella provato e cassato.
- 🖤 **Merge ghost → implosione "gomma"** (~1.1s ≈ ⅔ del vortice): stira verticale → squash orizzontale → respiro → snap `quartIn`; fade altalenante + shimmer nero↔viola scuro; allo snap burst color SPECIE (`WARRIORS[type].color` lerp 40% bianco — i colori scuri spariscono nel blend additivo). NON ruota.
- 🐞 **Bug fixato**: `VFXLayer` è creato a runtime senza `UITransform` → `convertToNodeSpaceAR` ritornava `undefined` e il burst non spawnava mai, in silenzio (gotcha in MEMO).
- 🛠️ **DebugPanel a doppio tap sulla sezione ROUND** dell'HUD — toggle runtime anche nei build di produzione; flag `DEBUG` invariato (`_wireDebugPanelGesture`/`_toggleDebugPanel`/`_spawnDebugPanel`).
- ℹ️ Remote-control: nessun trigger esiste sull'account (lista vuota) — l'istruzione in CLAUDE.md presuppone un trigger da creare la prima volta.

### 2026-06-10 sera (v0.8.57 → v0.8.61) — Juice Fase 4 + perf + Poki adapter + size budget
- ✨ **Juice**: `entities/TrailEffect.ts` (scia additiva dietro il warrior in volo, emissione basata sulla distanza, autogestita) + slowmo sui punteggi alti (`_maybeScoreSlowmo`: ×0.8 ≥10k, ×0.5 ≥12k, su merge e Track Cleared).
- ⚡ **Perf**: VFXManager senza allocazioni per-frame (scratch `TMP_COLOR`/`TMP_ANCHOR` + costanti hoistate); WildRiver/Brotherhood dedupli­cati in `GlowPulseEffect` e i due Sparkle in `TintSparkleEffect` (−430 righe, API pubbliche invariate); `console.log` di gameplay dietro `DEBUG`.
- 🧩 **Poki portal adapter** (Fase 5 anticipata): `PortalSdk`/`NullPortal`/`PokiPortal`/`PortalProvider`, flag `PORTAL` default `'none'` — vedi TECH.md. Restano account Poki + test sandbox.
- 📦 **Size budget**: build **44,3 → 14,9 MB** (requisito Poki <20MB ✓): `npm run optimize:images` (PNG8 in-place, particelle→512px), `main.mp3` 112kbps senza cover, musica alternativa fuori da `resources/`. Workflow in MEMO.
- 🧹 **Housekeeping**: Netlify rimosso del tutto; tsconfig fix deprecazione TS6 (`moduleResolution: bundler`) + `lib ES2017` → `npx tsc --noEmit` a zero errori.
- ✅ Rules Firestore v1 applicate e testate end-to-end; leaderboard COMPLETA.
- 🚀 Deploy v0.8.61 su GitHub Pages; `main` pushato (4 commit).

### 2026-06-10 (v0.8.56 → v0.8.57) — Robustezza codice + riallineamento docs + chiusura Fase 3
- 🛡️ **Pass di robustezza** (da code-review a 3 agenti): `RigidBody2D` cachato in `Warrior` (getter `velocity` era hot path con `getComponent` per chiamata); nuovo `utils/SafeStorage.ts` (localStorage try/catch — incognito safe) usato ovunque; guard doppio-submit in `NameEntry` (confirm disabilitato); cleanup tween/schedule su destroy in Warrior, tutti gli effetti (Aura/WR/WRS/PF/BR/BRS), PausePanel, EndPanel e tinte PF (`Tween.stopAllByTarget` — i tween su component NON si fermano da soli alla destroy del nodo).
- 📐 **`LIVE_RESIZE` resta `true` anche in produzione** (decisione: costo trascurabile).
- 📚 **Riallineamento .md**: risolte contraddizioni doc↔codice (aura 1.5s, damping 16, friction 0.3, formula pista 6/10×1.2, endline editor-driven), fuse sezioni leaderboard doppie in TECH, GDD §17 (PsychoForce+Brotherhood), README services aggiornato al flusso Ranking.
- ✅ **Fase 3 chiusa**: HUD completato (round animato, font MedievalSharp), posizione NextPreview sistemata, migrazione DebugPanel cassata. **Rules Firestore v1 applicate** in console. Follow-up chiusi (bug 2 non ripresentato, auto-attivazione AURA).
- 🚀 Build + deploy v0.8.57 su GitHub Pages.

### 2026-06-08 (v0.8.55 → v0.8.56) — Pannelli modali (pause/gameover/win) + flusso fine partita + UI utils
- 🪟 **Schermate fine partita ora prefab modali editor-driven** (`assets/prefabs/PausePanel|GameOverPanel|VictoryPanel.prefab`, generati da `scripts/gen-ui-panels.js`), al posto delle vecchie `Graphics` disegnate da codice. Root = Widget fullscreen + `UIOpacity` (opacità default **0** → invisibili in editor ma attive) + **`BlockInputEvents`** + Dim (sprite bianco builtin tintato) + Card wood. Comportamento: `PausePanel.ts` (Resume/Restart/Menu) ed `EndPanel.ts` condiviso GameOver+Victory con **un solo pulsante Continue**. Istanze in `UILayer/Modals`, **lasciate ATTIVE** (si auto-nascondono in `onLoad`).
- 🔁 **Flusso `MENU→GAME→WIN/LOSE→LEADERBOARD(se attiva)→MENU`**: a fine partita controlli inibiti subito (`state=GameOver` + `inputCtrl.blocked`); `_revealEndPanelWhenSettled` mostra il pannello solo a gioco fermo (ritardo min `END_PANEL_DELAY=1s`; victory `max(1s, cascata)`; + nessun merge in corso + odometro fermo; safety-cap 10s, via `schedule`/`unschedule`, non `scheduleOnce` ricorsivo). `_prepareLeaderboard` arma `pendingScore` **senza navigare** prima che il pannello sia interattivo (no race). `Continue` → Ranking se `LEADERBOARD_ENABLED` (name-entry→board→Menu) altrimenti Menu; attende `_lbReady` (cap 3s). Fade-in pannello 2s. Pannelli mostrano `Score N` / `ROUND N` / `Best N` (niente `:`) + pulse NEW BEST.
- ⏱️ **Timer di lancio** ora usa il nodo editor `Track > LaunchTimer` (Label interna): codice aggiorna **solo valore e colore**; posizione/scala autoritative dell'editor (rimossi nodo `TimerValue` runtime e reposition al resize).
- 🐞 **Debug LOSE**: nuovo tasto `💀 LOSE` nel DebugPanel → `GameManager.debugLose()` → `triggerGameOver()` (pannello esteso in basso, `PANEL_BOT -416`).
- 🧩 **Nuovi componenti UI** in `assets/scripts/ui/`: `MaxSize` (cap CSS-style `max-width`/`max-height`, `0`=illimitato) e `AspectRatioFit` (mantiene aspect, `aspect=0`=auto da spriteFrame). Reagiscono a `SIZE_CHANGED` (non `update()`, che il Widget sovrascriverebbe: il Widget allinea su `EVENT_AFTER_UPDATE`); `update()` solo-editor (`if (EDITOR)`) per feedback live nell'Inspector. Richiedono Sprite `Size Mode = CUSTOM`. Compongono fra loro (Widget stretch → MaxSize cap → AspectRatioFit altezza).
- 🛠️ **InputController**: crea il nodo `Crossbow > Rope` (Graphics) a runtime se assente → la scena non deve più portarlo; guard se manca il `Crossbow`.

### 2026-06-08 (v0.8.52 → v0.8.53) — Leaderboard consolidata nella scena Ranking
- 🧹 **Eliminato del tutto il modale**: la leaderboard è ora interamente la **scena `Ranking`** (LeaderboardPanel + NameEntry come nodi normali). `LeaderboardPanel.ts` riscritto: `static pendingScore` (handoff dal game-over), `start()` → name-entry se c'è uno score, altrimenti board; `_close()` → MainMenu. Rimossi `spawn`/`_findIn`/`open`/`runEndGame`/detection scena.
- 🏁 **Game-over**: `GameManager._runLeaderboardFlow` fa `qualifies(score)` → se top-10 imposta `pendingScore` e `loadScene('Ranking')` (name-entry→submit→board). Altrimenti resta sul pannello game-over.
- 🐞 **Causa "vedo solo lo sfondo" trovata**: `director.getScene().name` è `""` in `onLoad` nei build → detection standalone falliva. Risolto eliminando il modale.
- 🔥 **Firebase SDK caricato dal CDN a runtime** (`FirestoreLeaderboard._loadSdk`) se `window.firebase` manca → funziona anche nella Preview dell'editor (dove i tag CDN non sono iniettati).
- 🌱 **`scripts/seed-leaderboard.js`** (`npm run seed:leaderboard`): seed di 10 entry default via REST + transform `REQUEST_TIME`. Collection seedata con 10 `FAN` (100k→10k).
- 🛠️ **Fix crash scena**: `Track.onDestroy` ora guarda `isValid` (componente distrutto = truthy ma `.node` null → crash "reading 'off'") — emergeva col nuovo `loadScene` al game-over.
- 🔄 **Refresh geometria al primo lancio** (`_refreshTrackGeometry`, one-shot): rebuild walls Box2D + bounds prima del volo.
- 🧪 Flag di test `TEST_FIRST_LAUNCH_GAMEOVER` (default OFF) e debug `SHOW_ENDLINE_DEBUG` (OFF). `DEBUG`/`DEBUG_ENGINE` OFF.

### 2026-06-08 (v0.8.42 → v0.8.51) — Leaderboard: pivot a scena dedicata
- 🔄 **Ranking ora è una SCENA dedicata** (`assets/scenes/Ranking.scene`) con dentro una PrefabInstance di `LeaderboardPanel`, non più una modale. Abbandonato l'approccio modale via `resources.load`/`getComponent` perché si comportava in modo assurdo sul deploy (bug mai capito: `getComponent` restituiva un componente del nodo "Rank" senza `open` — vedi memoria `project_leaderboard`). In una scena il pannello lo istanzia il motore = path affidabile.
- `LeaderboardPanel` rileva `director.getScene().name === 'Ranking'` → **standalone**: sempre visibile, imposta design resolution, Close → `loadScene('MainMenu')`. Altrove resta modale (game over).
- `MainMenu.onLeaderboard()` → `director.loadScene('Ranking')`. Rimossa tutta la diagnostica alert.
- Build: **`md5Cache=true`** in `scripts/build.js` (evita bundle serviti da cache stale); `patch-html.js` non riscrive URL assoluti (CDN Firebase).
- 🌐 **Deploy GitHub Pages** verificato dal vivo (l'utente testa da telefono): `npm run build` + `npm run deploy` → https://clemanto.github.io/FanWarriors/. Firestore in **test mode** (rules temporanee).
- 🇬🇧 **Tutte le label di gioco in inglese** (game over/victory: `YOU WIN!`, `New Game`, `Retry`, `NEW BEST SCORE!`; Settings `Quit`/`Sure?`/`Close`; pannello: `LEADERBOARD`, `Loading…`, `No scores yet.`, `CLOSE`).
- 🏆 **Game over**: `Best Score: XXX` mostrato SOLO se non si è battuto il record; altrimenti solo `NEW BEST SCORE!` (mutuamente esclusivi).
- ⚠️ **Stato a fine sessione**: working tree a **v0.8.51 NON committato**; ultimo deploy = **v0.8.50** (le modifiche Best Score/new best v0.8.51 sono solo locali, da deployare quando l'utente lo chiede). Regola ribadita: **niente build/deploy automatici**.

### 2026-06-07 (v0.8.24 → v0.8.41)
- ✅ **Stato di gioco ripristinabile**: snapshot completo in `localStorage` salvato a ogni turno; dialog "Errore non previsto" con CONTINUA / RIPRISTINA (reload scena + ricostruzione). Vedi TECH.md.
- ✅ **Hardening errori**: `unhandledrejection` non apre più il dialog (rumore async leaderboard); `window.error` solo dal nostro bundle; `_saveSnapshot` interamente in try/catch (fix "errore a ogni lancio").
- ✅ **Pausa**: "PAUSE" (tradotto) + tap-to-resume + blocco input durante pausa (recupera da blur spuri su mobile).
- ✅ **Endline game-over**: fix soglia prospettica — derivata da `visualToPhys` della posizione visiva del nodo `GameOverLine` (prima scattava col warrior sopra la linea). Debug toggle `SHOW_ENDLINE_DEBUG` (linea viola).
- ✅ **Varietà early-game**: livello 2 dal round 2; `topRowBiasChance` 0.4 → 0.25.
- 📋 Leaderboard Firestore committata (config/services/LeaderboardPanel/NameEntry/prefab/rules) — resta il lavoro editor di piazzare le PrefabInstance in scena (vedi TECH.md).

---

## FASE 1 — Setup e prototipo greybox *(7–20 mag 2026)* ✅ chiusa 2026-05-09

**Obiettivo**: prototipo cliccabile con lancio a fionda, rimbalzi corretti e merge funzionante.

### Settimana 1: Setup e fisica base *(7–13 mag)*

**Giorno 1-2: Setup progetto** *(7–8 mag)*
- [x] Installare Cocos Creator 3.8.8
- [x] Creare nuovo progetto "FunWarriors"
- [x] Configurare TypeScript strict mode
- [x] Setup Git, .gitignore standard Cocos
- [x] Configurare risoluzione di riferimento (720×1280 portrait, FIXED_HEIGHT — impostato via codice)
- [x] Importare sprite placeholder (cerchi colorati con numeri)

**Giorno 3-4: Pista e fisica** *(9–10 mag)*
- [x] Creare scena principale "GameScene"
- [x] Configurare PhysicsSystem2D (Box2D), **gravità globale = 0** (nessuna forza gravitazionale)
- [x] Creare "Track" node con SpriteComponent (rettangolo grigio greybox)
- [x] Aggiungere muri statici con Collider2D BoxCollider:
  - Pareti laterali: restitution ~0.8, friction bassa (rimbalzo consistente)
  - Fondo pista (top): restitution ~0.1, friction alta (smorzamento forte)
  - Bottom invisibile: blocca il rientro sotto la linea di lancio
- [x] Test: una palla lanciata rimbalza elasticamente sulle pareti laterali e si ferma sul fondo

**Giorno 5-7: Meccanica di lancio a fionda** *(11–13 mag)*
- [x] Creare prefab "Warrior": SpriteComponent (cerchio + numero), CircleCollider2D, RigidBody2D
  - Damping lineare e angolare alti (personaggi stabili, assorbono urti)
  - Friction ~0.05 (superficie scivolosa come bowling)
- [x] Spawn position: bottom-center
- [x] Input system (mouse e touch equivalenti):
  - Press sul personaggio → inizio drag
  - Drag verso il basso / diagonale-basso → visualizza corda elastica
  - Direzione lancio = opposto al vettore drag (drag giù → lancia su, drag sinistra → lancia destra)
  - Lunghezza drag = forza (cappata a distanza massima)
  - Rilascio sotto soglia minima → annulla lancio
  - Rilascio sopra soglia minima → `applyLinearImpulse` nella direzione opposta al drag
- [x] Calibrare soglia minima: deve garantire che qualsiasi lancio valido superi la linea di game over
- [x] Calibrare soglia massima: la corda smette di allungarsi al cap visivo
- [x] Visualizzare corda elastica (Graphics drawn proceduralmente) e indicatore forza
- [x] Test: il personaggio viene lanciato nella direzione opposta al drag, rimbalza sulle pareti, si ferma per attrito

### Settimana 2: Merge, magnetismo, game over *(14–20 mag)*

**Giorno 8-10: Sistema di identificazione e merge** *(14–16 mag)*
- [x] Aggiungere a Warrior: `type: number` (0–6) e `level: number` (1–7)
- [x] Color-code temporaneo: ogni type un colore, ogni level un numero sul cerchio
- [x] Collision detection con stesso type+level (callback `onBeginContact`)
- [x] Timer contatto: >300ms → trigger merge
- [x] Funzione `mergeWarriors(a, b)`:
  - Calcola posizione media
  - Distruggi a e b
  - Spawn nuovo Warrior con stesso type, level+1, alla posizione media
  - Effetto visivo placeholder (flash bianco)

**Giorno 11-12: Magnetismo e game over** *(17–18 mag)*
- [x] Ogni frame: per ogni Warrior, trovare Warrior compatibili (stessa specie E stesso livello) nel raggio ~2x diametro
- [x] Applicare piccola forza di attrazione verso il più vicino — percepibile ma non teletrasportante
- [x] Linea game over visibile (Graphics rosso) a metà pista
- [x] Logica attraversamento linea:
  - Warrior lanciato che supera **completamente** la linea **dal basso verso l'alto** → in gioco, turno OK
  - Warrior che **non** supera la linea → **game over**
  - Warrior in gioco che riattraversa **dall'alto verso il basso** → **esplode** con malus (non game over)
- [x] Schermata game over placeholder: punteggio e "Riprova"

**Giorno 13-14: Timer di lancio + spawn loop** *(19–20 mag)*
- [x] Timer di lancio (Round 1 = 15s): conto alla rovescia visibile
- [x] Allo scadere: lancio automatico nella direzione corrente del drag con forza media
- [x] Queue di prossimi warrior: array `{type, level}` casuali
- [x] Preview "NEXT" (testo placeholder)
- [x] Dopo ogni lancio, spawn nuovo warrior dalla queue
- [x] Game state: `idle / aiming / inflight / settling`
- [x] Refactor in classi pulite: `GameManager`, `Warrior`, `InputController`, `SpawnManager`
- [x] **Milestone Fase 1** *(chiusa 2026-05-09)*: prototipo giocabile 30s+, merge funzionante, game over attivo

---

## FASE 2 — Core gameplay completo *(21 mag–3 giu 2026)* ✅ chiusa 2026-05-11

**Obiettivo**: tutto il loop di gioco giocabile in greybox — punteggio formula completa, round, game over, malus, esplosioni livelli speciali.

### Settimana 3: Punteggio e round *(21–27 mag)*

**Giorno 15-17: Sistema di punteggio** *(21–23 mag)*
- [x] Formula punteggio: `10 × 2^(livello_creatura - 1) × round_corrente × 2^(merge_nello_stesso_lancio - 1)`
- [x] Tracciare `mergesThisLaunch` (reset ad ogni nuovo lancio)
- [x] Floating score placeholder: testo "+N" che sale dal punto di merge
- [x] Malus: penalità `10 × 2^(livello_creatura - 1) × round_corrente` quando un warrior riattraversa la linea
- [x] Malus: flash rosso overlay (~0.3s) come unico feedback visivo negativo
- [x] Punteggio non scende sotto zero

**Giorno 18-19: Progressione round** *(24–25 mag)*
- [x] Aggiungere `currentRound` al GameManager
- [x] Contatore `totalMerges` e tabella soglie merge per avanzare di round (ROUND_THRESHOLDS: 10/25/45/70/100/135)
- [x] All'avanzare del round: aggiungere specie alla pool, aggiornare regole spawn, ridurre timer di lancio
- [x] Timer di lancio scala con il round — tabella a gradini in `launchTimerForRound` (15/12/10/8/5/3s; cala ai round 2/4/6/8/11, MAI nei round di introduzione specie 3/5/7/9: un solo aumento di pressione alla volta)
- [x] Notifica visiva "ROUND UP" con tween scala + pausa `roundUpPause`

**Giorno 20-21: Game over e restart** *(26–27 mag)*
- [x] Verifica frame-by-frame attraversamento linea — condizione game-over su centri (`prev >= LINE && y < LINE`), non sui bordi
- [x] Rimbalzo oltre linea → **game over immediato** (decisione design: rimosso malus a punteggio)
- [x] Flash rosso prima del game over
- [x] Restart con `director.loadScene(sceneName)` — sceneName catturato in `start()`
- [x] Salvataggio best score in localStorage

### Settimana 4: Esplosioni livelli speciali e refinement *(28 mag–3 giu)*

**Giorno 22-23: Esplosioni Campione / Eroe / Leggenda** *(28–29 mag)*
- [x] Quando merge crea warrior di livello 5 (Campione): esplosione placeholder + bonus +500pt
- [x] Quando merge crea warrior di livello 6 (Eroe): esplosione placeholder + bonus +1000pt
- [x] Quando merge crea warrior di livello 7 (Leggenda): esplosione placeholder + bonus +2000pt
- [x] Ogni esplosione: VFX placeholder (2 cerchi che crescono e svaniscono), warrior distrutto

**Giorno 24-25: Tutorial e logica spawn avanzata** *(30–31 mag)*
- [x] Logica spawn: round 1-2 solo livello 1; round 3-4 livelli 1-2; round 7+ livelli 1-3
- [x] Spawn specie scalato per round (3 specie → 7 specie progressivamente)
- [x] Tutorial primo lancio: 3 popup ("Trascina verso il basso", "Rilascia per lanciare", "Unisci due uguali!")
- [x] Flag in localStorage per non rimostrare tutorial

**Decisioni di design prese in Fase 2:**
- Pista a **funnel** (imbuto): pareti inclinate, più strette in cima, con PolygonCollider2D
- Layout pista **responsivo**: agganciata in basso, centrata; tutte le costanti derivano da `initLayout()` (Track.ts). *(Formula attuale: `TRACK_H = min(75% vs.height, 10/6 × 95% vs.width)`, `TRACK_W = TRACK_H × 6/10 × 1.2` — l'aspect 500:700 iniziale è stato superato; vedi COCOS.md)*
- Flag **`LIVE_RESIZE`** (GameManager.ts): `true` anche in produzione (decisione 2026-06-10) — ricalcola layout e ricostruisce pista/muri in tempo reale al resize del browser
- Lancio immediato (`waitForSettling = false`): il warrior successivo si attiva appena quello lanciato supera la linea
- Rimbalzo oltre la linea → **game over** (non più malus a punteggio)
- Momentum conservation al merge: 75% velocità media dei due warrior
- Angolo lancio clamped a ±75° dalla verticale
- Debug panel con PAUSE/RESUME, round ±, merge ±, SAVE/LOAD/RESET, palette drag-and-drop
- **Tutti i posizionamenti relativi** alle costanti di Track — nessun valore hardcoded
- Gerarchia scene: **GameLayer** (warriors, VFX, rope) + **UILayer** (HUD, overlay)
- Warrior fermi: `settle()` imposta `linearDamping=16` (era 12, alzato 2026-05-11) — si muovono ma non schizzano
- Preview NEXT: **bottom-left**, ancorata a `view.getVisibleSize()`
- Loading screen HTML/CSS in `build-templates/web-mobile/index.html`, scompare al primo frame CC

**Giorno 26-28: Bilanciamento iniziale** *(1–3 giu)*
- [x] Playtest sessioni multiple *(anticipato)*
- [x] Tuning: forza magnetismo, attrito, tempi merge, soglie min/max fionda
- [x] Tuning: curva soglie punteggio per round-up
- [x] Fix bug evidenti
- [x] **Milestone Fase 2** *(chiusa 2026-05-11)*: loop completo e giocabile, sprite reali, background medievale

---

## FASE 3 — Asset definitivi e UI *(4–24 giu 2026)* ✅ chiusa 2026-06-10

**Obiettivo**: il gioco assomiglia al prodotto finale.

### Settimana 5: Sprite personaggi + ambiente *(4–10 giu)*

- [x] Decisione finale stile artistico — medievale pixel art
- [x] Produrre **sprite base**: 7 specie × livelli — sprite reali integrati (commit e16c782)
- [x] Completare la serie **~8–9 sprite livelli speciali**: Campione (~4–5 specie), Eroe (~2–3 specie), Leggenda (1 specie)
- [x] Esportare a 128×128 base + 256×256 retina, importare come Atlas
- [x] Sostituire placeholder con sprite definitivi
- [x] Background medievale fisso — integrato con prospettiva warriors (PerspectiveMapper)

### Settimana 6: Animazioni + VFX *(11–17 giu)*

- [x] Animazione warrior al launcher: bounce-in (zoom-in da scala 0) — commit 62df635
- [x] Animazione next preview: zoom-out creatura corrente → pausa → zoom-in nuova — commit 62df635
- [x] ~~Animazioni frame-by-frame per ogni sprite~~ — eliminato (idle/squash/pop gestiti via tween programmatici)
- [x] Animazioni esplosione bonus (3 varianti): Campione, Eroe, Leggenda — anelli + scintille tier-scaled
- ~~Animazione esplosione malus~~ — cassata: il tween di ritorno è già leggibile
- ~~3 asset particellari~~ — rimandati a fase successiva se necessario
- [x] VFX di scena via codice: **screen shake** implementato (VFXManager) — flash overlay, flash rosso malus, slowmo ancora da fare

### Settimana 7: UI completa *(18–24 giu)*

- [x] Schermata splash + menu principale — `MainMenu.scene` + `MainMenu.ts` (PLAY → Game, Best Score, versione); loading screen con logo `title.png` (v0.8.22)
- [x] HUD definitivo *(completato 2026-06-10)*:
  - [x] Punteggio con animazione **contachilometri** (tween su label) — `_scoreProxy`/`_scoreTween` in GameManager.ts (v0.7.2)
  - [x] Round con animazione al cambio
  - [x] Timer: normale (grigio) + danger (rosso ≤5s) + ticchettio audio ultimi 5s — `updateTimerLabel()`
  - [x] Font HUD: **MedievalSharp** assegnato alle Label nell'editor (coerente col floating score)
- [x] **Floating score tier system** — 4 tier implementati: grigio (≤500), bianco (501–1000), oro+shine (1001–2000), viola+pulse (>2000); font MedievalSharp; bubble pop-in; hold 1s
- [x] **Balestra** al posto della fionda: nodo rotante (punta UP a 0°) + bowstring a V + traiettoria puntini stile Puzzle Bubble (max 1 rimbalzo, stop alla game over line) — artwork da integrare
- [x] Anteprima NEXT definitiva — posizione sistemata nell'editor (2026-06-10)
- [x] Schermate game over / win / pausa **definitive come prefab modali** (`PausePanel`/`GameOverPanel`/`VictoryPanel` in `assets/prefabs/`, generati da `scripts/gen-ui-panels.js`); root con Widget fullscreen + UIOpacity + BlockInputEvents (best-practice CC 3.8); comportamento in `EndPanel.ts`/`PausePanel.ts`, wiring in `GameManager._wirePanels()`. Tutorial popup rimosso.
- [x] Pulsanti settings — dialog opzioni centralizzato in `Settings.ts` (vibrazione/sfx/musica/fullscreen), condiviso MainMenu+Game (v0.8.22)
- [x] ~~Tutorial popup iniziale~~ — **rimosso** in v0.8.22 (era in Fase 2)
- [x] **Milestone Fase 3** *(chiusa 2026-06-10, in anticipo sul 24 giu)*: il gioco assomiglia visivamente al prodotto finale

---

## FASE 4 — Polish, audio, bilanciamento *(25 giu–8 lug 2026)* ← **sei qui**

**Obiettivo**: il gioco si sente "premium".

### Settimana 8: Audio e juice completo *(25 giu–1 lug)*

- [x] Procurare/comporre **1–2 loop musicali** (medievale-festivo) — `audio/music/main.mp3` (112kbps; traccia alternativa in `unused_assets/`)
- [x] Procurare/registrare **~17 SFX + 6 varianti merge** — tutti i file referenziati dall'enum SFX presenti in `assets/resources/audio` (manca solo il "click magnetismo", mai implementato):

  | SFX | Note |
  |-----|------|
  | Lancio (whoosh) | |
  | Landing (thud morbido) | |
  | Magnetismo (click) | |
  | Merge livello 1→6 | 6 varianti chime ascendente |
  | Esplosione Campione | Boom medio + cheer |
  | Esplosione Eroe | Boom grande + cheer |
  | Esplosione Leggenda | Boom epico + cheer lungo |
  | Malus | Buzz/clang negativo |
  | Ticchettio timer | Tick per secondo, ultimi 5s |
  | Avvicinamento game over | Heartbeat sottile |
  | Game over | Trombetta triste comica |
  | Nuovo round | Fanfara breve |
  | Click UI | |

- [x] Implementare AudioManager con volume controls (musica separata da SFX) — fatto da tempo (toggle in Settings)
- [x] ~~Sistema 6-tier floating score~~ → **ridimensionato e chiuso (2026-06-12)**: i 4 tier di testo restano (grigio/bianco/oro/viola — 6 colori non sono percepibili in ~2s); i "tier 5/6" sono **escalation di spettacolo sopra il viola** a 10k/12k pt (font 72/84 + burst scintille + shake), in sincrono con lo slowmo (`SCORE_TIER5/6_PTS` condivise con `_maybeScoreSlowmo`)
- [x] Implementare slowmo: ×0.8 da 10k pt (tier 5), ×0.5 da 12k pt (tier 6) — `_maybeScoreSlowmo` su merge e Track Cleared (v0.8.59)
- [x] Trail leggero dietro al warrior in volo — `entities/TrailEffect.ts` (v0.8.59)
- [x] Squash & stretch sull'atterraggio — già fatto in Fase 3 (squash via PerspectiveMapper)

### Settimana 9: Bilanciamento approfondito *(2–8 lug)*

- [ ] **Playtest con 5–10 persone esterne** (non saltare — è il test più importante)
- [ ] Raccogliere feedback su: difficoltà, leggibilità, feel della fionda, chiarezza merge, timer
- [ ] Iterare su:
  - Curva soglie punteggio per avanzare di round
  - Timer di lancio per round (15s → 3s, forma della curva)
  - Forza e raggio magnetismo
  - Soglie min/max fionda
  - Distribuzione specie/livello nello spawn
- [ ] **Milestone Fase 4** *(8 lug)*: il gioco è divertente da giocare ripetutamente

---

## FASE 5 — Integrazione SDK e pubblicazione *(9–15 lug 2026)*

**Obiettivo**: gioco pubblicato sui portali.

### Integrazione Poki SDK *(anticipata — codice fatto 2026-06-10)*

- [ ] [manuale] Registrare account sviluppatore Poki (richiesta account inviata, silenzio) **e/o CrazyGames** (self-service, percorso attivo dal 2026-06-15)
- [x] **Adapter CrazyGames** (`CrazyGamesPortal`, SDK v3) + `npm run pack:crazygames` + conformità (no-ad-primo-PLAY, mute su adStarted, fullscreen toggle off, privacy policy) — 2026-06-15, vedi TECH.md
- [ ] [manuale] CrazyGames: caricare la cartella `build/web-mobile` in QA, testare, submit; poi leaderboard nativa (post-onboarding) + privacy panel wiring
- [x] Implementato **adapter portale** (`PortalSdk` + `NullPortal`/`PokiPortal` + `PortalProvider`, flag `PORTAL` in `config/PortalConfig.ts` — default `'none'`, build GitHub Pages invariata; vedi TECH.md):
  - [x] `init()` all'avvio (MainMenu + Game, idempotente; SDK caricato a runtime dal CDN Poki) + `gameLoadingFinished()`
  - [x] `gameplayStart()`/`gameplayStop()` — inizio partita, pause (settings/panel/auto-pausa), game over/victory; dedup interno
  - [x] `commercialBreak()` tra le partite (PLAY, Continue, Restart, Menu) con audio mutato e timeout di sicurezza 35s — mai durante il gameplay
- [ ] Test in Poki sandbox con `PORTAL='poki'` (loading screen: `gameLoadingFinished` già wired; verificare specifiche Poki sul nostro splash HTML)

### Asset di marketing *(12–13 lug)*

- [ ] **Thumbnail** (cruciale): 512×512, personaggi più belli, colori saturi, leggibile in piccolo
- [ ] Screenshots di gameplay (3–5)
- [ ] Trailer GIF/video breve (15–30s): lancio fionda → merge → esplosione → round up
- [ ] Descrizione del gioco in inglese
- [ ] Tag: merge, casual, puzzle, physics, animals

### Submission *(14–15 lug)*

- [ ] Build HTML5 ottimizzata (target <20MB)
- [ ] Test su Chrome, Firefox, Safari, Edge
- [ ] Test su device reali: iPhone, Android, tablet, desktop
- [ ] Submit a Poki/CrazyGames
- [ ] Attendere review (1–4 settimane) e iterare su feedback portale

---

## Feature — Leaderboard globale (Firebase) *(✅ COMPLETA — v0.8.53 scena Ranking; rules v1 attive e testate 2026-06-10)*

**Obiettivo**: classifica online con i **primi 10 punteggi**; l'utente inserisce **3 lettere** come nome. Pensata per la build standalone (GitHub Pages); sui portali si usa il leaderboard nativo, quindi è **disattivabile**.

**Decisioni prese:**
- **Backend**: Firebase **Firestore** (collezione `leaderboard`, doc `{ name:"ABC", score:int, createdAt }`; query `orderBy('score','desc').limit(10)`).
- **Anti-cheat v1**: solo **security rules** (validano forma: `name [A-Z]{3}`, `score` int 0..cap, `createdAt==request.time`, no update/delete). Cheating entro il cap accettato per la v1; App Check come hardening futuro.
- **Inserimento nome**: **selettore arcade a 3 slot** (A–Z con frecce su/giù + conferma), non EditBox.
- **Flag di esclusione**: `LEADERBOARD_ENABLED` + astrazione `LeaderboardService` (impl Firestore / Null / Mock) → backend intercambiabile e leaderboard interno spegnibile per i portali.
- **Integrazione Cocos**: SDK Firebase **compat via CDN** iniettato in `index.html` (step `scripts/patch-html.js`) — niente bundling npm.

**Checklist:**
- [x] [manuale] Progetto Firebase + Firestore (production) + Web App + config — config fornita (progetto `fanwarriors-2026`), in `LeaderboardConfig.ts`
- [x] [manuale] Applicare security rules v1 — applicate in console Firebase (2026-06-10; file in `firestore.rules`)
- [x] `config/LeaderboardConfig.ts` — flag (`ENABLED`/`BACKEND`), config Firebase, costanti (TOP_N=10, NAME_LEN=3, SCORE_CAP=1e6, REQUEST_TIMEOUT_MS)
- [x] `services/LeaderboardService.ts` — interfaccia (`init`/`getTop`/`qualifies`/`submit`) + tipi `LeaderboardEntry`/`SubmitResult`
- [x] `services/NullLeaderboard.ts` (no-op) + `services/MockLeaderboard.ts` (localStorage, seeded)
- [x] `services/FirestoreLeaderboard.ts` — impl reale (init lazy coalesced, timeout, no-throw, serverTimestamp)
- [x] `services/LeaderboardProvider.ts` — factory Null/Mock/Firestore in base al flag (singleton)
- [x] Build: iniezione SDK Firebase compat via CDN in `index.html` (+ patch-html non riscrive URL assoluti)
- [x] `managers/NameEntry.ts` — selettore arcade 3 slot (comportamento; layout nel prefab `NameEntry.prefab`)
- [x] `managers/LeaderboardPanel.ts` — pannello top 10 (comportamento; layout in `LeaderboardPanel.prefab`)
- [x] Prefab `NameEntry.prefab` + `LeaderboardPanel.prefab` generati (vedi `scripts/gen-leaderboard-prefabs.js`)
- [x] Integrazione flusso game over in `GameManager._runLeaderboardFlow` (qualifies → NameEntry → submit → classifica; flag off/unbound = invariato)
- [x] Tasto LEADERBOARD nel MainMenu (`MainMenu.onLeaderboard` + `leaderboardButton`/`leaderboardPanel`)
- [x] Robustezza rete (timeout per richiesta, no-throw end-to-end, stato "Caricamento…", guard doppio-confirm)
- [x] ~~Piazzare le istanze prefab in scena~~ — superato dal pivot: la leaderboard vive nella scena `Ranking` (v0.8.53)
- [x] Test end-to-end con le rules v1 attive (2026-06-10)
- [x] Deploy su GitHub Pages verificato dal vivo (v0.8.50+)

> **BACKEND attuale: `firestore`** (config reale). Per sviluppo offline mettere `BACKEND='mock'` in `LeaderboardConfig.ts`.

---

## Strumenti raccomandati

- **Cocos Creator 3.8.8** — engine
- **VS Code** — editor (con plugin Cocos)
- **Aseprite** o **Photoshop** — sprite
- **Audacity** o **Reaper** — audio
- **TexturePacker** — atlas sprite
- **GitHub/GitLab** — version control + backup

## Rischi principali e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Asset art costoso/lungo (37 sprite + animazioni) | Alta | Alto | Iniziare con AI generation + rifinitura per i 28 base; commissionare solo i livelli speciali se budget lo consente |
| Magnetismo difficile da bilanciare | Alta | Medio | Esporre come parametro live-tunabile, testare presto |
| Calibrazione soglie fionda (min/max vs linea game over) | Media | Medio | Testare su tutti gli angoli di lancio fin dalla Fase 1 |
| Performance mobile con particelle | Bassa | Medio | 3 asset particellari riutilizzati con parametri variabili; pool di particelle; max ~30 warrior simultanei |
| Poki rifiuta per "troppo simile a Suika" | Bassa | Alto | Enfatizzare differenziatori: fionda, magnetismo selettivo, malus, round |
| Scope creep | Alta | Alto | Rispettare lista "out of scope" del GDD |

## Prossime azioni concrete

> Aggiornato al 2026-06-10 — v0.8.57: **Fase 3 chiusa** (HUD completato, posizione NextPreview sistemata, migrazione DebugPanel cassata). Rules Firestore v1 applicate. Follow-up chiusi (bug 2 non ripresentato, auto-attivazione AURA risolta). Pass di robustezza codice (rb cache, SafeStorage, cleanup tween su destroy, guard doppio-submit) + riallineamento completo dei .md.
>
> Storico 2026-06-07 — v0.8.23: fix bug 1 (anti-tunneling muri, `rb.bullet=true`) + bug 2 (game over/victory robusti: schermata schedulata prima dei side-effect in `try/catch`); messaggio "HAI SUPERATO IL TUO MIGLIOR PUNTEGGIO!" (score > 10000); tasto "Ricomincia" nel dialog Settings (solo scena Game, via host hook `onRestart`).
>
> Storico 2026-06-08 — v0.8.55: rebalance brotherhood (trigger ≥25 warrior + cooldown 10 tiri **e** 10 merge; nuovo `_brCooldownMerges`) + depotenziamento aura per specie basse (range quadratico su 7 specie, zap disabilitato sotto `AURA_ZAP_MIN_TYPE=2`). Verificato che né brotherhood né aura possono creare merge sopra il max-level di specie.
>
> Storico 2026-06-04 — v0.8.22: MainMenu scene (PLAY/Best Score/versione) + dialog opzioni centralizzato in `Settings.ts` (condiviso con Game); loading screen con logo `title.png`; tutorial iniziale rimosso.
>
> Storico 2026-05-26 — v0.8.19+: powerup segue il warrior nel next slot (swap preserva aura/PF/WR); glow indicator nel next preview; fix aura (durata 1.5s, trasferimento su merge, lifecycle corretto); regole lifecycle powerup (nuovo lancio / lancio fallito).

1. ~~**Completare sprite livelli speciali**~~ ✅ fatto
2. ~~**Animazioni rimanenti**~~ ✅ fatto (idle respiro, squash on landing, esplosioni 3 tier con scintille)
3. ~~**Blackhole VFX**~~ ✅ fatto (v0.6.14) — spirale perspective-corretta, stardust, merge ghost nero, implosione fisica
4. ~~**Swap Next↔Launcher**~~ ✅ fatto (v0.6.15) — tap sul NextPreview scambia le due creature; abilitato solo quando il lancio è attivo
5. ~~**LevelBoost powerup**~~ ✅ riscritto come **AURA powerup** (v0.8.19) — forza repulsiva, warrior zappati diventano scintille colorate con volo cadenzato, evoluzione energetica sul target, round illimitati
6. ~~**Smart bag spawn**~~ ✅ fatto (v0.7.1) — SpawnManager con bag Tetris-style + bias contestuale verso specie stranded + bias livello
7. ~~**Track Cleared! bonus**~~ ✅ fatto (v0.8.1) — 1000×round, una volta per round, banner gold animato con sottotitolo
8. ~~**UI Fase 3**~~ ✅ completata (2026-06-10): menu principale, settings dialog, schermate modali, HUD definitivo (contachilometri, round animato, timer, font MedievalSharp)
9. ~~**Posizione NextPreview**~~ ✅ sistemata nell'editor (2026-06-10)
10. ~~**File audio mancanti**: `audio/sfx/draw.mp3` e `audio/sfx/win.mp3`~~ ✅ presenti
11. ~~**DebugPanel migrazione scena**~~ — cassata: non necessaria (2026-06-10)
12. ~~**Condizione auto-attivazione AURA**~~ ✅ chiusa (2026-06-10)
13. ~~**Leaderboard globale (Firebase)**~~ ✅ COMPLETA (2026-06-10): implementata, deployata, rules v1 applicate e testate end-to-end. Vedi sezione dedicata.
14. **Fase 4**: audio completo (loop musicali + SFX mancanti), slowmo tier alti, trail/squash, poi playtest esterni e bilanciamento

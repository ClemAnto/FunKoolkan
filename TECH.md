# Note Tecniche — FunWarriors

> Decisioni architetturali non ovvie. Da aggiornare quando si fanno scelte significative.

---

## Curling (HOUSE/TEE) — zone geometriche in spazio PROIETTATO, non Box2D (FunKoolkan, 2026-06-22)

Nuovo core (vedi pivot in CLAUDE.md/GDD). Le zone HOUSE/TEE sono **geometriche in spazio visivo (arena-local proiettato)**, NON collider Box2D.
- **Perché non Box2D**: la fisica è in ground space piatto (modello B), il render è proiettato. Un collider Box2D vivrebbe nel piatto e nel physics-debug apparirebbe sfasato rispetto all'arte. Inoltre il rilevamento curling non ha bisogno di contatti: basta un test geometrico. → `House.ts` calcola l'**ellisse dello sprite a schermo** (centro + semiassi da `UITransform`×scala) e testa la **posizione proiettata** delle stone. Stesso test servirà allo scoring.
- **Perché ellisse visiva e non cerchio in ground space**: de-squashare la larghezza in un raggio ground produce un cerchio che, riproiettato, sborda verticalmente oltre l'arte (la proiezione Y è non-lineare). Lavorare in spazio proiettato = la zona combacia 1:1 col disegno.
- `Glue`/`Pole` (ex circuito di mana) **restano in repo** parcheggiati come bonus futuro; non sono cancellati né usati dal curling.

## EditMode — tool drag-stone che si auto-aggancia al Button (FunKoolkan, 2026-06-22)

Componente dev separato per riposizionare le stone. Decisioni:
- **Si aggancia da solo** all'evento `Button.EventType.CLICK` del nodo `editButton` (in `onEnable`), invece di richiedere un ClickEvent serializzato in editor: rende il wiring a prova di dimenticanza (basta assegnare il nodo). `toggle()` resta pubblico.
- **Coordinamento col launcher per stato condiviso, non per ordine di input**: entrambi ascoltano l'input globale; il launcher si auto-sopprime via `setSuspended()` chiamato da EditMode **solo durante il drag** di una stone (così il lancio resta possibile in EDIT e non c'è doppio innesco anche se una stone è sopra la hit-box del launcher). Vedi anche §"Launcher input gate".
- Drag: stone più vicina (`Stone.all`, ground space) → corpo **Kinematic** mentre segue il dito (la fisica non reagisce) → **Dynamic** a vel 0 al rilascio.
- Stato attivo mostrato **tintando lo Sprite** del bottone: lecito perché il `Button` usa transition **SCALE** (non tocca il colore). Cambio di proprietà su istanza in scena, coerente con la regola "niente disegno da codice".

## Launcher input gate — primo tocco sul launcher + posa valida (FunKoolkan, 2026-06-22)

`StoneLauncher` arma la mira **solo** se il primo tocco cade sulla hit-box del launcher (`UITransform.getBoundingBoxToWorld().contains`, idiom di `NextPreview`). Un click non lancia mai (tap < `minDrag`). Posa **invalida** se il puntatore va sopra il launcher (`pull.y>0`). Transizione braccio+traiettoria gestita per **target inseguiti in `update()`** (`AIM_EASE`) → smooth simmetrico invalido↔valido; il disegno è centralizzato lì, `_resim` setta solo i target.

---

## Portal SDK (Poki / CrazyGames) — adapter spegnibile (2026-06-10, CrazyGames 2026-06-15)

**Decisione**: stessa stratificazione del leaderboard — `services/PortalSdk.ts` (interfaccia no-throw), `NullPortal` (standalone), `PokiPortal` (SDK v2), `CrazyGamesPortal` (SDK v3), tutti caricati lazy dal CDN a runtime (mai in `index.html`); `PortalProvider.get()` singleton (switch a 3 vie) su flag `PORTAL` in `config/PortalConfig.ts` (`'none' | 'poki' | 'crazygames'`, **default `'none'`** → la build GitHub Pages non cambia di un byte).

**Mappatura lifecycle**:
- `gameplayStart()` → avvio partita e ogni resume da pausa (`_exitSettingsPause`). Adapter dedupano start/stop sbilanciati.
- `gameplayStop()` → ogni pausa (`_enterSettingsPause`) + `triggerGameOver`/`triggerVictory`.
- `commercialBreak(onAdStart?)` → SOLO tra le sessioni, **MAI prima del primo gameplay** (vedi sotto). Helper `GameManager._withCommercialBreak(next)`: aspetta il break (timeout 35s), poi smuta e naviga. **L'audio si muta nel callback `onAdStart`** (CrazyGames `adStarted` / Poki `beforeAd`), NON alla richiesta → niente "mute flicker" se nessun ad è disponibile. CrazyGames: `ad.requestAd('midgame', {adStarted, adFinished, adError})`.
- `init()` idempotente/coalesced + `gameLoadingFinished()` one-shot (CrazyGames: `sdkGameLoadingStart` in `init`, `sdkGameLoadingStop` in `gameLoadingFinished`).

**Conformità CrazyGames (fix 2026-06-15, attivi solo con `PORTAL='crazygames'` o sempre):**
- **Niente ad al primo PLAY**: `MainMenu.onPlay` fa `director.loadScene('Game')` diretto (l'ad solo tra le partite in `_withCommercialBreak`); + `director.preloadScene('Game')` in `MainMenu.start` → transizione istantanea.
- **Toggle Fullscreen nascosto** quando `PORTAL==='crazygames'` (`Settings.ts`): i custom fullscreen button sono vietati, la piattaforma possiede il fullscreen.
- **Privacy Policy in-game** (`PrivacyPanel.ts`): requisito "user consent" di CrazyGames (salviamo 3 lettere + score). Behavior-only come `Settings`; testo in `POLICY_TEXT`, pannello+link costruiti nell'editor.

**Build CrazyGames**: `npm run pack:crazygames` (vedi MEMO §workflow) — NON serve una URL pubblica (CrazyGames ospita lui i file): si carica la **cartella** `build/web-mobile` nel QA tool. **Per Poki**: `PORTAL='poki'`, build, sandbox.

**Leaderboard sui portali**: CrazyGames ha una leaderboard **nativa** (Leaderboards MVP — Friends/Country/Global, stagioni settimanali, trofei; submit cifrato AES-GCM via `user.submitScore`, UI nativa, va però **configurata lato admin CrazyGames** → solo post-onboarding). Decisione: per il **primo submit** si tiene la nostra Firebase (`LEADERBOARD_ENABLED=true`); migrazione alla nativa come follow-up dopo l'onboarding.

---

## Tutorial, audio e transizioni (2026-06-17)

**Tutorial come loading-cover** (`scenes/Tutorial.scene` + `managers/Tutorial.ts`): il 1° PLAY (flag `fw_tutorial_seen` ≠ `VERSION`, in localStorage) entra nel Tutorial, che **precarica il Game** (`director.preloadScene` con progress → % su `LoadingLabel`) mentre il giocatore legge la storia; **START** avvia il Game appena pronto. PLAY successivi → Game diretto. Flag legato alla `VERSION` (riappare a ogni aggiornamento). I nodi UI (StartButton, StoryPanel/ScrollView, LoadingLabel) sono iniettati da `scripts/add-tutorial-*.js` (formato `.scene` autorato a mano come per i bottoni). `MainMenu.onPlay` fa fade-al-nero (`FadeOverlay`) + spinner → `loadScene`.

**Audio (`AudioManager`)**: ora **persistente** tra scene (`addPersistRootNode`) → musica continua e clip cacheati una volta. API `playMusic(track)` per-traccia: menu/tutorial = `MUSIC_MENU` (loop taverna), Game = `MUSIC_MAIN`. Entrambe **lazy** (mai nel preload, che salta `audio/music/`); il guard usa il **clip in play** e stoppa la traccia corrente al cambio (il loop menu si interrompe entrando nel Game). Perché lazy: la musica è il singolo asset più pesante e non è essenziale all'avvio.

**Resize/fullscreen** (decisione finale): centraggio **dichiarativo via Widget** (`World`/`Track` HORIZONTAL_CENTER) — i corpi Box2D dinamici vivono nel b2World globale e non seguono il layout, quindi durante il resize si **freeza** fisica+input e allo unfreeze si **ri-pinna la posizione LOCALE** (frame box2dLayer) di ogni warrior via Static↔Dynamic. Rebuild muri e re-pin avvengono **solo a fisica accesa** (toccare collider/corpi a `enable=false` → crash broadphase); se l'unfreeze cade mentre Settings è in pausa, tutto è rinviato al resume. `_recentreGameLayers` (vecchio snap manuale dei layer) RIMOSSO. Dettagli e storia in MEMO §Resize/fullscreen.

**Loading**: loading screen HTML a sola **%** (ibrida); musica/Firebase/bg-menu lazy; immagini ridotte; `nativeCodeBundleMode=wasm`; splash off. Vedi MEMO §Loading/§Pacchetto CrazyGames.

---

## Effetti — base class interne, classi pubbliche dedicate (2026-06-10, v0.8.59)

**Decisione**: la regola "una classe per effetto" resta (ogni VFX ha la sua classe pubblica con la sua API), ma l'implementazione condivisa vive in base class astratte: `GlowPulseEffect` (anelli additive + pulse + sparkle + fade-out → `WildRiverEffect`/`BrotherhoodEffect`) e `TintSparkleEffect` (tinta pulsante + hop sul mapper → `WildRiverSparkleEffect`/`BrotherhoodSparkleEffect`). Le sottoclassi contengono solo `static attach()` e i parametri di tuning (`protected readonly` ri-dichiarati).

**Perché**: erano ~240 righe duplicate quasi identiche — un fix andava replicato a mano. Le API pubbliche (`attach`/`detach`/`onExpired`/`startTimer`) sono invariate: GameManager non è stato toccato. Le base sono decorate con `@ccclass` (registrazione corretta nel sistema componenti CC3) ma non vengono mai istanziate direttamente.

**Gotcha cleanup** (vale per tutti gli effetti): i tween che targettano **component** (UIOpacity, Sprite, PerspectiveMapper) NON vengono fermati dall'engine alla destroy del nodo — ogni effetto ha un `onDestroy()` che li ferma. Nei sparkle l'`onDestroy` è guardato da `_detaching`: dopo un `detach()` normale i tween di restore devono sopravvivere alla destroy del nodo effetto.

---

## Pannelli fine partita + flusso end-game (2026-06-08, v0.8.56)

**Decisione**: pause / game-over / victory sono **prefab modali editor-driven** (`assets/prefabs/`), non più UI disegnata da codice con `Graphics`. Comportamento in due classi: `PausePanel.ts` (Resume/Restart/Menu) ed `EndPanel.ts` (condiviso GameOver+Victory, **un solo Continue**). Generatore: `scripts/gen-ui-panels.js`.

**Perché**: rispetta la regola "niente UI a runtime"; layout editabile; e il flusso lineare richiesto `MENU→GAME→WIN/LOSE→LEADERBOARD(se attiva)→MENU` con un'unica azione "avanti" evita scelte che possono rompere l'handoff leaderboard.

**Come funziona**:
- Root modale: Widget fullscreen + `UIOpacity` (default opacità **0**, così l'istanza resta attiva ma invisibile in editor) + `BlockInputEvents`. `onLoad` mette `active=false` → l'istanza va lasciata **ATTIVA** in scena (altrimenti `onLoad` non parte). Vedi COCOS.md.
- `GameManager._wirePanels()` risolve i pannelli (via `@property` o per nome sotto UILayer) e setta gli hook. `Continue` → Ranking se `LEADERBOARD_ENABLED` altrimenti MainMenu.
- **Anti-race**: a fine partita `state=GameOver` + `inputCtrl.blocked=true` (controlli inibiti). `_revealEndPanelWhenSettled(show, minDelay)` avvia `_prepareLeaderboard` (arma `LeaderboardPanel.pendingScore` **senza navigare**) e mostra il pannello solo quando: trascorso `minDelay` (`END_PANEL_DELAY=1s`; victory `max(1s, durata cascata)`) **+** nessun merge in volo **+** odometro punteggio fermo (`_scoreTween===null`). Implementato con `schedule`/`unschedule` (NON `scheduleOnce` ricorsivo → evita warning "selector already scheduled"). `Continue` attende `_lbReady` (cap 3s) prima di navigare, così il name-entry è sempre armato.
- La comparsa del pannello **non dipende** dalla rete (la prep leaderboard gira in parallelo): in editor preview l'init Firebase può essere lento.

**Gotcha**: il timer di lancio usa il nodo editor `Track > LaunchTimer`; il codice (`updateTimerLabel`) tocca **solo `string` e `color`**, mai posizione/scala.

---

## Componenti UI riutilizzabili — MaxSize / AspectRatioFit (2026-06-08, v0.8.56)

**Decisione**: due componenti generici in `assets/scripts/ui/`. `MaxSize` (cap dimensione, semantica CSS `max-width`/`max-height`, `0`=illimitato). `AspectRatioFit` (mantiene un aspect W/H; `aspect=0` = auto da `Sprite.spriteFrame.originalSize`).

**Perché**: Cocos 3.8 **non** ha vincoli di dimensione max né lock di aspect-ratio nativi (solo Widget per allineamento e Layout per i figli).

**Come funziona / gotcha critico**: reagiscono a **`SIZE_CHANGED`**, NON a `update()`. Il Widget allinea su `Director.EVENT_AFTER_UPDATE` (dopo gli update dei componenti), quindi un clamp in `update()` verrebbe sovrascritto ogni frame; `SIZE_CHANGED` scatta sincrono quando il Widget imposta la dimensione → il vincolo si applica subito dopo, prima del render. C'è un `update()` **solo-editor** (`if (EDITOR)` da `cc/env`) per riflettere live le modifiche nell'Inspector. Richiedono Sprite `Size Mode = CUSTOM`. Compongono: Widget stretch (100%) → MaxSize cap → AspectRatioFit altezza da larghezza.

---

## Settings — dialog opzioni centralizzato (MainMenu + Game) (2026-06-04, v0.8.22)

**Decisione**: la logica del dialog opzioni (vibrazione / sfx / musica / fullscreen) vive in un'unica classe `Settings.ts` (`assets/scripts/managers/`), condivisa tra `MainMenu.scene` e `Game.scene`. Prima era duplicata dentro `GameManager` (`openMenu/closeMenu/toggle*`).

**Perché**: una sola fonte di verità per le opzioni; lo stato mute è già persistito da `AudioManager` in localStorage (`fw_sfx_muted`/`fw_music_muted`) e la vibrazione in `fw_vibration`, quindi è condiviso tra scene automaticamente.

**Come funziona**:
- `Settings` espone via `@property` i riferimenti: `dialogNode`, `menuButton`, `closeButton`, e i 4 `Toggle`. Gestisce fade open/close, sync stato toggle, hide del fullscreen se non supportato. Aggiunge da sé un `cc.Button` su menu/close se mancante.
- Vibrazione: fonte unica tramite getter statico `Settings.vibrationEnabled` (legge `fw_vibration`). `GameManager._vibrate()` lo usa.
- Hook host (null in MainMenu): `canOpen` (veto apertura, es. game over), `onBeforeOpen`/`onAfterClose`. `GameManager` ci registra pausa/resume (`_enterSettingsPause`/`_exitSettingsPause`).
- `GameManager` trova il componente con `(canvas).getComponentInChildren(Settings)` — indipendente dalla gerarchia.
- `VERSION` è ora `export const` in `GameManager.ts` (importata da `MainMenu.ts`).

**Gotcha**: `Settings` va su un nodo **sempre attivo** (es. Canvas) con `dialogNode` → il pannello Dialog; così il Dialog può restare disattivo nell'editor. Un componente su nodo disattivo non riceve `onLoad` → niente wiring. Vedi MEMO.

---

## MainMenu — scena di ingresso (2026-06-04, v0.8.22)

**Decisione**: `MainMenu.scene` è la start scene; `MainMenu.ts` fa `director.loadScene('Game')` sul PLAY, riempie Best Score (`Best Score\n<n>`, da `fw_best_score`) e versione, e avvia l'audio. Il tutorial iniziale a popup è stato **rimosso** da `GameManager` (chiamata + metodo `showTutorial`, key `fw_tutorial_done` non più usata).

## Track — muri fisici derivati da TrackSprite (branch refactor/no-runtime-resize, 2026-05-12)

**Decisione**: `buildWalls()` non usa più le costanti `TRACK_BOTTOM_Y`/`TRACK_TOP_Y`/`FUNNEL_OFFSET` per costruire i collider. Legge invece i bounds di `TrackSprite` direttamente (`UITransform.contentSize`, `anchorPoint`, `position`, `scale`).

**Perché**: eliminando `drawTrack()` e tutti i `setPosition`/`setContentSize` runtime su Track node, la pista è ora posizionata e dimensionata interamente dall'editor. I muri fisici devono seguire lo sprite grafico — non le costanti di layout che riflettono lo schermo, non il nodo.

**Come funziona**:
- `buildWalls()` calcola left/right/bot/top dai dati UITransform di TrackSprite (con offset posizione e scala)
- `wallThickness` e `funnelPercentage` sono `private readonly` nella classe Track
- I muri vengono rigenerati automaticamente tramite listener `SIZE_CHANGED` e `TRANSFORM_CHANGED` su TrackSprite
- `_walls: Node[]` traccia i nodi creati per distruggerli senza affidarsi a `getChildByName` (evita duplicati da destroy deferrato)

**Costanti ancora attive**: `TRACK_W`, `TRACK_BOTTOM_Y`, `TRACK_TOP_Y`, `GAME_OVER_LINE_Y`, `LAYOUT_SCALE`, `FUNNEL_OFFSET`, `initLayout()` — restano esportate e usate da `GameManager`, `InputController`, `PerspectiveMapper`. Non sono più usate in `buildWalls()`.

---

## Sistema di coordinate pseudo-isometrico

**Visuale**: la pista e i warrior sono disegnati in prospettiva pseudo-isometrica — le basi dei warrior (fisicamente cerchi) appaiono come ellissi schiacciate.

**Soluzione**: il mondo fisico Box2D è puramente 2D (cerchi perfetti). La conversione in visuale è `x → x`, `y → y/2`, ottenuta mettendo `Box2DLayer.scaleY = 0.5`. I cerchi fisici proiettati con questo scale corrispondono esattamente alle ellissi degli sprite.

**Gerarchia layer sotto `World`**:

| Nodo | scaleY | Ruolo |
|---|---|---|
| `Box2DLayer` | **0.5** | Fisica Box2D — coordinate locali compresse |
| `GameLayer` | 1 | VFX generici (burst, floating score) |
| `WarriorsLayer` | 1 | Sprite visivi dei warrior (viewNode) |

**Tre spazi di coordinate**:
| Spazio | Descrizione | Esempio Y range |
|---|---|---|
| `physLocalY` | Locale di `Box2DLayer` — input per Box2D | ≈ -1280..+1280 |
| `worldY` | 3D world space — `physLocalY * sy + box2dWorldY` | Canvas center = 360 |
| `warriorsLocalY` | Locale di `WarriorsLayer` — usato da `setPosition` per VFX/sprite | ≈ -640..+640 |

**Formula di conversione** (da derivazione scena + dati runtime):
- `physToVisual(physLocal) = physLocal * sy² + box2dWorldY * (sy - 1)`
- Per `sy=0.5`, `box2dWorldY=640`: `= physLocal * 0.25 - 320`
- Inverso: `visualToPhys(c) = (c - box2dWorldY * (sy - 1)) / sy²` = `(c + 320) * 4`
- Utility: `CoordConverter(box2dScaleY, box2dWorldY)` in `utils/CoordConverter.ts`

**Perché `box2dWorldY = 640` (non 360)**: il file scena salva `Canvas._lpos.y = 360` perché la scena era aperta in modalità landscape (1280×720 → centro Y = 360). A runtime, `view.setDesignResolutionSize(720, 1280, FIXED_HEIGHT)` aggiusta il Canvas a `worldY = designHeight/2 = 640`. Questo avviene **dopo** il completamento di tutti i `start()`, quindi leggere `worldPosition.y` durante `start()` restituirebbe ancora 360. La soluzione è usare `view.getDesignResolutionSize().height / 2` al posto di `worldPosition.y`.

**Regola pratica**: VFX attaccati a `WarriorsLayer` devono usare `coords.physToVisual(y)` per la coordinata Y. La fisica usa sempre coordinate locali di `Box2DLayer`.

**`PerspectiveMapper`**: legge `worldPosition.y = physLocalY * sy + box2dWorldY`, lo moltiplica per `sy` via `setWorldPosition(wp.x, wp.y * sy + yOffset)`. Il risultato è `viewWorldY = physLocalY * sy² + box2dWorldY * sy + yOffset`; convertito in locale WarriorsLayer: `warriorsLocalY = physLocalY * sy² + box2dWorldY * (sy - 1) + yOffset`.

**Costanti Track**: `TRACK_BOTTOM_Y`, `TRACK_TOP_Y`, `GAME_OVER_LINE_Y` sono in spazio canvas (world Y). Quando servono in spazio fisico locale si divide per `scaleY` (`gameOverLineLocal = GAME_OVER_LINE_Y / scaleY`).

---

## Gerarchia layer World (regola stabile)

| Layer | scaleY | Contenuto | Regola |
|---|---|---|---|
| `Box2DLayer` | **0.5** | Nodi fisici warrior (RigidBody2D + Collider) | Solo fisica — mai VFX |
| `WarriorsLayer` | 1 | `viewNode` sprite warrior | Solo nodi soggetti a z-sorting |
| `VFXLayer` | 1 | Tutti gli effetti visivi effimeri | Sopra tutti i warrior — mai z-sortato |

**Regola VFXLayer**: qualsiasi nodo che non rappresenta un'entità di gioco persistente va su `VFXLayer`. Questo include cerchi espandenti (merge burst, esplosioni), anelli suction, particelle suction, screen shake, flash overlay, future particelle. `WarriorsLayer` è riservato ai `viewNode` dei warrior perché `zSortWarriors()` ne riordina i figli ogni frame — aggiungere VFX qui causerebbe z-order errato.

---

## Separazione layer fisico / layer visivo

**Implementato** in Fase 2 (`PerspectiveMapper.ts`, `Warrior.ts`).

**Decisione**: ogni entità di gioco ha due nodi separati — un nodo fisico (invisibile) e un nodo visivo (sprite).

```
Warrior (root)
├── RigidBody2D + CircleCollider2D  — fisica Box2D, non scalato
└── viewNode (Node "View")          — Sprite/Graphics, scalato da PerspectiveMapper
```

**Perché**: se si scalasse il nodo con il collider, Box2D userebbe le dimensioni visive ridotte per le collisioni. Con layer separati, Box2D lavora in spazio piatto uniforme e la proiezione è responsabilità esclusiva del mapper.

**Implementazione attuale** (`PerspectiveMapper.ts`):

```typescript
const SCALE_BOTTOM = 0.55;  // bottom pista — lontano (pile)
const SCALE_TOP    = 1.0;   // top pista — vicino (launcher)
const VISUAL_SCALE = 1.65;  // moltiplicatore rispetto al raggio fisico

const depth = (y - TRACK_BOTTOM_Y) / span; // 0=bottom, 1=top
const scale = (SCALE_BOTTOM + (SCALE_TOP - SCALE_BOTTOM) * depth) * VISUAL_SCALE;
viewNode.setScale(scale, scale, 1);
```

**Direzione prospettica**: top=vicino/grande, bottom=lontano/piccolo — vista dall'alto come curling/shuffleboard.

**Offset visivo sprite**: `viewNode.setPosition(0, r * 0.5)` in `Warrior.buildSprite` — il centro dello sprite è leggermente sopra il centro fisico. Valore calibrabile.

**Z-sorting**: `GameManager.zSortWarriors()` ogni frame — warrior con Y più bassa (più lontani) renderizzati per primi (dietro).

**Debug mode**: `PhysicsSystem2D.instance.debugDrawFlags = EPhysics2DDrawFlags.Shape` mostra i collider Box2D sovrapposti ai visual — attivato da `DEBUG_ENGINE` in `GameManager.ts`.

---

## Stato di gioco ripristinabile + dialog "Errore non previsto" (v0.8.x)

**Decisione**: snapshot completo della partita in `localStorage` (`fw_game_state`), salvato a **ogni attivazione di warrior** (= inizio turno, board assestata) in `_saveSnapshot()`, e ripristinabile dopo un crash.

**Cosa contiene lo STATO** (`GameSnapshot`): score, round, totalMerges, cooldown powerup (wr/pf/br), `firstLaunchSpecies`, `trackClearedBonusUsed`, best-single, spawnLog, launcher (tipo/livello/**powerup**), `nextPowerup`, next (tipo/livello), e tutti i warrior on-track (tipo/livello/x/y + aura residua). Reset a inizio partita (`_clearSnapshot`).

**Ripristino**: il bottone `RIPRISTINA` del dialog setta un flag **statico** `GameManager._pendingRestore` e fa `director.loadScene` → al nuovo `start()` il board viene ricostruito da `_restoreSnapshot()` invece di partire una partita nuova. Ricaricare la scena (anziché ripristino in-place) è robusto: l'errore può aver lasciato tween/callback/body corrotti.

**Dialog errore**: `CONTINUA` (chiude, riprende) / `RIPRISTINA`. Intercetta: il `try/catch` di `update()`; `window 'error'` **solo se dal nostro bundle** (filtra CDN/Firebase); `unhandledrejection` **log-only** (i rejection async di rete/SDK non devono interrompere il gioco). Mostra il testo reale dell'errore. Guard `_errorDialogShown` + grace `_errorSuppressed` (1.5s dopo CONTINUA).

**Regola**: il salvataggio dello STATO è un effetto collaterale **non critico** → `_saveSnapshot()` è interamente in `try/catch`: non deve mai propagare un errore nel game-loop (era la causa del bug "errore a ogni lancio" — `_serializeSpawnLog` lanciava fuori dal try).

---

## Pausa — tap-to-resume + blocco input (v0.8.x)

**Decisione**: durante la pausa (auto o manuale, `_togglePause`) si **blocca l'input** (`inputCtrl.blocked = true`) e l'overlay "PAUSE" è tappabile per riprendere (TOUCH_END/MOUSE_UP → resume).

**Perché**: (1) un tap di ripresa non deve avviare per sbaglio una mira/lancio (l'overlay riceve il tap, l'InputController è bloccato); (2) recupero immediato da pause spurie (su mobile `blur` può scattare per la tastiera o gesti di sistema). Testo "PAUSE" (UI tradotta in inglese).

---

## Linea di game over — editor-driven (v0.5.0)

**Decisione**: la quota `GAME_OVER_LINE_Y` è ora derivabile da un nodo scena, non solo dalla formula matematica.

**Come funziona**: `Track.buildWalls()` cerca un nodo figlio di `TrackSprite` chiamato `GameOverLine`. Se presente, legge `worldPosition.y` e sovrascrive `GAME_OVER_LINE_Y` e il nuovo `GAME_OVER_AREA` (ratio normalizzato 0..1). In assenza del nodo, il valore di `initLayout()` resta valido come fallback.

**Perché**: permette di spostare la linea nell'editor senza toccare il codice. Su resize, `relayout()` ricalcola automaticamente dalla posizione del nodo (se dotato di Widget proporzionale).

**Coordinare con gameOverLineLocal**: `GameManager` espone un getter privato `gameOverLineLocal`. Tutti i check di attraversamento linea (`checkLineLogic`, `checkLaunchResult`, `onWarriorLaunched`) usano `w.node.position.y` vs `gameOverLineLocal` — mai `worldPosition.y` vs `GAME_OVER_LINE_Y`.

### Correzione soglia prospettica (v0.8.41)

**Bug**: il game-over scattava quando il warrior era **nettamente sopra** la linea rossa dello sprite. Causa: `gameOverLineLocal` valeva `GAME_OVER_LINE_Y / sy`, con `GAME_OVER_LINE_Y = goEditorNode.worldPosition.y`. Ma `worldPosition.y` è world-space (centro≈640) mentre il valore veniva usato come canvas design-centrato → la mappatura prospettica `physToVisual` collocava la soglia **più in alto** della posizione reale del nodo (verificato con linea viola di debug su WarriorsLayer).

**Fix**: `gameOverLineLocal` ora deriva la soglia fisica **invertendo la stessa mappatura di rendering** dei warrior, a partire dalla posizione **visiva reale** del nodo `GameOverLine`:
```typescript
const visualY = this._endlineNode.worldPosition.y - this.warriorsLayer.worldPosition.y; // WarriorsLayer-local
return this.coords.visualToPhys(visualY);                                                // → physLocalY
```
- `_endlineNode` risolto in `start()` (`TrackSprite > GameOverLine`).
- Calcolato **live ad ogni accesso** (getter) → robusto a layout/resize/rotazione e ai problemi di timing del `worldPosition` durante `start()`.
- Per costruzione `physToVisual(gameOverLineLocal)` ricade esattamente sul nodo → la linea fisica coincide con la rossa dello sprite.
- Resta un debug toggle `SHOW_ENDLINE_DEBUG` (flag in GameManager): linea viola tratteggiata su WarriorsLayer a `physToVisual(gol)`. Off in produzione, codice conservato.

> L'override storico `GAME_OVER_LINE_Y = worldPosition.y` in `Track.buildWalls` resta come fallback, ma non è più la fonte usata dal game-over (lo è il getter sopra).

---

## Sistema danger tint + pulse linea (v0.4.0)

**Decisione**: la linea di game over è disegnata in `Track.buildWalls()` (nodo Track) anziché in `GameManager` (nodo gameLayer). Questo garantisce che sia sempre sotto i warrior nella gerarchia di rendering, senza richiedere `setSiblingIndex`.

**Tint warrior**: `Warrior.setDangerTint(factor)` imposta `Sprite.color` come moltiplicatore RGB. Factor 0 = bianco (nessun tint), factor 1+ = rosso intenso. Calcolato in `GameManager.checkLineLogic()` dal bordo inferiore del warrior rispetto a `GAME_OVER_LINE_Y`.

**Pulse linea**: `Track.setLinePulse(bool)` gestisce un tween `UIOpacity` 255→30→255 (loop ricorsivo con flag `_linePulseActive` come guard). `GameManager` accumula `anyDanger` nel loop di `checkLineLogic` e chiama `setLinePulse` una volta a fine frame — transizione solo se lo stato cambia.

**Esclusione `inflightWarrior`**: il warrior del turno corrente non contribuisce a `anyDanger` né riceve tint, anche dopo aver superato la linea. Diventa eleggibile solo quando viene lanciato il warrior successivo (che sovrascrive il riferimento in `onWarriorLaunched`). Motivazione UX: l'effetto pericolo deve segnalare accumulo dal mucchio storico, non la normale traiettoria di ingresso.

**Game over — check a frame sostenuti (v0.5.5+)**: il trigger game-over non avviene più su una singola transizione di frame (`prev >= gol && y < gol`, che poteva firedare per jitter fisico o per un warrior che sfiorava la linea per 1 frame). I check ora usano contatori di frame consecutivi:
- `framesAboveLine`: warrior lanciato deve stare ≥ gol per `CROSS_LINE_FRAMES = 3` frame prima che `crossedLine = true` venga committato
- `framesBelowLine`: warrior in-play deve stare < gol per `GAME_OVER_FRAMES = 3` frame prima del game over
A 60fps = ~50ms: impercettibile per il player, filtra tutti i glitch fisici.

**Flag `fired` (Warrior)**: flag one-way settato da `applyImpulse()` e mai resettato (diversamente da `launched` che viene resettato da `penaliseAndReturn`). Il branch game-over in `checkLineLogic` richiede `w.fired` — impedisce fisicamente a warrior sul launcher o in preview di triggerare game over per posizionamento errato o animazioni. Warrior merged/prefill/debug ricevono `fired = true` esplicitamente al momento della creazione.

---

## Auto-pausa background/focus (v0.6.0)

**Decisione**: uso di `visibilitychange` + `blur`/`focus` browser per pausa automatica su background/standby.

**Perché**: Cocos non espone un lifecycle hook nativo per background su web. I tre eventi coprono tutti i casi: tab nascosta (visibilitychange), finestra non attiva (blur), mobileSafari che manda in background (visibilitychange).

**Flag `_autoPaused`**: distingue pausa automatica da manuale. `_autoResume()` non fa nulla se `_autoPaused` è falso — evita che il ritorno del focus sblocchi una pausa manuale dell'utente.

**AudioManager singleton guard**: il getter `AudioManager.instance` ora controlla `node?.isValid` prima di restituire `_inst`. Se il nodo è stato distrutto da un reload scena, ricrea l'istanza fresh invece di restituire un riferimento stale.

---

## NextPreview — posizione nella gerarchia scena (v0.6.0)

**Decisione**: `NextPreview` è figlio diretto di **Track** (non della HUD).

**Perché**: `GameManager.start()` usa `this.track?.node.getChildByName('NextPreview')` — `getChildByName` in CC3 cerca solo nei figli diretti, non ricorsivamente. Il vecchio nodo era sotto `HUD/NextSec` (poi eliminato). Mettere il nodo sotto Track lo rende trovabile dalla ricerca e lo mantiene coordinato spazialmente con la pista.

**Regola operativa**: non creare mai nodi UI programmaticamente senza istruzione esplicita. Tutti gli elementi UI devono essere aggiunti nella scena tramite editor Cocos Creator.

---

## Feedback aptico (vibrazione) + FullscreenBtn condizionale (v0.6.2)

**Vibrazione**: `GameManager._vibrate(ms)` chiama `(navigator as any).vibrate?.(ms)` — no-op silenzioso se non supportato. 40ms su merge normale, 120ms su explosion max-level. Flag `_vibrationEnabled` caricato da `localStorage` key `fw_vibration` (default '1'). `toggleVibration()` è public per il ClickEvent da scena.

**VibraBtn in scena**: aggiunto come 5° figlio di `menu` (nodi array 143–150 in `Game.scene`). Il `cc.Layout` Horizontal del menu posiziona automaticamente tutti i tasti — nessuna coordinata hardcoded necessaria.

**FullscreenBtn auto-hide**: in `initHud()`, se `document.documentElement.requestFullscreen` non esiste (iOS Safari, alcuni Android WebView), `FullscreenBtn.active = false`. Il tasto resta nella scena ma è invisibile/inattivo — non richiede variante di scena separata.

---

## SpawnManager — da plain class a Component (v0.7.1)

**Decisione**: `SpawnManager` è stato convertito da plain class a `@ccclass Component` e aggiunto dinamicamente al nodo di `GameManager` tramite `addComponent`.

**Perché**: esporre `bagMultiplier`, `contextBiasChance`, `levelBiasChance`, `strandedRadiusMultiplier` come `@property` inspector-tunable richiede un Component. L'aggiunta dinamica evita modifiche alla scena.

**Come usarlo**: `this.spawnMgr = this.node.addComponent(SpawnManager)` poi `this.spawnMgr.init(...)`. I `@property` sono visibili nell'inspector durante il play mode (non persistono tra run a meno di non aggiungerlo alla scena nell'editor). Le API pubbliche rimangono identiche alla versione precedente (`spawnNext`, `prefill`, `setSpawnTypes`, `setMaxLevel`, `setNext`, `.next`).

**`setSpawnTypes(n)`**: gestisce sia avanzamento round (aggiunge nuove specie al bag corrente) sia reset debug (n < specie attuali → reinizializza bag da zero).

---

## DebugPanel — coordinate canvas vs fisica (v0.6.2)

**Spazi di coordinate rilevanti per DebugPanel:**
- `toWorld(ui)` restituisce canvas-relative Y: `ui.y - vs.height/2` — range −640..+640, origine al centro schermo.
- `viewNode.position.y` (LOCAL in WarriorsLayer) = stesso spazio di `toWorld()`. Da usare per l'hit detection visiva.
- `viewNode.worldPosition.y` = `viewNode.position.y + 640` — NON comparabile con `toWorld()` (offset Canvas.worldY).

**Conversioni:**
- Canvas → physics local: `toPhysY(c) = (c − designH/2 × (sy−1)) / sy²` = `(c + 320) × 4` per sy=0.5
- Physics local → canvas: `toVisualY(p) = p × sy² + designH/2 × (sy−1)` = `p × 0.25 − 320` per sy=0.5

**Check drop palette**: usare `toVisualY(GAME_OVER_LINE_Y / sy)` come soglia Y — è la posizione visiva della linea di game over (dove i warrior appaiono a schermo), non la costante di fisica.

**InputController.blocked**: flag settato da DebugPanel via `GameManager.setLauncherBlocked()` durante palette drag, e da `GameManager.openMenu()`/`closeMenu()` durante il menu di pausa. Controllato in handleDragStart/Move/End — impedisce lancio anche se il TOUCH_START era già stato ricevuto da InputController prima che il blocco venisse impostato.

---

## Menu dialog — pausa + input blocking (v0.7.2)

**Decisione**: aprire il menu (nodo `Dialog` nella HUD) mette il gioco in pausa completa: physics disabilitata, audio silenziato, **e input bloccato**.

**Come funziona**:
- `openMenu()`: imposta `GameState.Paused`, `PhysicsSystem2D.instance.enable = false`, `AudioManager.muteForPause()`, **`inputCtrl.blocked = true`**
- `closeMenu()`: dopo il fade-out (tween 0.2s), ripristina `state`, `enable = true`, `unmuteForPause()`, **`inputCtrl.blocked = false`**

**Perché il blocco esplicito**: `InputController` registra listener globali (`input.on()`) e non legge `GameState` — senza `blocked = true`, il drag e la rotazione balestra continuano a rispondere durante la pausa. `PhysicsSystem2D.enable = false` ferma la simulazione ma non impedisce all'input di accumulare stato (drag start, direzione balestra).

**Toggle sync**: al momento dell'apertura, `_syncingToggles = true` viene impostato prima di aggiornare `isChecked` dei Toggle (Vibrations, Sfx, Music, Fullscreen) per evitare che le callback dei toggle chiamino nuovamente le funzioni toggle. Il flag viene resettato subito dopo la sync.

---

## Swap NextPreview — listener diretto su nodo scena (v0.8.6)

**Decisione**: il riconoscimento del tap su NextPreview non passa più dall'`InputController` globale. Il listener è ora diretto:
```typescript
this.nextPreviewNode?.on(Node.EventType.TOUCH_END, () => this.swapNextWithLauncher(), this);
```

**Perché**: il vecchio approccio usava `_isOnSwapNode()` nell'handler globale `input.on(TOUCH_START)` con hit-test via coordinate canvas vs worldPosition. Questa conversione era fragile (coordinate space mismatch tra world node e UI canvas) e causava swap accidentali al click di altri elementi. Con il listener sul nodo, CC3 fa l'hit-test correttamente e il trigger è garantito solo sul nodo.

**Rimosso da InputController**: campi `onSwapNext`, `swapHitNode`, `_swapTapStart`; metodo `_isOnSwapNode`; blocchi in `handleDragStart`/`handleDragEnd`.

---

## Game over / victory — schermata garantita (v0.8.23)

**Decisione**: in `triggerGameOver()`/`triggerVictory()` la schermata viene **schedulata prima** dei side-effect (audio, log, salvataggio best), che sono racchiusi in `try/catch`.

**Perché**: entrambe le funzioni vengono raggiunte da `checkLineLogic`/merge, che girano dentro il `try/catch` di `update()`. Quel catch **inghiotte** le eccezioni. Se un side-effect lanciava *dopo* `state = GameOver` ma *prima* di schedulare la schermata, lo stato restava `GameOver` (→ `update()` esce subito ogni frame), il warrior restava rosso e **nessuna schermata appariva**. Schedulando per prima la schermata, un'eccessione nei side-effect non può più bloccare il flusso (viene solo loggata).

---

## Settings — host hook `onQuit` + tasto "Quit" con conferma (v0.8.62, ex `onRestart` v0.8.23)

**Decisione**: il dialog `Settings` (condiviso MainMenu+Game) espone un host hook `onQuit`. Il `GameManager` lo imposta a `() => loadScene(MainMenu)` (con commercial break); in MainMenu resta `null`. Ha sostituito il vecchio `onRestart` (2026-06-12): il restart resta disponibile nel `PausePanel`, nel dialog settings servono solo Close + Quit.

**Visibilità scena-specifica senza duplicare il dialog**: il tasto "Quit" è mostrato in `open()` solo se `onQuit` è settato → compare **solo nella scena Game**. Se non è assegnato un nodo dedicato (`quitButton` @property), alla prima apertura ne viene **clonato uno da `closeButton`** (stesso stile), rietichettato e posizionato **affiancato** (x speculare: il Close in scena sta a `horizontalCenter: -190`, il clone va a `+190`; fallback sopra il Close se questo è centrato). Stesso pattern degli host hook esistenti (`canOpen`/`onBeforeOpen`/`onAfterClose`).

**Conferma in due step (niente UI extra)**: primo click la label diventa `Sure?`, secondo click chiude e quitta; la conferma si disarma a ogni `open()`. Evita un dialog di conferma dedicato (regola no-runtime-UI).

---

## InputController — drag limitato alla pista (v0.8.6)

**Decisione**: il drag della traiettoria inizia solo se il tocco cade dentro la pista (orizzontalmente tra le pareti, a qualunque altezza), non più ovunque con `touch.y < 0`.

**Implementazione**: metodo `_isInsideTrack(touch)` in InputController — interpolazione lineare della X delle pareti alla Y del tocco:
```typescript
const t  = (touch.y - lwA.y) / (lwB.y - lwA.y);
const lx = lwA.x + (lwB.x - lwA.x) * t;
const rx = rwA.x + (rwB.x - rwA.x) * t;
return touch.x >= lx && touch.x <= rx;
```
Fallback `touch.y < 0` se i bounds non sono ancora settati. Le coordinate sono in canvas-centered space (stesso sistema di `WALL_L*`/`WALL_R*` esportati da Track.ts).

---

## Leaderboard online (Firebase Firestore) — architettura riusabile

**Obiettivo:** classifica top-10 riusabile in altri progetti, spegnibile per i portali.

**Stratificazione (perché):**
- `config/LeaderboardConfig.ts` è l'**unico file da editare per progetto** (flag `ENABLED`/`BACKEND`, `FIREBASE_CONFIG`, costanti). Tutto il resto è agnostico.
- `services/` è **TS puro, zero dipendenze da scena/engine UI** → la parte davvero portabile. `LeaderboardService` è il contratto; `Null`/`Mock`/`Firestore` le impl; `LeaderboardProvider.get()` sceglie via flag e fa da singleton.
- I metodi del service **non lanciano mai**: errori di rete/SDK si risolvono in vuoto/false/`{ok:false}`. Così la UI non ha try/catch e un backend morto degrada senza freeze.
- I componenti UI portano **solo comportamento** e si legano a un **prefab** via `@property` (niente UI costruita da codice — preferenza esplicita). Layout editabile nell'editor; testi in inglese.

**UI nella scena Ranking** *(stato v0.8.53 — il vecchio overlay prefab modale è superato, vedi Pivot sotto)*: `Board` (lista) e `NameEntry` (selettore) sono nodi della scena `Ranking.scene`. Il root resta **sempre attivo** come gate (BlockInputEvents fullscreen); i sotto-pannelli sfumano via `UIOpacity`. Regola CC3 da ricordare: un nodo che parte inattivo non riceve `onLoad` (binding non registrati) — l'attivazione è sincrona, quindi riattivare il root esegue `NameEntry.onLoad` prima di chiamarlo.

**Firebase compat via CDN (non npm):** i due `<script>` in `build-templates/web-mobile/index.html` espongono `window.firebase`; il bundle dell'engine resta Firebase-free. `patch-html.js` non riscrive gli URL assoluti (sono già version-pinned). `FirestoreLeaderboard` tocca solo `window.firebase`.

**Anti-cheat v1 (rules-only):** `firestore.rules` valida forma (`name` `[A-Z]{3}`, `score` int 0..1e6, `createdAt==request.time`, no update/delete, read pubblica). Cheating entro il cap accettato per la v1; App Check come hardening futuro. Le costanti delle rules vanno tenute in sync con `LeaderboardConfig.ts` (NAME_LEN, SCORE_CAP).

**Prefab generato a tavolino:** `scripts/gen-leaderboard-prefabs.js` emette `LeaderboardPanel.prefab` (layout + wiring `@property` già fatto) calcolando la forma compressa dell'UUID script (algoritmo Cocos: 5 hex literali + base64 a gruppi di 3 hex). Gli sprite frame usati sono `hud/wood.png` (pannelli) e `hud/button.png` (bottoni); font MedievalSharp; le frecce ▲/▼ usano il **system font** (MedievalSharp non ha i glifi triangolo). Rigenerabile con `node scripts/gen-leaderboard-prefabs.js`. ⚠️ Rigenerare cambia i `fileId`: le `PrefabInstance` già piazzate in scena vanno ri-trascinate (override orfani).

**MainMenu:** pulsante LEADERBOARD → `MainMenu.onLeaderboard()` → `director.loadScene('Ranking')`. Per il flusso game-over vedi il Pivot sotto e la sezione "Pannelli fine partita" in cima al file (`_prepareLeaderboard` arma `pendingScore` senza navigare; `Continue` naviga).

### Pivot 2026-06-08 — Ranking è una SCENA dedicata (stato finale v0.8.53)
L'approccio modale dal menu (`resources.load` + `getComponent`/duck-typing) si è rivelato inaffidabile sul deploy. **Soluzione finale**: la leaderboard vive interamente nella scena `Ranking.scene` (LeaderboardPanel + NameEntry come nodi normali, istanziati dal motore al load — path standard, affidabile).
- **Niente detection del nome scena**: `director.getScene().name` è `""` in `onLoad` nei build (gotcha in MEMO.md) — la detection `=== 'Ranking'` del primo pivot è stata rimossa in v0.8.53.
- **Handoff dal game-over**: `GameManager._runLeaderboardFlow` fa `qualifies(score)` → se top-10 imposta lo **statico** `LeaderboardPanel.pendingScore` e fa `loadScene('Ranking')` (name-entry → submit → board). `LeaderboardPanel.start()` mostra name-entry se c'è uno score pendente, altrimenti la board; Close → `loadScene('MainMenu')`.
- `md5Cache=true` in `scripts/build.js` per evitare bundle serviti da cache stale.

**Stato/deploy**: deploy manuale su gh-pages (`npm run build` + `npm run deploy`). NIENTE build/deploy automatici (vedi memoria workflow). Rules v1 applicate in console Firebase (2026-06-10) — test-mode disattivato.

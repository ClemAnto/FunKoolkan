# Leaderboard module — reusable across projects

A self-contained, backend-agnostic leaderboard. The **service layer** (this folder)
is pure TypeScript with no scene dependency; the two UI components
(`managers/NameEntry.ts`, `managers/LeaderboardPanel.ts`) carry only behavior and
bind to a prefab via `@property`.

## Files

| File | Role |
|------|------|
| `config/LeaderboardConfig.ts` | **The only file to edit per project**: flag, backend, Firebase keys, constants (TOP_N, NAME_LEN, SCORE_CAP). |
| `services/LeaderboardService.ts` | Interface + `LeaderboardEntry` / `SubmitResult` types. |
| `services/NullLeaderboard.ts` | No-op (portal builds / disabled). |
| `services/MockLeaderboard.ts` | In-memory + localStorage, seeded — local dev/tests, no network. |
| `services/FirestoreLeaderboard.ts` | Real backend via Firebase **compat** SDK (`window.firebase`). |
| `services/LeaderboardProvider.ts` | `LeaderboardProvider.get()` → the configured singleton. |
| `managers/NameEntry.ts` | Arcade NAME_LEN-letter name selector (behavior). Lives next to the board in the Ranking scene. |
| `managers/LeaderboardPanel.ts` | Board + flow orchestration, hosted in a dedicated **Ranking scene**. Handoff from game over via the static `LeaderboardPanel.pendingScore` (+ `pendingRound`/`pendingVersion`): `start()` shows name-entry if a score is pending, else the board. |

## Drop into a new project

1. Copy `config/`, `services/`, the two `managers/*.ts`, and the Ranking scene (or rebuild
   an equivalent scene hosting the board + name-entry nodes).
2. Edit `LeaderboardConfig.ts`: `FIREBASE_CONFIG`, `BACKEND`, and tuning constants.
3. Inject the Firebase compat SDK in `index.html` (see `build-templates/web-mobile/index.html`) —
   `FirestoreLeaderboard` also lazy-loads it from the CDN at runtime if missing.
4. Apply `firestore.rules` to the Firebase project.
5. At game over: set `LeaderboardPanel.pendingScore` and `director.loadScene('Ranking')`
   (see `GameManager._runLeaderboardFlow`); from a menu button just load the scene
   (see `MainMenu.onLeaderboard`).

## Disable for portals

Set `BACKEND = 'null'` (or `ENABLED = false`) in `LeaderboardConfig.ts`, and remove
the two Firebase `<script>` tags from `index.html`. All call sites stay unchanged.

## Usage contract

Every service method is async and **never throws** — failures resolve to empty/false/
`{ ok: false }`, so the UI needs no try/catch and a dead backend degrades gracefully.

export enum GameState {
    Idle,       // startup, no warrior ready yet
    Aiming,     // warrior ready, timer counting
    Inflight,   // warrior launched, waiting to cross line
    Settling,   // warrior crossed line, physics settling
    GameOver,
    Paused,
}

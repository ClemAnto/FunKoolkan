import { Color } from 'cc';

export interface LevelData {
    name: string;
    radius: number;
    explosion?: boolean;
    bonus?: number;
    label?: string;
    vfxColor?: Color;
}

export interface WarriorData {
    id: number;
    type: string;
    name: string;
    maxLevel: number;
    color: Color;
    introRound: number;
}

// index = level (0 unused, 1–7 valid)
export const LEVEL_CONFIG: readonly (LevelData | null)[] = [
    null,
    { name: 'Cub',        radius: 18 },
    { name: 'Apprentice', radius: 22 },
    { name: 'Soldier',    radius: 26 },
    { name: 'Warrior',    radius: 31 },
    { name: 'Champion',   radius: 37, explosion: true, bonus:  500, label: 'CHAMPION!', vfxColor: new Color(255, 200,  50, 255) },
    { name: 'Hero',       radius: 45, explosion: true, bonus: 1000, label: 'HERO!',     vfxColor: new Color(180, 100, 255, 255) },
    { name: 'Legend',     radius: 54, explosion: true, bonus: 2000, label: 'LEGEND!',   vfxColor: new Color(255,  80,  60, 255) },
];

// index = type (0–6)
export const WARRIORS: readonly WarriorData[] = [
    { id: 0, type: 'frog',    name: 'Frog',    maxLevel: 3, color: new Color( 60, 190,  60), introRound: 1 },
    { id: 1, type: 'cat',     name: 'Cat',     maxLevel: 3, color: new Color(220, 130,  50), introRound: 1 },
    { id: 2, type: 'chicken', name: 'Chicken', maxLevel: 3, color: new Color(240, 210,  80), introRound: 1 },
    { id: 3, type: 'wolf',    name: 'Wolf',    maxLevel: 4, color: new Color(110, 110, 130), introRound: 3 },
    { id: 4, type: 'eagle',   name: 'Eagle',   maxLevel: 4, color: new Color(140,  90,  40), introRound: 5 },
    { id: 5, type: 'lion',    name: 'Lion',    maxLevel: 4, color: new Color(220, 170,  40), introRound: 7 },
    { id: 6, type: 'dragon',  name: 'Dragon',  maxLevel: 5, color: new Color(130,  50, 180), introRound: 9 },
];

export function spawnTypesForRound(round: number): number {
    return WARRIORS.filter(w => w.introRound <= round).length;
}

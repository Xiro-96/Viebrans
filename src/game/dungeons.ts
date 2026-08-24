export type DungeonMode = 'solo' | 'party';

export interface Wave {
  monsterId: string;
  count: number;
  levelBonus?: number;
}

export interface DungeonDef {
  id: string;
  name: string;
  blurb: string;
  mode: DungeonMode;
  minLevel: number;
  /** Türsteher: benötigter Gear-Score. */
  minGearScore: number;
  partySize: number;
  waves: Wave[];
  bossId: string;
  /** Itemlevel der Belohnungen. */
  rewardIlvl: number;
  goldReward: number;
  /** Anzahl garantierter Beutestücke. */
  rewardItems: number;
  endgame?: boolean;
}

export const DUNGEONS: DungeonDef[] = [
  {
    id: 'crypt',
    name: 'Sickergrotte',
    blurb: 'Eine feuchte Höhle unter der Sonnenwiese. Der Einstieg für Einzelgänger.',
    mode: 'solo',
    minLevel: 10,
    minGearScore: 38,
    partySize: 1,
    waves: [
      { monsterId: 'slime', count: 5 },
      { monsterId: 'mush', count: 4 },
      { monsterId: 'wolf', count: 3 },
    ],
    bossId: 'boss_grum',
    rewardIlvl: 14,
    goldReward: 700,
    rewardItems: 2,
  },
  {
    id: 'quarry',
    name: 'Versunkener Steinbruch',
    blurb: 'Vier Abenteurer, drei Wellen, ein sehr wütender Golemfürst.',
    mode: 'party',
    minLevel: 20,
    minGearScore: 105,
    partySize: 4,
    waves: [
      { monsterId: 'golem', count: 4 },
      { monsterId: 'wisp', count: 5 },
      { monsterId: 'bandit', count: 5 },
    ],
    bossId: 'boss_hollow',
    rewardIlvl: 30,
    goldReward: 2400,
    rewardItems: 3,
  },
  {
    id: 'throne',
    name: 'Thronsaal des Ersten',
    blurb: 'Endstufe. Nur voll ausgerüstete Gruppen überleben hier länger als eine Minute.',
    mode: 'party',
    minLevel: 60,
    minGearScore: 340,
    partySize: 4,
    waves: [
      { monsterId: 'revenant', count: 5, levelBonus: 12 },
      { monsterId: 'titan', count: 4, levelBonus: 8 },
      { monsterId: 'drake', count: 6, levelBonus: 20 },
    ],
    bossId: 'boss_viebran',
    rewardIlvl: 70,
    goldReward: 12000,
    rewardItems: 4,
    endgame: true,
  },
];

export const DUNGEON_BY_ID: Record<string, DungeonDef> = Object.fromEntries(
  DUNGEONS.map((d) => [d.id, d]),
);

export interface LockCheck {
  ok: boolean;
  reason?: string;
}

export function checkLock(d: DungeonDef, level: number, gs: number): LockCheck {
  if (level < d.minLevel) return { ok: false, reason: `Level ${d.minLevel} nötig (du bist ${level})` };
  if (gs < d.minGearScore) return { ok: false, reason: `Gear-Score ${d.minGearScore} nötig (du hast ${gs})` };
  return { ok: true };
}

/**
 * Maße der Instanz: ein hochkanter Korridor, damit er den Handybildschirm füllt.
 * Die Wellen liegen von unten nach oben gestaffelt — man kämpft sich vorwärts.
 */
export const DUNGEON_W = 520;
export const DUNGEON_H = 1700;
/** Startpunkt des Spielers und Abstand zwischen den Wellenlinien. */
export const DUNGEON_ENTRANCE_Y = DUNGEON_H - 110;
export const DUNGEON_WAVE_GAP = 340;
export const DUNGEON_BOSS_Y = 200;

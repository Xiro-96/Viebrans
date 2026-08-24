export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  range: number;
  attackSpeed: number;
  radius: number;
  color: string;
  gold: number;
  /** Chance auf Ausrüstung pro Kill. */
  dropChance: number;
  boss?: boolean;
  /** Aggressiv: greift von selbst an. */
  aggressive: boolean;
}

function mob(
  id: string, name: string, level: number, color: string,
  opts: Partial<MonsterDef> = {},
): MonsterDef {
  return {
    id, name, level, color,
    hp: Math.round(40 + level * level * 2.4 + level * 26),
    atk: Math.round(6 + level * 3.1),
    def: Math.round(level * 1.6),
    speed: 62,
    range: 26,
    attackSpeed: 1.7,
    radius: 13,
    gold: Math.round(4 + level * 3.2),
    dropChance: 0.18,
    aggressive: false,
    ...opts,
  };
}

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(
  [
    mob('slime', 'Wackelschleim', 1, '#86efac', { speed: 44, dropChance: 0.12 }),
    mob('bunny', 'Beißhase', 3, '#fda4af', { speed: 74 }),
    mob('mush', 'Giftpilz', 6, '#c084fc', { aggressive: true }),
    mob('wolf', 'Steppenwolf', 9, '#94a3b8', { aggressive: true, speed: 82 }),
    mob('golem', 'Steinklotz', 13, '#a8a29e', { speed: 40, hp: 900, def: 40 }),
    mob('wisp', 'Irrlicht', 16, '#67e8f9', { range: 150, attackSpeed: 2.2, speed: 70 }),
    mob('bandit', 'Wegelagerer', 20, '#f97316', { aggressive: true, speed: 78 }),
    mob('drake', 'Jungdrache', 26, '#ef4444', { aggressive: true, speed: 74, radius: 17 }),
    mob('revenant', 'Wiedergänger', 34, '#818cf8', { aggressive: true, speed: 76, radius: 16 }),
    mob('titan', 'Ödland-Titan', 45, '#fb7185', { aggressive: true, speed: 70, radius: 19 }),
    // Bosse
    mob('boss_grum', 'Grummelkönig', 12, '#fbbf24', {
      boss: true, hp: 4200, atk: 58, def: 55, radius: 26, speed: 58, gold: 900, dropChance: 1,
      aggressive: true,
    }),
    mob('boss_hollow', 'Hohlherz', 24, '#f472b6', {
      boss: true, hp: 16000, atk: 128, def: 130, radius: 30, speed: 62, gold: 2600, dropChance: 1,
      aggressive: true,
    }),
    mob('boss_viebran', 'Viebran, der Erste', 60, '#f87171', {
      boss: true, hp: 92000, atk: 430, def: 420, radius: 36, speed: 66, gold: 9000, dropChance: 1,
      aggressive: true,
    }),
  ].map((m) => [m.id, m]),
);

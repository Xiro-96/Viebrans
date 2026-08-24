import { CLASSES, MAX_LEVEL, SPECS } from './classes';
import type { ClassId, CombatStats, Item, SpecId, Stats } from './types';

/** XP für den Aufstieg von `level` auf `level+1`. */
export function xpToNext(level: number): number {
  return Math.round(60 * Math.pow(level, 1.55) + 40 * level);
}

/** Fertigkeitspunkte, die ein Levelaufstieg gewährt. */
export function skillPointsForLevel(level: number): number {
  return level % 5 === 0 ? 2 : 1;
}

export type Derived = CombatStats;

export interface GearSummary {
  atk: number;
  def: number;
  bonus: Stats;
  gearScore: number;
}

export const RARITY = {
  common: { name: 'Normal', color: '#cbd5e1', mult: 1.0, affixes: 0, score: 1.0 },
  rare: { name: 'Selten', color: '#60a5fa', mult: 1.25, affixes: 1, score: 1.15 },
  epic: { name: 'Episch', color: '#c084fc', mult: 1.55, affixes: 2, score: 1.35 },
  legendary: { name: 'Legendär', color: '#fbbf24', mult: 1.95, affixes: 3, score: 1.6 },
} as const;

export function itemPower(item: Item): number {
  return item.base * (1 + 0.09 * item.plus);
}

/**
 * Gear-Score: Summe aus Itemlevel, Seltenheit und Aufwertung über alle 7 Slots.
 * Voll ausgerüstet liegt er grob beim 7-fachen des durchschnittlichen Itemlevels.
 */
export function gearScore(equipped: Partial<Record<string, Item>>): number {
  let sum = 0;
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    sum += item.ilvl * RARITY[item.rarity].score * (1 + 0.05 * item.plus);
  }
  return Math.round(sum);
}

export function summarizeGear(equipped: Partial<Record<string, Item>>): GearSummary {
  const bonus: Stats = { str: 0, sta: 0, dex: 0, int: 0 };
  let atk = 0;
  let def = 0;
  for (const item of Object.values(equipped)) {
    if (!item) continue;
    if (item.slot === 'weapon') atk += itemPower(item);
    else def += itemPower(item);
    for (const [k, v] of Object.entries(item.bonus)) {
      bonus[k as keyof Stats] += v ?? 0;
    }
  }
  return { atk, def, bonus, gearScore: gearScore(equipped) };
}

export function derive(
  classId: ClassId,
  specId: SpecId | null | undefined,
  level: number,
  stats: Stats,
  gear: GearSummary,
): Derived {
  const c = CLASSES[classId];
  const m = specId ? SPECS[specId].mods : {};
  const total: Stats = {
    str: stats.str + gear.bonus.str,
    sta: stats.sta + gear.bonus.sta,
    dex: stats.dex + gear.bonus.dex,
    int: stats.int + gear.bonus.int,
  };
  const mainVal = total[c.mainStat];
  const atk = (8 + mainVal * 1.7 + level * 2.2 + gear.atk) * (m.atk ?? 1);
  const maxHp = Math.round((60 + total.sta * 9 + level * 18) * (m.hp ?? 1));
  const maxMp = Math.round(40 + total.int * 5 + level * 8);
  const def = (total.sta * 1.1 + level * 1.4 + gear.def) * (m.def ?? 1);
  const crit = Math.min(0.6, 0.03 + total.dex * 0.0016 + (m.crit ?? 0));
  const dodge = Math.min(0.4, total.dex * 0.0012);
  const healPower = (10 + total.int * 1.8 + level * 2) * (m.heal ?? 1);
  return {
    maxHp,
    maxMp,
    atk,
    def,
    crit,
    dodge,
    attackSpeed: c.attackSpeed / (m.speed ?? 1),
    moveSpeed: 118 * (m.speed ?? 1),
    healPower,
  };
}

/** Kernformel: Rüstung reduziert prozentual, skaliert mit Angreiferlevel. */
export function mitigate(raw: number, def: number, attackerLevel: number): number {
  const k = 55 + attackerLevel * 11;
  return raw * (k / (k + Math.max(0, def)));
}

export function levelPenalty(attackerLevel: number, targetLevel: number): number {
  const d = attackerLevel - targetLevel;
  if (d >= 0) return 1;
  return Math.max(0.25, 1 + d * 0.06);
}

export function xpReward(monsterLevel: number, playerLevel: number): number {
  const base = 14 + monsterLevel * monsterLevel * 0.9;
  const d = playerLevel - monsterLevel;
  const factor = d > 8 ? Math.max(0.05, 1 - (d - 8) * 0.12) : 1;
  return Math.round(base * factor);
}

export function isMaxLevel(level: number): boolean {
  return level >= MAX_LEVEL;
}

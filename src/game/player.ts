import { CLASSES, JOB_LEVEL, MAX_LEVEL, SPECS, statsFor } from './classes';
import { derive, skillPointsForLevel, summarizeGear, xpToNext } from './formulas';
import { availableSkills, SKILL_BY_ID } from './skills';
import { itemScore, sellValue, SLOT_ORDER, startingGear, upgradeChance, upgradeCost } from './items';
import { chance } from './rng';
import type { BotRecord } from './bots';
import type { ClassId, CombatStats, EquipSlot, Item, SpecId, Stats } from './types';

export const SAVE_VERSION = 1;
export const QUICKBAR_SIZE = 6;
export const INVENTORY_CAP = 60;

export interface SaveData {
  v: number;
  name: string;
  classId: ClassId;
  specId: SpecId | null;
  level: number;
  xp: number;
  gold: number;
  skillPoints: number;
  skillRanks: Record<string, number>;
  equipped: Partial<Record<EquipSlot, Item>>;
  inventory: Item[];
  quickbar: (string | null)[];
  clears: Record<string, number>;
  bots: BotRecord[];
  lastSeen: number;
  playtime: number;
  kills: number;
}

export function createSave(name: string, classId: ClassId, bots: BotRecord[]): SaveData {
  const save: SaveData = {
    v: SAVE_VERSION,
    name,
    classId,
    specId: null,
    level: 1,
    xp: 0,
    gold: 150,
    skillPoints: 1,
    skillRanks: {},
    equipped: {},
    inventory: [],
    quickbar: new Array(QUICKBAR_SIZE).fill(null),
    clears: {},
    bots,
    lastSeen: Date.now(),
    playtime: 0,
    kills: 0,
  };
  for (const item of startingGear(classId)) equip(save, item);
  // Die erste Fertigkeit ist von Anfang an gelernt und belegt.
  const first = availableSkills(classId, null, 1)[0];
  if (first) {
    save.skillRanks[first.id] = 1;
    save.skillPoints = 0;
    save.quickbar[0] = first.id;
  }
  return save;
}

export interface PlayerView {
  stats: Stats;
  gearScore: number;
  cs: CombatStats;
  xpNeeded: number;
}

export function view(save: SaveData): PlayerView {
  const stats = statsFor(save.classId, save.level);
  const gear = summarizeGear(save.equipped);
  return {
    stats: {
      str: stats.str + gear.bonus.str,
      sta: stats.sta + gear.bonus.sta,
      dex: stats.dex + gear.bonus.dex,
      int: stats.int + gear.bonus.int,
    },
    gearScore: gear.gearScore,
    cs: derive(save.classId, save.specId, save.level, stats, gear),
    xpNeeded: xpToNext(save.level),
  };
}

export interface LevelUpResult {
  levels: number;
  jobReady: boolean;
}

export function addXp(save: SaveData, amount: number): LevelUpResult {
  let levels = 0;
  save.xp += amount;
  while (save.level < MAX_LEVEL && save.xp >= xpToNext(save.level)) {
    save.xp -= xpToNext(save.level);
    save.level += 1;
    save.skillPoints += skillPointsForLevel(save.level);
    levels += 1;
  }
  if (save.level >= MAX_LEVEL) save.xp = Math.min(save.xp, xpToNext(MAX_LEVEL) - 1);
  return { levels, jobReady: save.level >= JOB_LEVEL && !save.specId };
}

export function chooseSpec(save: SaveData, specId: SpecId): boolean {
  if (save.specId) return false;
  if (save.level < JOB_LEVEL) return false;
  if (!CLASSES[save.classId].specs.includes(specId)) return false;
  save.specId = specId;
  return true;
}

export function canUse(save: SaveData, item: Item): boolean {
  return !item.classes || item.classes.includes(save.classId);
}

/** Legt ein Item an; ein bereits getragenes wandert zurück ins Inventar. */
export function equip(save: SaveData, item: Item): boolean {
  if (!canUse(save, item)) return false;
  const idx = save.inventory.findIndex((i) => i.uid === item.uid);
  if (idx >= 0) save.inventory.splice(idx, 1);
  const previous = save.equipped[item.slot];
  if (previous) save.inventory.push(previous);
  save.equipped[item.slot] = item;
  return true;
}

export function unequip(save: SaveData, slot: EquipSlot): void {
  const item = save.equipped[slot];
  if (!item) return;
  delete save.equipped[slot];
  save.inventory.push(item);
}

export function sell(save: SaveData, uid: string): number {
  const idx = save.inventory.findIndex((i) => i.uid === uid);
  if (idx < 0) return 0;
  const [item] = save.inventory.splice(idx, 1);
  const value = sellValue(item);
  save.gold += value;
  return value;
}

export interface UpgradeResult {
  ok: boolean;
  reason?: string;
  success?: boolean;
}

export function upgrade(save: SaveData, slot: EquipSlot): UpgradeResult {
  const item = save.equipped[slot];
  if (!item) return { ok: false, reason: 'Kein Item in diesem Slot.' };
  if (item.plus >= 10) return { ok: false, reason: 'Maximale Stufe erreicht.' };
  const cost = upgradeCost(item);
  if (save.gold < cost) return { ok: false, reason: `Du brauchst ${cost} Gold.` };
  save.gold -= cost;
  const success = chance(upgradeChance(item));
  if (success) item.plus += 1;
  return { ok: true, success };
}

export function learn(save: SaveData, skillId: string): boolean {
  const skill = SKILL_BY_ID[skillId];
  if (!skill) return false;
  if (save.skillPoints < 1) return false;
  if (save.level < skill.reqLevel) return false;
  const owned = skill.owner === save.classId || skill.owner === save.specId;
  if (!owned) return false;
  const rank = save.skillRanks[skillId] ?? 0;
  if (rank >= skill.maxRank) return false;
  save.skillRanks[skillId] = rank + 1;
  save.skillPoints -= 1;
  if (rank === 0 && !save.quickbar.includes(skillId)) {
    const free = save.quickbar.indexOf(null);
    if (free >= 0) save.quickbar[free] = skillId;
  }
  return true;
}

export function assignQuickbar(save: SaveData, index: number, skillId: string | null): void {
  if (index < 0 || index >= QUICKBAR_SIZE) return;
  if (skillId) {
    const existing = save.quickbar.indexOf(skillId);
    if (existing >= 0) save.quickbar[existing] = null;
  }
  save.quickbar[index] = skillId;
}

export function bagFull(save: SaveData): boolean {
  return save.inventory.length >= INVENTORY_CAP;
}

/** Nimmt Beute auf, sofern noch Platz ist. */
export function addItem(save: SaveData, item: Item): boolean {
  if (bagFull(save)) return false;
  save.inventory.push(item);
  return true;
}

/**
 * Legt aus dem Inventar für jeden Slot das jeweils stärkste nutzbare Stück an.
 * Vergleicht über den Item-Score, damit Seltenheit und Aufwertung mitzählen.
 */
export function equipBest(save: SaveData): number {
  let changed = 0;
  for (const slot of SLOT_ORDER) {
    for (;;) {
      const current = save.equipped[slot];
      const best = save.inventory
        .filter((i) => i.slot === slot && canUse(save, i))
        .sort((a, b) => itemScore(b) - itemScore(a))[0];
      if (!best) break;
      if (current && itemScore(current) >= itemScore(best)) break;
      equip(save, best);
      changed += 1;
    }
  }
  return changed;
}

export function specName(save: SaveData): string {
  return save.specId ? SPECS[save.specId].name : CLASSES[save.classId].name;
}

export function classColor(save: SaveData): string {
  return CLASSES[save.classId].color;
}

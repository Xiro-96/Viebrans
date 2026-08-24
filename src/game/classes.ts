import type { ClassId, Role, SpecId, StatKey, Stats } from './types';

export const JOB_LEVEL = 30;
export const MAX_LEVEL = 60;

export interface ClassDef {
  id: ClassId;
  name: string;
  blurb: string;
  color: string;
  /** Statwachstum pro Level. */
  growth: Stats;
  base: Stats;
  /** Reichweite des Autoangriffs. */
  range: number;
  attackSpeed: number;
  /** Welcher Stat den Angriff treibt. */
  mainStat: StatKey;
  specs: SpecId[];
}

export interface SpecDef {
  id: SpecId;
  name: string;
  parent: ClassId;
  role: Role;
  blurb: string;
  /** Multiplikatoren, die ab der Jobwahl greifen. */
  mods: { hp?: number; atk?: number; def?: number; heal?: number; crit?: number; speed?: number };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Krieger',
    blurb: 'Robuster Nahkämpfer. Hält viel aus, teilt hart aus.',
    color: '#f87171',
    base: { str: 14, sta: 12, dex: 8, int: 5 },
    growth: { str: 2.4, sta: 2.0, dex: 0.8, int: 0.3 },
    range: 34,
    attackSpeed: 1.15,
    mainStat: 'str',
    specs: ['blademaster', 'guardian'],
  },
  scout: {
    id: 'scout',
    name: 'Späher',
    blurb: 'Flink und präzise. Hoher Schaden, wenig Rüstung.',
    color: '#4ade80',
    base: { str: 9, sta: 9, dex: 16, int: 5 },
    growth: { str: 1.1, sta: 1.2, dex: 2.8, int: 0.4 },
    range: 44,
    attackSpeed: 0.95,
    mainStat: 'dex',
    specs: ['ranger', 'bladedancer'],
  },
  assist: {
    id: 'assist',
    name: 'Assist',
    blurb: 'Unterstützer mit Fäusten. Buffs, Heilung, solide Defensive.',
    color: '#fbbf24',
    base: { str: 11, sta: 12, dex: 8, int: 12 },
    growth: { str: 1.6, sta: 1.7, dex: 0.9, int: 1.7 },
    range: 32,
    attackSpeed: 1.05,
    mainStat: 'str',
    specs: ['monk', 'ringmaster'],
  },
  mage: {
    id: 'mage',
    name: 'Magier',
    blurb: 'Zerbrechlich, aber mit gewaltigem Flächenschaden.',
    color: '#a78bfa',
    base: { str: 6, sta: 8, dex: 8, int: 18 },
    growth: { str: 0.5, sta: 1.1, dex: 0.9, int: 3.2 },
    range: 200,
    attackSpeed: 1.35,
    mainStat: 'int',
    specs: ['elementor', 'psykeeper'],
  },
};

export const SPECS: Record<SpecId, SpecDef> = {
  blademaster: {
    id: 'blademaster', name: 'Klingenmeister', parent: 'warrior', role: 'dps',
    blurb: 'Zwei Klingen, hohe Angriffsgeschwindigkeit und kritische Treffer.',
    mods: { atk: 1.28, crit: 0.08, speed: 1.1, hp: 0.95 },
  },
  guardian: {
    id: 'guardian', name: 'Wächter', parent: 'warrior', role: 'tank',
    blurb: 'Schild und Spott. Bindet Gegner und schützt die Gruppe.',
    mods: { hp: 1.45, def: 1.5, atk: 0.9 },
  },
  ranger: {
    id: 'ranger', name: 'Bogenschütze', parent: 'scout', role: 'dps',
    blurb: 'Tödlich auf Distanz, mit durchschlagenden Pfeilen.',
    mods: { atk: 1.3, crit: 0.06 },
  },
  bladedancer: {
    id: 'bladedancer', name: 'Klingentänzer', parent: 'scout', role: 'dps',
    blurb: 'Nahkampf-Wirbel mit hoher Kritchance und Ausweichen.',
    mods: { atk: 1.18, crit: 0.14, speed: 1.15, hp: 1.1 },
  },
  monk: {
    id: 'monk', name: 'Kampfmönch', parent: 'assist', role: 'dps',
    blurb: 'Faustkampf mit Selbstheilung — hält erstaunlich lange durch.',
    mods: { atk: 1.22, hp: 1.25, def: 1.15 },
  },
  ringmaster: {
    id: 'ringmaster', name: 'Ringmeister', parent: 'assist', role: 'heal',
    blurb: 'Der Anker jeder Gruppe: Heilung, Buffs, Wiederbelebung.',
    mods: { heal: 1.9, hp: 1.15, atk: 0.75 },
  },
  elementor: {
    id: 'elementor', name: 'Elementarist', parent: 'mage', role: 'dps',
    blurb: 'Flächenzauber, die ganze Mobgruppen auslöschen.',
    mods: { atk: 1.42, hp: 0.9 },
  },
  psykeeper: {
    id: 'psykeeper', name: 'Psykeeper', parent: 'mage', role: 'dps',
    blurb: 'Schadenszauber über Zeit, Kontrolle und Lebensraub.',
    mods: { atk: 1.15, hp: 1.3, def: 1.2 },
  },
};

export function statsFor(classId: ClassId, level: number): Stats {
  const c = CLASSES[classId];
  const l = level - 1;
  return {
    str: Math.round(c.base.str + c.growth.str * l),
    sta: Math.round(c.base.sta + c.growth.sta * l),
    dex: Math.round(c.base.dex + c.growth.dex * l),
    int: Math.round(c.base.int + c.growth.int * l),
  };
}

export function roleOf(classId: ClassId, specId: SpecId | null | undefined): Role {
  if (specId) return SPECS[specId].role;
  return classId === 'assist' ? 'heal' : classId === 'warrior' ? 'tank' : 'dps';
}

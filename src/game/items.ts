import { RARITY } from './formulas';
import type { ClassId, EquipSlot, Item, Rarity, StatKey } from './types';
import { rng } from './rng';

/** Genus des Gegenstandsnamens — steuert die Adjektivendung des Präfixes. */
type Gender = 'm' | 'f' | 'n' | 'p';

interface Template {
  id: string;
  name: string;
  slot: EquipSlot;
  classes: ClassId[] | null;
  /** Basiswert pro Itemlevel. */
  scale: number;
  favored: StatKey[];
  gender: Gender;
}

const WEAPONS: Template[] = [
  { id: 'w_sword', name: 'Langschwert', slot: 'weapon', classes: ['warrior'], scale: 3.1, favored: ['str', 'sta'], gender: 'n' },
  { id: 'w_axe', name: 'Streitaxt', slot: 'weapon', classes: ['warrior'], scale: 3.4, favored: ['str'], gender: 'f' },
  { id: 'w_bow', name: 'Jagdbogen', slot: 'weapon', classes: ['scout'], scale: 3.0, favored: ['dex'], gender: 'm' },
  { id: 'w_dagger', name: 'Zwillingsdolche', slot: 'weapon', classes: ['scout'], scale: 2.8, favored: ['dex', 'str'], gender: 'p' },
  { id: 'w_knuckle', name: 'Schlagringe', slot: 'weapon', classes: ['assist'], scale: 3.0, favored: ['str', 'int'], gender: 'p' },
  { id: 'w_stick', name: 'Segensstab', slot: 'weapon', classes: ['assist'], scale: 2.6, favored: ['int', 'sta'], gender: 'm' },
  { id: 'w_staff', name: 'Runenstab', slot: 'weapon', classes: ['mage'], scale: 3.3, favored: ['int'], gender: 'm' },
  { id: 'w_wand', name: 'Zauberrute', slot: 'weapon', classes: ['mage'], scale: 2.9, favored: ['int', 'sta'], gender: 'f' },
];

const ARMOR: Template[] = [
  { id: 'a_helm', name: 'Helm', slot: 'helmet', classes: null, scale: 1.0, favored: ['sta'], gender: 'm' },
  { id: 'a_chest', name: 'Harnisch', slot: 'armor', classes: null, scale: 1.6, favored: ['sta', 'str'], gender: 'm' },
  { id: 'a_gloves', name: 'Handschuhe', slot: 'gloves', classes: null, scale: 0.8, favored: ['dex', 'str'], gender: 'p' },
  { id: 'a_boots', name: 'Stiefel', slot: 'boots', classes: null, scale: 0.9, favored: ['dex', 'sta'], gender: 'p' },
  { id: 'a_ring', name: 'Ring', slot: 'ring', classes: null, scale: 0.5, favored: ['int', 'dex', 'str'], gender: 'm' },
  { id: 'a_neck', name: 'Amulett', slot: 'necklace', classes: null, scale: 0.6, favored: ['int', 'sta'], gender: 'n' },
];

export const TEMPLATES: Template[] = [...WEAPONS, ...ARMOR];
export const SLOT_ORDER: EquipSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'necklace'];

export const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: 'Waffe',
  helmet: 'Kopf',
  armor: 'Rumpf',
  gloves: 'Hände',
  boots: 'Füße',
  ring: 'Ring',
  necklace: 'Amulett',
};

/** Adjektivstämme (ohne Endung) und feste Wortbestandteile für Legendäres. */
const PREFIX: Record<Rarity, string[]> = {
  common: ['Schlicht', 'Abgenutzt', 'Einfach'],
  rare: ['Gehärtet', 'Fein', 'Geschliffen'],
  epic: ['Uralt', 'Sturmgeschmiedet', 'Glühend'],
  legendary: ['Viebranisch', 'Drachenzahn-', 'Sonnenlicht-'],
};

/** Starke Deklination im Nominativ: der/die/das/die → -er/-e/-es/-e. */
const ENDING: Record<Gender, string> = { m: 'er', f: 'e', n: 'es', p: 'e' };

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `i${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

export function rollRarity(luck = 0): Rarity {
  const r = rng() - luck;
  if (r < 0.02) return 'legendary';
  if (r < 0.10) return 'epic';
  if (r < 0.32) return 'rare';
  return 'common';
}

export function makeItem(ilvl: number, rarity: Rarity, template: Template): Item {
  const info = RARITY[rarity];
  const base = Math.max(1, Math.round(template.scale * ilvl * info.mult));
  const bonus: Partial<Record<StatKey, number>> = {};
  const pool = [...template.favored];
  for (let i = 0; i < info.affixes; i++) {
    const stat = pool[Math.floor(rng() * pool.length)] ?? 'sta';
    const amount = Math.max(1, Math.round(ilvl * 0.35 * (0.7 + rng() * 0.6)));
    bonus[stat] = (bonus[stat] ?? 0) + amount;
  }
  const prefixes = PREFIX[rarity];
  const prefix = prefixes[Math.floor(rng() * prefixes.length)];
  const name = prefix.endsWith('-')
    ? `${prefix}${template.name}`
    : `${prefix}${ENDING[template.gender]} ${template.name}`;
  return {
    uid: uid(),
    templateId: template.id,
    name,
    slot: template.slot,
    ilvl,
    rarity,
    base,
    bonus,
    plus: 0,
    classes: template.classes,
  };
}

/** Zieht ein zufälliges Item, das zur Klasse passt. */
export function rollLoot(ilvl: number, classId: ClassId, luck = 0): Item {
  const usable = TEMPLATES.filter((t) => !t.classes || t.classes.includes(classId));
  const t = usable[Math.floor(rng() * usable.length)];
  return makeItem(Math.max(1, ilvl), rollRarity(luck), t);
}

export function startingGear(classId: ClassId): Item[] {
  const weapon = WEAPONS.find((w) => w.classes?.includes(classId))!;
  return [makeItem(1, 'common', weapon), makeItem(1, 'common', ARMOR[1])];
}

/** Kosten und Erfolgschance beim Aufwerten. */
export function upgradeCost(item: Item): number {
  return Math.round(120 * (item.plus + 1) ** 1.7 + item.ilvl * 25);
}

export function upgradeChance(item: Item): number {
  return Math.max(0.28, 0.95 - item.plus * 0.075);
}

export function itemScore(item: Item): number {
  return Math.round(item.ilvl * RARITY[item.rarity].score * (1 + 0.05 * item.plus));
}

export function sellValue(item: Item): number {
  return Math.round(item.ilvl * 9 * RARITY[item.rarity].mult + item.plus * 40);
}

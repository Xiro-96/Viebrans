/** Zentrale Typen des Spiels. */

export type ClassId = 'warrior' | 'scout' | 'assist' | 'mage';
export type SpecId =
  | 'blademaster' | 'guardian'
  | 'ranger' | 'bladedancer'
  | 'monk' | 'ringmaster'
  | 'elementor' | 'psykeeper';

export type Role = 'tank' | 'heal' | 'dps';
export type StatKey = 'str' | 'sta' | 'dex' | 'int';
export type Stats = Record<StatKey, number>;

export type EquipSlot =
  | 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'ring' | 'necklace';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Item {
  uid: string;
  templateId: string;
  name: string;
  slot: EquipSlot;
  ilvl: number;
  rarity: Rarity;
  /** Basiswert: Angriff bei Waffen, Verteidigung bei Rüstung. */
  base: number;
  bonus: Partial<Stats>;
  /** Aufwertungsstufe +0..+10. */
  plus: number;
  classes: ClassId[] | null;
}

export type SkillKind = 'damage' | 'aoe' | 'heal' | 'buff' | 'debuff';

export interface Skill {
  id: string;
  name: string;
  desc: string;
  owner: ClassId | SpecId;
  reqLevel: number;
  kind: SkillKind;
  mp: number;
  cooldown: number;
  /** Schaden/Heilung als Faktor auf den Angriffswert. */
  power: number;
  range: number;
  radius?: number;
  duration?: number;
  /** Effekt für Buff/Debuff, z.B. { atk: 0.2 }. */
  effect?: Record<string, number>;
  maxRank: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  until: number;
  effect: Record<string, number>;
  /** Schaden pro Sekunde bei DoTs. */
  dps?: number;
  source?: string;
}

export interface CombatStats {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  crit: number;
  dodge: number;
  attackSpeed: number;
  moveSpeed: number;
  healPower: number;
}

export type ActorKind = 'player' | 'bot' | 'monster' | 'npc';

export interface Actor {
  id: string;
  kind: ActorKind;
  name: string;
  level: number;
  x: number;
  y: number;
  /** Höhe über dem Boden. 0 = am Boden, darüber wird geflogen. */
  alt: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  dead: boolean;
  respawnAt: number;
  radius: number;
  targetId: string | null;
  /** Ziel des Laufwegs. */
  moveTo: { x: number; y: number } | null;
  /** Dauerhafte Laufrichtung vom Steuerknüppel; hat Vorrang vor moveTo. */
  moveDir: { x: number; y: number } | null;
  attackCd: number;
  gcd: number;
  effects: StatusEffect[];
  classId?: ClassId;
  specId?: SpecId | null;
  role?: Role;
  monsterId?: string;
  spawnX?: number;
  spawnY?: number;
  aggroUntil?: number;
  /** Nur für Bots: KI-Zustand. */
  ai?: BotAI;
  skillCd?: Record<string, number>;
  gearScore?: number;
  color?: string;
  cs: CombatStats;
  /** Zugehörigkeit: 0 = Spielerseite, 1 = Monster. */
  team: 0 | 1;
  /** Bedrohung pro Angreifer-ID (nur Monster). */
  threat?: Record<string, number>;
  /** Sichtbare Wirkanimation. */
  castFx?: { t: number; kind: string; x: number; y: number; r: number };
  /** Aufgesessenes Reittier, falls vorhanden. */
  mountId?: string | null;
  /** Steigen (1), sinken (-1) oder Höhe halten (0). */
  climb?: number;
  /** Wie weit die Figur gerade läuft — treibt die Laufanimation. */
  stride?: number;
}

export interface BotAI {
  state: 'idle' | 'roam' | 'fight' | 'rest' | 'dungeon';
  nextThink: number;
  homeX: number;
  homeY: number;
  chatCd: number;
  partyId?: string | null;
}

export interface DamageEvent {
  x: number;
  y: number;
  amount: number;
  crit: boolean;
  kind: 'dmg' | 'heal' | 'xp' | 'miss';
  t: number;
  /** Betrifft den Spieler oder seine Gruppe — wird deutlicher dargestellt. */
  major: boolean;
}

export interface ChatMessage {
  channel: 'welt' | 'system' | 'gruppe' | 'handel';
  from: string;
  text: string;
  t: number;
}

import { CLASSES, statsFor } from './classes';
import { derive, levelPenalty, mitigate, summarizeGear, xpReward } from './formulas';
import { MONSTERS, type MonsterDef } from './monsters';
import { rankPower, SKILL_BY_ID } from './skills';
import { rollLoot } from './items';
import { chance, pick, rng } from './rng';
import { bestZoneFor, inTown, TOWN, WORLD_H, WORLD_W, ZONES, type Zone } from './world';
import { FLIGHT_THRESHOLD, MOUNT_BY_ID, type MountDef } from './mounts';
import {
  DUNGEON_BOSS_Y, DUNGEON_ENTRANCE_Y, DUNGEON_H, DUNGEON_W, DUNGEON_WAVE_GAP, type DungeonDef,
} from './dungeons';
import { findPartyCandidates, tickPopulation, type BotRecord } from './bots';
import { addItem, addXp, view, type SaveData } from './player';
import type {
  Actor, ChatMessage, ClassId, CombatStats, DamageEvent, Item, Skill, SpecId,
} from './types';

const GCD = 0.75;
const AGGRO_RADIUS = 190;
const LEASH = 420;
const RESPAWN_TIME = 14;
const BOT_RESPAWN = 8;

let actorSeq = 0;
function nextId(prefix: string): string {
  actorSeq += 1;
  return `${prefix}${actorSeq}`;
}

function baseActor(partial: Partial<Actor> & Pick<Actor, 'id' | 'kind' | 'name' | 'level' | 'x' | 'y' | 'cs' | 'team'>): Actor {
  return {
    alt: 0, vx: 0, vy: 0, facing: 0, climb: 0, stride: 0, mountId: null,
    hp: partial.cs.maxHp, maxHp: partial.cs.maxHp,
    mp: partial.cs.maxMp, maxMp: partial.cs.maxMp,
    dead: false, respawnAt: 0, radius: 12,
    targetId: null, moveTo: null, moveDir: null,
    attackCd: 0, gcd: 0, effects: [],
    skillCd: {},
    ...partial,
  };
}

export function monsterStats(def: MonsterDef, levelBonus = 0): CombatStats {
  const scale = 1 + levelBonus * 0.12;
  return {
    maxHp: Math.round(def.hp * scale),
    maxMp: 0,
    atk: def.atk * scale,
    def: def.def * scale,
    crit: 0.05,
    dodge: 0,
    attackSpeed: def.attackSpeed,
    moveSpeed: def.speed,
    healPower: 0,
  };
}

export function spawnMonster(id: string, x: number, y: number, levelBonus = 0): Actor {
  const def = MONSTERS[id];
  const cs = monsterStats(def, levelBonus);
  return baseActor({
    id: nextId('m'),
    kind: 'monster',
    name: def.name,
    level: def.level + levelBonus,
    x, y, cs, team: 1,
    radius: def.radius,
    monsterId: id,
    spawnX: x, spawnY: y,
    color: def.color,
    threat: {},
  });
}

/** Näherung der Werte eines Bots aus Level und Gear-Score. */
export function botStats(classId: ClassId, specId: SpecId | null, level: number, gs: number): CombatStats {
  const stats = statsFor(classId, level);
  const gear = summarizeGear({});
  // Gear-Score ist die Summe über 7 Slots — hier zurück in Angriff/Verteidigung übersetzt.
  gear.atk = gs * 0.48;
  gear.def = gs * 0.83;
  return derive(classId, specId, level, stats, gear);
}

export function spawnBotActor(rec: BotRecord, x: number, y: number): Actor {
  const cs = botStats(rec.classId, rec.specId, rec.level, rec.gearScore);
  return baseActor({
    id: `a_${rec.id}`,
    kind: 'bot',
    name: rec.name,
    level: rec.level,
    x, y, cs, team: 0,
    radius: 12,
    classId: rec.classId,
    specId: rec.specId,
    role: rec.role,
    gearScore: rec.gearScore,
    color: CLASSES[rec.classId].color,
    ai: { state: 'roam', nextThink: 0, homeX: x, homeY: y, chatCd: rng() * 60 },
  });
}

export interface DungeonRun {
  def: DungeonDef;
  waveIndex: number;
  /** Verbleibende Gegner der aktuellen Welle. */
  state: 'fighting' | 'boss' | 'cleared' | 'failed';
  timer: number;
  members: string[];
  elapsed: number;
}

export interface Notice {
  text: string;
  kind: 'info' | 'good' | 'bad' | 'level';
  t: number;
}

export type Scene = 'world' | 'dungeon';

export class Game {
  save: SaveData;
  actors: Actor[] = [];
  player!: Actor;
  time = 0;
  scene: Scene = 'world';
  dungeon: DungeonRun | null = null;
  damageEvents: DamageEvent[] = [];
  chat: ChatMessage[] = [];
  notices: Notice[] = [];
  loot: Item[] = [];
  /** Ausgewählte Fähigkeit wartet auf Ziel? (nicht genutzt — Autoziel) */
  paused = false;
  private botActorLimit = 14;
  private worldSnapshot: Actor[] = [];

  constructor(save: SaveData) {
    this.save = save;
    this.buildWorld();
  }

  // ---------------------------------------------------------------- Aufbau

  private buildWorld(): void {
    this.actors = [];
    this.spawnPlayer(TOWN.x, TOWN.y + 120);
    for (const zone of ZONES) this.populateZone(zone);
    this.refreshWorldBots();
  }

  private spawnPlayer(x: number, y: number): void {
    const v = view(this.save);
    this.player = baseActor({
      id: 'player',
      kind: 'player',
      name: this.save.name,
      level: this.save.level,
      x, y, cs: v.cs, team: 0,
      classId: this.save.classId,
      specId: this.save.specId,
      gearScore: v.gearScore,
      color: CLASSES[this.save.classId].color,
    });
    this.actors.push(this.player);
  }

  private populateZone(zone: Zone): void {
    for (let i = 0; i < zone.density; i++) {
      const id = pick(zone.monsters);
      const x = zone.x + 30 + rng() * (zone.w - 60);
      const y = zone.y + 30 + rng() * (zone.h - 60);
      this.actors.push(spawnMonster(id, x, y));
    }
  }

  /** Hält eine Handvoll Bots in der Nähe des Spielers sichtbar. */
  refreshWorldBots(): void {
    if (this.scene !== 'world') return;
    const existing = this.actors.filter((a) => a.kind === 'bot');
    const online = this.save.bots.filter((b) => b.online);
    const near = online.filter((b) => Math.abs(b.level - this.save.level) < 14);
    const pool = near.length >= 6 ? near : online;
    for (const a of existing) {
      if (Math.hypot(a.x - this.player.x, a.y - this.player.y) > 1400) {
        this.actors.splice(this.actors.indexOf(a), 1);
      }
    }
    let count = this.actors.filter((a) => a.kind === 'bot').length;
    let guard = 0;
    while (count < this.botActorLimit && pool.length && guard++ < 60) {
      const rec = pick(pool);
      if (this.actors.some((a) => a.id === `a_${rec.id}`)) continue;
      const zone = bestZoneFor(rec.level);
      const inZone = chance(0.7);
      const x = inZone ? zone.x + rng() * zone.w : TOWN.x + (rng() - 0.5) * TOWN.r * 1.6;
      const y = inZone ? zone.y + rng() * zone.h : TOWN.y + (rng() - 0.5) * TOWN.r * 1.6;
      this.actors.push(spawnBotActor(rec, x, y));
      count += 1;
    }
  }

  /** Nach Levelaufstieg oder Ausrüstungswechsel neu berechnen. */
  recomputePlayer(): void {
    const v = view(this.save);
    const hpRatio = this.player.maxHp > 0 ? this.player.hp / this.player.maxHp : 1;
    const mpRatio = this.player.maxMp > 0 ? this.player.mp / this.player.maxMp : 1;
    this.player.cs = v.cs;
    this.player.level = this.save.level;
    this.player.specId = this.save.specId;
    this.player.gearScore = v.gearScore;
    this.player.maxHp = v.cs.maxHp;
    this.player.maxMp = v.cs.maxMp;
    this.player.hp = Math.min(v.cs.maxHp, Math.round(v.cs.maxHp * hpRatio));
    this.player.mp = Math.min(v.cs.maxMp, Math.round(v.cs.maxMp * mpRatio));
  }

  // ------------------------------------------------------------- Hilfsmittel

  actorById(id: string | null): Actor | undefined {
    if (!id) return undefined;
    return this.actors.find((a) => a.id === id);
  }

  get bounds(): { w: number; h: number } {
    return this.scene === 'dungeon' ? { w: DUNGEON_W, h: DUNGEON_H } : { w: WORLD_W, h: WORLD_H };
  }

  notify(text: string, kind: Notice['kind'] = 'info'): void {
    this.notices.push({ text, kind, t: this.time });
    if (this.notices.length > 40) this.notices.shift();
  }

  say(msg: ChatMessage): void {
    this.chat.push(msg);
    if (this.chat.length > 120) this.chat.shift();
  }

  private float(
    x: number, y: number, amount: number, kind: DamageEvent['kind'],
    crit = false, major = true,
  ): void {
    // Kämpfe weit entfernter Bots erzeugen keine Zahlen — sonst flimmert der Bildschirm.
    if (!major && Math.hypot(x - this.player.x, y - this.player.y) > 300) return;
    this.damageEvents.push({ x, y, amount, crit, kind, t: this.time, major });
    if (this.damageEvents.length > 80) this.damageEvents.shift();
  }

  /** Ist der Spieler an diesem Schlagabtausch beteiligt? */
  private involvesPlayer(a: Actor, b: Actor): boolean {
    if (a.kind === 'player' || b.kind === 'player') return true;
    const party = this.dungeon?.members;
    return !!party && (party.includes(a.id) || party.includes(b.id));
  }

  /** Fliegt diese Figur gerade — also außer Reichweite des Bodenkampfs? */
  isFlying(a: Actor): boolean {
    return a.alt >= FLIGHT_THRESHOLD;
  }

  get mount(): MountDef | null {
    return this.save.activeMount ? MOUNT_BY_ID[this.save.activeMount] ?? null : null;
  }

  get mounted(): boolean {
    return !!this.player.mountId;
  }

  /** Sitzt auf oder steigt ab. Im Flug wird zuerst gelandet. */
  toggleMount(): string | null {
    const p = this.player;
    if (p.dead) return 'Du bist besiegt.';
    if (p.mountId) {
      if (p.alt > 0) return 'Lande erst, bevor du absteigst.';
      p.mountId = null;
      p.climb = 0;
      this.notify('Abgestiegen.', 'info');
      return null;
    }
    const def = this.mount;
    if (!def) return 'Du besitzt kein Reittier. Schau beim Stallmeister vorbei.';
    if (this.scene === 'dungeon') return 'In Instanzen darfst du nicht reiten.';
    if (p.targetId && !this.actorById(p.targetId)?.dead) p.targetId = null;
    p.mountId = def.id;
    this.notify(`${def.name} gerufen.`, 'good');
    return null;
  }

  /** Steigt, sinkt oder hält die Höhe. */
  setClimb(dir: -1 | 0 | 1): string | null {
    const p = this.player;
    if (!p.mountId) return 'Dafür brauchst du ein Reittier.';
    const def = MOUNT_BY_ID[p.mountId];
    if (!def?.canFly) return `${def?.name ?? 'Dieses Reittier'} kann nicht fliegen.`;
    p.climb = dir;
    return null;
  }

  private updateAltitude(a: Actor, dt: number): void {
    const def = a.mountId ? MOUNT_BY_ID[a.mountId] : null;
    if (!def?.canFly) {
      // Ohne Flugtier sinkt man zügig zu Boden.
      if (a.alt > 0) a.alt = Math.max(0, a.alt - 260 * dt);
      return;
    }
    const dir = a.climb ?? 0;
    if (dir > 0) a.alt = Math.min(def.ceiling, a.alt + def.climb * dt);
    else if (dir < 0) a.alt = Math.max(0, a.alt - def.climb * 1.25 * dt);
    if (a.alt === 0 && dir < 0) a.climb = 0;
  }

  private mods(a: Actor): Record<string, number> {
    const m: Record<string, number> = {};
    for (const e of a.effects) {
      for (const [k, v] of Object.entries(e.effect)) m[k] = (m[k] ?? 0) + v;
    }
    return m;
  }

  private allies(a: Actor): Actor[] {
    return this.actors.filter((o) => !o.dead && o.team === a.team);
  }

  private enemies(a: Actor): Actor[] {
    // Wer fliegt, ist für Bodengegner weder Ziel noch Angreifer.
    const airborne = this.isFlying(a);
    return this.actors.filter(
      (o) => !o.dead && o.team !== a.team && o.kind !== 'npc' && this.isFlying(o) === airborne,
    );
  }

  private nearest(a: Actor, list: Actor[], maxDist: number): Actor | null {
    let best: Actor | null = null;
    let bestD = maxDist;
    for (const o of list) {
      if (o === a) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  // ----------------------------------------------------------------- Kampf

  private addThreat(target: Actor, srcId: string, amount: number): void {
    if (!target.threat) target.threat = {};
    target.threat[srcId] = (target.threat[srcId] ?? 0) + amount;
    target.aggroUntil = this.time + 8;
  }

  dealDamage(src: Actor, tgt: Actor, powerMult: number, opts: { crit?: boolean; skill?: Skill } = {}): number {
    if (tgt.dead) return 0;
    const sm = this.mods(src);
    const tm = this.mods(tgt);
    const major = this.involvesPlayer(src, tgt);
    if (rng() < Math.max(0, tgt.cs.dodge + (tm.dodge ?? 0))) {
      this.float(tgt.x, tgt.y - tgt.radius, 0, 'miss', false, major);
      return 0;
    }
    const critChance = src.cs.crit + (sm.crit ?? 0) + (opts.skill?.effect?.critBonus ?? 0);
    const crit = opts.crit ?? rng() < critChance;
    let raw = src.cs.atk * (1 + (sm.atk ?? 0)) * powerMult;
    if (crit) raw *= 1.75;
    const defense = tgt.cs.def * (1 + (tm.def ?? 0));
    let dmg = mitigate(raw, defense, src.level) * levelPenalty(src.level, tgt.level);
    dmg *= 1 - Math.min(0.8, tm.dr ?? 0);
    dmg *= 1 + (tm.vuln ?? 0);
    dmg = Math.max(1, Math.round(dmg));
    tgt.hp -= dmg;
    this.float(tgt.x, tgt.y - tgt.radius, dmg, 'dmg', crit, major);
    if (tgt.kind === 'monster') this.addThreat(tgt, src.id, dmg);
    if (opts.skill?.effect?.lifesteal) {
      this.heal(src, src, dmg * opts.skill.effect.lifesteal, true);
    }
    if (tgt.hp <= 0) this.kill(tgt, src);
    return dmg;
  }

  heal(src: Actor, tgt: Actor, amount: number, raw = false): number {
    if (tgt.dead) return 0;
    const value = Math.max(1, Math.round(raw ? amount : amount));
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + value);
    const done = tgt.hp - before;
    if (done > 0) this.float(tgt.x, tgt.y - tgt.radius, done, 'heal', false, this.involvesPlayer(src, tgt));
    if (src.kind !== 'monster') {
      for (const e of this.enemies(src)) {
        if (e.threat && Math.hypot(e.x - src.x, e.y - src.y) < 320) this.addThreat(e, src.id, done * 0.4);
      }
    }
    return done;
  }

  private applyEffect(tgt: Actor, skill: Skill, rank: number, sourceAtk: number): void {
    if (!skill.effect || !skill.duration) return;
    const scale = 1 + 0.18 * (rank - 1);
    const effect: Record<string, number> = {};
    for (const [k, v] of Object.entries(skill.effect)) {
      if (k === 'dot' || k === 'taunt') continue;
      effect[k] = v * scale;
    }
    const existing = tgt.effects.find((e) => e.id === skill.id);
    const entry = {
      id: skill.id,
      name: skill.name,
      until: this.time + skill.duration,
      effect,
      dps: skill.effect.dot ? sourceAtk * rankPower(skill, rank) * 0.25 : undefined,
    };
    if (existing) Object.assign(existing, entry);
    else tgt.effects.push(entry);
  }

  private kill(tgt: Actor, killer: Actor): void {
    tgt.dead = true;
    tgt.hp = 0;
    tgt.targetId = null;
    tgt.effects = [];
    if (tgt.kind === 'monster') {
      tgt.respawnAt = this.time + (this.scene === 'dungeon' ? Infinity : RESPAWN_TIME);
      const def = MONSTERS[tgt.monsterId!];
      const rewardTo = killer.kind === 'player' ? this.player
        : this.playerParty().includes(killer) ? this.player : null;
      if (rewardTo) this.rewardKill(def, tgt);
    } else if (tgt.kind === 'bot') {
      tgt.respawnAt = this.time + BOT_RESPAWN;
    } else if (tgt.kind === 'player') {
      tgt.respawnAt = this.time + 5;
      this.notify('Du wurdest besiegt. Rückkehr in die Stadt …', 'bad');
      if (this.dungeon) this.dungeon.state = 'failed';
    }
  }

  private rewardKill(def: MonsterDef, corpse: Actor): void {
    const xp = xpReward(corpse.level, this.save.level);
    const gold = Math.round(def.gold * (0.7 + rng() * 0.6));
    this.save.gold += gold;
    this.save.kills += 1;
    this.float(this.player.x, this.player.y - 34, xp, 'xp');
    const result = addXp(this.save, xp);
    if (result.levels > 0) {
      this.recomputePlayer();
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;
      this.notify(`Level ${this.save.level}! (+${result.levels === 1 ? 1 : result.levels} Fertigkeitspunkte verfügbar)`, 'level');
    }
    if (result.jobReady) {
      this.notify('Du kannst jetzt einen Job wählen! Öffne den Charakter.', 'level');
    }
    if (chance(def.dropChance)) {
      const item = rollLoot(Math.max(1, corpse.level), this.save.classId, def.boss ? 0.12 : 0);
      if (addItem(this.save, item)) this.notify(`Beute: ${item.name} (Lv ${item.ilvl})`, 'good');
      else this.notify('Dein Beutel ist voll — verkaufe im Beutel-Menü.', 'bad');
    }
  }

  // ------------------------------------------------------------ Fertigkeiten

  skillReady(actor: Actor, skillId: string): boolean {
    return (actor.skillCd?.[skillId] ?? 0) <= 0 && actor.gcd <= 0;
  }

  castPlayerSkill(skillId: string): string | null {
    const skill = SKILL_BY_ID[skillId];
    if (!skill) return null;
    const rank = this.save.skillRanks[skillId] ?? 0;
    if (rank < 1) return 'Noch nicht gelernt.';
    if (this.player.dead) return 'Du bist besiegt.';
    if (this.isFlying(this.player)) return 'Im Flug kannst du nicht kämpfen.';
    if (!this.skillReady(this.player, skillId)) return null;
    if (this.player.mp < skill.mp) return 'Nicht genug MP.';
    const target = this.actorById(this.player.targetId);
    if ((skill.kind === 'damage') && (!target || target.dead)) return 'Kein Ziel.';
    if (skill.kind === 'damage' && target && Math.hypot(target.x - this.player.x, target.y - this.player.y) > skill.range + target.radius) {
      return 'Zu weit entfernt.';
    }
    this.cast(this.player, skill, rank, target ?? null);
    return null;
  }

  cast(src: Actor, skill: Skill, rank: number, target: Actor | null): void {
    src.mp -= skill.mp;
    src.gcd = GCD;
    if (!src.skillCd) src.skillCd = {};
    src.skillCd[skill.id] = skill.cooldown;
    const power = rankPower(skill, rank);
    src.castFx = { t: this.time, kind: skill.kind, x: src.x, y: src.y, r: skill.radius ?? 0 };

    switch (skill.kind) {
      case 'damage': {
        if (target) this.dealDamage(src, target, power, { skill });
        break;
      }
      case 'aoe': {
        const cx = target && skill.range > 80 ? target.x : src.x;
        const cy = target && skill.range > 80 ? target.y : src.y;
        src.castFx = { t: this.time, kind: 'aoe', x: cx, y: cy, r: skill.radius ?? 90 };
        for (const e of this.enemies(src)) {
          if (Math.hypot(e.x - cx, e.y - cy) <= (skill.radius ?? 90) + e.radius) {
            this.dealDamage(src, e, power, { skill });
            if (skill.duration) this.applyEffect(e, skill, rank, src.cs.atk);
          }
        }
        break;
      }
      case 'heal': {
        const amount = src.cs.healPower * power;
        if (skill.radius) {
          for (const ally of this.allies(src)) {
            if (Math.hypot(ally.x - src.x, ally.y - src.y) <= skill.radius) this.heal(src, ally, amount);
          }
        } else {
          // Heilt das schwächste Gruppenmitglied in Reichweite, sonst sich selbst.
          const party = [src, ...this.playerPartyOf(src)].filter((a) => !a.dead);
          const hurt = party
            .filter((a) => Math.hypot(a.x - src.x, a.y - src.y) <= skill.range)
            .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          this.heal(src, hurt ?? src, amount);
        }
        break;
      }
      case 'buff': {
        const targets = skill.radius
          ? this.allies(src).filter((a) => Math.hypot(a.x - src.x, a.y - src.y) <= skill.radius!)
          : [src];
        for (const t of targets) this.applyEffect(t, skill, rank, src.cs.atk);
        break;
      }
      case 'debuff': {
        if (skill.effect?.taunt) {
          for (const e of this.enemies(src)) {
            if (Math.hypot(e.x - src.x, e.y - src.y) <= (skill.radius ?? 120)) {
              this.addThreat(e, src.id, 100000);
              e.targetId = src.id;
            }
          }
        } else if (skill.radius) {
          for (const e of this.enemies(src)) {
            if (Math.hypot(e.x - src.x, e.y - src.y) <= skill.radius) {
              this.applyEffect(e, skill, rank, src.cs.atk);
            }
          }
        } else if (target) {
          this.applyEffect(target, skill, rank, src.cs.atk);
          if (skill.effect?.dot) this.dealDamage(src, target, power * 0.3, { skill });
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- Gruppe

  playerParty(): Actor[] {
    if (!this.dungeon) return [];
    return this.dungeon.members
      .map((id) => this.actorById(id))
      .filter((a): a is Actor => !!a && a.kind === 'bot');
  }

  private playerPartyOf(a: Actor): Actor[] {
    if (a.team !== 0) return [];
    if (!this.dungeon) return [];
    return [this.player, ...this.playerParty()].filter((x) => x !== a);
  }

  // ------------------------------------------------------------------ Loop

  update(dt: number): void {
    if (this.paused) return;
    this.time += dt;
    this.save.playtime += dt;

    tickPopulation(this.save.bots, dt * 6, this.chat, this.time);
    if (this.chat.length > 120) this.chat.splice(0, this.chat.length - 120);

    for (const a of this.actors) {
      if (a.kind === 'npc') continue;
      this.updateEffects(a, dt);
      if (a.dead) {
        this.updateDead(a);
        continue;
      }
      a.attackCd = Math.max(0, a.attackCd - dt);
      a.gcd = Math.max(0, a.gcd - dt);
      if (a.skillCd) {
        for (const k of Object.keys(a.skillCd)) a.skillCd[k] = Math.max(0, a.skillCd[k] - dt);
      }
      this.regen(a, dt);
      this.updateAltitude(a, dt);
      if (a.kind === 'monster') this.monsterAI(a, dt);
      else if (a.kind === 'bot') this.botAI(a, dt);
      this.move(a, dt);
      if (a.kind === 'player') this.playerAutoAttack(a);
    }

    this.separate();
    this.damageEvents = this.damageEvents.filter((d) => this.time - d.t < 1.2);
    if (this.dungeon) this.updateDungeon(dt);
  }

  /**
   * Schiebt sich überlappende Figuren sanft auseinander — sonst stapeln sich
   * Gruppe und Gegner auf einem Punkt. Nur im Umkreis des Spielers, das reicht.
   */
  private separate(): void {
    const near = this.actors.filter(
      (a) => !a.dead && a.kind !== 'npc'
        && Math.abs(a.x - this.player.x) < 520 && Math.abs(a.y - this.player.y) < 520,
    );
    const b = this.bounds;
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const a1 = near[i];
        const a2 = near[j];
        const min = (a1.radius + a2.radius) * 0.92;
        let dx = a2.x - a1.x;
        let dy = a2.y - a1.y;
        let d = Math.hypot(dx, dy);
        if (d > min) continue;
        if (d < 0.001) {
          // Exakt deckungsgleich: in eine beliebige Richtung auseinanderziehen.
          dx = rng() - 0.5;
          dy = rng() - 0.5;
          d = Math.max(0.001, Math.hypot(dx, dy));
        }
        const push = (min - d) * 0.5;
        const nx = (dx / d) * push;
        const ny = (dy / d) * push;
        a1.x = Math.max(12, Math.min(b.w - 12, a1.x - nx));
        a1.y = Math.max(12, Math.min(b.h - 12, a1.y - ny));
        a2.x = Math.max(12, Math.min(b.w - 12, a2.x + nx));
        a2.y = Math.max(12, Math.min(b.h - 12, a2.y + ny));
      }
    }
  }

  private updateDead(a: Actor): void {
    if (this.time < a.respawnAt) return;
    if (a.kind === 'monster') {
      a.dead = false;
      a.hp = a.maxHp;
      a.x = a.spawnX!;
      a.y = a.spawnY!;
      a.threat = {};
    } else if (a.kind === 'bot') {
      a.dead = false;
      a.hp = a.maxHp;
      a.mp = a.maxMp;
      if (a.ai) { a.x = a.ai.homeX; a.y = a.ai.homeY; a.ai.state = 'roam'; }
    } else if (a.kind === 'player') {
      a.dead = false;
      a.hp = Math.round(a.maxHp * 0.5);
      a.mp = Math.round(a.maxMp * 0.5);
      if (this.dungeon) this.leaveDungeon(false);
      a.x = TOWN.x;
      a.y = TOWN.y + 100;
      a.alt = 0;
      a.climb = 0;
      a.mountId = null;
      a.targetId = null;
      a.moveTo = null;
    }
  }

  private updateEffects(a: Actor, dt: number): void {
    if (!a.effects.length) return;
    for (const e of a.effects) {
      if (e.dps && !a.dead) {
        a.hp -= e.dps * dt;
        if (a.hp <= 0) this.kill(a, this.player);
      }
      if (e.effect.regen && !a.dead) {
        a.hp = Math.min(a.maxHp, a.hp + a.maxHp * e.effect.regen * dt);
      }
    }
    a.effects = a.effects.filter((e) => e.until > this.time);
  }

  private regen(a: Actor, dt: number): void {
    const resting = !a.targetId && !a.moveTo;
    const hpRate = a.maxHp * (resting ? 0.045 : 0.012);
    const mpRate = a.maxMp * (resting ? 0.06 : 0.022);
    const townBonus = a.kind !== 'monster' && this.scene === 'world' && inTown(a.x, a.y) ? 4 : 1;
    a.hp = Math.min(a.maxHp, a.hp + hpRate * dt * townBonus);
    a.mp = Math.min(a.maxMp, a.mp + mpRate * dt * townBonus);
  }

  private move(a: Actor, dt: number): void {
    const m = this.mods(a);
    let speed = a.cs.moveSpeed * (1 + (m.speed ?? 0)) * (1 - Math.min(0.8, m.slow ?? 0));
    if (a.mountId) {
      const def = MOUNT_BY_ID[a.mountId];
      if (def) speed *= this.isFlying(a) ? def.flySpeed : def.groundSpeed;
    }
    // Der Steuerknüppel schlägt jedes Laufziel.
    if (a.moveDir) {
      const len = Math.hypot(a.moveDir.x, a.moveDir.y);
      if (len > 0.001) {
        a.moveTo = null;
        a.facing = Math.atan2(a.moveDir.y, a.moveDir.x);
        a.vx = (a.moveDir.x / len) * speed * Math.min(1, len);
        a.vy = (a.moveDir.y / len) * speed * Math.min(1, len);
        const bb = this.bounds;
        a.x = Math.max(12, Math.min(bb.w - 12, a.x + a.vx * dt));
        a.y = Math.max(12, Math.min(bb.h - 12, a.y + a.vy * dt));
        a.stride = (a.stride ?? 0) + speed * dt;
        return;
      }
    }

    let tx: number | null = null;
    let ty: number | null = null;
    const target = this.actorById(a.targetId);
    if (target && !target.dead && a.kind !== 'player') {
      const range = a.kind === 'monster' ? MONSTERS[a.monsterId!].range : this.attackRange(a);
      const d = Math.hypot(target.x - a.x, target.y - a.y);
      if (d > range * 0.85) { tx = target.x; ty = target.y; }
    } else if (a.moveTo) {
      tx = a.moveTo.x; ty = a.moveTo.y;
    } else if (a.kind === 'player' && target && !target.dead) {
      const range = this.attackRange(a);
      const d = Math.hypot(target.x - a.x, target.y - a.y);
      if (d > range * 0.9) { tx = target.x; ty = target.y; }
    }
    if (tx === null || ty === null) { a.vx = 0; a.vy = 0; a.stride = 0; return; }
    const dx = tx - a.x;
    const dy = ty - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
      a.moveTo = null;
      a.vx = 0; a.vy = 0;
      a.stride = 0;
      return;
    }
    a.facing = Math.atan2(dy, dx);
    a.vx = (dx / dist) * speed;
    a.vy = (dy / dist) * speed;
    const b = this.bounds;
    a.x = Math.max(12, Math.min(b.w - 12, a.x + a.vx * dt));
    a.y = Math.max(12, Math.min(b.h - 12, a.y + a.vy * dt));
    a.stride = (a.stride ?? 0) + speed * dt;
  }

  attackRange(a: Actor): number {
    if (a.kind === 'monster') return MONSTERS[a.monsterId!].range;
    if (a.classId) return CLASSES[a.classId].range;
    return 34;
  }

  private tryAutoAttack(a: Actor, target: Actor): boolean {
    if (a.attackCd > 0 || target.dead) return false;
    const range = this.attackRange(a) + target.radius;
    if (Math.hypot(target.x - a.x, target.y - a.y) > range) return false;
    const m = this.mods(a);
    a.attackCd = a.cs.attackSpeed / (1 + (m.speed ?? 0) * 0.4);
    a.facing = Math.atan2(target.y - a.y, target.x - a.x);
    this.dealDamage(a, target, 1);
    return true;
  }

  private playerAutoAttack(a: Actor): void {
    if (this.isFlying(a)) return;
    const target = this.actorById(a.targetId);
    if (!target || target.dead || target.team === a.team) {
      if (target?.dead) a.targetId = null;
      return;
    }
    this.tryAutoAttack(a, target);
  }

  // ------------------------------------------------------------- Monster-KI

  private monsterAI(a: Actor, dt: number): void {
    void dt;
    const def = MONSTERS[a.monsterId!];
    let target = this.actorById(a.targetId);

    // Bedrohungsliste bestimmt das Ziel, sonst Nahbereichs-Aggro.
    if (a.threat && Object.keys(a.threat).length && (a.aggroUntil ?? 0) > this.time) {
      let bestId: string | null = null;
      let bestVal = 0;
      for (const [id, val] of Object.entries(a.threat)) {
        const c = this.actorById(id);
        if (!c || c.dead) continue;
        if (val > bestVal) { bestVal = val; bestId = id; }
      }
      if (bestId) { a.targetId = bestId; target = this.actorById(bestId); }
    } else if (!target || target.dead) {
      a.targetId = null;
      a.threat = {};
      if (def.aggressive) {
        const found = this.nearest(a, this.enemies(a), AGGRO_RADIUS);
        if (found) a.targetId = found.id;
      }
    }

    if (!a.targetId) {
      // Zurück zum Spawn schlendern.
      if (!a.moveTo && chance(0.004)) {
        a.moveTo = {
          x: a.spawnX! + (rng() - 0.5) * 120,
          y: a.spawnY! + (rng() - 0.5) * 120,
        };
      }
      return;
    }
    target = this.actorById(a.targetId);
    if (!target || target.dead) { a.targetId = null; return; }

    // Leine: zu weit vom Spawn entfernt → zurück und heilen.
    if (this.scene === 'world' && Math.hypot(a.x - a.spawnX!, a.y - a.spawnY!) > LEASH) {
      a.targetId = null;
      a.threat = {};
      a.moveTo = { x: a.spawnX!, y: a.spawnY! };
      a.hp = a.maxHp;
      return;
    }
    this.tryAutoAttack(a, target);
  }

  // ----------------------------------------------------------------- Bot-KI

  private botAI(a: Actor, dt: number): void {
    const ai = a.ai!;
    ai.nextThink -= dt;
    const inParty = this.dungeon?.members.includes(a.id) ?? false;
    const party = inParty ? [this.player, ...this.playerParty()] : [];

    // Rollenverhalten in der Gruppe
    if (inParty) {
      const hurt = party.filter((p) => !p.dead).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (a.role === 'heal' && hurt && hurt.hp / hurt.maxHp < 0.75) {
        const healSkill = this.botSkills(a).find((s) => s.kind === 'heal');
        if (healSkill && this.skillReady(a, healSkill.id) && a.mp >= healSkill.mp) {
          this.cast(a, healSkill, this.botRank(a, healSkill), hurt);
          return;
        }
      }
    }

    let target = this.actorById(a.targetId);
    if (!target || target.dead || target.team === a.team) {
      a.targetId = null;
      const searchRadius = inParty ? 460 : 300;
      const candidates = this.enemies(a).filter((e) => {
        if (this.scene === 'world' && e.level > a.level + 4) return false;
        return true;
      });
      const found = this.nearest(a, candidates, searchRadius);
      if (found) {
        a.targetId = found.id;
        ai.state = 'fight';
      } else {
        ai.state = 'roam';
      }
    }
    target = this.actorById(a.targetId);

    if (!target) {
      if (!a.moveTo && ai.nextThink <= 0) {
        ai.nextThink = 2 + rng() * 4;
        if (inParty) {
          a.moveTo = { x: this.player.x + (rng() - 0.5) * 90, y: this.player.y + (rng() - 0.5) * 90 };
        } else {
          const zone = bestZoneFor(a.level);
          a.moveTo = { x: zone.x + rng() * zone.w, y: zone.y + rng() * zone.h };
        }
      }
      return;
    }

    // Wächter halten Aggro
    if (a.role === 'tank') {
      const taunt = this.botSkills(a).find((s) => s.effect?.taunt);
      if (taunt && this.skillReady(a, taunt.id) && a.mp >= taunt.mp
        && Math.hypot(target.x - a.x, target.y - a.y) < (taunt.radius ?? 120)) {
        this.cast(a, taunt, this.botRank(a, taunt), target);
        return;
      }
    }

    // Schadensrotation: teuerste bereite Fertigkeit zuerst.
    const usable = this.botSkills(a)
      .filter((s) => (s.kind === 'damage' || s.kind === 'aoe' || s.kind === 'buff' || s.kind === 'debuff')
        && this.skillReady(a, s.id) && a.mp >= s.mp)
      .sort((x, y) => y.power - x.power);
    const dist = Math.hypot(target.x - a.x, target.y - a.y);
    for (const s of usable) {
      if (s.kind === 'buff' && a.effects.some((e) => e.id === s.id)) continue;
      if ((s.kind === 'damage' || s.kind === 'debuff') && dist > s.range) continue;
      if (s.kind === 'aoe' && dist > s.range + (s.radius ?? 0)) continue;
      if (s.kind === 'buff' || rng() < 0.85) {
        this.cast(a, s, this.botRank(a, s), target);
        return;
      }
    }
    this.tryAutoAttack(a, target);
  }

  private botSkills(a: Actor): Skill[] {
    return Object.values(SKILL_BY_ID).filter(
      (s) => (s.owner === a.classId || s.owner === a.specId) && s.reqLevel <= a.level,
    );
  }

  private botRank(a: Actor, s: Skill): number {
    return Math.max(1, Math.min(s.maxRank, Math.floor((a.level - s.reqLevel) / 8) + 1));
  }

  // --------------------------------------------------------------- Dungeon

  enterDungeon(def: DungeonDef): { ok: boolean; reason?: string } {
    if (this.dungeon) return { ok: false, reason: 'Du bist bereits in einer Instanz.' };
    const v = view(this.save);
    if (this.save.level < def.minLevel) return { ok: false, reason: `Level ${def.minLevel} nötig.` };
    if (v.gearScore < def.minGearScore) return { ok: false, reason: `Gear-Score ${def.minGearScore} nötig.` };

    this.worldSnapshot = this.actors;
    this.scene = 'dungeon';
    this.actors = [this.player];
    this.player.x = DUNGEON_W / 2;
    this.player.y = DUNGEON_ENTRANCE_Y;
    this.player.alt = 0;
    this.player.climb = 0;
    this.player.mountId = null;
    this.player.targetId = null;
    this.player.moveTo = null;

    const members: string[] = [];
    if (def.partySize > 1) {
      const mates = findPartyCandidates(
        this.save.bots, def.minLevel, def.minGearScore, def.partySize - 1,
      );
      if (mates.length < def.partySize - 1) {
        this.scene = 'world';
        this.actors = this.worldSnapshot;
        return { ok: false, reason: 'Nicht genug passende Mitspieler online. Versuch es gleich noch einmal.' };
      }
      mates.forEach((rec, i) => {
        const actor = spawnBotActor(rec, DUNGEON_W / 2 + (i - 1) * 42, DUNGEON_ENTRANCE_Y + 40);
        actor.ai!.state = 'dungeon';
        this.actors.push(actor);
        members.push(actor.id);
      });
      this.say({
        channel: 'gruppe', from: '', t: this.time,
        text: `Gruppe gebildet: ${mates.map((m) => `${m.name} (${m.role === 'tank' ? 'Tank' : m.role === 'heal' ? 'Heiler' : 'DPS'})`).join(', ')}`,
      });
      const greeter = mates[Math.floor(rng() * mates.length)];
      this.say({ channel: 'gruppe', from: greeter.name, text: pick(['hi', 'moin', 'gogo', 'bin bereit', 'hf!']), t: this.time });
    }

    this.dungeon = { def, waveIndex: -1, state: 'fighting', timer: 2, members, elapsed: 0 };
    this.notify(`${def.name} betreten.`, 'info');
    return { ok: true };
  }

  private spawnWave(): void {
    const run = this.dungeon!;
    run.waveIndex += 1;
    if (run.waveIndex >= run.def.waves.length) {
      // Boss
      const boss = spawnMonster(run.def.bossId, DUNGEON_W / 2, DUNGEON_BOSS_Y);
      this.actors.push(boss);
      run.state = 'boss';
      this.notify(`${boss.name} erwacht!`, 'bad');
      if (run.members.length) {
        this.say({ channel: 'gruppe', from: this.actorById(run.members[0])!.name, text: pick(['Boss! Sammeln!', 'Achtung, Boss', 'Ich tanke', 'burst wenn er unten ist']), t: this.time });
      }
      return;
    }
    const wave = run.def.waves[run.waveIndex];
    // Jede Welle liegt ein Stück weiter im Korridor — man arbeitet sich nach vorn.
    const lineY = DUNGEON_ENTRANCE_Y - 280 - run.waveIndex * DUNGEON_WAVE_GAP;
    for (let i = 0; i < wave.count; i++) {
      const x = 80 + (i % 4) * ((DUNGEON_W - 160) / 3);
      const y = lineY + Math.floor(i / 4) * 82;
      this.actors.push(spawnMonster(wave.monsterId, x, y, wave.levelBonus ?? 0));
    }
    this.notify(`Welle ${run.waveIndex + 1}/${run.def.waves.length}`, 'info');
  }

  private updateDungeon(dt: number): void {
    const run = this.dungeon!;
    run.elapsed += dt;
    if (run.state === 'cleared' || run.state === 'failed') return;
    const alive = this.actors.some((a) => a.kind === 'monster' && !a.dead);
    if (alive) return;
    run.timer -= dt;
    if (run.timer > 0) return;
    run.timer = 3;
    if (run.state === 'boss') {
      run.state = 'cleared';
      this.finishDungeon();
      return;
    }
    this.actors = this.actors.filter((a) => a.kind !== 'monster');
    this.spawnWave();
  }

  private finishDungeon(): void {
    const run = this.dungeon!;
    const def = run.def;
    this.save.gold += def.goldReward;
    this.save.clears[def.id] = (this.save.clears[def.id] ?? 0) + 1;
    const drops: Item[] = [];
    for (let i = 0; i < def.rewardItems; i++) {
      const item = rollLoot(def.rewardIlvl, this.save.classId, def.endgame ? 0.2 : 0.08);
      if (addItem(this.save, item)) drops.push(item);
    }
    if (drops.length < def.rewardItems) this.notify('Ein Teil der Beute passte nicht mehr in den Beutel.', 'bad');
    const xp = xpReward(def.minLevel + 6, this.save.level) * 14;
    const res = addXp(this.save, xp);
    if (res.levels) {
      this.recomputePlayer();
      this.notify(`Level ${this.save.level}!`, 'level');
    }
    this.notify(`${def.name} abgeschlossen! +${def.goldReward} Gold, ${drops.length} Beutestücke.`, 'good');
    for (const d of drops) this.notify(`Beute: ${d.name} (Lv ${d.ilvl})`, 'good');
    if (run.members.length) {
      const speaker = this.actorById(run.members[Math.floor(rng() * run.members.length)]);
      if (speaker) this.say({ channel: 'gruppe', from: speaker.name, text: pick(['gg', 'gg wp', 'danke euch!', 'sauber gelaufen', 'nochmal?']), t: this.time });
    }
  }

  leaveDungeon(finished = true): void {
    if (!this.dungeon) return;
    this.dungeon = null;
    this.scene = 'world';
    this.actors = this.worldSnapshot.length ? this.worldSnapshot : this.actors.filter((a) => a.kind !== 'monster');
    if (!this.actors.includes(this.player)) this.actors.unshift(this.player);
    this.player.x = TOWN.x;
    this.player.y = TOWN.y + 130;
    this.player.targetId = null;
    this.player.moveTo = null;
    this.refreshWorldBots();
    if (!finished) this.notify('Instanz verlassen.', 'info');
  }

  // ------------------------------------------------------------- Eingaben

  tapWorld(x: number, y: number): void {
    if (this.player.dead) return;
    const airborne = this.isFlying(this.player);
    const hit = this.actors.find(
      (a) => a !== this.player && !a.dead && a.kind !== 'npc'
        && this.isFlying(a) === airborne
        && Math.hypot(a.x - x, a.y - y) < a.radius + 18,
    );
    if (hit && hit.team === 1) {
      this.player.targetId = hit.id;
      this.player.moveTo = null;
      return;
    }
    if (hit && hit.team === 0) {
      this.player.targetId = hit.id;
      return;
    }
    this.player.targetId = null;
    this.player.moveDir = null;
    this.player.moveTo = { x, y };
  }

  /** Laufrichtung setzen; (0,0) hält an. */
  steer(x: number, y: number): void {
    if (this.player.dead) return;
    this.player.moveDir = Math.hypot(x, y) > 0.08 ? { x, y } : null;
  }

  clearTarget(): void {
    this.player.targetId = null;
  }
}

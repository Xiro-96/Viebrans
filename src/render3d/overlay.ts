/**
 * Namen, Lebensbalken und Schadenszahlen liegen als 2D-Ebene über der
 * 3D-Ansicht. Das hält die Schrift gestochen scharf und kostet fast nichts.
 */
import * as THREE from 'three';
import { MONSTERS } from '../game/monsters';
import type { Game } from '../game/engine';
import type { Actor } from '../game/types';
import type { Renderer3D } from './scene';

const NAME_DIST = 700;
/** Mehr Schilder als das lesen sich nicht mehr — der Rest bleibt stumm. */
const MAX_PLATES = 16;

export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private v = new THREE.Vector3();
  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D-Kontext nicht verfügbar');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  draw(game: Game, r3d: Renderer3D): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.textAlign = 'center';

    const p = game.player;
    const airborne = game.isFlying(p);
    const targetId = p.targetId;
    const entries: { a: Actor; sx: number; sy: number; depth: number; dist: number }[] = [];
    for (const a of game.actors) {
      if (a.dead || a.kind === 'npc') continue;
      // Was auf einer anderen Ebene ist, lässt sich ohnehin nicht anfassen.
      const important = a.kind === 'player' || a.id === targetId
        || (game.dungeon?.members.includes(a.id) ?? false);
      if (!important && game.isFlying(a) !== airborne) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d > NAME_DIST && !important) continue;
      const top = a.alt + this.headHeight(a);
      if (!r3d.project(a.x, top, a.y, this.v)) continue;
      if (this.v.x < -80 || this.v.x > this.width + 80) continue;
      entries.push({ a, sx: this.v.x, sy: this.v.y, depth: this.v.z, dist: d });
    }
    // Die nächsten zuerst behalten, dann von hinten nach vorn zeichnen.
    entries.sort((x, y) => x.dist - y.dist);
    const shown = entries.slice(0, MAX_PLATES).sort((x, y) => y.depth - x.depth);

    for (const e of shown) {
      const fade = Math.min(1, Math.max(0.25, 1 - (e.dist - 260) / 460));
      ctx.globalAlpha = e.a.id === targetId || e.a.kind === 'player' ? 1 : fade;
      this.drawPlate(game, e.a, e.sx, e.sy);
    }
    ctx.globalAlpha = 1;
    this.drawFloaters(game, r3d);
  }

  private headHeight(a: Actor): number {
    if (a.kind === 'monster') {
      const def = MONSTERS[a.monsterId!];
      return def.boss ? 64 : Math.max(24, a.radius * 2.1);
    }
    return a.mountId ? 50 : 38;
  }

  private drawPlate(game: Game, a: Actor, x: number, y: number): void {
    const ctx = this.ctx;
    const isPlayer = a.kind === 'player';
    const inParty = game.dungeon?.members.includes(a.id) ?? false;
    const ratio = Math.max(0, a.hp / a.maxHp);

    // Lebensbalken
    const w = a.kind === 'monster' && MONSTERS[a.monsterId!].boss ? 74 : 46;
    const h = 5;
    ctx.fillStyle = 'rgba(12,10,20,.62)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = a.team === 0 ? '#59d36a' : '#e8553f';
    ctx.fillRect(x - w / 2, y, w * ratio, h);

    const label = a.kind === 'monster' ? `${a.name} · ${a.level}` : `${a.name} · ${a.level}`;
    ctx.font = `${isPlayer ? 700 : 600} ${isPlayer ? 13 : 11.5}px "Baloo 2", system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,8,18,.85)';
    ctx.strokeText(inParty ? `⚑ ${label}` : label, x, y - 6);
    ctx.fillStyle = isPlayer ? '#ffe9a8'
      : a.team === 0 ? '#dff0ff'
      : MONSTERS[a.monsterId!]?.boss ? '#ffc46a' : '#ffd0c4';
    ctx.fillText(inParty ? `⚑ ${label}` : label, x, y - 6);

    if (a.effects.length) {
      ctx.fillStyle = '#a5b4fc';
      for (let i = 0; i < Math.min(5, a.effects.length); i++) {
        ctx.beginPath();
        ctx.arc(x - 12 + i * 6, y - 21, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawFloaters(game: Game, r3d: Renderer3D): void {
    const ctx = this.ctx;
    for (const d of game.damageEvents) {
      const age = game.time - d.t;
      const k = 1 - age / 1.2;
      if (k <= 0) continue;
      if (!r3d.project(d.x, 30 + age * 34, d.y, this.v)) continue;
      // Aus dem Zeitstempel eine feste Streuung ableiten, sonst stapeln sich Treffer.
      const jitter = ((d.t * 9973) % 1 - 0.5) * 46;
      // Am Bildrand einfangen, sonst werden Zahlen abgeschnitten.
      const x = Math.max(36, Math.min(this.width - 36, this.v.x + jitter));
      const y = this.v.y;
      const scale = d.major ? 1 : 0.78;
      ctx.globalAlpha = Math.min(1, k * 1.6) * (d.major ? 1 : 0.5);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,18,.8)';

      let text = `${d.amount}`;
      if (d.kind === 'miss') { text = 'daneben'; ctx.fillStyle = '#d8d2e0'; }
      else if (d.kind === 'heal') { text = `+${d.amount}`; ctx.fillStyle = '#66e07a'; }
      else if (d.kind === 'xp') { text = `+${d.amount} EP`; ctx.fillStyle = '#9fd8ff'; }
      else { text = d.crit ? `${d.amount}!` : `${d.amount}`; ctx.fillStyle = d.crit ? '#ffcf5a' : '#ffb0a0'; }

      const size = (d.kind === 'dmg' && d.crit ? 21 : d.kind === 'xp' || d.kind === 'miss' ? 12 : 15) * scale;
      ctx.font = `${d.crit ? 800 : 700} ${size}px "Baloo 2", system-ui, sans-serif`;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
    }
  }
}

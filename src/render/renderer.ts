import { MONSTERS } from '../game/monsters';
import { TOWN, ZONES } from '../game/world';
import { DUNGEON_H, DUNGEON_W } from '../game/dungeons';
import type { Game } from '../game/engine';
import type { Actor } from '../game/types';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /** Zoom in der offenen Welt; in Instanzen wird er passend erhöht. */
  private baseZoom = 1;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D nicht verfügbar');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    // Auf schmalen Handys weiter herauszoomen, damit man die Umgebung sieht.
    this.baseZoom = Math.max(0.62, Math.min(1.2, rect.width / 640));
    this.cam.zoom = this.baseZoom;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.width / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.height / 2) / this.cam.zoom + this.cam.y,
    };
  }

  draw(game: Game): void {
    const ctx = this.ctx;
    const p = game.player;
    // In der Instanz so weit heranfahren, dass der Korridor die Fläche ausfüllt.
    this.cam.zoom = game.scene === 'dungeon'
      ? Math.min(1.35, Math.max(this.baseZoom, this.width / DUNGEON_W, this.height / DUNGEON_H))
      : this.baseZoom;
    this.cam.x += (p.x - this.cam.x) * 0.16;
    this.cam.y += (p.y - this.cam.y) * 0.16;
    this.clampCamera(game);

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = game.scene === 'dungeon' ? '#0a0a12' : '#0e1a14';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    if (game.scene === 'dungeon') this.drawDungeonFloor(game);
    else this.drawWorldFloor();

    // Sortiert nach y für eine glaubhafte Tiefenwirkung.
    const visible = game.actors
      .filter((a) => this.onScreen(a))
      .sort((a, b) => a.y - b.y);

    for (const a of visible) this.drawShadow(a);
    this.drawCastEffects(game);
    for (const a of visible) this.drawActor(game, a);
    this.drawTargetRing(game);
    this.drawFloaters(game);
    ctx.restore();
  }

  /** Hält die Kamera innerhalb der Karte, damit kein Rand ins Bild läuft. */
  private clampCamera(game: Game): void {
    const b = game.bounds;
    const halfW = this.width / 2 / this.cam.zoom;
    const halfH = this.height / 2 / this.cam.zoom;
    // In der Instanz darf die Kamera über den Rand hinaus, damit der Held
    // auch am Korridorende mittig bleibt statt hinter der Anzeige zu kleben.
    const pad = game.scene === 'dungeon' ? 300 : 0;
    this.cam.x = b.w - pad * 2 <= halfW * 2
      ? b.w / 2
      : Math.max(halfW - pad, Math.min(b.w - halfW + pad, this.cam.x));
    this.cam.y = b.h - pad * 2 <= halfH * 2
      ? b.h / 2
      : Math.max(halfH - pad, Math.min(b.h - halfH + pad, this.cam.y));
  }

  private onScreen(a: Actor): boolean {
    const margin = 80;
    const hw = this.width / 2 / this.cam.zoom + margin;
    const hh = this.height / 2 / this.cam.zoom + margin;
    return Math.abs(a.x - this.cam.x) < hw && Math.abs(a.y - this.cam.y) < hh;
  }

  private drawWorldFloor(): void {
    const ctx = this.ctx;
    // Grundgras mit Rasterstruktur
    const x0 = this.cam.x - this.width / this.cam.zoom;
    const y0 = this.cam.y - this.height / this.cam.zoom;
    const x1 = this.cam.x + this.width / this.cam.zoom;
    const y1 = this.cam.y + this.height / this.cam.zoom;
    ctx.fillStyle = '#16281d';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    for (const z of ZONES) {
      ctx.fillStyle = z.tint;
      ctx.globalAlpha = 0.85;
      this.roundRect(z.x, z.y, z.w, z.h, 26);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 2;
      this.roundRect(z.x, z.y, z.w, z.h, 26);
      ctx.stroke();
      ctx.fillStyle = 'rgba(226,232,240,0.35)';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${z.name}  ·  ${z.levelHint}`, z.x + 14, z.y + 26);
    }

    // Stadt
    const g = ctx.createRadialGradient(TOWN.x, TOWN.y, 20, TOWN.x, TOWN.y, TOWN.r);
    g.addColorStop(0, '#2b3a55');
    g.addColorStop(1, '#1b2233');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(TOWN.x, TOWN.y, TOWN.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,197,255,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Ein paar Häuser als Silhouetten
    ctx.fillStyle = '#38445e';
    const houses: [number, number, number, number][] = [
      [-160, -110, 90, 66], [40, -140, 110, 74], [110, 30, 84, 60], [-140, 60, 96, 64],
    ];
    for (const [dx, dy, w, h] of houses) {
      ctx.fillRect(TOWN.x + dx, TOWN.y + dy, w, h);
      ctx.fillStyle = '#4b5a7a';
      ctx.beginPath();
      ctx.moveTo(TOWN.x + dx - 6, TOWN.y + dy);
      ctx.lineTo(TOWN.x + dx + w / 2, TOWN.y + dy - 24);
      ctx.lineTo(TOWN.x + dx + w + 6, TOWN.y + dy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#38445e';
    }
    ctx.fillStyle = 'rgba(226,232,240,0.5)';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(TOWN.name, TOWN.x, TOWN.y - TOWN.r + 34);
  }

  private drawDungeonFloor(game: Game): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#14141f';
    this.roundRect(0, 0, DUNGEON_W, DUNGEON_H, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(196,181,253,0.35)';
    ctx.lineWidth = 4;
    this.roundRect(0, 0, DUNGEON_W, DUNGEON_H, 18);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let x = 60; x < DUNGEON_W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, DUNGEON_H); ctx.stroke();
    }
    for (let y = 60; y < DUNGEON_H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(DUNGEON_W, y); ctx.stroke();
    }
    const run = game.dungeon;
    if (run) {
      ctx.fillStyle = 'rgba(226,232,240,0.45)';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = run.state === 'boss' ? 'BOSS' :
        run.state === 'cleared' ? 'Geschafft!' :
        run.state === 'failed' ? 'Gescheitert' :
        `Welle ${Math.max(1, run.waveIndex + 1)} / ${run.def.waves.length}`;
      ctx.fillText(`${run.def.name} — ${label}`, DUNGEON_W / 2, 40);
    }
  }

  private drawShadow(a: Actor): void {
    if (a.dead) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + a.radius * 0.7, a.radius * 0.95, a.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCastEffects(game: Game): void {
    const ctx = this.ctx;
    for (const a of game.actors) {
      const fx = a.castFx;
      if (!fx) continue;
      const age = game.time - fx.t;
      if (age > 0.45) { a.castFx = undefined; continue; }
      const k = 1 - age / 0.45;
      if (fx.kind === 'aoe' && fx.r > 0) {
        ctx.strokeStyle = `rgba(147,197,253,${0.7 * k})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (0.5 + 0.5 * (1 - k)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(147,197,253,${0.12 * k})`;
        ctx.fill();
      } else {
        ctx.strokeStyle = `rgba(253,224,71,${0.8 * k})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 26 + (1 - k) * 22, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawActor(game: Game, a: Actor): void {
    const ctx = this.ctx;
    if (a.dead) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 4, a.radius, a.radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    const isPlayer = a.kind === 'player';
    const color = a.color ?? (a.kind === 'monster' ? MONSTERS[a.monsterId!].color : '#94a3b8');
    const r = a.radius;

    // Körper
    ctx.fillStyle = color;
    if (a.kind === 'monster') {
      const boss = MONSTERS[a.monsterId!].boss;
      ctx.beginPath();
      if (boss) {
        // Bosse als Sterne, damit sie sofort auffallen.
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const rad = i % 2 === 0 ? r : r * 0.55;
          const px = a.x + Math.cos(ang) * rad;
          const py = a.y + Math.sin(ang) * rad;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Spieler/Bots: Kapsel mit Kopf
      ctx.beginPath();
      ctx.roundRect(a.x - r * 0.7, a.y - r * 0.4, r * 1.4, r * 1.5, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(a.x, a.y - r * 0.75, r * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = '#f8d9b0';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Blickrichtung
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + Math.cos(a.facing) * (r + 8), a.y + Math.sin(a.facing) * (r + 8));
      ctx.stroke();
    }

    if (isPlayer) {
      ctx.strokeStyle = 'rgba(253,224,71,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Lebensbalken
    const barW = Math.max(30, r * 2.6);
    const ratio = Math.max(0, a.hp / a.maxHp);
    const by = a.y - r - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(a.x - barW / 2, by, barW, 5);
    ctx.fillStyle = a.team === 0 ? '#4ade80' : '#f87171';
    ctx.fillRect(a.x - barW / 2, by, barW * ratio, 5);

    // Name
    ctx.font = `600 ${isPlayer ? 13 : 11}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = a.team === 0 ? 'rgba(226,232,240,0.92)' : 'rgba(248,180,180,0.85)';
    const inParty = game.dungeon?.members.includes(a.id);
    const label = a.kind === 'monster' ? `${a.name} Lv${a.level}` : `${a.name} ${a.level}`;
    ctx.fillText(inParty ? `⚑ ${label}` : label, a.x, by - 5);

    // Statuseffekte als kleine Punkte
    if (a.effects.length) {
      ctx.fillStyle = '#a5b4fc';
      for (let i = 0; i < Math.min(5, a.effects.length); i++) {
        ctx.beginPath();
        ctx.arc(a.x - 12 + i * 6, by - 16, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawTargetRing(game: Game): void {
    const t = game.actors.find((a) => a.id === game.player.targetId);
    if (!t || t.dead) return;
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(game.time * 6) * 0.06;
    ctx.strokeStyle = t.team === 1 ? 'rgba(248,113,113,0.95)' : 'rgba(96,165,250,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, (t.radius + 10) * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawFloaters(game: Game): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const d of game.damageEvents) {
      const age = game.time - d.t;
      const k = 1 - age / 1.2;
      if (k <= 0) continue;
      const y = d.y - age * 42;
      ctx.globalAlpha = Math.min(1, k * 1.6) * (d.major ? 1 : 0.45);
      const scale = d.major ? 1 : 0.8;
      if (d.kind === 'miss') {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = `600 ${13 * scale}px system-ui, sans-serif`;
        ctx.fillText('daneben', d.x, y);
      } else if (d.kind === 'heal') {
        ctx.fillStyle = '#4ade80';
        ctx.font = `700 ${14 * scale}px system-ui, sans-serif`;
        ctx.fillText(`+${d.amount}`, d.x, y);
      } else if (d.kind === 'xp') {
        ctx.fillStyle = '#93c5fd';
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillText(`+${d.amount} EP`, d.x, y);
      } else {
        ctx.fillStyle = d.crit ? '#fbbf24' : '#fca5a5';
        ctx.font = `${d.crit ? 800 : 700} ${(d.crit ? 19 : 14) * scale}px system-ui, sans-serif`;
        ctx.fillText(d.crit ? `${d.amount}!` : `${d.amount}`, d.x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
  }
}

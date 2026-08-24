/**
 * Die 3D-Darstellung. Verwaltet Szene, Kamera und einen Bestand an
 * Figurenmodellen, der nur für Wesen in Sichtweite gefüllt wird.
 */
import * as THREE from 'three';
import { MONSTERS } from '../game/monsters';
import { MOUNT_BY_ID } from '../game/mounts';
import { WORLD_H, WORLD_W } from '../game/world';
import { DUNGEON_H, DUNGEON_W } from '../game/dungeons';
import type { Game } from '../game/engine';
import type { Actor } from '../game/types';
import { CLASS_COLORS, PALETTE } from './palette';
import { terrainHeight } from './terrain';
import {
  buildBlobShadow, buildCharacter, buildMonster, buildMountById, buildWeapon, mat, type Rig,
} from './models';
import { buildDungeonScenery, buildWorldScenery } from './world3d';

/** Ab dieser Entfernung werden keine Figuren mehr aufgebaut. */
const VIEW_DIST = 900;
const MAX_VIEWS = 34;

interface ActorView {
  group: THREE.Group;
  rig: Rig | null;
  shadow: THREE.Mesh;
  /** Woraus das Modell gebaut wurde — ändert sich das, wird neu gebaut. */
  signature: string;
  lastSeen: number;
}

export interface Pick {
  actorId?: string;
  ground?: { x: number; y: number };
}

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private worldScenery: THREE.Group;
  private dungeonScenery: THREE.Group | null = null;
  private actorRoot = new THREE.Group();
  private fxRoot = new THREE.Group();
  private clouds: THREE.Group;
  private views = new Map<string, ActorView>();
  private targetRing: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;

  /** Kamerastand — vom Spieler per Ziehen und Zwei-Finger-Geste verändert. */
  yaw = Math.PI;
  pitch = 0.58;
  /** Vom Spieler gewählter Abstand; im Flug wird zusätzlich zurückgefahren. */
  distance = 350;
  private appliedDistance = 350;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private lastScene: 'world' | 'dungeon' = 'world';

  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(PALETTE.fog);
    this.camera = new THREE.PerspectiveCamera(58, 1, 3, 5200);

    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(PALETTE.fog, 700, 2600);

    this.hemi = new THREE.HemisphereLight(PALETTE.ambientSky, PALETTE.ambientGround, 1.15);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 1.05);
    this.sun.position.set(0.5, 1, 0.35).multiplyScalar(600);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.worldScenery = buildWorldScenery();
    this.clouds = buildClouds();
    this.scene.add(this.worldScenery, this.clouds, this.actorRoot, this.fxRoot);

    this.targetRing = new THREE.Mesh(
      new THREE.TorusGeometry(15, 1.8, 6, 26),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.visible = false;
    this.scene.add(this.targetRing);

    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ Kamera

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(0.12, Math.min(1.25, this.pitch + dy * 0.005));
  }

  zoom(factor: number): void {
    this.distance = Math.max(150, Math.min(760, this.distance * factor));
  }

  /** Blickrichtung der Kamera auf der Bodenebene — Grundlage der Steuerung. */
  get forward(): { x: number; y: number } {
    return { x: -Math.sin(this.yaw), y: -Math.cos(this.yaw) };
  }

  /**
   * Rechnet einen Knüppelausschlag in eine Weltrichtung um.
   *
   * `sx` ist der Ausschlag nach rechts, `sy` der nach unten (Bildschirmachsen).
   * "Rechts auf dem Bildschirm" ist das Kreuzprodukt aus Blickrichtung und
   * Oben: bei Blick (fx, 0, fz) ergibt das (-fz, 0, fx). Ein Vorzeichenfehler
   * an dieser Stelle spiegelt die gesamte Steuerung, deshalb prüft
   * steering-test.mjs das Ergebnis gegen die tatsächliche Bildschirmbewegung.
   */
  screenToWorldDir(sx: number, sy: number): { x: number; y: number } {
    const f = this.forward;
    const rightX = -f.y;
    const rightY = f.x;
    return {
      x: f.x * -sy + rightX * sx,
      y: f.y * -sy + rightY * sx,
    };
  }

  // ---------------------------------------------------------------- Auswahl

  /**
   * Trifft ein Fingertipp eine Figur? Geprüft wird im Bildschirmraum, das ist
   * robuster als Strahlen gegen unregelmäßige Körper.
   */
  pick(game: Game, sx: number, sy: number): Pick {
    // Fingerkuppen sind ungenau: großzügig zielen und Gegner bevorzugen.
    const REACH = 78;
    let best: string | undefined;
    let bestScore = Infinity;
    const v = new THREE.Vector3();
    for (const a of game.actors) {
      if (a === game.player || a.dead || a.kind === 'npc') continue;
      if (game.isFlying(a) !== game.isFlying(game.player)) continue;
      if (!this.views.has(a.id)) continue;
      v.set(a.x, this.groundY(a.x, a.y) + a.alt + a.radius, a.y).project(this.camera);
      if (v.z > 1) continue;
      const px = (v.x * 0.5 + 0.5) * this.width;
      const py = (-v.y * 0.5 + 0.5) * this.height;
      const d = Math.hypot(px - sx, py - sy);
      if (d > REACH) continue;
      // Verbündete zählen nur, wenn kein Gegner in Reichweite ist.
      const score = d + (a.team === 0 ? 400 : 0);
      if (score < bestScore) { bestScore = score; best = a.id; }
    }
    if (best) return { actorId: best };

    // Sonst auf den Boden zielen.
    const ndc = new THREE.Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return {};
    return { ground: { x: hit.x, y: hit.z } };
  }

  /** Bildschirmposition eines Punktes — für Namen und Schadenszahlen. */
  project(x: number, alt: number, z: number, out: THREE.Vector3): boolean {
    out.set(x, this.groundY(x, z) + alt, z).project(this.camera);
    if (out.z > 1) return false;
    out.x = (out.x * 0.5 + 0.5) * this.width;
    out.y = (-out.y * 0.5 + 0.5) * this.height;
    return true;
  }

  /** Bildschirmposition einer Bodenstelle — vom Steuerungstest genutzt. */
  screenOf(x: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3();
    this.project(x, 0, z, v);
    return { x: v.x, y: v.y };
  }

  groundY(x: number, z: number): number {
    return this.lastScene === 'dungeon' ? 0 : terrainHeight(x, z);
  }

  // ------------------------------------------------------------------ Bild

  draw(game: Game, dt: number): void {
    this.syncScene(game);
    this.syncActors(game);
    this.animate(game, dt);
    this.updateCamera(game, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private syncScene(game: Game): void {
    if (game.scene === this.lastScene) return;
    this.lastScene = game.scene;
    const dungeon = game.scene === 'dungeon';
    if (dungeon && !this.dungeonScenery) {
      this.dungeonScenery = buildDungeonScenery();
      this.scene.add(this.dungeonScenery);
    }
    this.worldScenery.visible = !dungeon;
    this.clouds.visible = !dungeon;
    if (this.dungeonScenery) this.dungeonScenery.visible = dungeon;
    this.scene.background = dungeon ? new THREE.Color(0x2a2338) : makeSkyTexture();
    (this.scene.fog as THREE.Fog).color.set(dungeon ? 0x2a2338 : PALETTE.fog);
    (this.scene.fog as THREE.Fog).near = dungeon ? 500 : 700;
    (this.scene.fog as THREE.Fog).far = dungeon ? 2000 : 2600;
    // In der Instanz übernimmt warmes Fackellicht die Führung.
    this.sun.intensity = dungeon ? 0.55 : 1.05;
    this.sun.color.set(dungeon ? 0xffd9a8 : PALETTE.sun);
    this.hemi.intensity = dungeon ? 0.95 : 1.15;
    this.hemi.color.set(dungeon ? 0xb9a8d8 : PALETTE.ambientSky);
    this.hemi.groundColor.set(dungeon ? 0x4a4058 : PALETTE.ambientGround);
    // Modelle neu aufbauen, die Welt hat gewechselt.
    for (const [id, view] of this.views) {
      this.actorRoot.remove(view.group);
      this.views.delete(id);
    }
  }

  private signatureOf(a: Actor): string {
    if (a.kind === 'monster') return `m:${a.monsterId}`;
    return `c:${a.classId ?? 'warrior'}:${a.mountId ?? '-'}`;
  }

  private syncActors(game: Game): void {
    const p = game.player;
    const now = performance.now();

    // Nach Nähe sortieren und die nächsten aufbauen.
    const near = game.actors
      .filter((a) => a.kind !== 'npc')
      .map((a) => ({ a, d: Math.hypot(a.x - p.x, a.y - p.y) }))
      .filter((e) => e.d < VIEW_DIST)
      .sort((x, y) => x.d - y.d)
      .slice(0, MAX_VIEWS);

    for (const { a } of near) {
      let view = this.views.get(a.id);
      const sig = this.signatureOf(a);
      if (view && view.signature !== sig) {
        this.actorRoot.remove(view.group);
        this.views.delete(a.id);
        view = undefined;
      }
      if (!view) {
        view = this.createView(a, sig);
        this.views.set(a.id, view);
        this.actorRoot.add(view.group);
      }
      view.lastSeen = now;
      view.group.visible = !a.dead;
      view.shadow.visible = !a.dead && a.alt < 200;
    }

    for (const [id, view] of this.views) {
      if (view.lastSeen !== now) {
        this.actorRoot.remove(view.group);
        this.views.delete(id);
      }
    }
  }

  private createView(a: Actor, signature: string): ActorView {
    const group = new THREE.Group();
    let rig: Rig | null = null;

    if (a.kind === 'monster') {
      const def = MONSTERS[a.monsterId!];
      group.add(buildMonster(a.monsterId!, new THREE.Color(def.color).getHex(), !!def.boss));
    } else {
      rig = buildCharacter(a.classId ?? 'warrior', a.name.charCodeAt(0) + a.name.length);
      rig.armR.add(buildWeapon(a.classId ?? 'warrior'));
      group.add(rig.root);
      if (a.mountId) {
        const m = buildMountById(a.mountId);
        rig.mount.add(m);
        // Auf dem Reittier sitzt die Figur höher und mit gespreizten Beinen.
        rig.body.position.y = 14;
        rig.legL.rotation.x = -1.1;
        rig.legR.rotation.x = -1.1;
      }
    }

    const shadowR = a.kind === 'monster' ? (MONSTERS[a.monsterId!].boss ? 26 : a.radius + 3) : 11;
    const shadow = buildBlobShadow(shadowR);
    group.add(shadow);
    return { group, rig, shadow, signature, lastSeen: 0 };
  }

  private animate(game: Game, dt: number): void {
    const t = game.time;
    for (const [id, view] of this.views) {
      const a = game.actorById(id);
      if (!a) continue;
      const gy = this.groundY(a.x, a.y);
      view.group.position.set(a.x, gy + a.alt, a.y);
      view.group.rotation.y = -a.facing + Math.PI / 2;
      view.shadow.position.y = -a.alt + 0.6;
      const sm = view.shadow.material as THREE.MeshBasicMaterial;
      sm.opacity = 0.26 * Math.max(0, 1 - a.alt / 260);

      const moving = Math.hypot(a.vx, a.vy) > 6;
      if (view.rig) this.animateCharacter(game, a, view.rig, t, moving);
      else this.animateMonster(view.group, a, t, moving);
    }
    this.animateFx(game, dt);
  }

  private animateCharacter(game: Game, a: Actor, rig: Rig, t: number, moving: boolean): void {
    const flying = game.isFlying(a);
    const swing = Math.sin((a.stride ?? 0) * 0.13);
    const mounted = !!a.mountId;

    rig.root.rotation.x = flying ? 0.3 : 0;
    if (flying) {
      // Im Flug kippt die Figur samt Reittier nach vorn, Beine angelegt.
      rig.body.rotation.x = 0.14;
      rig.body.position.y = 15 + Math.sin(t * 2.2) * 1.4;
      rig.legL.rotation.x = -0.5;
      rig.legR.rotation.x = -0.5;
      rig.armL.rotation.x = -0.7;
      rig.armR.rotation.x = -0.7;
      rig.mount.rotation.x = 0;
      rig.mount.position.y = Math.sin(t * 1.6) * 1.6;
      // Flügel schlagen.
      rig.mount.traverse((o) => {
        if (o.name === 'wingL' || o.name === 'wingR') {
          const s = o.name === 'wingL' ? -1 : 1;
          o.rotation.z = s * (0.35 + Math.sin(t * 7) * 0.45);
        }
      });
    } else if (mounted) {
      rig.body.rotation.x = 0.1;
      rig.body.position.y = 14 + (moving ? Math.abs(Math.sin(t * 9)) * 1.6 : 0);
      rig.legL.rotation.x = -1.1;
      rig.legR.rotation.x = -1.1;
      rig.armL.rotation.x = -0.55;
      rig.armR.rotation.x = -0.55;
      rig.mount.rotation.x = 0;
      rig.mount.position.y = moving ? Math.abs(Math.sin(t * 9)) * 1.2 : 0;
    } else if (moving) {
      rig.body.rotation.x = 0.08;
      rig.body.position.y = Math.abs(Math.sin((a.stride ?? 0) * 0.13)) * 1.8;
      rig.legL.rotation.x = swing * 0.85;
      rig.legR.rotation.x = -swing * 0.85;
      rig.armL.rotation.x = -swing * 0.7;
      rig.armR.rotation.x = swing * 0.7;
    } else {
      // Ruhiges Atmen im Stand.
      rig.body.rotation.x = 0;
      rig.body.position.y = Math.sin(t * 1.8) * 0.5;
      rig.legL.rotation.x = 0;
      rig.legR.rotation.x = 0;
      rig.armL.rotation.x = Math.sin(t * 1.8) * 0.08;
      rig.armR.rotation.x = -Math.sin(t * 1.8) * 0.08;
    }

    // Angriffsausholen der Waffenhand.
    const cd = a.attackCd ?? 0;
    if (!flying && cd > 0 && cd > a.cs.attackSpeed - 0.32) {
      const k = (cd - (a.cs.attackSpeed - 0.32)) / 0.32;
      rig.armR.rotation.x = -2.2 * Math.sin(k * Math.PI);
    }
    rig.head.rotation.y = Math.sin(t * 0.7 + a.x) * 0.12;
  }

  private animateMonster(group: THREE.Group, a: Actor, t: number, moving: boolean): void {
    const phase = t * 3 + a.x * 0.05;
    group.traverse((o) => {
      if (o.name === 'wobble') {
        const s = 1 + Math.sin(phase) * 0.09;
        o.scale.set(s, (1 / s) * 0.72, s);
      } else if (o.name === 'spin') {
        o.rotation.z += 0.02;
        o.rotation.y += 0.012;
      } else if (o.name === 'wingL' || o.name === 'wingR') {
        const s = o.name === 'wingL' ? -1 : 1;
        o.rotation.z = s * (0.4 + Math.sin(t * 5) * 0.35);
      }
    });
    const def = MONSTERS[a.monsterId!];
    if (def.id === 'wisp' || def.id === 'revenant') {
      group.children[0].position.y = Math.sin(t * 1.6 + a.x) * 3;
    } else if (moving) {
      group.position.y += Math.abs(Math.sin(t * 8)) * 1.6;
    }
  }

  // -------------------------------------------------------------- Effekte

  private fxPool: THREE.Mesh[] = [];
  private fxActive = new Map<string, { mesh: THREE.Mesh; born: number; radius: number }>();

  private animateFx(game: Game, dt: number): void {
    void dt;
    for (const a of game.actors) {
      const fx = a.castFx;
      if (!fx || this.fxActive.has(a.id + fx.t)) continue;
      if (game.time - fx.t > 0.1) continue;
      const mesh = this.fxPool.pop() ?? new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.07, 6, 28),
        new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(fx.x, this.groundY(fx.x, fx.y) + a.alt + 3, fx.y);
      mesh.visible = true;
      this.fxRoot.add(mesh);
      this.fxActive.set(a.id + fx.t, { mesh, born: game.time, radius: fx.r || 45 });
    }
    for (const [key, entry] of this.fxActive) {
      const age = game.time - entry.born;
      if (age > 0.5) {
        this.fxRoot.remove(entry.mesh);
        entry.mesh.visible = false;
        this.fxPool.push(entry.mesh);
        this.fxActive.delete(key);
        continue;
      }
      const k = age / 0.5;
      entry.mesh.scale.setScalar(entry.radius * (0.35 + k * 0.75));
      (entry.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }

    const target = game.actorById(game.player.targetId);
    if (target && !target.dead) {
      this.targetRing.visible = true;
      this.targetRing.position.set(
        target.x, this.groundY(target.x, target.y) + target.alt + 1.5, target.y,
      );
      const s = (target.radius + 6) / 15;
      this.targetRing.scale.setScalar(s * (1 + Math.sin(game.time * 6) * 0.05));
      this.targetRing.rotation.z += 0.03;
    } else {
      this.targetRing.visible = false;
    }
  }

  // --------------------------------------------------------------- Kamera

  private updateCamera(game: Game, dt: number): void {
    const p = game.player;
    const gy = this.groundY(p.x, p.y);
    this.camLook.lerp(new THREE.Vector3(p.x, gy + p.alt + 26, p.y), Math.min(1, dt * 9));

    // Beim Fliegen den Blick weiten, damit man die Landschaft überschaut.
    const wantDist = this.distance * (game.isFlying(p) ? 1.45 : 1);
    this.appliedDistance += (wantDist - this.appliedDistance) * Math.min(1, dt * 3);
    const horiz = Math.cos(this.pitch) * this.appliedDistance;
    const wanted = new THREE.Vector3(
      this.camLook.x + Math.sin(this.yaw) * horiz,
      this.camLook.y + Math.sin(this.pitch) * this.appliedDistance,
      this.camLook.z + Math.cos(this.yaw) * horiz,
    );
    // Nicht unter den Boden tauchen.
    const floor = this.groundY(wanted.x, wanted.z) + 16;
    wanted.y = Math.max(wanted.y, floor);
    this.camPos.lerp(wanted, Math.min(1, dt * 8));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.sun.position.copy(this.camLook).add(new THREE.Vector3(320, 620, 220));
    this.sun.target.position.copy(this.camLook);
    this.clouds.position.x = this.camLook.x;
    this.clouds.position.z = this.camLook.z;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

/** Himmelsverlauf als kleine Textur — billiger als ein Shader. */
function makeSkyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#3f9ce0');
  g.addColorStop(0.55, '#9fd6f5');
  g.addColorStop(1, '#dff1ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/** Wolkenbänke — geben dem Flug oben herum einen Maßstab. */
function buildClouds(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 });
  for (let i = 0; i < 26; i++) {
    const puff = new THREE.Group();
    const parts = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < parts; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(30 + Math.random() * 34, 8, 6), m);
      b.position.set((j - parts / 2) * 34, Math.random() * 12, Math.random() * 22);
      b.scale.y = 0.55;
      puff.add(b);
    }
    const a = Math.random() * Math.PI * 2;
    const r = 300 + Math.random() * 1500;
    puff.position.set(Math.cos(a) * r, 420 + Math.random() * 260, Math.sin(a) * r);
    g.add(puff);
  }
  void CLASS_COLORS;
  void mat;
  void WORLD_W;
  void WORLD_H;
  void DUNGEON_W;
  void DUNGEON_H;
  void MOUNT_BY_ID;
  return g;
}

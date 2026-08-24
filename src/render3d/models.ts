/**
 * Alle sichtbaren Körper werden aus Grundformen zusammengesetzt — es gibt
 * keine Modelldateien. Das hält das Spiel klein und den Stil einheitlich.
 */
import * as THREE from 'three';
import { CLASS_COLORS, HAIR, PALETTE, SKIN } from './palette';
import { MOUNT_BY_ID, type MountStyle } from '../game/mounts';

/** Materialien werden geteilt, sonst kostet jede Figur eigene Shaderprogramme. */
const matCache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(color: number, opts: { emissive?: number; opacity?: number } = {}): THREE.MeshLambertMaterial {
  const key = `${color}|${opts.emissive ?? 0}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      emissive: opts.emissive ?? 0x000000,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

function ball(r: number, color: number, detail = 12): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, detail, detail * 0.75), mat(color));
}

function capsule(r: number, len: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 10), mat(color));
}

function cone(r: number, h: number, color: number, seg = 10): THREE.Mesh {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
}

function cyl(rt: number, rb: number, h: number, color: number, seg = 10): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
}

/** Bewegliche Teile einer Figur, damit die Laufanimation sie greifen kann. */
export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  mount: THREE.Group;
  extra: THREE.Object3D[];
}

/**
 * Chibi-Figur: großer Kopf, kurzer Körper — die Proportionen des Vorbilds.
 * Die Gliedmaßen hängen an Drehpunkten, damit sie sauber ausschlagen.
 */
export function buildCharacter(classId: string, seed = 0): Rig {
  const color = CLASS_COLORS[classId] ?? 0x9aa0a6;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = capsule(6.2, 7, color);
  torso.position.y = 13;
  body.add(torso);

  // Gürtel und Schulterstück heben die Silhouette ab.
  const belt = cyl(6.6, 6.6, 2.2, 0x5a3a22, 12);
  belt.position.y = 9.5;
  body.add(belt);

  const head = new THREE.Group();
  head.position.y = 21.5;
  const skull = ball(7.4, SKIN, 14);
  head.add(skull);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(7.7, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat(HAIR[seed % HAIR.length]),
  );
  hair.position.y = 0.6;
  head.add(hair);
  // Augen als flache Scheiben — reicht, um Blickrichtung zu zeigen.
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(1.15, 10), mat(0x2a2230));
    eye.position.set(2.6 * sx, 0.6, 7.05);
    head.add(eye);
  }
  body.add(head);

  const limb = (sx: number, y: number, len: number, c: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx, y, 0);
    const m = capsule(2.5, len, c);
    m.position.y = -len / 2 - 1;
    pivot.add(m);
    return pivot;
  };

  const armL = limb(-7.2, 16.5, 7, color);
  const armR = limb(7.2, 16.5, 7, color);
  const legL = limb(-3.2, 9, 7, 0x3f4a68);
  const legR = limb(3.2, 9, 7, 0x3f4a68);
  body.add(armL, armR, legL, legR);

  const mount = new THREE.Group();
  root.add(mount);

  return { root, body, head, armL, armR, legL, legR, mount, extra: [] };
}

/** Waffe in der rechten Hand — je Klasse eine andere Silhouette. */
export function buildWeapon(classId: string): THREE.Object3D {
  const g = new THREE.Group();
  switch (classId) {
    case 'warrior': {
      const blade = box(1.6, 16, 4, 0xdfe6ee);
      blade.position.y = -9;
      const guard = box(1.8, 1.4, 8, 0xc8a13a);
      guard.position.y = -1.5;
      g.add(blade, guard);
      break;
    }
    case 'scout': {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(7, 0.8, 6, 16, Math.PI * 1.3), mat(0x8a5a2a));
      // Der Bogen hängt senkrecht neben der Figur, Sehne nach außen.
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
      bow.position.y = -7;
      const string = cyl(0.25, 0.25, 13, 0xf0e4c8, 4);
      string.position.set(0, -7, 3.4);
      g.add(bow, string);
      break;
    }
    case 'assist': {
      const staff = cyl(0.8, 0.8, 20, 0xb98a52, 8);
      staff.position.y = -8;
      const orb = ball(2.6, 0xffe08a, 10);
      orb.position.y = 2.4;
      g.add(staff, orb);
      break;
    }
    default: {
      const staff = cyl(0.9, 0.9, 21, 0x6a4a86, 8);
      staff.position.y = -8;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(3.1), mat(0x9fd8ff, { emissive: 0x2a4a80 }));
      gem.position.y = 3.4;
      g.add(staff, gem);
    }
  }
  // Am ausgestreckten Arm, leicht nach außen und vorn.
  g.position.set(1.6, -7.5, 1.2);
  g.rotation.z = -0.12;
  return g;
}

/** Reittiere. Die fliegenden bekommen einen deutlich anderen Umriss. */
export function buildMount(style: MountStyle, color: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  switch (style) {
    case 'beast': {
      const trunk = capsule(7.5, 13, color);
      trunk.rotation.z = Math.PI / 2;
      trunk.position.y = 9;
      const snout = cone(4.2, 8, color, 8);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 8.5, 12);
      for (const [sx, sz] of [[-5, 6], [5, 6], [-5, -6], [5, -6]] as const) {
        const leg = cyl(1.9, 1.6, 9, 0x4e3a26, 6);
        leg.position.set(sx, 4, sz);
        g.add(leg);
      }
      for (const sx of [-1, 1]) {
        const tusk = cone(1, 4, accent, 6);
        tusk.position.set(2.6 * sx, 7.5, 14);
        tusk.rotation.x = -0.5;
        g.add(tusk);
      }
      g.add(trunk, snout);
      break;
    }
    case 'broom': {
      const shaft = cyl(1.1, 1.1, 30, color, 8);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.y = 6;
      const bristle = cone(4.6, 11, accent, 9);
      bristle.rotation.x = -Math.PI / 2;
      bristle.position.set(0, 6, -18);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.5, 6, 12), mat(accent));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0, 6, -11);
      g.add(shaft, bristle, ring);
      break;
    }
    case 'board': {
      const deck = new THREE.Mesh(new THREE.CapsuleGeometry(6.5, 20, 2, 10), mat(color));
      deck.rotation.x = Math.PI / 2;
      deck.scale.set(1, 1, 0.32);
      deck.position.y = 4;
      const glow = new THREE.Mesh(new THREE.TorusGeometry(9, 1.1, 6, 18), mat(accent, { emissive: accent, opacity: 0.85 }));
      glow.rotation.x = Math.PI / 2;
      glow.position.y = 2.2;
      g.add(deck, glow);
      break;
    }
    case 'wings': {
      const trunk = capsule(6.5, 12, color);
      trunk.rotation.z = Math.PI / 2;
      trunk.position.y = 9;
      const beak = cone(3, 7, accent, 7);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 10, 12);
      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(11, 10, 6, 0, Math.PI), mat(accent));
        wing.scale.set(1, 0.22, 0.72);
        wing.position.set(11 * sx, 11, -1);
        wing.rotation.z = sx * 0.35;
        wing.name = sx < 0 ? 'wingL' : 'wingR';
        g.add(wing);
      }
      const tail = cone(3.4, 10, accent, 7);
      tail.rotation.x = -Math.PI / 2.4;
      tail.position.set(0, 9, -12);
      g.add(trunk, beak, tail);
      break;
    }
  }
  return g;
}

export function buildMountById(id: string): THREE.Group {
  const def = MOUNT_BY_ID[id];
  if (!def) return new THREE.Group();
  return buildMount(def.style, new THREE.Color(def.color).getHex(), new THREE.Color(def.accent).getHex());
}

/** Ein Gegner. `boss` vergrößert ihn und setzt einen Reif obendrauf. */
export function buildMonster(monsterId: string, color: number, boss: boolean): THREE.Group {
  const g = new THREE.Group();
  const c = color;
  switch (monsterId) {
    case 'slime': {
      const blob = ball(11, c, 14);
      blob.scale.set(1, 0.72, 1);
      blob.position.y = 8;
      blob.name = 'wobble';
      for (const sx of [-1, 1]) {
        const eye = ball(1.5, 0x2a2230, 8);
        eye.position.set(3.4 * sx, 10, 9.4);
        g.add(eye);
      }
      g.add(blob);
      break;
    }
    case 'bunny': {
      const bodyM = ball(9, c, 12);
      bodyM.position.y = 8;
      for (const sx of [-1, 1]) {
        const ear = capsule(2, 9, c);
        ear.position.set(3.6 * sx, 19, -1);
        ear.rotation.z = sx * 0.22;
        g.add(ear);
        const eye = ball(1.3, 0x2a2230, 8);
        eye.position.set(3 * sx, 9.5, 7.8);
        g.add(eye);
      }
      const tooth = box(3.2, 2.4, 1, 0xffffff);
      tooth.position.set(0, 5.6, 8);
      g.add(bodyM, tooth);
      break;
    }
    case 'mush': {
      const stalk = cyl(3.6, 4.6, 11, 0xf3e6cf, 10);
      stalk.position.y = 5.5;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(9.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c));
      cap.position.y = 11;
      for (let i = 0; i < 5; i++) {
        const spot = new THREE.Mesh(new THREE.CircleGeometry(1.7, 8), mat(0xfff3d0));
        const a = (i / 5) * Math.PI * 2;
        spot.position.set(Math.cos(a) * 6, 14.6, Math.sin(a) * 6);
        spot.rotation.x = -Math.PI / 2;
        g.add(spot);
      }
      g.add(stalk, cap);
      break;
    }
    case 'wolf': {
      const trunk = capsule(5.4, 11, c);
      trunk.rotation.z = Math.PI / 2;
      trunk.position.y = 10;
      const headM = ball(5.4, c, 10);
      headM.position.set(0, 12, 9);
      const snout = cone(2.6, 6, c, 7);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 11, 14);
      for (const sx of [-1, 1]) {
        const ear = cone(1.8, 4, c, 5);
        ear.position.set(2.6 * sx, 16, 8);
        g.add(ear);
        const eye = ball(1, 0xffe066, 6);
        eye.position.set(2.2 * sx, 12.6, 13);
        g.add(eye);
      }
      for (const [sx, sz] of [[-4, 5], [4, 5], [-4, -5], [4, -5]] as const) {
        const leg = cyl(1.6, 1.4, 9, 0x5c6268, 6);
        leg.position.set(sx, 4.5, sz);
        g.add(leg);
      }
      const tail = cone(2.2, 9, c, 6);
      tail.rotation.x = -Math.PI / 2.6;
      tail.position.set(0, 12, -10);
      g.add(trunk, headM, snout, tail);
      break;
    }
    case 'golem': {
      for (const [y, r, s] of [[6, 8.5, 1], [15, 7, 0.9], [22, 4.6, 0.8]] as const) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(y > 12 ? PALETTE.rock : PALETTE.rockDark));
        rock.position.y = y;
        rock.rotation.set(y, r, s);
        g.add(rock);
      }
      for (const sx of [-1, 1]) {
        const eye = ball(1.3, 0xffb648, 6);
        eye.position.set(1.9 * sx, 23, 4.2);
        g.add(eye);
      }
      break;
    }
    case 'wisp': {
      const core = ball(6, c, 12);
      core.position.y = 16;
      const inner = ball(3.4, 0xffffff, 10);
      inner.position.y = 16;
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(9 + i * 2.5, 0.6, 6, 18), mat(c, { emissive: c, opacity: 0.7 }));
        ring.rotation.x = Math.PI / 2 + i * 0.6;
        ring.position.y = 16;
        ring.name = 'spin';
        g.add(ring);
      }
      g.add(core, inner);
      break;
    }
    case 'drake': {
      const trunk = capsule(6, 13, c);
      trunk.rotation.z = Math.PI / 2;
      trunk.position.y = 12;
      const headM = ball(5, c, 10);
      headM.position.set(0, 15, 11);
      const horn = cone(1.6, 6, 0xf3e0c0, 6);
      horn.position.set(0, 19, 9);
      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(12, 10, 6, 0, Math.PI), mat(c));
        wing.scale.set(1, 0.18, 0.8);
        wing.position.set(11 * sx, 15, -2);
        wing.rotation.z = sx * 0.4;
        wing.name = sx < 0 ? 'wingL' : 'wingR';
        g.add(wing);
      }
      const tail = cone(3, 14, c, 7);
      tail.rotation.x = -Math.PI / 2.2;
      tail.position.set(0, 12, -13);
      g.add(trunk, headM, horn, tail);
      break;
    }
    case 'revenant': {
      const cloak = cone(8, 22, c, 12);
      cloak.position.y = 11;
      const skull = ball(4.6, 0xe8e4d8, 10);
      skull.position.y = 23;
      for (const sx of [-1, 1]) {
        const eye = ball(1.1, 0x7fe0ff, 6);
        eye.position.set(1.9 * sx, 23.6, 4);
        g.add(eye);
      }
      g.add(cloak, skull);
      break;
    }
    default: {
      // Titan und alles Übrige: schwerer humanoider Klotz.
      const trunk = capsule(8, 14, c);
      trunk.position.y = 16;
      const headM = ball(6, c, 10);
      headM.position.y = 30;
      for (const sx of [-1, 1]) {
        const arm = capsule(3, 12, c);
        arm.position.set(10 * sx, 17, 0);
        g.add(arm);
        const leg = capsule(3.2, 9, 0x4a4048);
        leg.position.set(4.4 * sx, 5, 0);
        g.add(leg);
        const eye = ball(1.3, 0xff6a4a, 6);
        eye.position.set(2.2 * sx, 31, 5);
        g.add(eye);
      }
      g.add(trunk, headM);
    }
  }

  if (boss) {
    g.scale.setScalar(1.7);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(7, 1.2, 6, 16), mat(0xffcf5a, { emissive: 0x6a4a00 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 36;
    crown.name = 'spin';
    g.add(crown);
  }
  return g;
}

/** Flacher Schattenfleck — billiger und stilgerechter als echte Schattenwürfe. */
export function buildBlobShadow(r: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 16),
    new THREE.MeshBasicMaterial({ color: 0x1a2a12, transparent: true, opacity: 0.26, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

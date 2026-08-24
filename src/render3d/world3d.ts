/**
 * Baut die statische Kulisse: Gelände mit eingefärbten Zonen, die Hafenstadt,
 * Bewuchs als Instanzen und die Dungeon-Halle.
 */
import * as THREE from 'three';
import { TOWN, WORLD_H, WORLD_W, ZONES } from '../game/world';
import { DUNGEON_H, DUNGEON_W } from '../game/dungeons';
import { PALETTE } from './palette';
import { terrainHeight } from './terrain';
import { mat } from './models';
import { rint, rng, seed as setSeed } from '../game/rng';

const GRASS = new THREE.Color(PALETTE.grass);
const GRASS_DARK = new THREE.Color(PALETTE.grassDark);
const PLAZA = new THREE.Color(PALETTE.plaza);
const PATH = new THREE.Color(PALETTE.path);

/** Nimmt die Zonenfarbe und mischt sie dezent ins Gras. */
function zoneTint(x: number, z: number): THREE.Color | null {
  for (const zone of ZONES) {
    if (x >= zone.x && x <= zone.x + zone.w && z >= zone.y && z <= zone.y + zone.h) {
      const edge = Math.min(
        x - zone.x, zone.x + zone.w - x, z - zone.y, zone.y + zone.h - z,
      );
      const blend = Math.min(1, edge / 90) * 0.55;
      return new THREE.Color(zone.tint3d).lerp(GRASS, 1 - blend);
    }
  }
  return null;
}

function buildTerrain(): THREE.Mesh {
  const segX = 120;
  const segZ = 96;
  const geo = new THREE.PlaneGeometry(WORLD_W + 1200, WORLD_H + 1200, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    // Von der Mitte der Ebene auf Weltkoordinaten umrechnen.
    const x = pos.getX(i) + WORLD_W / 2;
    const z = pos.getZ(i) + WORLD_H / 2;
    pos.setY(i, terrainHeight(x, z));

    const distTown = Math.hypot(x - TOWN.x, z - TOWN.y);
    if (distTown < TOWN.r * 0.82) {
      c.copy(PLAZA);
    } else if (distTown < TOWN.r) {
      c.copy(PATH).lerp(GRASS, (distTown - TOWN.r * 0.82) / (TOWN.r * 0.18));
    } else {
      const tint = zoneTint(x, z);
      c.copy(tint ?? GRASS);
      // Leichte Fleckigkeit, damit die Fläche nicht tot wirkt.
      const n = (Math.sin(x * 0.013) + Math.cos(z * 0.017)) * 0.5;
      c.lerp(GRASS_DARK, 0.12 + n * 0.08);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.position.set(WORLD_W / 2, 0, WORLD_H / 2);
  mesh.renderOrder = -1;
  return mesh;
}

function buildTown(): THREE.Group {
  const g = new THREE.Group();

  // Springbrunnen als Mittelpunkt
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 6, 20), mat(0xd8cbb0));
  basin.position.set(TOWN.x, 3, TOWN.y);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(23, 23, 6.4, 20), mat(PALETTE.water, { emissive: 0x0d3a4a }));
  water.position.set(TOWN.x, 3.6, TOWN.y);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 16, 10), mat(0xd8cbb0));
  spout.position.set(TOWN.x, 12, TOWN.y);
  g.add(basin, water, spout);

  // Häuser im Kreis um den Platz
  const houses = 9;
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + 0.3;
    const r = TOWN.r * 0.66;
    const x = TOWN.x + Math.cos(a) * r;
    const z = TOWN.y + Math.sin(a) * r;
    const w = 34 + (i % 3) * 8;
    const h = 30 + (i % 4) * 7;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.85), mat(PALETTE.wall));
    wall.position.set(x, h / 2, z);
    wall.rotation.y = -a;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 20, 4), mat(i % 3 === 0 ? PALETTE.roofAlt : PALETTE.roof));
    roof.position.set(x, h + 9, z);
    roof.rotation.y = -a + Math.PI / 4;
    // Balken deuten Fachwerk an.
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 3, w * 0.86 + 1), mat(PALETTE.wood));
    beam.position.set(x, h * 0.62, z);
    beam.rotation.y = -a;
    g.add(wall, roof, beam);
  }

  // Marktstände beleben den Platz.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.9;
    const r = TOWN.r * 0.36;
    const x = TOWN.x + Math.cos(a) * r;
    const z = TOWN.y + Math.sin(a) * r;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(26, 11, 15), mat(PALETTE.wood));
    counter.position.set(x, 5.5, z);
    counter.rotation.y = -a;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(30, 2.5, 19), mat(i % 2 ? 0xd85a4a : 0x4a86c8));
    awning.position.set(x, 22, z);
    awning.rotation.set(0.18, -a, 0);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 22, 5), mat(PALETTE.wood));
      post.position.set(x + Math.cos(-a) * 13 * sx, 11, z + Math.sin(-a) * 13 * sx);
      g.add(post);
    }
    // Kisten und Fässer daneben
    const crate = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9), mat(0xa87a48));
    crate.position.set(x + 17, 4.5, z + 6);
    crate.rotation.y = i;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 11, 9), mat(0x7a5230));
    barrel.position.set(x - 16, 5.5, z - 5);
    g.add(counter, awning, crate, barrel);
  }

  // Wimpel an hohen Masten geben dem Platz eine Mitte.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = TOWN.r * 0.2;
    const x = TOWN.x + Math.cos(a) * r;
    const z = TOWN.y + Math.sin(a) * r;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 54, 6), mat(PALETTE.wood));
    mast.position.set(x, 27, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), new THREE.MeshLambertMaterial({
      color: i % 2 ? 0xd85a4a : 0x4a86c8, side: THREE.DoubleSide,
    }));
    flag.position.set(x + 9, 46, z);
    flag.rotation.y = -a;
    g.add(mast, flag);
  }

  // Laternen entlang des Platzrandes
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = TOWN.r * 0.88;
    const x = TOWN.x + Math.cos(a) * r;
    const z = TOWN.y + Math.sin(a) * r;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 26, 6), mat(PALETTE.wood));
    post.position.set(x, 13, z);
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(4), mat(0xffe6a8, { emissive: 0xffa63d }));
    lamp.position.set(x, 28, z);
    g.add(post, lamp);
  }
  return g;
}

/** Bäume, Felsen und Blüten als Instanzen — hunderte Objekte, wenige Zeichenaufrufe. */
function buildFlora(): THREE.Group {
  const g = new THREE.Group();
  setSeed(20260824);

  const trunkGeo = new THREE.CylinderGeometry(2.6, 3.6, 20, 6);
  const leafGeo = new THREE.ConeGeometry(13, 26, 8);
  const rockGeo = new THREE.DodecahedronGeometry(6, 0);
  const bloomGeo = new THREE.ConeGeometry(2.4, 5, 5);

  const TREES = 520;
  const ROCKS = 220;
  const BLOOMS = 700;

  const trunks = new THREE.InstancedMesh(trunkGeo, mat(PALETTE.trunk), TREES);
  const leaves = new THREE.InstancedMesh(leafGeo, mat(PALETTE.leaf), TREES);
  const leaves2 = new THREE.InstancedMesh(leafGeo, mat(PALETTE.leafLight), TREES);
  const rocks = new THREE.InstancedMesh(rockGeo, mat(PALETTE.rock), ROCKS);
  const blooms = new THREE.InstancedMesh(bloomGeo, mat(PALETTE.bloom), BLOOMS);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  const place = (margin: number): [number, number] | null => {
    const x = -400 + rng() * (WORLD_W + 800);
    const z = -400 + rng() * (WORLD_H + 800);
    // Der Stadtplatz und die unmittelbare Umgebung bleiben frei.
    if (Math.hypot(x - TOWN.x, z - TOWN.y) < TOWN.r + margin) return null;
    return [x, z];
  };

  let ti = 0;
  for (let guard = 0; ti < TREES && guard < TREES * 6; guard++) {
    const p = place(24);
    if (!p) continue;
    const [x, z] = p;
    const y = terrainHeight(x, z);
    const scale = 0.7 + rng() * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);

    m.compose(v.set(x, y + 10 * scale, z), q, s.setScalar(scale));
    trunks.setMatrixAt(ti, m);
    m.compose(v.set(x, y + (24 + rng() * 4) * scale, z), q, s.setScalar(scale));
    (rng() < 0.5 ? leaves : leaves2).setMatrixAt(ti, m);
    // Die jeweils andere Krone wird außer Sicht geparkt.
    m.compose(v.set(0, -9999, 0), q, s.setScalar(0.001));
    (rng() < 0.5 ? leaves2 : leaves).setMatrixAt(ti, m);
    ti++;
  }

  let ri = 0;
  for (let guard = 0; ri < ROCKS && guard < ROCKS * 6; guard++) {
    const p = place(14);
    if (!p) continue;
    const [x, z] = p;
    q.setFromEuler(new THREE.Euler(rng(), rng() * Math.PI * 2, rng()));
    m.compose(v.set(x, terrainHeight(x, z) + 2, z), q, s.setScalar(0.5 + rng() * 1.1));
    rocks.setMatrixAt(ri++, m);
  }

  let bi = 0;
  for (let guard = 0; bi < BLOOMS && guard < BLOOMS * 4; guard++) {
    const p = place(6);
    if (!p) continue;
    const [x, z] = p;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    m.compose(v.set(x, terrainHeight(x, z) + 2.5, z), q, s.setScalar(0.6 + rng() * 0.7));
    blooms.setMatrixAt(bi++, m);
  }

  for (const inst of [trunks, leaves, leaves2, rocks, blooms]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    g.add(inst);
  }
  void rint;
  return g;
}

/** Ferne Berge am Horizont, damit der Rand der Karte nicht ins Leere läuft. */
function buildHorizon(): THREE.Group {
  const g = new THREE.Group();
  setSeed(7781);
  const cx = WORLD_W / 2;
  const cz = WORLD_H / 2;
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rng() * 0.1;
    const r = 2100 + rng() * 500;
    const h = 240 + rng() * 460;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(180 + rng() * 220, h, 5), mat(0x8fb4d6));
    peak.position.set(cx + Math.cos(a) * r, h / 2 - 40, cz + Math.sin(a) * r);
    peak.rotation.y = rng() * Math.PI;
    g.add(peak);
  }
  return g;
}

/** Beschriftetes Holzschild — die Aufschrift wird in eine Textur gemalt. */
function signTexture(title: string, sub: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8a5f34';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#5d3c1d';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fdf3dd';
  ctx.font = '700 34px "Baloo 2", system-ui, sans-serif';
  ctx.fillText(title, 128, 46);
  ctx.fillStyle = '#e8c88a';
  ctx.font = '600 22px "Baloo 2", system-ui, sans-serif';
  ctx.fillText(sub, 128, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * An jeder Zone steht ein Schild mit Name und Levelbereich. Es sitzt dort, wo
 * die Verbindungslinie von der Stadt auf den Zonenrand trifft — nie im Ort.
 */
function buildSignposts(): THREE.Group {
  const g = new THREE.Group();
  for (const zone of ZONES) {
    const cx = zone.x + zone.w / 2;
    const cz = zone.y + zone.h / 2;
    let dx = cx - TOWN.x;
    let dz = cz - TOWN.y;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;

    // Vom Zonenmittelpunkt zurück Richtung Stadt bis kurz vor den Rand laufen.
    let t = 0;
    while (t < len) {
      const px = cx - dx * t;
      const pz = cz - dz * t;
      if (px < zone.x || px > zone.x + zone.w || pz < zone.y || pz > zone.y + zone.h) break;
      t += 8;
    }
    let x = cx - dx * (t + 18);
    let z = cz - dz * (t + 18);

    // Auf keinen Fall im Stadtgebiet stehen bleiben.
    const dTown = Math.hypot(x - TOWN.x, z - TOWN.y);
    if (dTown < TOWN.r + 60) {
      x = TOWN.x + dx * (TOWN.r + 60);
      z = TOWN.y + dz * (TOWN.r + 60);
    }

    const y = terrainHeight(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 46, 6), mat(PALETTE.wood));
    post.position.set(x, y + 23, z);
    const plank = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 17),
      new THREE.MeshLambertMaterial({ map: signTexture(zone.name, zone.levelHint), side: THREE.DoubleSide }),
    );
    plank.position.set(x, y + 42, z);
    // lookAt richtet die z-Achse vom Ziel weg — daher die halbe Drehung zurück.
    plank.lookAt(TOWN.x, y + 42, TOWN.y);
    plank.rotateY(Math.PI);
    g.add(post, plank);
  }
  return g;
}

export function buildWorldScenery(): THREE.Group {
  const g = new THREE.Group();
  g.add(buildTerrain(), buildTown(), buildFlora(), buildSignposts(), buildHorizon());
  return g;
}

/** Die Instanz: eine steinerne Halle mit Fackeln entlang der Wände. */
export function buildDungeonScenery(): THREE.Group {
  const g = new THREE.Group();
  // Der Boden bekommt ein Schachbrett aus Steinplatten, sonst wirkt er leer.
  const floorGeo = new THREE.PlaneGeometry(DUNGEON_W, DUNGEON_H, 8, 26);
  floorGeo.rotateX(-Math.PI / 2);
  const fpos = floorGeo.attributes.position as THREE.BufferAttribute;
  const fcol = new Float32Array(fpos.count * 3);
  const light = new THREE.Color(PALETTE.dungeonFloor);
  const dark = new THREE.Color(PALETTE.dungeonFloor).multiplyScalar(0.78);
  const tmp = new THREE.Color();
  for (let i = 0; i < fpos.count; i++) {
    const gx = Math.floor((fpos.getX(i) + DUNGEON_W / 2) / (DUNGEON_W / 8));
    const gz = Math.floor((fpos.getZ(i) + DUNGEON_H / 2) / (DUNGEON_H / 26));
    tmp.copy((gx + gz) % 2 === 0 ? light : dark);
    fcol[i * 3] = tmp.r;
    fcol[i * 3 + 1] = tmp.g;
    fcol[i * 3 + 2] = tmp.b;
  }
  floorGeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  floor.position.set(DUNGEON_W / 2, 0, DUNGEON_H / 2);
  g.add(floor);

  const wallH = 120;
  for (const sx of [0, DUNGEON_W]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, wallH, DUNGEON_H), mat(PALETTE.dungeonWall));
    wall.position.set(sx, wallH / 2, DUNGEON_H / 2);
    g.add(wall);
  }
  for (const sz of [0, DUNGEON_H]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(DUNGEON_W + 28, wallH, 14), mat(PALETTE.dungeonWall));
    wall.position.set(DUNGEON_W / 2, wallH / 2, sz);
    g.add(wall);
  }

  // Pfeiler und Fackeln gliedern den langen Gang.
  for (let z = 150; z < DUNGEON_H; z += 170) {
    for (const sx of [42, DUNGEON_W - 42]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(11, 13, wallH, 8), mat(0x4f4858));
      pillar.position.set(sx, wallH / 2, z);
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(6), mat(0xffcf7a, { emissive: PALETTE.torch }));
      flame.position.set(sx, 78, z);
      flame.name = 'spin';
      g.add(pillar, flame);
    }
  }
  for (const frac of [0.18, 0.5, 0.82]) {
    const light = new THREE.PointLight(PALETTE.torch, 1.5, 1100, 1.4);
    light.position.set(DUNGEON_W / 2, 95, DUNGEON_H * frac);
    g.add(light);
  }
  return g;
}

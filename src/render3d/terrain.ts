/**
 * Sanfte Geländehöhe. Rein optisch — die Spiellogik bleibt zweidimensional,
 * die Figuren werden nur auf die Oberfläche gesetzt.
 */
import { TOWN } from '../game/world';

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Der See liegt in einer Mulde — Ufer und Wasserspiegel müssen zusammenpassen. */
export const LAKE = { x: 420, y: 1760, r: 270 };

/** Höhe des Bodens an einer Weltposition. */
export function terrainHeight(x: number, z: number): number {
  const base = smoothNoise(x / 420, z / 420) * 26 + smoothNoise(x / 150, z / 150) * 7;
  // Die Stadt liegt auf einer ebenen Terrasse.
  const d = Math.hypot(x - TOWN.x, z - TOWN.y);
  const flat = Math.min(1, Math.max(0, (d - TOWN.r * 0.75) / (TOWN.r * 0.6)));
  let h = base * flat;

  // Mulde für den See, zum Ufer hin sanft auslaufend.
  const dl = Math.hypot(x - LAKE.x, z - LAKE.y);
  if (dl < LAKE.r) {
    const t = 1 - dl / LAKE.r;
    h -= 34 * t * t;
  }
  return h;
}

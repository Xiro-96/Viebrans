import { MONSTERS } from './monsters';

export const WORLD_W = 2600;
export const WORLD_H = 2100;

export const TOWN = { x: 1300, y: 1050, r: 250, name: 'Hafen Viebran' };

export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  monsters: string[];
  density: number;
  levelHint: string;
  tint: string;
}

export const ZONES: Zone[] = [
  { id: 'meadow', name: 'Sonnenwiese', x: 760, y: 620, w: 520, h: 380, monsters: ['slime', 'bunny'], density: 16, levelHint: 'Lv 1–5', tint: '#1e3a2a' },
  { id: 'grove', name: 'Nebelhain', x: 1560, y: 600, w: 520, h: 400, monsters: ['bunny', 'mush'], density: 16, levelHint: 'Lv 5–9', tint: '#1c3340' },
  { id: 'steppe', name: 'Wolfssteppe', x: 700, y: 1240, w: 560, h: 420, monsters: ['wolf', 'mush'], density: 15, levelHint: 'Lv 9–13', tint: '#33301c' },
  { id: 'quarry', name: 'Alter Steinbruch', x: 1600, y: 1250, w: 560, h: 420, monsters: ['golem', 'wisp'], density: 13, levelHint: 'Lv 13–18', tint: '#2a2a33' },
  { id: 'road', name: 'Räuberpfad', x: 260, y: 820, w: 380, h: 520, monsters: ['bandit', 'wolf'], density: 12, levelHint: 'Lv 18–24', tint: '#3a2418' },
  { id: 'ashes', name: 'Aschefelder', x: 2180, y: 800, w: 360, h: 560, monsters: ['drake', 'revenant'], density: 12, levelHint: 'Lv 25–38', tint: '#3a1c1c' },
  { id: 'waste', name: 'Ödland', x: 980, y: 120, w: 700, h: 340, monsters: ['revenant', 'titan'], density: 11, levelHint: 'Lv 38–60', tint: '#231a33' },
];

export function zoneAt(x: number, y: number): Zone | null {
  for (const z of ZONES) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
  }
  return null;
}

export function inTown(x: number, y: number): boolean {
  return Math.hypot(x - TOWN.x, y - TOWN.y) < TOWN.r;
}

export function areaName(x: number, y: number): string {
  if (inTown(x, y)) return TOWN.name;
  return zoneAt(x, y)?.name ?? 'Wildnis';
}

/** Empfohlenes Monsterlevel einer Zone (für Bot-Wegewahl). */
export function zoneLevel(z: Zone): number {
  return Math.round(z.monsters.reduce((a, id) => a + MONSTERS[id].level, 0) / z.monsters.length);
}

/** Die für ein Level am besten geeignete Zone. */
export function bestZoneFor(level: number): Zone {
  let best = ZONES[0];
  let bestDiff = Infinity;
  for (const z of ZONES) {
    const diff = Math.abs(zoneLevel(z) - level);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = z;
    }
  }
  return best;
}

import { createPopulation, tickPopulation, type BotRecord } from './bots';
import { SAVE_VERSION, type SaveData } from './player';

const KEY = 'viebrans.save.v1';
/** Offline-Fortschritt der Bots wird auf 12 Stunden gedeckelt. */
const MAX_OFFLINE_SECONDS = 12 * 3600;

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== SAVE_VERSION) return null;
    if (!Array.isArray(data.bots) || data.bots.length === 0) data.bots = createPopulation();
    // Die Welt hat weitergelebt, während der Spieler weg war.
    const elapsed = Math.min(MAX_OFFLINE_SECONDS, (Date.now() - (data.lastSeen ?? Date.now())) / 1000);
    if (elapsed > 60) tickPopulation(data.bots, elapsed);
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    data.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* Speicher voll oder privater Modus — das Spiel läuft trotzdem weiter. */
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

export function freshPopulation(): BotRecord[] {
  return createPopulation();
}

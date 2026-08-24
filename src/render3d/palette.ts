/**
 * Farbwelt: hell, sonnig und satt — die Anmutung, für die das Vorbild bekannt
 * ist. Alle Werte sind Hexzahlen für three.js.
 */
export const PALETTE = {
  skyTop: 0x4fa8e8,
  skyBottom: 0xcdefff,
  sun: 0xfff6df,
  ambientSky: 0xbfe4ff,
  ambientGround: 0x7ea85c,
  fog: 0xbfe0f5,

  grass: 0x76c65a,
  grassDark: 0x5aa845,
  grassLight: 0x96d873,
  path: 0xd9bd88,
  sand: 0xe8d19a,
  water: 0x4fb5d8,
  rock: 0x9aa0a6,
  rockDark: 0x767d84,
  trunk: 0x8a5a34,
  leaf: 0x4f9e3f,
  leafLight: 0x6fbc55,
  bloom: 0xffd6e8,

  plaza: 0xe4d6b4,
  roof: 0xc8543f,
  roofAlt: 0x3f6fb5,
  wall: 0xf3e3c4,
  wood: 0x9c6b3f,

  dungeonFloor: 0x8b8299,
  dungeonWall: 0x554e63,
  torch: 0xffa63d,
} as const;

/** Farben der vier Klassen — kräftig, damit sie sich im Getümmel abheben. */
export const CLASS_COLORS: Record<string, number> = {
  warrior: 0xe05a4a,
  scout: 0x4fbf6a,
  assist: 0xf0b429,
  mage: 0x8f6ff0,
};

export const SKIN = 0xf7d2a8;
export const HAIR = [0x3a2418, 0x8a5a2a, 0xe0c060, 0x2a2a3a, 0xb04040] as const;

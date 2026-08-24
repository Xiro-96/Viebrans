import type { ClassId, Skill, SpecId } from './types';

/**
 * Jede Basisklasse hat 3 Fertigkeiten (Lv 1/5/12), jede Spezialisierung
 * weitere 3 (Lv 30/38/48). Ränge werden mit Fertigkeitspunkten gesteigert.
 */
export const SKILLS: Skill[] = [
  // ---------------- Krieger ----------------
  { id: 'w_slash', name: 'Wuchtschlag', desc: 'Ein schwerer Hieb auf ein Ziel.', owner: 'warrior', reqLevel: 1, kind: 'damage', mp: 8, cooldown: 3.5, power: 1.9, range: 40, maxRank: 5 },
  { id: 'w_shout', name: 'Schlachtruf', desc: 'Erhöht den Angriff um 20% für 20s.', owner: 'warrior', reqLevel: 5, kind: 'buff', mp: 14, cooldown: 30, power: 0, range: 0, duration: 20, effect: { atk: 0.2 }, maxRank: 5 },
  { id: 'w_sweep', name: 'Rundumschlag', desc: 'Trifft alle Gegner in der Nähe.', owner: 'warrior', reqLevel: 12, kind: 'aoe', mp: 20, cooldown: 8, power: 1.35, range: 44, radius: 80, maxRank: 5 },
  { id: 'bm_frenzy', name: 'Klingenrausch', desc: 'Serie schneller Hiebe auf ein Ziel.', owner: 'blademaster', reqLevel: 30, kind: 'damage', mp: 30, cooldown: 9, power: 3.4, range: 44, maxRank: 5 },
  { id: 'bm_edge', name: 'Scharfe Schneide', desc: '+15% kritische Trefferchance für 25s.', owner: 'blademaster', reqLevel: 38, kind: 'buff', mp: 34, cooldown: 45, power: 0, range: 0, duration: 25, effect: { crit: 0.15 }, maxRank: 5 },
  { id: 'bm_storm', name: 'Klingensturm', desc: 'Massiver Flächenschaden um dich herum.', owner: 'blademaster', reqLevel: 48, kind: 'aoe', mp: 55, cooldown: 22, power: 2.6, range: 48, radius: 110, maxRank: 5 },
  { id: 'gd_taunt', name: 'Spott', desc: 'Zieht die Aufmerksamkeit aller Gegner auf dich.', owner: 'guardian', reqLevel: 30, kind: 'debuff', mp: 22, cooldown: 12, power: 0.5, range: 44, radius: 130, duration: 8, effect: { taunt: 1 }, maxRank: 5 },
  { id: 'gd_wall', name: 'Bollwerk', desc: 'Halbiert erlittenen Schaden für 12s.', owner: 'guardian', reqLevel: 38, kind: 'buff', mp: 30, cooldown: 40, power: 0, range: 0, duration: 12, effect: { dr: 0.5 }, maxRank: 5 },
  { id: 'gd_slam', name: 'Schildstoß', desc: 'Schaden und Verlangsamung im Umkreis.', owner: 'guardian', reqLevel: 48, kind: 'aoe', mp: 40, cooldown: 16, power: 1.8, range: 44, radius: 100, duration: 5, effect: { slow: 0.4 }, maxRank: 5 },

  // ---------------- Späher ----------------
  { id: 's_pierce', name: 'Durchbohren', desc: 'Ein präziser Stich mit hoher Kritchance.', owner: 'scout', reqLevel: 1, kind: 'damage', mp: 8, cooldown: 3.5, power: 1.8, range: 60, effect: { critBonus: 0.15 }, maxRank: 5 },
  { id: 's_dash', name: 'Windschritt', desc: '+35% Lauftempo für 12s.', owner: 'scout', reqLevel: 5, kind: 'buff', mp: 12, cooldown: 25, power: 0, range: 0, duration: 12, effect: { speed: 0.35 }, maxRank: 5 },
  { id: 's_volley', name: 'Pfeilhagel', desc: 'Beschießt einen Bereich aus der Distanz.', owner: 'scout', reqLevel: 12, kind: 'aoe', mp: 22, cooldown: 9, power: 1.3, range: 190, radius: 90, maxRank: 5 },
  { id: 'rg_snipe', name: 'Zielschuss', desc: 'Ein langsamer, sehr harter Schuss.', owner: 'ranger', reqLevel: 30, kind: 'damage', mp: 32, cooldown: 10, power: 3.8, range: 240, maxRank: 5 },
  { id: 'rg_mark', name: 'Jagdmal', desc: 'Ziel erleidet 20% mehr Schaden für 15s.', owner: 'ranger', reqLevel: 38, kind: 'debuff', mp: 26, cooldown: 20, power: 0, range: 220, duration: 15, effect: { vuln: 0.2 }, maxRank: 5 },
  { id: 'rg_rain', name: 'Pfeilregen', desc: 'Anhaltender Beschuss eines großen Bereichs.', owner: 'ranger', reqLevel: 48, kind: 'aoe', mp: 55, cooldown: 20, power: 2.4, range: 210, radius: 130, maxRank: 5 },
  { id: 'bd_whirl', name: 'Klingenwirbel', desc: 'Wirbelt durch alle nahen Gegner.', owner: 'bladedancer', reqLevel: 30, kind: 'aoe', mp: 28, cooldown: 8, power: 1.9, range: 46, radius: 95, maxRank: 5 },
  { id: 'bd_shadow', name: 'Schattenschritt', desc: '+25% Ausweichen und Tempo für 15s.', owner: 'bladedancer', reqLevel: 38, kind: 'buff', mp: 30, cooldown: 35, power: 0, range: 0, duration: 15, effect: { dodge: 0.25, speed: 0.25 }, maxRank: 5 },
  { id: 'bd_thousand', name: 'Tausend Schnitte', desc: 'Extrem schnelle Schlagfolge auf ein Ziel.', owner: 'bladedancer', reqLevel: 48, kind: 'damage', mp: 50, cooldown: 18, power: 4.2, range: 48, maxRank: 5 },

  // ---------------- Assist ----------------
  { id: 'a_smite', name: 'Handstreich', desc: 'Geballte Energie im Nahkampf.', owner: 'assist', reqLevel: 1, kind: 'damage', mp: 8, cooldown: 3.5, power: 1.75, range: 38, maxRank: 5 },
  { id: 'a_heal', name: 'Heilwort', desc: 'Heilt dich oder ein Gruppenmitglied.', owner: 'assist', reqLevel: 5, kind: 'heal', mp: 18, cooldown: 5, power: 2.2, range: 220, maxRank: 5 },
  { id: 'a_bless', name: 'Segen', desc: '+15% Angriff und Verteidigung für 30s.', owner: 'assist', reqLevel: 12, kind: 'buff', mp: 24, cooldown: 35, power: 0, range: 200, duration: 30, effect: { atk: 0.15, def: 0.15 }, maxRank: 5 },
  { id: 'mk_burst', name: 'Bebenfaust', desc: 'Erschüttert den Boden im Umkreis.', owner: 'monk', reqLevel: 30, kind: 'aoe', mp: 30, cooldown: 10, power: 2.0, range: 40, radius: 100, maxRank: 5 },
  { id: 'mk_vigor', name: 'Innere Kraft', desc: 'Heilt dich stetig für 15s.', owner: 'monk', reqLevel: 38, kind: 'buff', mp: 28, cooldown: 30, power: 0, range: 0, duration: 15, effect: { regen: 0.03 }, maxRank: 5 },
  { id: 'mk_fist', name: 'Drachenfaust', desc: 'Ein einzelner, verheerender Schlag.', owner: 'monk', reqLevel: 48, kind: 'damage', mp: 48, cooldown: 16, power: 4.0, range: 42, maxRank: 5 },
  { id: 'rm_greatheal', name: 'Große Heilung', desc: 'Heilt die gesamte Gruppe.', owner: 'ringmaster', reqLevel: 30, kind: 'heal', mp: 40, cooldown: 12, power: 2.6, range: 260, radius: 260, maxRank: 5 },
  { id: 'rm_ward', name: 'Schutzhülle', desc: 'Gruppe erleidet 25% weniger Schaden für 15s.', owner: 'ringmaster', reqLevel: 38, kind: 'buff', mp: 45, cooldown: 45, power: 0, range: 260, duration: 15, effect: { dr: 0.25 }, maxRank: 5 },
  { id: 'rm_zeal', name: 'Kampfeswille', desc: 'Gruppe erhält +25% Angriff für 25s.', owner: 'ringmaster', reqLevel: 48, kind: 'buff', mp: 50, cooldown: 60, power: 0, range: 260, duration: 25, effect: { atk: 0.25 }, maxRank: 5 },

  // ---------------- Magier ----------------
  { id: 'm_bolt', name: 'Feuerpfeil', desc: 'Ein schneller Geschosszauber.', owner: 'mage', reqLevel: 1, kind: 'damage', mp: 10, cooldown: 3, power: 2.0, range: 220, maxRank: 5 },
  { id: 'm_frost', name: 'Frostnova', desc: 'Schaden und Verlangsamung um dich herum.', owner: 'mage', reqLevel: 5, kind: 'aoe', mp: 22, cooldown: 10, power: 1.4, range: 60, radius: 120, duration: 6, effect: { slow: 0.45 }, maxRank: 5 },
  { id: 'm_shield', name: 'Manaschild', desc: 'Verringert erlittenen Schaden um 25% für 20s.', owner: 'mage', reqLevel: 12, kind: 'buff', mp: 26, cooldown: 40, power: 0, range: 0, duration: 20, effect: { dr: 0.25 }, maxRank: 5 },
  { id: 'el_meteor', name: 'Meteor', desc: 'Gewaltiger Einschlag in einem großen Bereich.', owner: 'elementor', reqLevel: 30, kind: 'aoe', mp: 45, cooldown: 14, power: 3.0, range: 230, radius: 140, maxRank: 5 },
  { id: 'el_chain', name: 'Kettenblitz', desc: 'Springt zwischen mehreren Gegnern.', owner: 'elementor', reqLevel: 38, kind: 'aoe', mp: 38, cooldown: 9, power: 2.1, range: 230, radius: 150, maxRank: 5 },
  { id: 'el_nova', name: 'Sonnennova', desc: 'Entlädt alles um dich herum.', owner: 'elementor', reqLevel: 48, kind: 'aoe', mp: 65, cooldown: 24, power: 4.4, range: 60, radius: 180, maxRank: 5 },
  { id: 'pk_drain', name: 'Lebensraub', desc: 'Schaden, der dich für 50% davon heilt.', owner: 'psykeeper', reqLevel: 30, kind: 'damage', mp: 30, cooldown: 8, power: 2.4, range: 210, effect: { lifesteal: 0.5 }, maxRank: 5 },
  { id: 'pk_curse', name: 'Fluch', desc: 'Fügt über 12s anhaltenden Schaden zu.', owner: 'psykeeper', reqLevel: 38, kind: 'debuff', mp: 28, cooldown: 10, power: 0.55, range: 210, duration: 12, effect: { dot: 1 }, maxRank: 5 },
  { id: 'pk_void', name: 'Leerensog', desc: 'Zieht Gegner zusammen und verletzt sie schwer.', owner: 'psykeeper', reqLevel: 48, kind: 'aoe', mp: 58, cooldown: 20, power: 3.2, range: 220, radius: 150, duration: 4, effect: { slow: 0.6 }, maxRank: 5 },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function skillsFor(classId: ClassId, specId: SpecId | null | undefined): Skill[] {
  return SKILLS.filter((s) => s.owner === classId || (specId && s.owner === specId));
}

export function availableSkills(classId: ClassId, specId: SpecId | null | undefined, level: number): Skill[] {
  return skillsFor(classId, specId).filter((s) => s.reqLevel <= level);
}

/** Rang 1 = 100%, jeder weitere Rang +18% Wirkung. */
export function rankPower(skill: Skill, rank: number): number {
  return skill.power * (1 + 0.18 * Math.max(0, rank - 1));
}

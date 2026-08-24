import { CLASSES, JOB_LEVEL, MAX_LEVEL, SPECS } from './classes';
import { xpToNext } from './formulas';
import { botName, guildName } from './names';
import { chance, pick, rint, rng } from './rng';
import { bestZoneFor, ZONES } from './world';
import { DUNGEONS } from './dungeons';
import type { ChatMessage, ClassId, Role, SpecId } from './types';

export interface BotRecord {
  id: string;
  name: string;
  guild: string;
  classId: ClassId;
  specId: SpecId | null;
  role: Role;
  level: number;
  xp: number;
  gearScore: number;
  gold: number;
  online: boolean;
  /** Was der Bot gerade tut — erscheint in der Spielerliste. */
  activity: string;
  /** Sekunden bis zur nächsten Aktivitätsänderung. */
  nextChange: number;
  chatCd: number;
  /** Wie schnell dieser Bot spielt (Vielspieler vs. Gelegenheitsspieler). */
  pace: number;
}

export const BOT_POPULATION = 64;
/** Gear-Score, den ein durchschnittlich ausgerüsteter Charakter pro Level trägt. */
export const GS_PER_LEVEL = 6.5;

export function createBot(minLevel = 1, maxLevel = MAX_LEVEL): BotRecord {
  const classId = pick(Object.keys(CLASSES)) as ClassId;
  const level = rint(minLevel, maxLevel);
  const specId = level >= JOB_LEVEL ? pick(CLASSES[classId].specs) : null;
  const role = specId ? SPECS[specId].role : 'dps';
  return {
    id: `bot_${Math.floor(rng() * 1e9).toString(36)}`,
    name: botName(),
    guild: chance(0.55) ? guildName() : '',
    classId,
    specId,
    role,
    level,
    xp: 0,
    // Bots sind grob so ausgerüstet, wie es ihr Level erlaubt.
    gearScore: Math.max(1, Math.round(level * GS_PER_LEVEL * (0.82 + rng() * 0.45))),
    gold: rint(200, 40000),
    online: chance(0.72),
    activity: 'unterwegs',
    nextChange: rng() * 60,
    chatCd: rng() * 120,
    pace: 0.6 + rng() * 1.1,
  };
}

/** Startbevölkerung mit realistischer Levelverteilung: viele niedrig, wenige am Cap. */
export function createPopulation(): BotRecord[] {
  const bots: BotRecord[] = [];
  for (let i = 0; i < BOT_POPULATION; i++) {
    const r = rng();
    const level = r < 0.42 ? rint(1, 20) : r < 0.72 ? rint(20, 40) : r < 0.93 ? rint(40, 59) : MAX_LEVEL;
    bots.push(createBot(level, level));
  }
  return bots;
}

function activityFor(bot: BotRecord): string {
  if (!bot.online) return 'offline';
  const r = rng();
  if (r < 0.08) return 'AFK in Hafen Viebran';
  if (r < 0.16) return 'sortiert das Lager';
  if (r < 0.30 && bot.level >= 10) {
    const open = DUNGEONS.filter((d) => bot.level >= d.minLevel && bot.gearScore >= d.minGearScore);
    if (open.length) return `im Dungeon: ${pick(open).name}`;
  }
  return `farmt in ${bestZoneFor(bot.level).name}`;
}

/**
 * Rückt die Bevölkerung um `dt` Sekunden voran.
 * Läuft auch beim Laden für die verstrichene Offline-Zeit (gedeckelt).
 */
export function tickPopulation(bots: BotRecord[], dt: number, out?: ChatMessage[], now = 0): void {
  for (const bot of bots) {
    // An- und Abmelden
    if ((bot.nextChange -= dt) <= 0) {
      bot.nextChange = 60 + rng() * 300;
      if (chance(0.12)) bot.online = !bot.online;
      bot.activity = activityFor(bot);
    }
    if (!bot.online) continue;

    // Fortschritt: XP entsprechend Tempo, Levelaufstieg, Gear zieht nach.
    if (bot.level < MAX_LEVEL) {
      const rate = xpToNext(bot.level) / (280 / bot.pace);
      bot.xp += rate * dt;
      while (bot.xp >= xpToNext(bot.level) && bot.level < MAX_LEVEL) {
        bot.xp -= xpToNext(bot.level);
        bot.level += 1;
        if (bot.level === JOB_LEVEL && !bot.specId) {
          bot.specId = pick(CLASSES[bot.classId].specs);
          bot.role = SPECS[bot.specId].role;
          out?.push({
            channel: 'system',
            from: '',
            text: `${bot.name} ist jetzt ${SPECS[bot.specId].name}!`,
            t: now,
          });
        }
        if (bot.level % 10 === 0 && out && chance(0.5)) {
          out.push({ channel: 'welt', from: bot.name, text: pick(LEVEL_LINES).replace('%L', String(bot.level)), t: now });
        }
      }
    }
    bot.gold += 6 * bot.pace * dt;
    const targetGs = bot.level * GS_PER_LEVEL * (0.9 + (bot.pace - 0.6) * 0.22);
    if (bot.gearScore < targetGs) bot.gearScore += 0.08 * bot.pace * dt;

    // Chat
    if (out && (bot.chatCd -= dt) <= 0) {
      bot.chatCd = 90 + rng() * 260;
      out.push(makeChat(bot, now));
    }
  }
}

const LEVEL_LINES = [
  'Endlich Lv %L 🎉',
  'Lv %L! Das ging schneller als gedacht.',
  'ding! %L',
  'Lv %L — jetzt erstmal neues Equip suchen.',
];

const SMALLTALK = [
  'Moin zusammen',
  'ist der Server heute langsam oder liegts an mir',
  'wer kennt einen guten Farmspot?',
  'habe gerade legendär gedroppt, ich zittere noch',
  'mein Aufwerten ist zum dritten Mal fehlgeschlagen 😭',
  'lohnt sich Wächter noch oder lieber Klingenmeister?',
  'gn8 leute',
  'kurz afk, Nudeln sind fertig',
  'wie kommt man an mehr Gear-Score?',
  'Der Boss hat mich zweimal geonshottet, ich lerne dazu',
  'jemand Lust auf gemütliches Grinden?',
  'seit heute Mittag kein einziger Drop, das ist Statistik-Mobbing',
  'hab meine Skillpunkte falsch verteilt, hilfe',
  'wo genau ist der Eingang zum Steinbruch?',
];

const TRADE = [
  'WTS Episches Amulett Lv %I — Angebote per Flüstern',
  'Suche Runenstab ab Lv %I, zahle gut',
  'Verkaufe Handschuhe +%P, günstig',
  'WTB Legendär Waffe, Preis egal',
];

function makeChat(bot: BotRecord, now: number): ChatMessage {
  const r = rng();
  if (r < 0.24) {
    const d = pick(DUNGEONS.filter((x) => x.minLevel <= bot.level + 4)) ?? DUNGEONS[0];
    return {
      channel: 'welt',
      from: bot.name,
      text: pick([
        `LFG ${d.name}, brauche noch ${rint(1, 3)}`,
        `Suche Gruppe für ${d.name} — Tank vorhanden`,
        `${d.name} in 5 Minuten, wer will mit?`,
      ]),
      t: now,
    };
  }
  if (r < 0.4) {
    return {
      channel: 'handel',
      from: bot.name,
      text: pick(TRADE).replace('%I', String(Math.max(1, bot.level - 2))).replace('%P', String(rint(3, 9))),
      t: now,
    };
  }
  return { channel: 'welt', from: bot.name, text: pick(SMALLTALK), t: now };
}

/** Rangliste nach Level, dann Gear-Score. */
export function leaderboard(bots: BotRecord[]): BotRecord[] {
  return [...bots].sort((a, b) => b.level - a.level || b.gearScore - a.gearScore);
}

/** Bots, die als Gruppenmitglieder für einen Dungeon in Frage kommen. */
export function findPartyCandidates(
  bots: BotRecord[], minLevel: number, minGs: number, count: number,
): BotRecord[] {
  const eligible = bots.filter((b) => b.online && b.level >= minLevel && b.gearScore >= minGs);
  // Bevorzugt eine ausgewogene Aufstellung: 1 Tank, 1 Heiler, Rest DPS.
  const picked: BotRecord[] = [];
  const take = (role: Role) => {
    const c = eligible.find((b) => b.role === role && !picked.includes(b));
    if (c) picked.push(c);
  };
  take('tank');
  take('heal');
  for (const b of eligible) {
    if (picked.length >= count) break;
    if (!picked.includes(b)) picked.push(b);
  }
  return picked.slice(0, count);
}

export function onlineCount(bots: BotRecord[]): number {
  return bots.reduce((n, b) => n + (b.online ? 1 : 0), 0);
}

/** Für die Weltkarte: welche Zone ein Bot gerade bevölkert. */
export function botZoneCounts(bots: BotRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const z of ZONES) counts[z.id] = 0;
  for (const b of bots) {
    if (!b.online) continue;
    const z = bestZoneFor(b.level);
    counts[z.id] = (counts[z.id] ?? 0) + 1;
  }
  return counts;
}

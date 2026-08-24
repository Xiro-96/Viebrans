import { pick, rng } from './rng';

const A = ['Ael', 'Bran', 'Cor', 'Dra', 'El', 'Fen', 'Gor', 'Hal', 'Ily', 'Jor', 'Kai', 'Lun', 'Mor', 'Nyx', 'Oren', 'Pyr', 'Quen', 'Rav', 'Syl', 'Tor', 'Ulf', 'Vex', 'Wyn', 'Zar'];
const B = ['ar', 'en', 'ix', 'or', 'ath', 'ien', 'us', 'ka', 'wyn', 'dor', 'is', 'ael', 'ran', 'eth', 'ok', 'ila'];
const SUFFIX = ['', '', '', '', 'x', 'XD', '96', '007', 'HD', '_', 'yy', '23', 'TV'];
const HANDLES = [
  'NoobSlayer', 'KeksMitMilch', 'Dunkelherz', 'PixelPeter', 'Sahnetorte', 'HerrBert',
  'xXDrachenXx', 'Mondsichel', 'BlitzHans', 'TeeKanne', 'Waldschrat', 'Gummibaum',
  'Lichtbringer', 'KartoffelKing', 'SchattenMax', 'Nebelkrähe', 'Donnerfaust', 'Zuckerwatte',
];

export function botName(): string {
  if (rng() < 0.3) {
    const h = pick(HANDLES);
    return rng() < 0.4 ? h + pick(SUFFIX) : h;
  }
  const n = pick(A) + pick(B);
  return rng() < 0.25 ? n + pick(SUFFIX) : n;
}

const GUILDS = ['Nachtwacht', 'Sturmreiter', 'Die Kesselflicker', 'Aurora', 'Rotmond', 'Eisenbund', 'Feierabend'];

export function guildName(): string {
  return pick(GUILDS);
}

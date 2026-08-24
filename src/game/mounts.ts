/**
 * Reittiere. Jedes lässt sich am Boden reiten; die meisten können zusätzlich
 * abheben. Das Fliegen ist das namensgebende Element des Vorbilds: oben ist
 * man schneller, wird von Bodengegnern nicht angegriffen, kann aber auch
 * selbst nicht kämpfen.
 */
export type MountStyle = 'board' | 'broom' | 'beast' | 'wings';

export interface MountDef {
  id: string;
  name: string;
  blurb: string;
  style: MountStyle;
  reqLevel: number;
  price: number;
  /** Faktor auf das Lauftempo, während man reitet. */
  groundSpeed: number;
  /** Kann das Reittier abheben? */
  canFly: boolean;
  /** Faktor auf das Tempo in der Luft. */
  flySpeed: number;
  /** Steig- und Sinkgeschwindigkeit in Einheiten pro Sekunde. */
  climb: number;
  /** Maximale Flughöhe. */
  ceiling: number;
  color: string;
  accent: string;
}

export const MOUNTS: MountDef[] = [
  {
    id: 'boar',
    name: 'Borstenkeiler',
    blurb: 'Stur, schnell, bleibt am Boden. Das erste Reittier für kleines Geld.',
    style: 'beast',
    reqLevel: 15,
    price: 4000,
    groundSpeed: 1.55,
    canFly: false,
    flySpeed: 1,
    climb: 0,
    ceiling: 0,
    color: '#8d6748',
    accent: '#f3e0c0',
  },
  {
    id: 'broom',
    name: 'Hexenbesen',
    blurb: 'Der Klassiker. Am Boden gemächlich, in der Luft eine Wucht.',
    style: 'broom',
    reqLevel: 20,
    price: 12000,
    groundSpeed: 1.35,
    canFly: true,
    flySpeed: 2.0,
    climb: 78,
    ceiling: 340,
    color: '#7a4f2a',
    accent: '#e8c463',
  },
  {
    id: 'board',
    name: 'Schwebebrett',
    blurb: 'Gleitet dicht über dem Boden und steigt auf Knopfdruck steil auf.',
    style: 'board',
    reqLevel: 25,
    price: 26000,
    groundSpeed: 1.7,
    canFly: true,
    flySpeed: 2.3,
    climb: 96,
    ceiling: 420,
    color: '#3f6fb5',
    accent: '#9fd8ff',
  },
  {
    id: 'griffin',
    name: 'Greif',
    blurb: 'Endstufe. Steigt fast senkrecht und lässt jeden Besen stehen.',
    style: 'wings',
    reqLevel: 40,
    price: 90000,
    groundSpeed: 1.8,
    canFly: true,
    flySpeed: 2.9,
    climb: 130,
    ceiling: 560,
    color: '#d9c48a',
    accent: '#e8853f',
  },
];

export const MOUNT_BY_ID: Record<string, MountDef> = Object.fromEntries(
  MOUNTS.map((m) => [m.id, m]),
);

/** Höhe, ab der ein Charakter als fliegend gilt (Bodengegner ignorieren ihn). */
export const FLIGHT_THRESHOLD = 26;

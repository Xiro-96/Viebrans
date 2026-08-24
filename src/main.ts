import './styles.css';
import { CLASSES, MAX_LEVEL, SPECS } from './game/classes';
import { Game } from './game/engine';
import { createSave, equip, type SaveData } from './game/player';
import { rollLoot, SLOT_ORDER } from './game/items';
import { deleteSave, freshPopulation, hasSave, loadSave, writeSave } from './game/save';
import { seed } from './game/rng';
import { Renderer3D } from './render3d/scene';
import { Overlay } from './render3d/overlay';
import { Hud } from './ui/hud';
import { Joystick } from './ui/joystick';
import { Panels, type TabId } from './ui/panels';
import { clear, el, tap, toast } from './ui/dom';
import type { ClassId } from './game/types';

const app = document.getElementById('app')!;
seed(Date.now() & 0xffffffff);

const gameRoot = el('div', { id: 'game' });
const canvas = el('canvas', { id: 'view' }) as HTMLCanvasElement;
const plates = el('canvas', { id: 'plates' }) as HTMLCanvasElement;
gameRoot.append(canvas, plates);
app.append(gameRoot);

let game: Game | null = null;
let renderer: Renderer3D | null = null;
let overlay: Overlay | null = null;
let hud: Hud | null = null;
let panels: Panels | null = null;
let stick: Joystick | null = null;
let saveTimer = 0;

// ------------------------------------------------------------------ Screens

function showStart(): void {
  const screen = el('div', { class: 'screen' });
  const buttons: HTMLElement[] = [];

  if (hasSave()) {
    const cont = el('button', { class: 'btn primary', text: 'Weiterspielen' });
    tap(cont, () => {
      const data = loadSave();
      if (!data) { toast('Spielstand beschädigt.'); return; }
      screen.remove();
      startGame(data);
    });
    buttons.push(cont);
  }

  const neu = el('button', { class: hasSave() ? 'btn' : 'btn primary', text: 'Neuer Charakter' });
  tap(neu, () => {
    if (hasSave() && !confirm('Ein vorhandener Spielstand wird überschrieben. Fortfahren?')) return;
    screen.remove();
    showCreate();
  });
  buttons.push(neu);

  screen.append(
    el('h1', { class: 'logo' }, [el('span', { text: 'Vie' }), 'brans']),
    el('p', {
      class: 'tagline',
      text: 'Ein kleines Handy-MMORPG im Geiste von Flyff. Vier Klassen, acht Jobs, Reittiere zum Fliegen — und eine Welt voller Abenteurer, die nie schlafen.',
    }),
    ...buttons,
  );
  app.append(screen);
}

function showCreate(): void {
  const screen = el('div', { class: 'screen' });
  let chosen: ClassId = 'warrior';

  const nameInput = el('input', { type: 'text', maxlength: '14', placeholder: 'Heldenname' }) as HTMLInputElement;
  const grid = el('div', { class: 'class-grid' });
  const startBtn = el('button', { class: 'btn primary', text: 'Abenteuer beginnen' });

  const renderCards = () => {
    clear(grid);
    for (const c of Object.values(CLASSES)) {
      const card = el('button', { class: 'class-card', 'data-sel': chosen === c.id ? '1' : '0' }, [
        el('h3', {}, [el('i', { class: 'dot', style: `background:${c.color}` }), c.name]),
        el('p', { text: c.blurb }),
        el('div', { class: 'specs', text: `Ab Lv 30: ${c.specs.map((s) => SPECS[s].name).join(' oder ')}` }),
      ]);
      tap(card, () => { chosen = c.id; renderCards(); });
      grid.append(card);
    }
  };
  renderCards();

  tap(startBtn, () => {
    const name = (nameInput.value || '').trim() || 'Namenlos';
    const data = createSave(name.slice(0, 14), chosen, freshPopulation());
    writeSave(data);
    screen.remove();
    startGame(data);
  });

  screen.append(
    el('h1', { class: 'logo' }, [el('span', { text: 'Neuer ' }), 'Held']),
    el('div', { class: 'field' }, [el('label', { text: 'Name' }), nameInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Klasse' })]),
    grid,
    startBtn,
  );
  app.append(screen);
}

// --------------------------------------------------------------------- Spiel

function startGame(data: SaveData): void {
  gameRoot.classList.add('on');
  game = new Game(data);
  renderer = new Renderer3D(canvas);
  overlay = new Overlay(plates);
  stick = new Joystick();
  panels = new Panels(game, () => {
    hud?.buildSkillBar();
    persist();
  });
  hud = new Hud(game, (tab: TabId) => panels!.toggle(tab));
  gameRoot.append(hud.root, stick.root, panels.root);
  renderer.resize();
  overlay.resize();

  bindInput();
  game.notify(`Willkommen in Hafen Viebran, ${data.name}.`, 'info');
  game.notify('Links laufen, rechts die Kamera drehen.', 'info');
  requestAnimationFrame(loop);
}

function persist(): void {
  if (game) writeSave(game.save);
}

function bindInput(): void {
  /** Zeiger, die gerade die Kamera drehen. */
  const drags = new Map<number, { x: number; y: number; moved: number }>();
  let pinchStart: number | null = null;

  const isStickZone = (x: number, y: number) =>
    x < window.innerWidth * 0.46 && y > window.innerHeight * 0.34;

  canvas.addEventListener('pointerdown', (ev) => {
    if (panels?.open) return;
    canvas.setPointerCapture(ev.pointerId);
    if (stick && !stick.active && isStickZone(ev.clientX, ev.clientY)) {
      stick.start(ev.pointerId, ev.clientX, ev.clientY);
      return;
    }
    drags.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, moved: 0 });
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (stick?.owns(ev.pointerId)) {
      stick.move(ev.clientX, ev.clientY);
      return;
    }
    const d = drags.get(ev.pointerId);
    if (!d) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    d.moved += Math.abs(dx) + Math.abs(dy);
    d.x = ev.clientX;
    d.y = ev.clientY;

    if (drags.size >= 2) {
      // Zwei Finger: Abstand steuert den Zoom.
      const pts = [...drags.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStart !== null && dist > 0) renderer?.zoom(pinchStart / dist);
      pinchStart = dist;
      return;
    }
    renderer?.orbit(dx, dy);
  });

  const endPointer = (ev: PointerEvent) => {
    if (stick?.owns(ev.pointerId)) {
      stick.end();
      game?.steer(0, 0);
      return;
    }
    const d = drags.get(ev.pointerId);
    drags.delete(ev.pointerId);
    if (drags.size < 2) pinchStart = null;
    // Ein kurzer Tipp ohne Wischen wählt ein Ziel oder ein Laufziel.
    if (d && d.moved < 12 && game && renderer) {
      const rect = canvas.getBoundingClientRect();
      const hit = renderer.pick(game, ev.clientX - rect.left, ev.clientY - rect.top);
      if (hit.actorId) {
        game.player.targetId = hit.actorId;
        game.player.moveDir = null;
      } else if (hit.ground) {
        game.tapWorld(hit.ground.x, hit.ground.y);
      }
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  const onResize = () => { renderer?.resize(); overlay?.resize(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 140));

  // Tastatur für den Test am Rechner
  const keys = new Set<string>();
  window.addEventListener('keydown', (ev) => {
    if (!game) return;
    keys.add(ev.key.toLowerCase());
    const n = parseInt(ev.key, 10);
    if (n >= 1 && n <= 6) {
      const id = game.save.quickbar[n - 1];
      if (id) {
        const err = game.castPlayerSkill(id);
        if (err) game.notify(err, 'bad');
      }
    }
    if (ev.key === 'Escape') panels?.hide();
    if (ev.key.toLowerCase() === 'm') {
      const err = game.toggleMount();
      if (err) game.notify(err, 'bad');
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const enemy = game.actors
        .filter((a) => a.team === 1 && !a.dead && game!.isFlying(a) === game!.isFlying(game!.player))
        .sort((a, b) =>
          Math.hypot(a.x - game!.player.x, a.y - game!.player.y) -
          Math.hypot(b.x - game!.player.x, b.y - game!.player.y))[0];
      if (enemy) game.player.targetId = enemy.id;
    }
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));

  // Tastatursteuerung in denselben Richtungsvektor gießen wie den Knüppel.
  keyboardVector = () => {
    const x = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const y = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
    const climb = (keys.has('r') ? 1 : 0) - (keys.has('f') ? 1 : 0);
    return { x, y, climb };
  };

  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  window.addEventListener('pagehide', persist);
}

let keyboardVector: () => { x: number; y: number; climb: number } = () => ({ x: 0, y: 0, climb: 0 });

let last = performance.now();
let botRefresh = 0;

function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game && renderer && overlay && hud) {
    // Eingaben relativ zur Kamera in Weltrichtung umrechnen.
    const kb = keyboardVector();
    const sx = (stick?.x ?? 0) + kb.x;
    const sy = (stick?.y ?? 0) + kb.y;
    if (Math.hypot(sx, sy) > 0.08) {
      const f = renderer.forward;
      const rx = f.y;
      const ry = -f.x;
      game.steer(f.x * -sy + rx * sx, f.y * -sy + ry * sx);
    } else {
      game.steer(0, 0);
    }
    if (kb.climb !== 0) game.setClimb(kb.climb > 0 ? 1 : -1);

    game.update(dt);
    renderer.draw(game, dt);
    overlay.draw(game, renderer);
    hud.update();
    if (panels?.open && panels.needsLiveRefresh()) panels.render();

    botRefresh += dt;
    if (botRefresh > 6) {
      botRefresh = 0;
      game.refreshWorldBots();
    }
    saveTimer += dt;
    if (saveTimer > 15) {
      saveTimer = 0;
      persist();
    }
  }
  requestAnimationFrame(loop);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    try {
      // Lief hier schon ein Arbeiter? Dann ist ein Wechsel eine Aktualisierung
      // und die Seite soll sich einmal selbst neu laden.
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        location.reload();
      });
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => { /* offline optional */ });
    } catch {
      /* offline optional */
    }
  });
}

/**
 * Entwickler- und Testkonsole:
 *   viebrans.setLevel(30)   — Level setzen
 *   viebrans.gearUp(30)     — komplette Ausrüstung auf Itemlevel 30
 *   viebrans.giveMounts()   — alle Reittiere freischalten
 *   viebrans.reset()        — Spielstand löschen
 */
(window as unknown as Record<string, unknown>).viebrans = {
  reset: () => { deleteSave(); location.reload(); },
  game: () => game,
  renderer: () => renderer,
  setLevel: (n: number) => {
    if (!game) return;
    game.save.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(n)));
    game.save.xp = 0;
    game.save.skillPoints = Math.max(game.save.skillPoints, game.save.level);
    game.recomputePlayer();
    persist();
  },
  gearUp: (ilvl = 20) => {
    if (!game) return;
    for (const slot of SLOT_ORDER) {
      let tries = 0;
      let item = rollLoot(ilvl, game.save.classId);
      while (item.slot !== slot && tries++ < 60) item = rollLoot(ilvl, game.save.classId);
      if (item.slot === slot) equip(game.save, item);
    }
    game.recomputePlayer();
    persist();
  },
  giveMounts: () => {
    if (!game) return;
    game.save.mounts = ['boar', 'broom', 'board', 'griffin'];
    game.save.activeMount = 'broom';
    persist();
  },
};

showStart();

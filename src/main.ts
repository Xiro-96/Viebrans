import './styles.css';
import { CLASSES, MAX_LEVEL, SPECS } from './game/classes';
import { Game } from './game/engine';
import { createSave, equip, type SaveData } from './game/player';
import { rollLoot, SLOT_ORDER } from './game/items';
import { deleteSave, freshPopulation, hasSave, loadSave, writeSave } from './game/save';
import { seed } from './game/rng';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import { Panels, type TabId } from './ui/panels';
import { clear, el, tap, toast } from './ui/dom';
import type { ClassId } from './game/types';

const app = document.getElementById('app')!;
seed(Date.now() & 0xffffffff);

const gameRoot = el('div', { id: 'game' });
const canvas = el('canvas', { id: 'view' }) as HTMLCanvasElement;
gameRoot.append(canvas);
app.append(gameRoot);

let game: Game | null = null;
let renderer: Renderer | null = null;
let hud: Hud | null = null;
let panels: Panels | null = null;
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
    el('p', { class: 'tagline', text: 'Ein kleines Handy-MMORPG im Geiste von Flyff. Vier Klassen, acht Jobs, eine Welt voller Abenteurer, die nie schlafen.' }),
    ...buttons,
  );
  app.append(screen);
}

function showCreate(): void {
  const screen = el('div', { class: 'screen' });
  let chosen: ClassId = 'warrior';

  const nameInput = el('input', { type: 'text', maxlength: '14', placeholder: 'Heldenname', value: '' }) as HTMLInputElement;
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
  // Erst einblenden, dann den Renderer bauen — sonst misst er eine Fläche von 0.
  gameRoot.classList.add('on');
  game = new Game(data);
  renderer = new Renderer(canvas);
  panels = new Panels(game, () => {
    hud?.buildSkillBar();
    persist();
  });
  hud = new Hud(game, (tab: TabId) => panels!.toggle(tab));
  gameRoot.append(hud.root, panels.root);
  renderer.resize();

  bindInput();
  game.notify(`Willkommen in Hafen Viebran, ${data.name}.`, 'info');
  game.notify('Tippe auf einen Gegner, um ihn anzugreifen.', 'info');
  requestAnimationFrame(loop);
}

function persist(): void {
  if (game) writeSave(game.save);
}

function bindInput(): void {
  const handleTap = (clientX: number, clientY: number) => {
    if (!game || !renderer || panels?.open) return;
    const rect = canvas.getBoundingClientRect();
    const p = renderer.screenToWorld(clientX - rect.left, clientY - rect.top);
    game.tapWorld(p.x, p.y);
  };

  // Tippen zielt an oder läuft los; Halten und Ziehen führt den Helden weiter.
  let dragging = false;
  const dragTo = (clientX: number, clientY: number) => {
    if (!game || !renderer || panels?.open || game.player.dead) return;
    const rect = canvas.getBoundingClientRect();
    const p = renderer.screenToWorld(clientX - rect.left, clientY - rect.top);
    game.player.targetId = null;
    game.player.moveTo = { x: p.x, y: p.y };
  };

  canvas.addEventListener('touchstart', (ev) => {
    dragging = true;
    const t = ev.changedTouches[0];
    handleTap(t.clientX, t.clientY);
  }, { passive: true });
  canvas.addEventListener('touchmove', (ev) => {
    if (!dragging) return;
    const t = ev.changedTouches[0];
    dragTo(t.clientX, t.clientY);
  }, { passive: true });
  canvas.addEventListener('touchend', () => { dragging = false; }, { passive: true });

  canvas.addEventListener('mousedown', (ev) => {
    dragging = true;
    handleTap(ev.clientX, ev.clientY);
  });
  canvas.addEventListener('mousemove', (ev) => { if (dragging) dragTo(ev.clientX, ev.clientY); });
  window.addEventListener('mouseup', () => { dragging = false; });

  window.addEventListener('resize', () => renderer?.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => renderer?.resize(), 120));

  // Tastatur für den Test am Rechner
  window.addEventListener('keydown', (ev) => {
    if (!game) return;
    const n = parseInt(ev.key, 10);
    if (n >= 1 && n <= 6) {
      const id = game.save.quickbar[n - 1];
      if (id) {
        const err = game.castPlayerSkill(id);
        if (err) game.notify(err, 'bad');
      }
    }
    if (ev.key === 'Escape') panels?.hide();
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const enemy = game.actors
        .filter((a) => a.team === 1 && !a.dead)
        .sort((a, b) =>
          Math.hypot(a.x - game!.player.x, a.y - game!.player.y) -
          Math.hypot(b.x - game!.player.x, b.y - game!.player.y))[0];
      if (enemy) game.player.targetId = enemy.id;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
  });
  window.addEventListener('pagehide', persist);
}

let last = performance.now();
let botRefresh = 0;

function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game && renderer && hud) {
    game.update(dt);
    renderer.draw(game);
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

// Service Worker nur im Produktionsbuild registrieren.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline optional */ });
  });
}

/**
 * Entwickler- und Testkonsole. In der Browser-Konsole erreichbar:
 *   viebrans.setLevel(30)   — Level setzen (zum Ausprobieren der Jobs)
 *   viebrans.gearUp(30)     — komplette Ausrüstung auf Itemlevel 30
 *   viebrans.reset()        — Spielstand löschen
 */
(window as unknown as Record<string, unknown>).viebrans = {
  reset: () => { deleteSave(); location.reload(); },
  game: () => game,
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
};

showStart();

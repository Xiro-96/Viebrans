import { MAX_LEVEL } from '../game/classes';
import { xpToNext } from '../game/formulas';
import { SKILL_BY_ID } from '../game/skills';
import { onlineCount } from '../game/bots';
import type { MountStyle } from '../game/mounts';
import { areaName } from '../game/world';
import * as P from '../game/player';
import type { Game } from '../game/engine';
import { clear, el, fmt, tap } from './dom';
import type { TabId } from './panels';

const MOUNT_ICON: Record<MountStyle, string> = {
  beast: '🐗', broom: '🧹', board: '🛹', wings: '🦅',
};

export class Hud {
  root: HTMLElement;
  private hpBar: HTMLElement;
  private mpBar: HTMLElement;
  private xpBar: HTMLElement;
  private nameRow: HTMLElement;
  private hudMeta: HTMLElement;
  private chips: HTMLElement;
  private targetFrame: HTMLElement;
  private noticeBox: HTMLElement;
  private ticker: HTMLElement;
  private skillBar: HTMLElement;
  private navBar: HTMLElement;
  private skillNodes: HTMLElement[] = [];
  private lastQuickbar = '';
  private lastChatLen = -1;
  private lastNoticeLen = -1;
  private mountBtn!: HTMLElement;
  private upBtn!: HTMLButtonElement;
  private downBtn!: HTMLButtonElement;
  private sideBtns!: HTMLElement;

  constructor(private game: Game, private onNav: (tab: TabId) => void) {
    this.nameRow = el('div', { class: 'namerow' });
    this.hpBar = el('i');
    this.mpBar = el('i');
    this.xpBar = el('i');
    this.hudMeta = el('div', { class: 'hudmeta' });
    const topLeft = el('div', { class: 'top-left brassbox' }, [
      this.nameRow,
      el('div', { class: 'bar hp' }, [this.hpBar]),
      el('div', { class: 'bar mp' }, [this.mpBar]),
      el('div', { class: 'bar xp' }, [this.xpBar]),
      this.hudMeta,
    ]);

    this.chips = el('div', { class: 'top-right' });
    this.targetFrame = el('div', { class: 'target-frame brassbox' });
    this.noticeBox = el('div', { class: 'notices' });
    this.ticker = el('div', { class: 'chat-ticker' });
    this.skillBar = el('div', { class: 'skills' });
    this.navBar = el('div', { class: 'navbar' });

    const nav: [TabId, string][] = [
      ['hero', '🛡 Held'], ['bag', '🎒 Beutel'], ['skills', '✨ Können'],
      ['dungeon', '🗝 Dungeon'], ['social', '💬 Sozial'],
    ];
    for (const [id, label] of nav) {
      const b = el('button', { class: 'nav' }, [el('span', { text: label })]);
      tap(b, () => this.onNav(id));
      this.navBar.append(b);
    }

    this.mountBtn = el('button', { class: 'round', title: 'Reittier' }, [el('span', { text: '🐗' })]);
    this.upBtn = el('button', { class: 'round small', title: 'Steigen' }, [el('span', { text: '▲' })]);
    this.downBtn = el('button', { class: 'round small', title: 'Sinken' }, [el('span', { text: '▼' })]);
    tap(this.mountBtn, () => {
      const err = this.game.toggleMount();
      if (err) this.game.notify(err, 'bad');
    });
    // Gedrückt halten steigt, loslassen hält die Höhe.
    const hold = (node: HTMLElement, dir: -1 | 1) => {
      const set = (d: -1 | 0 | 1) => {
        const err = this.game.setClimb(d);
        if (err && d !== 0) this.game.notify(err, 'bad');
      };
      node.addEventListener('pointerdown', (ev) => { ev.preventDefault(); set(dir); });
      for (const e of ['pointerup', 'pointercancel', 'pointerleave']) {
        node.addEventListener(e, () => set(0));
      }
    };
    hold(this.upBtn, 1);
    hold(this.downBtn, -1);
    this.sideBtns = el('div', { class: 'sidebtns' }, [this.upBtn, this.downBtn, this.mountBtn]);

    this.root = el('div', { class: 'hud' }, [
      topLeft, this.chips, this.targetFrame, this.noticeBox, this.ticker, this.sideBtns,
      el('div', { class: 'actionbar' }, [this.skillBar, this.navBar]),
    ]);
    this.buildSkillBar();
  }

  buildSkillBar(): void {
    clear(this.skillBar);
    this.skillNodes = [];
    for (let i = 0; i < P.QUICKBAR_SIZE; i++) {
      const id = this.game.save.quickbar[i];
      const skill = id ? SKILL_BY_ID[id] : null;
      const node = el('button', { class: `skill ${skill ? '' : 'empty'}` }, [
        el('div', { class: 'sname', text: skill ? skill.name : '—' }),
        el('div', { class: 'skey', text: skill ? `${skill.mp} MP` : `${i + 1}` }),
        el('div', { class: 'cd', style: 'display:none' }),
      ]);
      if (skill) {
        tap(node, () => {
          const err = this.game.castPlayerSkill(skill.id);
          if (err) this.game.notify(err, 'bad');
        });
      } else {
        tap(node, () => this.onNav('skills'));
      }
      this.skillNodes.push(node);
      this.skillBar.append(node);
    }
    this.lastQuickbar = this.game.save.quickbar.join(',');
  }

  update(): void {
    const g = this.game;
    const save = g.save;
    const p = g.player;

    if (this.lastQuickbar !== save.quickbar.join(',')) this.buildSkillBar();

    // Kopfzeile
    clear(this.nameRow);
    this.nameRow.append(
      el('div', {
        class: 'portrait',
        style: `background:${P.classColor(save)}`,
        text: save.name.slice(0, 1).toUpperCase(),
      }),
      el('div', { class: 'namecol' }, [
        el('div', { class: 'nm', text: save.name }),
        el('div', { class: 'cl', text: `Lv ${save.level} · ${P.specName(save)}` }),
      ]),
    );
    this.hpBar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    this.mpBar.style.width = `${Math.max(0, (p.mp / Math.max(1, p.maxMp)) * 100)}%`;
    const need = xpToNext(save.level);
    this.xpBar.style.width = save.level >= MAX_LEVEL ? '100%' : `${Math.min(100, (save.xp / need) * 100)}%`;
    clear(this.hudMeta);
    this.hudMeta.append(
      el('span', { text: `${Math.max(0, Math.round(p.hp))} / ${Math.round(p.maxHp)}` }),
      el('span', { text: save.level >= MAX_LEVEL ? 'MAX' : `${Math.floor((save.xp / need) * 100)}% EP` }),
    );

    // Chips rechts
    clear(this.chips);
    const v = P.view(save);
    this.chips.append(
      el('div', { class: 'chip brassbox' }, [el('b', { text: fmt(save.gold) }), ' Gold']),
      el('div', { class: 'chip brassbox' }, [el('b', { text: String(v.gearScore) }), ' GS']),
      el('div', { class: 'chip brassbox' }, [
        el('span', { class: 'on', text: '● ' }),
        el('b', { text: String(onlineCount(save.bots)) }), ' online',
      ]),
      el('div', { class: 'chip brassbox', text: g.scene === 'dungeon' && g.dungeon ? g.dungeon.def.name : areaName(p.x, p.y) }),
    );
    if (save.skillPoints > 0) {
      this.chips.append(el('div', { class: 'chip brassbox' }, [el('b', { text: `+${save.skillPoints}` }), ' Punkte']));
    }

    if (p.alt > 0) {
      this.chips.append(el('div', { class: 'chip brassbox' }, [
        el('b', { text: `${Math.round(p.alt)} m` }), ' Höhe',
      ]));
    }

    // Zielfenster
    const t = g.actors.find((a) => a.id === p.targetId);
    if (t && !t.dead) {
      this.targetFrame.classList.add('on');
      clear(this.targetFrame);
      this.targetFrame.append(
        el('div', { class: 'tname', text: `${t.name} · Lv ${t.level}` }),
        el('div', { class: 'bar hp' }, [el('i', { style: `width:${Math.max(0, (t.hp / t.maxHp) * 100)}%` })]),
        el('div', { class: 'hudmeta' }, [
          el('span', { text: `${Math.max(0, Math.round(t.hp))} / ${Math.round(t.maxHp)}` }),
          el('span', { text: t.team === 0 ? 'verbündet' : 'feindlich' }),
        ]),
      );
    } else {
      this.targetFrame.classList.remove('on');
    }

    // Meldungen
    const recent = g.notices.filter((n) => g.time - n.t < 6).slice(-5);
    if (recent.length !== this.lastNoticeLen || recent.length) {
      this.lastNoticeLen = recent.length;
      clear(this.noticeBox);
      for (const n of recent) this.noticeBox.append(el('div', { class: `notice ${n.kind}`, text: n.text }));
    }

    // Chat-Laufband
    if (g.chat.length !== this.lastChatLen) {
      this.lastChatLen = g.chat.length;
      clear(this.ticker);
      for (const m of g.chat.slice(-5)) {
        this.ticker.append(el('div', { class: `line ${m.channel}` }, [
          m.from ? el('b', { text: `${m.from}: ` }) : null,
          m.text,
        ]));
      }
    }

    // Reiten und Fliegen
    const mountDef = g.mount;
    const canRide = !!mountDef && g.scene === 'world';
    this.sideBtns.style.display = save.mounts.length && g.scene === 'world' ? 'flex' : 'none';
    this.mountBtn.dataset.on = g.mounted ? '1' : '0';
    (this.mountBtn as HTMLButtonElement).disabled = !canRide && !g.mounted;
    this.mountBtn.textContent = mountDef ? MOUNT_ICON[mountDef.style] : '🐗';
    const canFly = g.mounted && !!mountDef?.canFly;
    this.upBtn.disabled = !canFly || p.alt >= (mountDef?.ceiling ?? 0);
    this.downBtn.disabled = !canFly || p.alt <= 0;
    this.upBtn.dataset.on = canFly && (p.climb ?? 0) > 0 ? '1' : '0';
    this.downBtn.dataset.on = canFly && (p.climb ?? 0) < 0 ? '1' : '0';

    // Fertigkeitenleiste
    for (let i = 0; i < this.skillNodes.length; i++) {
      const id = save.quickbar[i];
      const node = this.skillNodes[i];
      const cdNode = node.querySelector('.cd') as HTMLElement;
      if (!id) { cdNode.style.display = 'none'; continue; }
      const cd = p.skillCd?.[id] ?? 0;
      const skill = SKILL_BY_ID[id];
      const affordable = p.mp >= skill.mp;
      if (cd > 0.05) {
        cdNode.style.display = 'flex';
        cdNode.textContent = cd > 1 ? String(Math.ceil(cd)) : cd.toFixed(1);
      } else {
        cdNode.style.display = 'none';
      }
      node.classList.toggle('ready', cd <= 0.05 && affordable && p.gcd <= 0);
      node.style.opacity = affordable ? '1' : '.55';
    }
  }
}

import { CLASSES, JOB_LEVEL, MAX_LEVEL, SPECS } from '../game/classes';
import { itemPower, RARITY, xpToNext } from '../game/formulas';
import { SLOT_NAMES, SLOT_ORDER, sellValue, upgradeChance, upgradeCost } from '../game/items';
import { availableSkills, rankPower, skillsFor } from '../game/skills';
import { checkLock, DUNGEONS } from '../game/dungeons';
import { leaderboard, onlineCount } from '../game/bots';
import * as P from '../game/player';
import type { Game } from '../game/engine';
import type { Item, SpecId } from '../game/types';
import { clear, el, fmt, tap, toast } from './dom';

export type TabId = 'hero' | 'bag' | 'skills' | 'dungeon' | 'social';

const TAB_LABEL: Record<TabId, string> = {
  hero: 'Held',
  bag: 'Beutel',
  skills: 'Fertigkeiten',
  dungeon: 'Dungeons',
  social: 'Sozial',
};

export class Panels {
  root: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private tabsBar: HTMLElement;
  private current: TabId = 'hero';
  open = false;
  private socialTab: 'chat' | 'rangliste' | 'online' = 'chat';

  constructor(private game: Game, private onChange: () => void) {
    this.body = el('div', { class: 'sheet-body' });
    this.title = el('h2', { text: 'Held' });
    this.tabsBar = el('div', { class: 'tabs' });
    const close = el('button', { class: 'btn ghost', text: '✕' });
    tap(close, () => this.hide());
    const head = el('div', { class: 'sheet-head' }, [this.title, close]);
    const inner = el('div', { class: 'sheet-inner' }, [head, this.tabsBar, this.body]);
    this.root = el('div', { class: 'sheet' }, [inner]);
    this.root.addEventListener('click', (ev) => {
      if (ev.target === this.root) this.hide();
    });
  }

  show(tab: TabId): void {
    this.current = tab;
    this.open = true;
    this.root.classList.add('on');
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.classList.remove('on');
  }

  /** Der Sozial-Tab lebt weiter, während das Panel offen ist. */
  private lastLive = 0;
  needsLiveRefresh(): boolean {
    if (this.current !== 'social' || this.socialTab === 'rangliste') return false;
    if (this.game.time - this.lastLive < 2.5) return false;
    this.lastLive = this.game.time;
    return true;
  }

  toggle(tab: TabId): void {
    if (this.open && this.current === tab) this.hide();
    else this.show(tab);
  }

  render(): void {
    this.title.textContent = TAB_LABEL[this.current];
    clear(this.tabsBar);
    clear(this.body);
    if (this.current === 'social') this.renderSocialTabs();
    switch (this.current) {
      case 'hero': this.renderHero(); break;
      case 'bag': this.renderBag(); break;
      case 'skills': this.renderSkills(); break;
      case 'dungeon': this.renderDungeons(); break;
      case 'social': this.renderSocial(); break;
    }
  }

  private get save() { return this.game.save; }

  // ------------------------------------------------------------------ Held

  private renderHero(): void {
    const save = this.save;
    const v = P.view(save);
    const cls = CLASSES[save.classId];

    this.body.append(
      el('div', { class: 'section-title', text: 'Übersicht' }),
      el('div', { class: 'grid2' }, [
        this.stat('Klasse', P.specName(save)),
        this.stat('Level', `${save.level} / ${MAX_LEVEL}`),
        this.stat('Gear-Score', String(v.gearScore)),
        this.stat('Gold', fmt(save.gold)),
        this.stat('Erfahrung', save.level >= MAX_LEVEL ? 'max.' : `${fmt(save.xp)} / ${fmt(xpToNext(save.level))}`),
        this.stat('Besiegte Gegner', fmt(save.kills)),
      ]),
    );

    // Jobwahl
    if (!save.specId) {
      const ready = save.level >= JOB_LEVEL;
      this.body.append(el('div', { class: 'section-title', text: `Jobwahl (ab Level ${JOB_LEVEL})` }));
      for (const specId of cls.specs) {
        const spec = SPECS[specId];
        const btn = el('button', { class: 'mini primary', text: 'Wählen' }) as HTMLButtonElement;
        btn.disabled = !ready;
        tap(btn, () => this.confirmSpec(specId));
        this.body.append(el('div', { class: 'row' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 't1', text: `${spec.name} · ${spec.role === 'tank' ? 'Tank' : spec.role === 'heal' ? 'Heiler' : 'Schaden'}` }),
            el('div', { class: 't2', text: spec.blurb }),
          ]),
          el('div', { class: 'actions' }, [btn]),
        ]));
      }
      if (!ready) {
        this.body.append(el('div', { class: 'empty-hint', text: `Noch ${JOB_LEVEL - save.level} Level bis zur Jobwahl. Die Entscheidung ist endgültig.` }));
      }
    }

    this.body.append(
      el('div', { class: 'section-title', text: 'Werte' }),
      el('div', { class: 'grid2' }, [
        this.stat('STR', String(v.stats.str)),
        this.stat('STA', String(v.stats.sta)),
        this.stat('DEX', String(v.stats.dex)),
        this.stat('INT', String(v.stats.int)),
        this.stat('Angriff', fmt(v.cs.atk)),
        this.stat('Verteidigung', fmt(v.cs.def)),
        this.stat('Leben', fmt(v.cs.maxHp)),
        this.stat('Mana', fmt(v.cs.maxMp)),
        this.stat('Krit', `${(v.cs.crit * 100).toFixed(1)}%`),
        this.stat('Ausweichen', `${(v.cs.dodge * 100).toFixed(1)}%`),
      ]),
    );

    this.body.append(el('div', { class: 'section-title', text: 'Ausrüstung' }));
    for (const slot of SLOT_ORDER) {
      const item = save.equipped[slot];
      const actions: HTMLElement[] = [];
      if (item) {
        const cost = upgradeCost(item);
        const up = el('button', {
          class: 'mini',
          text: `+${item.plus + 1} · ${fmt(cost)}g`,
        }) as HTMLButtonElement;
        up.disabled = item.plus >= 10 || save.gold < cost;
        up.title = `${Math.round(upgradeChance(item) * 100)}% Erfolgschance`;
        tap(up, () => {
          const res = P.upgrade(save, slot);
          if (!res.ok) { toast(res.reason ?? 'Nicht möglich'); return; }
          toast(res.success ? `Erfolg! ${item.name} ist jetzt +${item.plus}` : 'Fehlgeschlagen — Gold ist weg.');
          this.game.recomputePlayer();
          this.onChange();
          this.render();
        });
        const off = el('button', { class: 'mini', text: 'Ablegen' });
        tap(off, () => {
          P.unequip(save, slot);
          this.game.recomputePlayer();
          this.onChange();
          this.render();
        });
        actions.push(up, off);
      }
      this.body.append(el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 't1' }, [
            el('span', { style: `color:${item ? RARITY[item.rarity].color : '#64748b'}`, text: item ? `${item.name}${item.plus ? ` +${item.plus}` : ''}` : '— leer —' }),
          ]),
          el('div', { class: 't2', text: item ? this.itemLine(item) : SLOT_NAMES[slot] }),
        ]),
        el('div', { class: 'actions' }, actions),
      ]));
    }
  }

  private confirmSpec(specId: SpecId): void {
    const spec = SPECS[specId];
    if (!confirm(`${spec.name} wählen? Diese Entscheidung lässt sich nicht rückgängig machen.`)) return;
    if (P.chooseSpec(this.save, specId)) {
      this.game.recomputePlayer();
      this.game.notify(`Du bist jetzt ${spec.name}!`, 'level');
      this.game.say({ channel: 'system', from: '', text: `${this.save.name} ist jetzt ${spec.name}!`, t: this.game.time });
      this.onChange();
      this.render();
    }
  }

  private itemLine(item: Item): string {
    const bonus = Object.entries(item.bonus)
      .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
      .join('  ');
    const kind = item.slot === 'weapon' ? 'ANG' : 'VER';
    return `Lv ${item.ilvl} · ${RARITY[item.rarity].name} · ${kind} ${fmt(itemPower(item))}${bonus ? `  ·  ${bonus}` : ''}`;
  }

  // ---------------------------------------------------------------- Beutel

  private renderBag(): void {
    const save = this.save;
    this.body.append(el('div', {
      class: 'section-title',
      text: `Inventar (${save.inventory.length} / ${P.INVENTORY_CAP}) · ${fmt(save.gold)} Gold`,
    }));
    if (!save.inventory.length) {
      this.body.append(el('div', { class: 'empty-hint', text: 'Dein Beutel ist leer. Besiege Gegner oder laufe Dungeons, um Ausrüstung zu finden.' }));
      return;
    }
    const sorted = [...save.inventory].sort((a, b) => b.ilvl - a.ilvl || RARITY[b.rarity].score - RARITY[a.rarity].score);
    const best = el('button', { class: 'mini primary', text: 'Bestes anlegen' });
    tap(best, () => {
      const n = P.equipBest(save);
      this.game.recomputePlayer();
      toast(n ? `${n} Ausrüstungsteil${n === 1 ? '' : 'e'} angelegt.` : 'Du trägst bereits das Beste.');
      this.onChange();
      this.render();
    });
    const sellAll = el('button', { class: 'mini danger', text: 'Normale verkaufen' });
    tap(sellAll, () => {
      const junk = save.inventory.filter((i) => i.rarity === 'common');
      let sum = 0;
      for (const i of junk) sum += P.sell(save, i.uid);
      toast(`${junk.length} Gegenstände verkauft: +${fmt(sum)} Gold`);
      this.onChange();
      this.render();
    });
    this.body.append(el('div', { class: 'row' }, [
      el('div', { class: 'grow' }, [el('div', { class: 't2', text: 'Schnellaktionen' })]),
      el('div', { class: 'actions' }, [best, sellAll]),
    ]));

    for (const item of sorted) {
      const usable = P.canUse(save, item);
      const equipped = save.equipped[item.slot];
      const better = !equipped || itemPower(item) > itemPower(equipped);
      const eq = el('button', { class: `mini ${better && usable ? 'primary' : ''}`, text: 'Anlegen' }) as HTMLButtonElement;
      eq.disabled = !usable;
      tap(eq, () => {
        if (P.equip(save, item)) {
          this.game.recomputePlayer();
          this.onChange();
          this.render();
        }
      });
      const sl = el('button', { class: 'mini', text: `${fmt(sellValue(item))}g` });
      tap(sl, () => {
        P.sell(save, item.uid);
        this.onChange();
        this.render();
      });
      this.body.append(el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 't1' }, [
            el('span', { style: `color:${RARITY[item.rarity].color}`, text: item.name }),
            better && usable ? el('span', { style: 'color:#4ade80', text: '  ▲' }) : null,
          ]),
          el('div', { class: 't2', text: `${SLOT_NAMES[item.slot]} · ${this.itemLine(item)}${usable ? '' : ' · nicht für deine Klasse'}` }),
        ]),
        el('div', { class: 'actions' }, [eq, sl]),
      ]));
    }
  }

  // ----------------------------------------------------------- Fertigkeiten

  private renderSkills(): void {
    const save = this.save;
    this.body.append(el('div', { class: 'section-title', text: `Fertigkeitspunkte: ${save.skillPoints}` }));

    const all = skillsFor(save.classId, save.specId);
    const unlocked = availableSkills(save.classId, save.specId, save.level);
    for (const skill of all) {
      const rank = save.skillRanks[skill.id] ?? 0;
      const open = unlocked.includes(skill);
      const canLearn = open && save.skillPoints > 0 && rank < skill.maxRank;
      const learn = el('button', { class: `mini ${canLearn ? 'primary' : ''}`, text: rank === 0 ? 'Lernen' : `Rang ${rank + 1}` }) as HTMLButtonElement;
      learn.disabled = !canLearn;
      tap(learn, () => {
        if (P.learn(save, skill.id)) {
          toast(`${skill.name} auf Rang ${save.skillRanks[skill.id]}`);
          this.onChange();
          this.render();
        }
      });
      const slotBtn = el('button', { class: 'mini', text: save.quickbar.includes(skill.id) ? `Slot ${save.quickbar.indexOf(skill.id) + 1}` : 'Belegen' }) as HTMLButtonElement;
      slotBtn.disabled = rank < 1;
      tap(slotBtn, () => this.assignDialog(skill.id));

      const owner = skill.owner === save.classId ? CLASSES[save.classId].name : SPECS[skill.owner as SpecId]?.name ?? '';
      const power = rank > 0 ? ` · Wirkung ${(rankPower(skill, rank) * 100).toFixed(0)}%` : '';
      this.body.append(el('div', { class: 'row', style: open ? '' : 'opacity:.5' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 't1', text: `${skill.name}${rank ? ` (Rang ${rank}/${skill.maxRank})` : ''}` }),
          el('div', { class: 't2', text: `${skill.desc}` }),
          el('div', { class: 't2', text: `${owner} · Lv ${skill.reqLevel} · ${skill.mp} MP · ${skill.cooldown}s${power}` }),
        ]),
        el('div', { class: 'actions' }, [learn, slotBtn]),
      ]));
    }
  }

  private assignDialog(skillId: string): void {
    const save = this.save;
    const raw = prompt(`In welchen Slot (1-${P.QUICKBAR_SIZE})? 0 = entfernen`, '1');
    if (raw === null) return;
    const n = parseInt(raw, 10);
    if (n === 0) {
      const idx = save.quickbar.indexOf(skillId);
      if (idx >= 0) P.assignQuickbar(save, idx, null);
    } else if (n >= 1 && n <= P.QUICKBAR_SIZE) {
      P.assignQuickbar(save, n - 1, skillId);
    }
    this.onChange();
    this.render();
  }

  // -------------------------------------------------------------- Dungeons

  private renderDungeons(): void {
    const save = this.save;
    const v = P.view(save);
    this.body.append(el('div', { class: 'section-title', text: `Dein Gear-Score: ${v.gearScore}` }));

    if (this.game.dungeon) {
      const leave = el('button', { class: 'mini danger', text: 'Verlassen' });
      tap(leave, () => {
        this.game.leaveDungeon(false);
        this.hide();
        this.onChange();
      });
      this.body.append(el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 't1', text: `Aktiv: ${this.game.dungeon.def.name}` }),
          el('div', { class: 't2', text: 'Beim Verlassen geht der Fortschritt der Instanz verloren.' }),
        ]),
        el('div', { class: 'actions' }, [leave]),
      ]));
    }

    for (const d of DUNGEONS) {
      const lock = checkLock(d, save.level, v.gearScore);
      const clears = save.clears[d.id] ?? 0;
      const enter = el('button', { class: `mini ${lock.ok ? 'primary' : ''}`, text: 'Betreten' }) as HTMLButtonElement;
      enter.disabled = !lock.ok || !!this.game.dungeon;
      tap(enter, () => {
        const res = this.game.enterDungeon(d);
        if (!res.ok) { toast(res.reason ?? 'Nicht möglich'); return; }
        this.hide();
        this.onChange();
      });
      const mode = d.mode === 'solo' ? 'Solo' : `Gruppe (${d.partySize})`;
      this.body.append(el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 't1', text: `${d.name}${d.endgame ? ' ★' : ''}` }),
          el('div', { class: 't2', text: d.blurb }),
          el('div', { class: 't2', text: `${mode} · Lv ${d.minLevel}+ · GS ${d.minGearScore}+ · Beute Lv ${d.rewardIlvl} · ${clears}× geschafft` }),
          lock.ok ? null : el('div', { class: 't2', style: 'color:#f87171', text: lock.reason }),
        ]),
        el('div', { class: 'actions' }, [enter]),
      ]));
    }

    this.body.append(el('div', { class: 'empty-hint', text: 'Gruppendungeons füllen sich automatisch mit passenden Spielern aus der Warteschlange. Die Gruppe kämpft eigenständig: Tank hält Aggro, Heiler reagiert auf niedrige Leben.' }));
  }

  // ---------------------------------------------------------------- Sozial

  private renderSocialTabs(): void {
    const opts: [typeof this.socialTab, string][] = [
      ['chat', 'Chat'], ['rangliste', 'Rangliste'], ['online', 'Spieler'],
    ];
    for (const [id, label] of opts) {
      const b = el('button', { class: 'tab', 'data-sel': this.socialTab === id ? '1' : '0', text: label });
      tap(b, () => { this.socialTab = id; this.render(); });
      this.tabsBar.append(b);
    }
  }

  private renderSocial(): void {
    if (this.socialTab === 'chat') return this.renderChat();
    if (this.socialTab === 'rangliste') return this.renderLeaderboard();
    return this.renderOnline();
  }

  private renderChat(): void {
    const log = el('div', { class: 'chatlog' });
    const messages = this.game.chat.slice(-70);
    for (const m of messages) {
      log.append(el('div', { class: `chatline ${m.channel}` }, [
        m.from ? el('b', { text: `${m.from}: ` }) : null,
        m.text,
      ]));
    }
    if (!messages.length) log.append(el('div', { class: 'empty-hint', text: 'Noch keine Nachrichten.' }));
    this.body.append(log);
    this.body.scrollTop = this.body.scrollHeight;
  }

  private renderLeaderboard(): void {
    const save = this.save;
    const v = P.view(save);
    const entries = leaderboard(save.bots).map((b) => ({
      name: b.name, guild: b.guild, level: b.level, gs: Math.round(b.gearScore),
      cls: b.specId ? SPECS[b.specId].name : CLASSES[b.classId].name, me: false,
    }));
    entries.push({
      name: save.name, guild: '', level: save.level, gs: v.gearScore,
      cls: P.specName(save), me: true,
    });
    entries.sort((a, b) => b.level - a.level || b.gs - a.gs);

    this.body.append(el('div', { class: 'section-title', text: 'Top 40 nach Level und Gear-Score' }));
    entries.slice(0, 40).forEach((e, i) => {
      this.body.append(el('div', { class: `lb-row ${e.me ? 'me' : ''}` }, [
        el('div', { class: 'rank', text: `${i + 1}` }),
        el('div', { class: 'who' }, [
          el('div', { text: e.guild ? `${e.name} «${e.guild}»` : e.name }),
          el('div', { style: 'font-size:11px;color:#94a3b8', text: `${e.cls} · GS ${e.gs}` }),
        ]),
        el('div', { class: 'lv', text: `Lv ${e.level}` }),
      ]));
    });
    const myIndex = entries.findIndex((e) => e.me);
    if (myIndex >= 40) {
      this.body.append(el('div', { class: 'empty-hint', text: `Dein Platz: ${myIndex + 1} von ${entries.length}` }));
    }
  }

  private renderOnline(): void {
    const bots = this.save.bots;
    this.body.append(el('div', { class: 'section-title', text: `${onlineCount(bots)} von ${bots.length} Spielern online` }));
    for (const b of bots.filter((x) => x.online).sort((a, c) => c.level - a.level)) {
      this.body.append(el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 't1', text: b.guild ? `${b.name} «${b.guild}»` : b.name }),
          el('div', { class: 't2', text: `Lv ${b.level} ${b.specId ? SPECS[b.specId].name : CLASSES[b.classId].name} · GS ${Math.round(b.gearScore)} · ${b.activity}` }),
        ]),
      ]));
    }
  }

  private stat(label: string, value: string): HTMLElement {
    return el('div', { class: 'stat' }, [el('span', { text: label }), el('div', { text: value })]);
  }
}

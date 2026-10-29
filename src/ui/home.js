// Home screen: menu pages over the 3D scene. The game owns all state; this class builds the DOM,
// shows the account's items, quests and drops, and forwards clicks.
import { CONFIG } from '../config.js';
import { DESIGNS, CAR_LIST } from '../render/carDesigns.js';
import { GOAL_EXPLOSIONS } from '../render/goalExplosions.js';
import { ITEMS, RARITY, CATEGORIES, UNLOCK_ITEMS, item, itemsIn, key } from '../meta/items.js';
import { questText, questInfo } from '../meta/quests.js';
import { XP_PER_LEVEL } from '../meta/account.js';
import { iconSvg } from './icons.js';
import { anthemSpec } from '../audio/anthems.js';
import { eqSwatch } from './anthemEditor.js';
import { OnlinePage } from './onlinePage.js';
import { PlayersPage } from './playersPage.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + Number(n).toString(16).padStart(6, '0');

const TIPS = [
  'Half flip: back flip, then push forward to cancel it and roll upright. Fastest way to turn around.',
  'Flip reset: touch the ball with all four wheels in the air to get your flip back.',
  'Musty flick: ball on your roof while driving, full jump, hold forward until the nose points down (about half a second), then flip backwards.',
  'Hold Air roll and steer to roll the car in the air, same as the roll left / right keys.',
  'Ball cam (C) keeps the ball on screen. Turn it off for dribbling if you like to see the road.',
  'Quests give Sport Drops. Open them under Drops for new cars, boosts, ball skins and more.',
  'Landing on all four wheels keeps your speed. Roll to match the floor before you land.',
  'Free play: 3 shoots the ball at you. Good for practising first touches and saves.',
  'Every control can be changed in Controls. Click a box, then press the key you want.',
];

// Colors for the small ball-skin swatches in the garage.
const BALL_SWATCH = {
  standard: 'radial-gradient(circle at 35% 30%, #fff, #c9d3e0 60%, #4a5466)',
  beach: 'conic-gradient(#e63232 0 60deg, #fad228 0 120deg, #2878e6 0 180deg, #f5f5f0 0 240deg, #3cbe5a 0 300deg, #fa8c1e 0)',
  eight: 'radial-gradient(circle at 50% 50%, #f6f6f2 0 26%, #0e0e12 27%)',
  midnight: 'radial-gradient(circle at 35% 30%, #3a4a66, #0a0c12 70%)',
  globe: 'radial-gradient(circle at 30% 35%, #3c8c3c 0 18%, transparent 19%), radial-gradient(circle at 65% 60%, #3c8c3c 0 22%, transparent 23%), radial-gradient(circle at 40% 30%, #3a7ad0, #18406e)',
  lava: 'radial-gradient(circle at 35% 30%, #ff9a3a, #5a1a0a 45%, #1a0804 75%)',
  golden: 'radial-gradient(circle at 35% 30%, #fff1b8, #e8ba56 45%, #5c3e16)',
  disco: 'repeating-conic-gradient(#ddd 0 10deg, #777 0 20deg)',
  champion: 'radial-gradient(circle at 35% 30%, #fff6d0 0 8%, transparent 9%), repeating-conic-gradient(#f4c64a 0 30deg, #8a1f2a 0 60deg)',
};

export function itemName(it) {
  if (!it) return '';
  if (it.cat === 'car') return DESIGNS[it.id]?.name || it.name;
  if (it.cat === 'explosion') return GOAL_EXPLOSIONS.find((e) => e.id === it.id)?.name || it.name;
  return it.name;
}

function itemBlurb(it) {
  if (it.cat === 'car') {
    const d = DESIGNS[it.id];
    return d ? `${CONFIG.hitboxes[d.hitbox].label} hitbox` : '';
  }
  if (it.cat === 'explosion') return GOAL_EXPLOSIONS.find((e) => e.id === it.id)?.blurb || '';
  if (it.cat === 'anthem') return it.id === 'none' ? 'Silence' : anthemSpec(it.id)?.blurb || '';
  return '';
}

// A small preview chip for an item (color swatch, icon, banner strip...). Returns an element or null.
export function itemSwatch(it, team = 0) {
  if (it.cat === 'anthem') return it.id === 'none' ? null : eqSwatch();
  const el = document.createElement('span');
  el.className = 'swatchy';
  switch (it.cat) {
    case 'paint':
      el.style.background = it.colors ? `linear-gradient(135deg, ${hex(it.colors[0])} 50%, ${hex(it.colors[1])} 50%)` : 'linear-gradient(135deg, #1f7bff 50%, #ff7a1a 50%)';
      break;
    case 'finish': {
      const f = {
        gloss: 'linear-gradient(135deg, #2a5fbf, #8ab6ff 45%, #2a5fbf 55%)', matte: '#2f4a78', metallic: 'linear-gradient(135deg, #24467e, #b6cff2 50%, #24467e)',
        carbon: 'repeating-linear-gradient(45deg, #1a1c22 0 4px, #2c3038 4px 8px)', pearl: 'linear-gradient(135deg, #e8f0ff, #ffd8f0 40%, #d8fff4 70%, #e8f0ff)',
        glitter: 'radial-gradient(#fff 1px, transparent 1.5px) 0 0 / 6px 6px, #3a5aa8', chrome: 'linear-gradient(180deg, #f4f7fb, #6c7684 48%, #e4e9ef 52%, #8c96a4)',
        spectrum: 'linear-gradient(135deg, #ff6ad5, #c774e8 25%, #8ad0ff 50%, #94ffb0 75%, #ffe27a)',
      }[it.id];
      el.style.background = f || '#555';
      break;
    }
    case 'boost':
      el.style.background = it.rainbow ? 'linear-gradient(90deg, #ff4040, #ffd040, #40ff70, #40c0ff, #b040ff)' : `linear-gradient(90deg, ${hex(it.hot)}, ${hex(it.mid)} 45%, ${hex(it.tail)})`;
      break;
    case 'ball':
      el.classList.add('round');
      el.style.background = BALL_SWATCH[it.id] || '#ccc';
      break;
    case 'icon':
      el.classList.add('icon');
      el.innerHTML = iconSvg(it.id);
      break;
    case 'banner':
      el.style.background = it.css;
      break;
    default:
      return null;
  }
  return el;
}

export class HomeScreen {
  constructor(game) {
    this.game = game;
    this.el = $('home');
    this.page = 'main';
    this.gtab = 'car';
    this.onlinePage = new OnlinePage(game);
    this.playersPage = new PlayersPage(game);
    this.tipIndex = Math.floor(Math.random() * TIPS.length);
    const click = (fn) => () => {
      game.audio.init();
      game.audio.play('click');
      fn();
    };
    this.click = click;

    // Clicking the open page again (or Back / Esc) returns to the main screen.
    document.querySelectorAll('#homeNav button').forEach((b) => b.addEventListener('click', click(() => this.setPage(this.page === b.dataset.page ? 'main' : b.dataset.page))));
    this.el.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', click(() => this.setPage('main'))));
    $('tileQuick').addEventListener('click', click(() => game.startQuickMatch()));
    $('tileFree').addEventListener('click', click(() => game.startFreePlay()));
    $('tileSky').addEventListener('click', click(() => game.startEndless()));
    $('creditsLink').addEventListener('click', click(() => this.setPage('credits')));
    $('arenaPick').addEventListener('click', click(() => this.setPage('arenas')));
    $('carPick').addEventListener('click', click(() => {
      this.gtab = 'car';
      this.setPage('garage');
    }));
    $('pcAccount').addEventListener('click', click(() => game.showLogin()));
    const nameEl = $('pcName');
    nameEl.addEventListener('change', () => game.account.setName(nameEl.value));
    nameEl.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing a name must not drive the menu
      if (e.key === 'Enter' || e.key === 'Escape') nameEl.blur();
    });
    setInterval(() => {
      if (this.el.hidden || this.page !== 'main') return;
      this.tipIndex = (this.tipIndex + 1) % TIPS.length;
      $('tileTip').textContent = TIPS[this.tipIndex];
    }, 9000);

    // Garage tabs.
    document.querySelectorAll('#garageTabs button').forEach((b) => b.addEventListener('click', click(() => {
      this.gtab = b.dataset.gtab;
      this.renderGarage();
      game.onGarageTab(this.gtab);
    })));
    document.querySelectorAll('#teamPreview button').forEach((b) => b.addEventListener('click', click(() => {
      game.previewTeam = Number(b.dataset.team);
      game.previewCar();
      this.refresh();
    })));

    // Drops.
    $('openDrop').addEventListener('click', click(() => this.openDrop()));
    $('revealClose').addEventListener('click', click(() => this.closeReveal()));
    $('revealNext').addEventListener('click', click(() => this.openDrop()));
    $('revealEquip').addEventListener('click', click(() => {
      if (this.revealed) game.equip(CATEGORIES.find((c) => c.id === this.revealed.cat).slot, this.revealed.id);
      this.closeReveal();
    }));

    // Arena cards.
    const list = $('arenaList');
    for (const a of CONFIG.arenas) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arena-card';
      b.dataset.arena = a.id;
      b.setAttribute('role', 'radio');
      const s = document.createElement('span');
      s.className = 'sw';
      s.style.background = `linear-gradient(135deg, ${a.swatch[0]}, ${a.swatch[1]} 55%, ${a.swatch[2]})`;
      const name = document.createElement('b');
      name.textContent = a.name;
      const blurb = document.createElement('small');
      blurb.textContent = a.blurb;
      b.append(s, name, blurb);
      b.addEventListener('click', click(() => game.selectArena(a.id)));
      list.appendChild(b);
    }

    // Drag the car to spin it.
    const view = $('view');
    let dragging = false;
    let lastX = 0;
    view.addEventListener('pointerdown', (e) => {
      if (game.state !== 'home' || this.page === 'arenas') return;
      dragging = true;
      lastX = e.clientX;
      view.setPointerCapture?.(e.pointerId);
    });
    view.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      game.showroom.drag(e.clientX - lastX);
      lastX = e.clientX;
    });
    const stop = () => { dragging = false; };
    view.addEventListener('pointerup', stop);
    view.addEventListener('pointercancel', stop);

    game.account.onChange(() => {
      if (!this.el.hidden) this.refresh();
    });
  }

  show() {
    this.el.hidden = false;
    this.setPage(this.page);
  }

  hide() {
    this.el.hidden = true;
  }

  setPage(name) {
    const was = this.page;
    this.page = name;
    document.querySelectorAll('#homeNav button').forEach((b) => b.classList.toggle('on', b.dataset.page === name));
    this.el.querySelectorAll('.home-page').forEach((p) => { p.hidden = p.dataset.page !== name; });
    // Settings and controls live in the pause menu too; move the one block to wherever it is shown.
    if (name === 'settings') $('homeSettingsSlot').appendChild($('settingsBlock'));
    if (name === 'controls') $('homeControlsSlot').appendChild($('controlsBlock'));
    this.el.classList.toggle('arena-view', name === 'arenas');
    for (const c of [...this.el.classList]) if (c.startsWith('page-')) this.el.classList.remove(c);
    this.el.classList.add(`page-${name}`);
    this.game.onHomePage(name);
    if (name === 'garage') this.game.onGarageTab(this.gtab);
    this.refresh();
    if (was === 'online' && name !== 'online') this.onlinePage.shown(false);
    if (name === 'online') this.onlinePage.shown(true);
    if (name === 'players' && was !== 'players') this.playersPage.shown();
  }

  // ------------------------------------------------------------------ garage
  renderGarage() {
    const acc = this.game.account;
    const lo = acc.loadout;
    document.querySelectorAll('#garageTabs button').forEach((b) => b.classList.toggle('on', b.dataset.gtab === this.gtab));
    const body = $('garageBody');
    body.textContent = '';
    const section = (label, cat) => {
      const f = document.createElement('div');
      f.className = 'field';
      const l = document.createElement('span');
      l.className = 'field-label';
      const items = itemsIn(cat);
      const owned = items.filter((it) => acc.owns(cat, it.id)).length;
      l.textContent = `${label} ${owned}/${items.length}`;
      f.appendChild(l);
      const grid = document.createElement('div');
      grid.className = `item-grid${cat === 'car' || cat === 'explosion' || cat === 'anthem' ? ' wide-cards' : ''}`;
      const slot = CATEGORIES.find((c) => c.id === cat).slot;
      // Owned first, then locked by rarity.
      const order = Object.keys(RARITY);
      const sorted = [...items].sort((a, b) => (acc.owns(cat, b.id) - acc.owns(cat, a.id)) || order.indexOf(a.rarity) - order.indexOf(b.rarity));
      for (const it of sorted) {
        const own = acc.owns(cat, it.id);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'item-card';
        b.dataset.rarity = it.rarity;
        b.style.setProperty('--rar', RARITY[it.rarity].color);
        if (!own) b.classList.add('locked');
        if (lo[slot] === it.id) b.classList.add('on');
        const sw = itemSwatch(it, this.game.previewTeam);
        if (sw) b.appendChild(sw);
        const t = document.createElement('span');
        t.className = 'item-text';
        const n = document.createElement('b');
        n.textContent = cat === 'title' ? itemName(it).toUpperCase() : itemName(it);
        const sm = document.createElement('small');
        const un = it.unlock;
        const prog = un ? `${Math.min(un.goal, acc.stat(un.stat))}/${un.goal}` : '';
        sm.textContent = own ? itemBlurb(it) || (it.starter ? 'Starter' : RARITY[it.rarity].name) : un ? `${un.text} · ${prog}` : `${RARITY[it.rarity].name} · from drops`;
        t.append(n, sm);
        if (un && !own) {
          const bar = document.createElement('i');
          bar.className = 'unlock-bar';
          bar.style.setProperty('--p', `${Math.min(1, acc.stat(un.stat) / un.goal) * 100}%`);
          t.appendChild(bar);
        }
        b.appendChild(t);
        b.title = own ? itemName(it) : un ? `${itemName(it)}: ${un.text} (${prog}). Never in drops.` : `${itemName(it)}: get it from Sport Drops`;
        b.addEventListener('click', this.click(() => {
          if (!own) return;
          this.game.equip(slot, it.id);
          if (cat === 'explosion') this.game.previewExplosion(it.id);
          if (cat === 'anthem') this.game.previewAnthem(it.id);
        }));
        grid.appendChild(b);
      }
      f.appendChild(grid);
      body.appendChild(f);
    };
    switch (this.gtab) {
      case 'car':
        section('Cars', 'car');
        break;
      case 'paint': {
        const f = document.createElement('div');
        f.className = 'field';
        const l = document.createElement('span');
        l.className = 'field-label';
        l.textContent = 'Accent';
        const sw = document.createElement('div');
        sw.className = 'swatches';
        for (const a of CONFIG.accents) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'swatch';
          b.title = a.name;
          b.setAttribute('aria-label', a.name);
          b.style.background = hex(a.hex);
          if (lo.accent === a.id) b.classList.add('on');
          b.addEventListener('click', this.click(() => this.game.equip('accent', a.id)));
          sw.appendChild(b);
        }
        f.append(l, sw);
        body.appendChild(f);
        section('Paint color', 'paint');
        section('Finish', 'finish');
        section('Decal', 'decal');
        break;
      }
      case 'boost':
        section('Boost', 'boost');
        break;
      case 'ball':
        section('Ball skin', 'ball');
        break;
      case 'explosion':
        section('Goal explosion (click to preview)', 'explosion');
        break;
      case 'anthem':
        section('Anthem: plays when you score (click to listen)', 'anthem');
        this.game.uploads.render(body);
        break;
      case 'player':
        section('Icon', 'icon');
        section('Banner', 'banner');
        section('Title', 'title');
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ quests and drops
  renderQuests() {
    const acc = this.game.account;
    const list = $('questList');
    list.textContent = '';
    for (const q of acc.data.quests) {
      const info = questInfo(q);
      const card = document.createElement('div');
      card.className = 'quest';
      const top = document.createElement('div');
      top.className = 'quest-top';
      const t = document.createElement('b');
      t.textContent = questText(q);
      const r = document.createElement('span');
      r.className = 'quest-reward';
      r.textContent = q.drops > 1 ? `${q.drops} drops` : '1 drop';
      top.append(t, r);
      const bar = document.createElement('div');
      bar.className = 'pc-xp big';
      const fill = document.createElement('i');
      fill.style.width = `${(q.progress / q.goal) * 100}%`;
      bar.appendChild(fill);
      const sm = document.createElement('small');
      sm.textContent = `${q.progress} / ${q.goal}${info.matchOnly ? ' · matches against bots' : ' · any mode, free play too'}`;
      card.append(top, bar, sm);
      list.appendChild(card);
    }
    const lvl = acc.level();
    $('qLevel').textContent = lvl;
    $('qXp').style.width = `${((acc.data.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100}%`;
    $('qLevelNote').textContent = `${XP_PER_LEVEL - (acc.data.xp % XP_PER_LEVEL)} XP to level ${lvl + 1} (next drop)`;
  }

  renderDrops() {
    const acc = this.game.account;
    $('dropCount').textContent = acc.data.drops;
    $('openDrop').disabled = acc.data.drops <= 0;
    $('crate').classList.toggle('empty', acc.data.drops <= 0);
    const col = $('collection');
    col.textContent = '';
    for (const c of CATEGORIES) {
      const items = itemsIn(c.id).filter((it) => !it.starter && !it.unlock);
      const owned = items.filter((it) => acc.data.owned.includes(key(c.id, it.id))).length;
      const row = document.createElement('div');
      row.className = 'col-row';
      const n = document.createElement('span');
      n.textContent = c.name;
      const bar = document.createElement('div');
      bar.className = 'pc-xp';
      const fill = document.createElement('i');
      fill.style.width = `${(owned / Math.max(1, items.length)) * 100}%`;
      bar.appendChild(fill);
      const v = document.createElement('b');
      v.textContent = `${owned}/${items.length}`;
      row.append(n, bar, v);
      col.appendChild(row);
    }
    // Achievement items: earned from lifetime match stats, listed with progress.
    const ach = $('achievements');
    ach.textContent = '';
    for (const it of UNLOCK_ITEMS) {
      const un = it.unlock;
      const have = acc.owns(it.cat, it.id);
      const val = Math.min(un.goal, acc.stat(un.stat));
      const row = document.createElement('div');
      row.className = `ach-row${have ? ' done' : ''}`;
      const n = document.createElement('span');
      const nb = document.createElement('b');
      nb.textContent = it.cat === 'title' ? itemName(it).toUpperCase() : itemName(it);
      const ns = document.createElement('small');
      ns.textContent = `${CATEGORIES.find((c) => c.id === it.cat).name.replace(/s$/, '')} · ${un.text}`;
      n.append(nb, ns);
      const bar = document.createElement('div');
      bar.className = 'pc-xp';
      const fill = document.createElement('i');
      fill.style.width = `${(val / un.goal) * 100}%`;
      bar.appendChild(fill);
      const v = document.createElement('b');
      v.textContent = have ? 'DONE' : `${val}/${un.goal}`;
      row.append(n, bar, v);
      ach.appendChild(row);
    }
  }

  openDrop() {
    const res = this.game.openDrop();
    if (!res) {
      this.closeReveal();
      return;
    }
    const card = $('revealCard');
    const overlay = $('reveal');
    overlay.hidden = false;
    this.game.anthems.stop(0.3);
    card.classList.remove('show');
    card.classList.add('opening');
    this.revealed = res.item;
    const it = res.item;
    const rar = it ? RARITY[it.rarity] : RARITY.common;
    card.style.setProperty('--rar', rar.color);
    $('revealRarity').textContent = it ? rar.name : 'Bonus';
    $('revealName').textContent = it ? (it.cat === 'title' ? itemName(it).toUpperCase() : itemName(it)) : `+${res.xp} XP`;
    $('revealCat').textContent = it ? CATEGORIES.find((c) => c.id === it.cat).name.replace(/s$/, '') : 'You own every item';
    const art = $('revealArt');
    art.textContent = '';
    const sw = it ? itemSwatch(it, this.game.previewTeam) : null;
    if (sw) art.appendChild(sw);
    else {
      const g = document.createElement('span');
      g.className = 'reveal-glyph';
      g.textContent = it ? (it.cat === 'car' ? 'CAR' : it.cat === 'explosion' ? 'GOAL' : it.cat === 'decal' ? 'DECAL' : it.cat === 'anthem' ? 'SONG' : 'TITLE') : 'XP';
      art.appendChild(g);
    }
    $('revealEquip').hidden = !it;
    $('revealNext').hidden = this.game.account.data.drops <= 0;
    // Crate shake, then the reveal.
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => {
      card.classList.remove('opening');
      card.classList.add('show');
      this.game.audio.play(it && (it.rarity === 'epic' || it.rarity === 'legendary') ? 'goal' : 'padBig');
      if (it && it.cat === 'anthem') setTimeout(() => this.game.previewAnthem(it.id), 500);
    }, 900);
  }

  closeReveal() {
    clearTimeout(this.revealTimer);
    this.game.anthems.stop(0.5);
    $('reveal').hidden = true;
    this.revealed = null;
    this.refresh();
  }

  // ------------------------------------------------------------------ refresh
  refresh() {
    const s = this.game.settings;
    const acc = this.game.account;
    const lo = acc.loadout;
    document.querySelectorAll('#arenaList .arena-card').forEach((b) => {
      const on = b.dataset.arena === s.arena;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });
    document.querySelectorAll('#teamPreview button').forEach((b) => b.classList.toggle('on', Number(b.dataset.team) === this.game.previewTeam));
    const car = CAR_LIST.find((c) => c.id === lo.car) || CAR_LIST[0];
    const hb = CONFIG.hitboxes[car.hitbox];
    const arena = CONFIG.arenas.find((a) => a.id === s.arena) || CONFIG.arenas[0];
    $('carPickName').textContent = car.name;
    $('arenaPickName').textContent = arena.name;
    $('homeCarName').textContent = car.name.toUpperCase();
    $('homeCarClass').textContent = `${hb.label} hitbox`;
    $('homeCarBlurb').textContent = `${car.blurb} ${hb.blurb}`;
    // Main screen tiles.
    const quickMode = s.mode === 'free' ? s.teamMode || '1v1' : s.mode;
    $('tileQuickMode').textContent = quickMode.toUpperCase();
    $('tileQuickInfo').textContent = `${s.difficulty[0].toUpperCase()}${s.difficulty.slice(1)} bots · ${arena.name}`;
    $('tileTip').textContent = TIPS[this.tipIndex];
    // Player card.
    const d = acc.data;
    $('pcLevel').textContent = acc.level();
    $('pcXp').style.width = `${((d.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100}%`;
    if (document.activeElement !== $('pcName')) $('pcName').value = d.name;
    $('pcTitle').textContent = itemName(item('title', lo.title)).toUpperCase();
    const badge = this.game.account.mode === 'online' ? this.game.account.badge : null;
    const pb = $('pcBadge');
    pb.hidden = !badge;
    if (badge) {
      pb.className = `badge-pill ${badge}`;
      pb.textContent = badge === 'owner' ? 'Owner' : 'Tester';
    }
    $('pcIcon').innerHTML = iconSvg(lo.icon);
    $('playerCard').style.background = (item('banner', lo.banner) || item('banner', 'default')).css;
    $('pcMode').textContent = acc.mode === 'online' ? 'ONLINE' : 'GUEST';
    $('playerCard').classList.toggle('online', acc.mode === 'online');
    $('pcRecord').textContent = `${d.matches} ${d.matches === 1 ? 'match' : 'matches'} · ${d.wins} ${d.wins === 1 ? 'win' : 'wins'} · ${d.goals} ${d.goals === 1 ? 'goal' : 'goals'} · ${d.mvps} MVP`;
    $('dropBadge').hidden = d.drops <= 0;
    $('dropBadge').textContent = d.drops;
    document.querySelectorAll('#modeGroup button').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
    document.querySelectorAll('#diffGroup button').forEach((b) => b.classList.toggle('on', b.dataset.diff === s.difficulty));
    if (this.page === 'garage') this.renderGarage();
    if (this.page === 'quests') this.renderQuests();
    if (this.page === 'drops') this.renderDrops();
  }
}

export { ITEMS };

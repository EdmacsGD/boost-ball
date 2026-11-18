// Orb Shop and Season Pass pages. The server decides everything (prices, orbs, what you own);
// these pages show account.eco and call the account's buy and claim functions.
import { item, RARITY } from '../meta/items.js';
import { ItemThumbs, orbSvg } from '../render/itemThumbs.js';
import { SHOP, PRICE, PREMIUM_PASS_PRICE, PASS_TIERS, PASS_XP_PER_TIER, ORB_RULES, passFor, seasonName, seasonEnd, seasonKey } from '../meta/economy.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const catName = { car: 'Car', topper: 'Topper' };
const splitKey = (k) => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
const orbs = (n) => `${Number(n).toLocaleString('en')} orbs`;

function timeLeft() {
  const ms = seasonEnd() - Date.now();
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d} days ${h} h left` : `${h} h left`;
}

export class ShopPage {
  constructor(game) {
    this.game = game;
    this.busy = false;
    game.account.onChange(() => this.refreshChip());
  }

  get acc() {
    return this.game.account;
  }

  thumb(k) {
    if (!this.thumbs) this.thumbs = new ItemThumbs(this.game.renderer.renderer);
    try {
      return this.thumbs.url(k);
    } catch {
      return null;
    }
  }

  pic(k, cls = 'item-pic') {
    const u = this.thumb(k);
    if (!u) return null;
    const img = el('img', cls);
    img.src = u;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  orbIcon(cls = 'orb-ico') {
    const i = el('span', cls);
    i.innerHTML = orbSvg();
    return i;
  }

  // Orbs on the Shop menu button, a dot on Season Pass when a reward is waiting.
  refreshChip() {
    const e = this.acc.eco;
    const chip = $('orbChip');
    if (chip) {
      chip.hidden = !e;
      if (e) chip.textContent = Number(e.orbs).toLocaleString('en');
    }
    const badge = $('passBadge');
    if (badge) {
      const n = e ? this.claimable(e).length : 0;
      badge.hidden = !n;
      badge.textContent = n;
    }
    const note = $('passNavNote');
    if (note && e) note.textContent = `Tier ${this.tierOf(e)}/${PASS_TIERS} · ${timeLeft()}`;
  }

  tierOf(e) {
    return Math.min(PASS_TIERS, Math.floor((Number(e.pass_xp) || 0) / PASS_XP_PER_TIER));
  }

  claimable(e) {
    const tier = this.tierOf(e);
    const claimed = new Set(e.claims || []);
    return passFor(e.season || seasonKey()).filter((r) => r.tier <= tier && (r.track === 'free' || e.premium) && !claimed.has(`${r.track}:${r.tier}`));
  }

  async shown(name) {
    this.render(name);
    if (this.acc.serverStats) {
      await this.acc.loadEconomy();
      this.render(name);
    }
  }

  render(name) {
    if (name === 'shop') this.renderShop();
    if (name === 'pass') this.renderPass();
    this.refreshChip();
  }

  signInNote(body) {
    body.replaceChildren(el('p', 'page-note', 'Sign in with an online account to earn and spend orbs. Orbs are kept on the server, so they are the same on every device.'));
  }

  orbBar() {
    const e = this.acc.eco;
    const bar = $('shopOrbBar');
    bar.replaceChildren();
    if (!e) return;
    const big = el('b', 'orb-big');
    big.appendChild(this.orbIcon('orb-ico big'));
    big.appendChild(document.createTextNode(Number(e.orbs).toLocaleString('en')));
    bar.appendChild(big);
    const how = el('small', 'orb-how', `Earn orbs: ${ORB_RULES.per15Min} every 15 min of play (next in ${Math.ceil((e.next_play || 900) / 60)} min) · ${ORB_RULES.perGoal} per goal · ${ORB_RULES.perSave} per save · ${ORB_RULES.perClipView} per clip view and ${ORB_RULES.perClipLike} per like on your clips (up to ${ORB_RULES.clipDailyCap} a day, ${e.clip_today || 0} today)`);
    bar.appendChild(how);
  }

  async act(fn, okText) {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
      this.game.audio.play('go');
      if (okText) this.game.toast(okText);
    } catch (err) {
      const m = String((err && (err.message || err.msg)) || err);
      this.game.toast(m.includes('not enough') ? 'Not enough orbs' : m.includes('already') ? 'You already have that' : `Could not do that: ${m.slice(0, 80)}`);
    }
    this.busy = false;
    this.render(this.game.home.page);
  }

  renderShop() {
    const body = $('shopBody');
    if (!this.acc.serverStats) { $('shopOrbBar').replaceChildren(); return this.signInNote(body); }
    this.orbBar();
    const e = this.acc.eco;
    body.replaceChildren();
    const winter = (e?.season || seasonKey()).match(/-(12|01|02)$/);
    const groups = [
      ['Winter', SHOP.filter(([k]) => ['topper:beanie', 'topper:holiday', 'topper:antlers'].includes(k))],
      ['Cars', SHOP.filter(([k]) => k.startsWith('car:'))],
      ['Toppers', SHOP.filter(([k]) => k.startsWith('topper:') && !['topper:beanie', 'topper:holiday', 'topper:antlers'].includes(k))],
    ];
    if (!winter) groups.push(groups.shift());
    for (const [title, rows] of groups) {
      body.appendChild(el('span', 'field-label shop-head', title));
      const grid = el('div', 'shop-grid');
      for (const [k, rarity] of rows) {
        const [cat, id] = splitKey(k);
        const it = item(cat, id);
        if (!it) continue;
        const owned = this.acc.data.owned.includes(k);
        const price = PRICE[rarity];
        const card = el('div', `shop-card${owned ? ' owned' : ''}`);
        card.style.setProperty('--rar', RARITY[rarity].color);
        const pic = this.pic(k, 'shop-pic');
        if (pic) card.appendChild(pic);
        card.appendChild(el('small', 'shop-kind', `${catName[cat] || cat} · ${RARITY[rarity].name}`));
        card.appendChild(el('b', 'shop-name', it.name));
        const row = el('div', 'shop-row');
        const prev = el('button', 'small-btn', 'Preview');
        prev.type = 'button';
        prev.addEventListener('click', () => this.peek(k, price));
        row.appendChild(prev);
        if (owned) {
          const eq = el('button', 'small-btn', this.acc.loadout[cat] === id ? 'Equipped' : 'Equip');
          eq.type = 'button';
          eq.disabled = this.acc.loadout[cat] === id;
          eq.addEventListener('click', () => { this.acc.equip(cat, id); this.game.previewCar(); this.renderShop(); });
          row.appendChild(eq);
        } else {
          const buy = el('button', 'small-btn buy');
          buy.appendChild(this.orbIcon());
          buy.appendChild(document.createTextNode(price.toLocaleString('en')));
          buy.type = 'button';
          buy.disabled = !e || Number(e.orbs) < price;
          buy.addEventListener('click', () => this.act(() => this.acc.buyItem(k), `${it.name} is yours`));
          row.appendChild(buy);
        }
        card.appendChild(row);
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }
    body.appendChild(el('p', 'page-note', 'Items from the shop and the Season Pass are never in Sport Drops. Ice Crown, Snow Drift, Halo and Shades are only in the pass.'));
  }

  // Show an item on your car in the showroom behind the page (without equipping it).
  preview(cat, id) {
    const lo = { ...this.acc.loadout, [cat]: id };
    this.game.previewCar(lo);
  }

  // Preview button: the menus slide away so you see the car, with a bar to buy or go back.
  peek(k, price) {
    const [cat, id] = splitKey(k);
    const it = item(cat, id);
    this.preview(cat, id);
    const home = this.game.home.el;
    home.classList.add('shop-peek');
    let bar = $('shopPeek');
    if (!bar) {
      bar = el('div', 'shop-peek-bar');
      bar.id = 'shopPeek';
      home.appendChild(bar);
    }
    bar.replaceChildren();
    const pic = this.pic(k, 'peek-pic');
    if (pic) bar.appendChild(pic);
    const info = el('div', 'peek-info');
    info.appendChild(el('small', 'shop-kind', `${catName[cat] || cat} · ${RARITY[it.rarity].name}`));
    info.appendChild(el('b', 'shop-name', it.name));
    info.appendChild(el('small', 'peek-hint', 'Drag the car to spin it'));
    bar.appendChild(info);
    bar.style.setProperty('--rar', RARITY[it.rarity].color);
    const owned = this.acc.data.owned.includes(k);
    const e = this.acc.eco;
    if (owned) {
      const eq = el('button', 'kick', this.acc.loadout[cat] === id ? 'Equipped' : 'Equip');
      eq.type = 'button';
      eq.disabled = this.acc.loadout[cat] === id;
      eq.addEventListener('click', () => { this.acc.equip(cat, id); this.unpeek(); });
      bar.appendChild(eq);
    } else if (price != null) {
      const buy = el('button', 'kick buy');
      buy.type = 'button';
      buy.appendChild(this.orbIcon());
      buy.appendChild(document.createTextNode(`Buy · ${price.toLocaleString('en')}`));
      buy.disabled = !e || Number(e.orbs) < price;
      buy.addEventListener('click', () => this.act(() => this.acc.buyItem(k), `${it.name} is yours`).then(() => this.peek(k, price)));
      bar.appendChild(buy);
    }
    const back = el('button', 'back', 'Back');
    back.type = 'button';
    back.appendChild(el('kbd', null, 'Esc'));
    back.addEventListener('click', () => this.unpeek());
    bar.appendChild(back);
    this.peeking = true;
  }

  unpeek() {
    if (!this.peeking) return false;
    this.peeking = false;
    this.game.home.el.classList.remove('shop-peek');
    $('shopPeek')?.remove();
    this.game.previewCar();
    this.render(this.game.home.page);
    return true;
  }

  renderPass() {
    const body = $('passBody');
    const e = this.acc.eco;
    const key = e?.season || seasonKey();
    $('passTitle').textContent = seasonName(key);
    if (!this.acc.serverStats) return this.signInNote(body);
    body.replaceChildren();
    const tier = e ? this.tierOf(e) : 0;
    const xp = e ? Number(e.pass_xp) || 0 : 0;
    const head = el('div', 'pass-head');
    head.appendChild(el('b', 'pass-tier', `Tier ${tier} / ${PASS_TIERS}`));
    const bar = el('div', 'pass-xp');
    const fill = el('i');
    fill.style.width = `${tier >= PASS_TIERS ? 100 : ((xp % PASS_XP_PER_TIER) / PASS_XP_PER_TIER) * 100}%`;
    bar.appendChild(fill);
    head.appendChild(bar);
    head.appendChild(el('small', 'pass-note', `${tier >= PASS_TIERS ? 'Pass complete' : `${xp % PASS_XP_PER_TIER} / ${PASS_XP_PER_TIER} XP to the next tier`} · match XP counts · ${timeLeft()}. Ranked season ends at the same time: Rank goes halfway back to 1000.`));
    if (e && !e.premium) {
      const buy = el('button', 'kick', `Get Premium · ${orbs(PREMIUM_PASS_PRICE)}`);
      buy.type = 'button';
      buy.disabled = Number(e.orbs) < PREMIUM_PASS_PRICE;
      buy.addEventListener('click', () => this.act(() => this.acc.buyPremiumPass(), 'Premium pass unlocked'));
      head.appendChild(buy);
      head.appendChild(el('small', 'pass-note', `You have ${orbs(e.orbs)}. Premium has a reward on every tier, including the new cars.`));
    } else if (e) head.appendChild(el('span', 'pass-premium', 'PREMIUM'));
    body.appendChild(head);

    const claimed = new Set(e?.claims || []);
    const rewards = passFor(key);
    // Showcase: the biggest premium rewards, large.
    const show = el('div', 'pass-show');
    for (const r of rewards.filter((x) => x.track === 'premium' && x.item && (x.tier >= 20 || x.tier === 8 || x.tier === 15)).slice(-4)) {
      const [cat, id] = splitKey(r.item);
      const it = item(cat, id);
      const c = el('div', 'pass-show-card');
      c.style.setProperty('--rar', RARITY[it.rarity].color);
      const pic = this.pic(r.item, 'pass-show-pic');
      if (pic) c.appendChild(pic);
      c.appendChild(el('b', null, it.name));
      c.appendChild(el('small', null, `Tier ${r.tier} · Premium`));
      c.addEventListener('click', () => this.peek(r.item, null));
      show.appendChild(c);
    }
    body.appendChild(show);

    const strip = el('div', 'pass-strip');
    const lanes = el('div', 'pass-lanes');
    lanes.appendChild(el('span', 'lane premium', 'PREMIUM'));
    lanes.appendChild(el('span', 'lane free', 'FREE'));
    strip.appendChild(lanes);
    for (let t = 1; t <= PASS_TIERS; t++) {
      const col = el('div', `pass-col${t <= tier ? ' reached' : ''}${t === tier + 1 ? ' next' : ''}`);
      col.appendChild(el('span', 'pass-num', String(t)));
      for (const track of ['premium', 'free']) {
        const r = rewards.find((x) => x.tier === t && x.track === track);
        const cell = el('div', `pass-cell ${track}${r ? '' : ' empty'}`);
        if (r) {
          const [cat, id] = r.item ? splitKey(r.item) : [null, null];
          const it = r.item ? item(cat, id) : null;
          if (it) {
            cell.style.setProperty('--rar', RARITY[it.rarity].color);
            const pic = this.pic(r.item, 'pass-pic');
            if (pic) cell.appendChild(pic);
            cell.appendChild(el('span', 'pass-reward', it.name));
            cell.addEventListener('click', (ev) => { if (ev.target.tagName !== 'BUTTON') this.peek(r.item, null); });
            cell.classList.add('has-item');
          } else {
            cell.classList.add('orbs');
            cell.appendChild(this.orbIcon('orb-ico pass'));
            cell.appendChild(el('span', 'pass-reward', `${r.orbs}`));
          }
          const k = `${track}:${t}`;
          if (claimed.has(k)) cell.classList.add('claimed');
          else if (t <= tier && (track === 'free' || e?.premium)) {
            cell.classList.add('ready');
            const b = el('button', 'claim-btn', 'Claim');
            b.type = 'button';
            b.addEventListener('click', () => this.act(() => this.acc.claimPass(t, track), it ? `${it.name} unlocked` : `+${r.orbs} orbs`));
            cell.appendChild(b);
          } else if (track === 'premium' && !e?.premium) cell.classList.add('locked');
        }
        col.appendChild(cell);
      }
      strip.appendChild(col);
    }
    body.appendChild(strip);
    // Scroll the strip to the next tier you are working on.
    requestAnimationFrame(() => {
      const next = strip.querySelector('.pass-col.next') || strip.querySelector('.pass-col.reached:last-of-type');
      if (next) strip.scrollLeft = Math.max(0, next.offsetLeft - strip.clientWidth / 2);
    });
    body.appendChild(el('p', 'page-note', 'Scroll sideways for all 30 tiers. Click an item to see it on your car. A pass item you already bought gives its price back in orbs.'));
  }
}

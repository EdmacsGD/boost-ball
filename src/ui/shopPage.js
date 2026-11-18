// Orb Shop and Season Pass pages. The server decides everything (prices, orbs, what you own);
// these pages show account.eco and call the account's buy and claim functions.
import { item, RARITY } from '../meta/items.js';
import { ItemThumbs, orbSvg } from '../render/itemThumbs.js';
import { itemName, itemSwatch } from './home.js';
import { BUNDLES, bundlePrice, seasonTheme, SHOP, PRICE, PREMIUM_PASS_PRICE, PASS_TIERS, PASS_XP_PER_TIER, ORB_RULES, passFor, seasonName, seasonEnd, seasonKey } from '../meta/economy.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const catName = { car: 'Car', topper: 'Topper', explosion: 'Goal explosion', boost: 'Boost', ball: 'Ball' };
const splitKey = (k) => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
const orbs = (n) => `${Number(n).toLocaleString('en')} orbs`;

const todayKey = () => new Date().toISOString().slice(0, 10);

// Picture for a goal explosion tile: a burst in the explosion's colors.
const BURST = {
  tsunami: ['#7fe3ff', '#1d6fd6'], portal: ['#c8f2ff', '#7a3cff'], kraken: ['#7dffd8', '#5a1d9e'], phoenix: ['#ffe27a', '#e8401c'],
  aurora: ['#9dffb8', '#6a3cd6'], bigbang: ['#ffffff', '#2a1a7a'],
};
let burstN = 0;
function burst(id) {
  const [a, b] = BURST[id] || ['#ffffff', '#3a6cff'];
  const g = `bvb${burstN++}`;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const t = (i / 12) * Math.PI * 2, r = i % 2 ? 30 : 44;
    return `${(50 + Math.cos(t) * r).toFixed(1)},${(50 + Math.sin(t) * r).toFixed(1)} ${(50 + Math.cos(t + 0.26) * 12).toFixed(1)},${(50 + Math.sin(t + 0.26) * 12).toFixed(1)}`;
  }).join(' ');
  const s = document.createElement('span');
  s.className = 'bv-burst';
  s.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="${g}"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#${g})" opacity="0.55"/><polygon points="${rays}" fill="${a}" opacity="0.9"/><circle cx="50" cy="50" r="10" fill="#fff"/></svg>`;
  return s;
}

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
    this.renderBundles(body, e);
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
    body.appendChild(el('p', 'page-note', 'Shop cars are never in Sport Drops. Hats from the shop can also drop. Ice Crown, Snow Drift, Halo and Shades are only in the pass.'));
  }

  owns(k) {
    const [cat, id] = splitKey(k);
    return this.acc.owns(cat, id);
  }

  // Bundles: one card each with the car's picture and a list of what is inside.
  renderBundles(body, e) {
    const key = e?.season || seasonKey();
    body.appendChild(el('span', 'field-label shop-head', 'Bundles'));
    const grid = el('div', 'shop-grid bundle-grid');
    for (const b of BUNDLES) {
      const forSale = !b.theme || seasonTheme(key) === b.theme;
      const p = bundlePrice(b, (k) => this.owns(k));
      const top = b.items[0][1] === 'legendary' || b.items.some(([, r]) => r === 'legendary') ? 'legendary' : b.items.some(([, r]) => r === 'epic') ? 'epic' : 'rare';
      const card = el('div', `shop-card bundle-card${p.missing ? '' : ' owned'}`);
      card.style.setProperty('--rar', RARITY[top].color);
      const pic = this.pic(b.items[0][0], 'shop-pic');
      if (pic) card.appendChild(pic);
      card.appendChild(el('small', 'shop-kind', `Bundle · ${b.items.length} items${b.theme === 'winter' ? ' · Winter' : ''}`));
      card.appendChild(el('b', 'shop-name', b.name));
      card.appendChild(el('small', 'bundle-blurb', b.blurb));
      card.appendChild(this.bundleList(b));
      const row = el('div', 'shop-row');
      const prev = el('button', 'small-btn', 'Preview');
      prev.type = 'button';
      prev.addEventListener('click', () => this.peekBundle(b));
      row.appendChild(prev);
      row.appendChild(this.bundleBuy(b, p, forSale, e, 'small-btn buy'));
      card.appendChild(row);
      if (p.missing && p.missing < b.items.length) card.appendChild(el('small', 'bundle-note', `You have ${b.items.length - p.missing} of ${b.items.length}, so you only pay for the rest.`));
      else if (p.missing) card.appendChild(el('small', 'bundle-note', `Worth ${p.full.toLocaleString('en')} on its own: save ${(p.full - p.price).toLocaleString('en')}.`));
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  bundleList(b) {
    const ul = el('ul', 'bundle-list');
    for (const [k, r] of b.items) {
      const [cat, id] = splitKey(k);
      const it = item(cat, id);
      if (!it) continue;
      const li = el('li', this.owns(k) ? 'have' : null);
      li.style.setProperty('--rar', RARITY[r].color);
      li.appendChild(el('i', 'rar-dot'));
      li.appendChild(el('span', 'bl-cat', catName[cat] || cat));
      li.appendChild(el('b', null, itemName(it)));
      if (this.owns(k)) li.appendChild(el('small', 'bl-have', 'owned'));
      ul.appendChild(li);
    }
    return ul;
  }

  bundleBuy(b, p, forSale, e, cls) {
    if (!p.missing) {
      const done = el('button', cls.replace(' buy', ''), 'Owned');
      done.type = 'button';
      done.disabled = true;
      return done;
    }
    if (!forSale) {
      const soon = el('button', cls.replace(' buy', ''), 'December to February');
      soon.type = 'button';
      soon.disabled = true;
      return soon;
    }
    const buy = el('button', cls);
    buy.type = 'button';
    buy.appendChild(this.orbIcon());
    buy.appendChild(document.createTextNode(p.price.toLocaleString('en')));
    buy.disabled = !e || Number(e.orbs) < p.price;
    buy.addEventListener('click', () => this.act(() => this.acc.buyBundle(b.id), `${b.name} is yours`).then(() => { if (this.peeking) this.peekBundle(b); }));
    return buy;
  }

  // Bundle view: the menus slide away, the bundle's name on the left, your car with everything on
  // it in the middle and one tile per item on the right. `offer`: shown by itself after a match.
  peekBundle(b, offer = false) {
    const lo = { ...this.acc.loadout };
    for (const [k] of b.items) {
      const [cat, id] = splitKey(k);
      lo[cat] = id;
    }
    this.game.previewCar(lo);
    const boost = b.items.find(([k]) => k.startsWith('boost:'));
    if (boost) { const bi = item('boost', splitKey(boost[0])[1]); if (bi) this.game.showroom.setBoost(bi); }
    const ball = b.items.find(([k]) => k.startsWith('ball:'));
    if (ball) this.game.showroom.setBall(splitKey(ball[0])[1]);

    const home = this.game.home.el;
    home.classList.add('shop-peek');
    $('shopPeek')?.remove();
    let v = $('bundleView');
    if (!v) {
      v = el('div', 'bundle-view');
      v.id = 'bundleView';
      home.appendChild(v);
    }
    v.replaceChildren();
    v.classList.toggle('offer', offer);
    const e = this.acc.eco;
    const p = bundlePrice(b, (k) => this.owns(k));
    const forSale = !b.theme || seasonTheme(e?.season || seasonKey()) === b.theme;

    // Left: the name.
    const head = el('div', 'bv-head');
    if (offer) head.appendChild(el('span', 'bv-tag', 'In the Orb Shop now'));
    head.appendChild(el('h2', 'bv-name', b.name));
    head.appendChild(el('span', 'bv-sub', `Bundle · ${b.items.length} items${b.theme === 'winter' ? ' · Winter only' : ''}`));
    head.appendChild(el('p', 'bv-blurb', b.blurb));
    v.appendChild(head);

    // Right: one tile per item.
    const tiles = el('div', 'bv-tiles');
    for (const [k, r] of b.items) {
      const [cat, id] = splitKey(k);
      const it = item(cat, id);
      if (!it) continue;
      const t = el('button', `bv-tile${this.owns(k) ? ' have' : ''}`);
      t.type = 'button';
      t.style.setProperty('--rar', RARITY[r].color);
      t.appendChild(el('span', 'bv-cat', catName[cat] || cat));
      t.appendChild(el('b', 'bv-item', itemName(it)));
      const art = el('span', 'bv-art');
      const pic = cat === 'car' || cat === 'topper' ? this.pic(k, 'bv-pic') : cat === 'explosion' ? burst(id) : itemSwatch(it, this.game.previewTeam);
      if (pic) art.appendChild(pic);
      t.appendChild(art);
      t.appendChild(el('span', 'bv-foot', this.owns(k) ? 'Owned' : RARITY[r].name));
      if (cat === 'explosion') {
        t.title = 'Play this goal explosion';
        t.appendChild(el('span', 'bv-play', 'Play'));
        t.addEventListener('click', () => this.game.previewExplosion(id));
      } else t.tabIndex = -1;
      tiles.appendChild(t);
    }
    v.appendChild(tiles);

    // Bottom: price and buttons.
    const foot = el('div', 'bv-foot-row');
    const price = el('div', 'bv-price');
    if (p.missing && forSale) {
      price.appendChild(el('s', null, p.full.toLocaleString('en')));
      price.appendChild(el('small', null, p.missing < b.items.length ? `You have ${b.items.length - p.missing}, you pay for the rest` : `Save ${(p.full - p.price).toLocaleString('en')} orbs`));
    }
    foot.appendChild(price);
    foot.appendChild(this.bundleBuy(b, p, forSale, e, 'kick buy'));
    if (offer) {
      const shop = el('button', 'small-btn', 'All bundles');
      shop.type = 'button';
      shop.addEventListener('click', () => { this.unpeek(); this.game.home.setPage('shop'); });
      foot.appendChild(shop);
      const mute = el('label', 'bv-mute');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', () => { try { localStorage.setItem('bb-offer-off', cb.checked ? todayKey() : ''); } catch { /* private window */ } });
      mute.append(cb, document.createTextNode("Don't show again today"));
      foot.appendChild(mute);
    }
    const back = el('button', 'back', offer ? 'Not now' : 'Back');
    back.type = 'button';
    back.appendChild(el('kbd', null, 'Esc'));
    back.addEventListener('click', () => this.unpeek());
    foot.appendChild(back);
    v.appendChild(foot);

    this.peekBack = () => { this.game.endPreview(); this.game.previewCar(); this.game.showroom.setBall(null); this.game.showroom.setBoost(null); this.render(this.game.home.page); };
    this.peeking = true;
  }

  // After a match or free play: show one bundle you can still buy, a different one each time.
  // Not for guests, not when nothing is left to buy, and not after "don't show again today".
  maybeOffer() {
    if (!this.acc.serverStats || !this.acc.eco || this.peeking) return false;
    if (this.game.online.status !== 'idle' && this.game.online.status !== 'browsing') return false; // searching or in a match room
    try { if (localStorage.getItem('bb-offer-off') === todayKey()) return false; } catch { /* private window */ }
    const key = this.acc.eco.season || seasonKey();
    const open = BUNDLES.filter((b) => (!b.theme || seasonTheme(key) === b.theme) && bundlePrice(b, (k) => this.owns(k)).missing);
    if (!open.length) return false;
    let n = 0;
    try { n = Number(localStorage.getItem('bb-offer-n')) || 0; localStorage.setItem('bb-offer-n', String(n + 1)); } catch { n = Math.floor(Math.random() * 99); }
    this.peekBundle(open[n % open.length], true);
    return true;
  }

  // Show an item on your car in the showroom behind the page (without equipping it).
  preview(cat, id) {
    const lo = { ...this.acc.loadout, [cat]: id };
    this.game.previewCar(lo);
  }

  // Full view: the menus slide away so you see the car, with one bar at the bottom.
  // Used by the shop, the pass and the garage. opts: { pic, kind, name, hint, rar, buttons, onBack }.
  openPeek(opts) {
    const home = this.game.home.el;
    $('bundleView')?.remove();
    home.classList.add('shop-peek');
    let bar = $('shopPeek');
    if (!bar) {
      bar = el('div', 'shop-peek-bar');
      bar.id = 'shopPeek';
      home.appendChild(bar);
    }
    bar.replaceChildren();
    if (opts.pic) bar.appendChild(opts.pic);
    const info = el('div', 'peek-info');
    info.appendChild(el('small', 'shop-kind', opts.kind));
    info.appendChild(el('b', 'shop-name', opts.name));
    info.appendChild(el('small', 'peek-hint', opts.hint || 'Drag the car to spin it'));
    bar.appendChild(info);
    bar.style.setProperty('--rar', opts.rar || 'var(--line)');
    for (const btn of opts.buttons || []) bar.appendChild(btn);
    const back = el('button', 'back', 'Back');
    back.type = 'button';
    back.appendChild(el('kbd', null, 'Esc'));
    back.addEventListener('click', () => this.unpeek());
    bar.appendChild(back);
    this.peekBack = opts.onBack || null;
    this.peeking = true;
  }

  // Preview button in the shop and pass.
  peek(k, price) {
    const [cat, id] = splitKey(k);
    const it = item(cat, id);
    this.preview(cat, id);
    const buttons = [];
    const owned = this.acc.data.owned.includes(k);
    const e = this.acc.eco;
    if (owned) {
      const eq = el('button', 'kick', this.acc.loadout[cat] === id ? 'Equipped' : 'Equip');
      eq.type = 'button';
      eq.disabled = this.acc.loadout[cat] === id;
      eq.addEventListener('click', () => { this.acc.equip(cat, id); this.unpeek(); });
      buttons.push(eq);
    } else if (price != null) {
      const buy = el('button', 'kick buy');
      buy.type = 'button';
      buy.appendChild(this.orbIcon());
      buy.appendChild(document.createTextNode(`Buy · ${price.toLocaleString('en')}`));
      buy.disabled = !e || Number(e.orbs) < price;
      buy.addEventListener('click', () => this.act(() => this.acc.buyItem(k), `${it.name} is yours`).then(() => this.peek(k, price)));
      buttons.push(buy);
    }
    this.openPeek({ pic: this.pic(k, 'peek-pic'), kind: `${catName[cat] || cat} · ${RARITY[it.rarity].name}`, name: it.name, rar: RARITY[it.rarity].color, buttons });
  }

  unpeek() {
    if (!this.peeking) return false;
    this.peeking = false;
    this.game.home.el.classList.remove('shop-peek');
    $('shopPeek')?.remove();
    $('bundleView')?.remove();
    const back = this.peekBack;
    this.peekBack = null;
    if (back) back();
    else {
      this.game.previewCar();
      this.render(this.game.home.page);
    }
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

// A player's banner card: banner background, icon, name, title and level. Used on the Players page
// and on the goal replay. Everything is checked against the item catalog; text goes in as text.
import { item } from '../meta/items.js';
import { iconSvg } from './icons.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function titleText(id) {
  const t = item('title', id);
  return (t ? t.name : 'Rookie').toUpperCase();
}

export function bannerCard({ name, title, icon, banner, level = null, sub = '' }, cls = '') {
  const card = el('div', `pcard ${cls}`.trim());
  const b = item('banner', banner) || item('banner', 'default');
  card.style.background = b.css;
  const ic = el('span', 'pcard-icon');
  ic.innerHTML = iconSvg(item('icon', icon) ? icon : 'ball'); // fixed SVG from icons.js, never user text
  const text = el('div', 'pcard-text');
  text.append(el('b', 'pcard-name', String(name || 'PLAYER').slice(0, 16)), el('small', 'pcard-title', title === null ? '' : titleText(title)));
  if (sub) text.appendChild(el('small', 'pcard-sub', sub));
  card.append(ic, text);
  if (level !== null && level !== undefined) {
    const lv = el('div', 'pcard-level');
    lv.append(el('small', '', 'LVL'), el('b', '', String(Math.max(1, Math.floor(Number(level) || 1)))));
    card.appendChild(lv);
  }
  return card;
}

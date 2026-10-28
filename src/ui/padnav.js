// Controller navigation for the menus: D-pad / left stick moves a highlight between the buttons of
// the menu on screen, Cross (A) presses it, Circle (B) goes back. Sliders and dropdowns change with
// left / right. Inactive while a match is being played.
const FOCUSABLE = 'button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled])';

function visible(el) {
  if (!el || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.2;
}

export class PadNav {
  constructor(game) {
    this.game = game;
    this.current = null;
  }

  // The menu layer that has the controller right now, or null during play.
  layer() {
    for (const id of ['reveal', 'login', 'results', 'pause']) {
      const el = document.getElementById(id);
      if (el && !el.hidden) return el;
    }
    if (this.game.state === 'home') return document.getElementById('home');
    return null;
  }

  // Where the highlight starts: the selected item of the open page, else the first button.
  start(layer) {
    const list = this.targets(layer);
    if (layer.id === 'home') {
      const page = layer.querySelector('.home-page:not([hidden])');
      const inPage = page ? list.filter((el) => page.contains(el)) : [];
      const pick = inPage.find((el) => el.classList.contains('on')) || inPage[0] || list.find((el) => el.classList.contains('nav-play'));
      if (pick) return pick;
    }
    return list.find((el) => el.classList.contains('primary') || el.classList.contains('kick')) || list[0] || null;
  }

  targets(layer) {
    return [...layer.querySelectorAll(FOCUSABLE)].filter(visible);
  }

  setFocus(el) {
    if (this.current) this.current.classList.remove('pad-focus');
    this.current = el;
    if (!el) return;
    el.classList.add('pad-focus');
    if (el.focus) el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  // Closest target in a direction from the current one (prefers targets lined up with it).
  move(layer, dx, dy) {
    const list = this.targets(layer);
    if (!list.length) return;
    if (!this.current || !list.includes(this.current)) {
      this.setFocus(list[0]);
      return;
    }
    const a = this.current.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === this.current) continue;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const along = (ex - ax) * dx + (ey - ay) * dy;
      if (along <= 4) continue;
      const across = Math.abs((ex - ax) * dy) + Math.abs((ey - ay) * dx);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      this.setFocus(best);
      this.game.audio.play('click', { volume: 0.4 });
    }
  }

  // Left / right on a slider or dropdown changes its value instead of moving.
  adjust(el, dir) {
    if (el.tagName === 'INPUT' && el.type === 'range') {
      const step = Number(el.step) || 1;
      el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + dir * step)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.tagName === 'SELECT') {
      el.selectedIndex = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + dir));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Called every frame with the input; returns true when it used a controller press.
  update(input) {
    if (!input.padState) {
      if (this.current) this.setFocus(null);
      return false;
    }
    const layer = this.layer();
    if (!layer) {
      if (this.current) this.setFocus(null);
      return false;
    }
    let used = false;
    const c = this.current && layer.contains(this.current) && this.targets(layer).includes(this.current) ? this.current : null;
    if (!c && (input.padPressed.has('navUp') || input.padPressed.has('navDown') || input.padPressed.has('navLeft') || input.padPressed.has('navRight'))) {
      for (const n of ['navUp', 'navDown', 'navLeft', 'navRight']) input.padPressed.delete(n);
      this.setFocus(this.start(layer));
      return true;
    }
    for (const [n, dx, dy] of [['navUp', 0, -1], ['navDown', 0, 1], ['navLeft', -1, 0], ['navRight', 1, 0]]) {
      if (!input.consumePad(n)) continue;
      used = true;
      if (dx && c && this.adjust(c, dx)) continue;
      this.move(layer, dx, dy);
    }
    if (input.consumePad('a')) {
      used = true;
      if (c) {
        if (c.tagName === 'INPUT' && c.type === 'checkbox') c.click();
        else if (c.tagName === 'INPUT' && c.type === 'text') c.focus();
        else c.click();
      } else {
        this.setFocus(this.start(layer));
      }
    }
    if (input.consumePad('b')) {
      used = true;
      this.back(layer);
    }
    return used;
  }

  back(layer) {
    const g = this.game;
    if (layer.id === 'reveal') g.home.closeReveal();
    else if (layer.id === 'pause') g.setPaused(false);
    else if (layer.id === 'home' && g.home.page !== 'main') g.home.setPage('main');
    this.setFocus(null);
  }
}

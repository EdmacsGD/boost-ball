// Input: air roll goes the right way with every control (keyboard, controller, touch, remapped
// buttons), and controllers are recognized correctly. Run with: node tests/input.test.mjs
globalThis.window = { addEventListener() {} };
const { Input, padTypeOf, PAD_DEFAULTS } = await import('../src/input/input.js');
const { Controls } = await import('../src/physics/car.js');

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const inp = new Input({ addEventListener() {} });
const pad = (buttons, lx = 0) => ({ b: Array.from({ length: 18 }, (_, i) => buttons.includes(i)), v: Array.from({ length: 18 }, (_, i) => (buttons.includes(i) ? 1 : 0)), lx, ly: 0, rx: 0, ry: 0 });
const read = (keys = [], p = null, touch = null) => {
  inp.keys = new Set(keys);
  inp.padState = p;
  inp.touch = touch;
  return inp.read(new Controls());
};
const sign = (v) => (v > 0.3 ? 'right' : v < -0.3 ? 'left' : 'none');
const cases = [
  ['keyboard air roll + D', read(['KeyX', 'KeyD']), 'right'],
  ['keyboard air roll + A', read(['KeyX', 'KeyA']), 'left'],
  ['keyboard E', read(['KeyE']), 'right'],
  ['keyboard Q', read(['KeyQ']), 'left'],
  ['controller X + stick right', read([], pad([2], 0.9)), 'right'],
  ['controller X + stick left', read([], pad([2], -0.9)), 'left'],
  ['controller RB', read([], pad([5])), 'right'],
  ['controller LB', read([], pad([4])), 'left'],
  ['controller X + RB', read([], pad([2, 5])), 'right'],
  ['touch drift + stick right', read([], null, { active: true, x: 0.9, y: 0, drift: true }), 'right'],
  ['touch drift + stick left', read([], null, { active: true, x: -0.9, y: 0, drift: true }), 'left'],
];
for (const [name, c, want] of cases) check(`${name} rolls ${want}`, sign(c.roll) === want && c.yaw === 0, `roll ${c.roll.toFixed(2)} yaw ${c.yaw}`);

// Remapped: air roll right on Y, left cleared.
inp.setPadBindings({ ...PAD_DEFAULTS, rollRight: 3, rollLeft: -1 });
check('remapped Y rolls right', sign(read([], pad([3])).roll) === 'right');
check('cleared LB does nothing', sign(read([], pad([4])).roll) === 'none');
check('old RB does nothing after remap', sign(read([], pad([5])).roll) === 'none');
inp.setPadBindings({ rollRight: 99, jump: 'x' });
check('bad saved values fall back safely', inp.padBindings.rollRight === -1 && inp.padBindings.jump === -1 && inp.padBindings.boost === 1);

check('Xbox pad is Xbox', padTypeOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)') === 'xbox');
check('DualSense is PlayStation', padTypeOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)') === 'ps');
check('PS4 pad is PlayStation', padTypeOf('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)') === 'ps');

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  if (!r.ok) failed++;
}
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('all input tests passed');

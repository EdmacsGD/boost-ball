// Quests: three active at a time. Finishing one gives Sport Drops and a new quest takes its place.
// `matchOnly` quests count in matches against bots; the rest count in free play too.

export const QUEST_TYPES = [
  { type: 'goals', text: (n) => `Score ${n} goals`, goals: [2, 3, 5], matchOnly: true },
  { type: 'wins', text: (n) => (n === 1 ? 'Win a match' : `Win ${n} matches`), goals: [1, 2], matchOnly: true },
  { type: 'matches', text: (n) => (n === 1 ? 'Play a match' : `Play ${n} matches`), goals: [2, 3], matchOnly: true },
  { type: 'saves', text: (n) => `Make ${n} saves`, goals: [2, 3, 4], matchOnly: true },
  { type: 'shots', text: (n) => `Take ${n} shots on goal`, goals: [4, 6], matchOnly: true },
  { type: 'assists', text: (n) => (n === 1 ? 'Get an assist' : `Get ${n} assists`), goals: [1, 2], matchOnly: true },
  { type: 'demos', text: (n) => `Demolish ${n} cars`, goals: [2, 3], matchOnly: true },
  { type: 'mvp', text: () => 'Be the MVP of a match', goals: [1], matchOnly: true, drops: 2 },
  { type: 'pads', text: (n) => `Pick up ${n} boost pads`, goals: [30, 50] },
  { type: 'touches', text: (n) => `Hit the ball ${n} times`, goals: [40, 70] },
  { type: 'aerials', text: (n) => `Hit the ball ${n} times in the air`, goals: [5, 10] },
  { type: 'supersonic', text: (n) => `Go supersonic ${n} times`, goals: [10, 15] },
  { type: 'flipreset', text: () => 'Get a flip reset', goals: [1], drops: 2 },
];

const typeOf = (t) => QUEST_TYPES.find((q) => q.type === t);

export function questText(q) {
  const t = typeOf(q.type);
  return t ? t.text(q.goal) : q.type;
}

export function questInfo(q) {
  const t = typeOf(q.type);
  return { matchOnly: !!t?.matchOnly, text: questText(q) };
}

// A new quest of a type not already active.
export function newQuest(active, rand = Math.random) {
  const taken = new Set(active.map((q) => q.type));
  const pool = QUEST_TYPES.filter((t) => !taken.has(t.type));
  const t = pool[Math.floor(rand() * pool.length)] || QUEST_TYPES[0];
  const goal = t.goals[Math.floor(rand() * t.goals.length)];
  return { id: `q${Date.now().toString(36)}${Math.floor(rand() * 1e6).toString(36)}`, type: t.type, goal, progress: 0, drops: t.drops || 1 };
}

export function fillQuests(active, rand = Math.random) {
  const out = active.filter((q) => typeOf(q.type));
  while (out.length < 3) out.push(newQuest(out, rand));
  return out;
}

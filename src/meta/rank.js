// Ranked tiers from the rating (Elo, everyone starts at 1000). Same rating math as chess: beating
// a stronger team gains more than beating a weaker one. The server does the math; this is display.
export const TIERS = [
  { id: 'bronze', name: 'Bronze', min: -Infinity, color: '#c58a5a' },
  { id: 'silver', name: 'Silver', min: 900, color: '#c4cfdc' },
  { id: 'gold', name: 'Gold', min: 1050, color: '#ffcf4a' },
  { id: 'platinum', name: 'Platinum', min: 1200, color: '#5fe0d0' },
  { id: 'diamond', name: 'Diamond', min: 1350, color: '#6fb4ff' },
  { id: 'champion', name: 'Champion', min: 1500, color: '#c47bff' },
];

export function tierOf(rating) {
  const r = Number(rating) || 1000;
  let t = TIERS[0];
  for (const x of TIERS) if (r >= x.min) t = x;
  return t;
}

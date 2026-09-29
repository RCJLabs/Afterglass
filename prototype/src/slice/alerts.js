// Alert kinds (round seven, phase 6). The sim calls a line out to the page with a kind (say() in sim.js), and
// what the page does with it, whether it stops the clock, offers to open the phase panel, or flashes the Veil,
// and what the replay viewer marks, is decided here by the kind, never by the words: a line can be reworded,
// or one day translated, without silently losing its pause. Alerts with no kind only show as a toast.

export const ALERT_KINDS = {
  larder: 'the larder is empty',
  sick: 'someone has fallen sick',
  plague: 'plague takes several at once',
  arrival: 'someone new at the gate, asking to stay',
  visitor: 'a visitor at the gate, waiting on an answer',
  road: 'raiders, or the crusade, on the road to the gate',
  gate: 'the Host, or the crusade, at the gate',
  breach: 'the gate gave way',
  'siege-camp': 'the camp outside stirs, and comes at the gate',
  siege: 'the Host makes camp outside the walls',
  'church-word': 'the Lantern Church announces an inspection',
  church: 'an inspector is sent, or gives a verdict',
  fire: 'a fire starts',
  'fire-spread': 'a fire spreads to another room',
  eclipse: 'the eclipse begins',
  midsummer: 'midsummer: the eclipse is due today',
  caught: 'one of the Unlit has caught a shade or a sleepwalker',
  hollow: 'the Hollow rises',
  'great-tide': "the Long Night's last great tide rises",
  maw: 'a Maw tears at a candle or breaks a room',
  crack: 'something reached a mirror and cracked the Veil',
  strain: 'the Veil strains: a stair of the line will be dark as the next tide comes up it',
  wraith: 'a shade has turned Wraith',
};

// What stops the clock (when the player lets alerts pause it).
export const STOPS = new Set(['eclipse', 'caught', 'hollow', 'great-tide', 'road', 'visitor', 'siege-camp', 'siege', 'gate', 'church-word', 'church', 'wraith', 'maw', 'fire', 'fire-spread', 'plague']);
// What the toast offers to open the phase panel for.
export const OPENS = new Set(['eclipse', 'midsummer', 'road', 'siege-camp', 'siege', 'gate', 'breach', 'church-word', 'church', 'sick', 'plague', 'larder', 'arrival', 'visitor', 'fire']);
// What flashes the Veil.
export const FLASHES = new Set(['crack']);

// What the replay viewer marks an alert as, if anything.
export function momentOf(al) {
  if (al.tone === 'death') return 'death';
  if (al.kind === 'crack') return 'crack';
  if (al.kind === 'caught') return 'caught';
  if (al.tone === 'visit') return 'visit'; // a visitor at the gate, and what was answered
  if (al.tone === 'bad') return 'bad';
  if (al.tone === 'good') return 'good';
  return null;
}

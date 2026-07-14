// Persistent storage for players and match history.
const PLAYERS_KEY = 'pila.players';
const HISTORY_KEY = 'pila.history';

export const COLORS = [
  '#16a34a', '#ef4444', '#3b82f6', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let _players = read(PLAYERS_KEY, [
  { id: 'p1', name: 'Krúsi' },
  { id: 'p2', name: 'Hákon' },
]);

export function getPlayers() { return _players.slice(); }

export function addPlayer(name) {
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  _players.push({ id, name: name.trim() || 'Leikmaður' });
  write(PLAYERS_KEY, _players);
}
export function removePlayer(id) {
  _players = _players.filter(p => p.id !== id);
  write(PLAYERS_KEY, _players);
}
export function colorFor(index) { return COLORS[index % COLORS.length]; }

export function getHistory() { return read(HISTORY_KEY, []); }
export function saveMatch(entry) {
  const list = read(HISTORY_KEY, []);
  list.unshift({ ...entry, date: Date.now() });
  write(HISTORY_KEY, list.slice(0, 100));
}
export function clearHistory() { write(HISTORY_KEY, []); }

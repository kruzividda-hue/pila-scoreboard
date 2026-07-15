// Persistent storage for players and match history.
const PLAYERS_KEY = 'pila.players';
const SELECTED_KEY = 'pila.selected';
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

// which roster players take part in the next game, in selection order
let _selected = read(SELECTED_KEY, null) ?? _players.map(p => p.id);

export function getPlayers() { return _players.slice(); }

// selected players in the order they were selected (determines colors/turn order)
export function getSelectedPlayers() {
  return _selected.map(id => _players.find(p => p.id === id)).filter(Boolean);
}
export function isSelected(id) { return _selected.includes(id); }
export function toggleSelected(id) {
  _selected = _selected.includes(id) ? _selected.filter(x => x !== id) : [..._selected, id];
  write(SELECTED_KEY, _selected);
}

export function addPlayer(name) {
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  _players.push({ id, name: name.trim() || 'Leikmaður' });
  write(PLAYERS_KEY, _players);
}
export function removePlayer(id) {
  _players = _players.filter(p => p.id !== id);
  write(PLAYERS_KEY, _players);
  _selected = _selected.filter(x => x !== id);
  write(SELECTED_KEY, _selected);
}
export function colorFor(index) { return COLORS[index % COLORS.length]; }

export function getHistory() { return read(HISTORY_KEY, []); }
export function saveMatch(entry) {
  const list = read(HISTORY_KEY, []);
  list.unshift({ ...entry, date: Date.now() });
  write(HISTORY_KEY, list.slice(0, 100));
}
export function clearHistory() { write(HISTORY_KEY, []); }

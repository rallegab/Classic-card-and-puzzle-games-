(() => {
"use strict";

/* ============================== Tile data ============================== */

const SUITED = ["dots", "bamboo", "characters"];
const WINDS = ["east", "south", "west", "north"];
const DRAGONS = ["red", "green", "white"];
const WIND_CHAR = { east: "東", south: "南", west: "西", north: "北" };
const DRAGON_CHAR = { red: "中", green: "發" };
const KANJI_NUM = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九" };
const FLOWER_EMOJI = ["🌸", "🌺", "🌼", "🌷"];
const SEASON_EMOJI = ["🌱", "☀️", "🍁", "❄️"];

// 3x3 pip layouts for the dot/bamboo suits, shared by both (bamboo renders
// the same positions as bars instead of circles).
const DOT_PATTERNS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  7: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 0], [2, 1], [2, 2]],
  8: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]],
  9: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
};

function matchKeyOf(t) {
  if (t.group === "suited") return "suited-" + t.suit + "-" + t.rank;
  if (t.group === "wind") return "wind-" + t.wind;
  if (t.group === "dragon") return "dragon-" + t.dragon;
  if (t.group === "flower") return "flower";
  if (t.group === "season") return "season";
  return "?";
}

function tilesMatch(a, b) {
  return a !== b && !a.removed && !b.removed && matchKeyOf(a) === matchKeyOf(b);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 72 pair-events (144 tiles): 27 suited types x2 + 4 winds x2 + 3 dragons x2
 *  + 2 flower pairs (any-flower-matches-any-flower) + 2 season pairs. */
function buildPairPool() {
  const pool = [];
  SUITED.forEach((suit) => {
    for (let rank = 1; rank <= 9; rank++) {
      pool.push([{ group: "suited", suit, rank }, { group: "suited", suit, rank }]);
      pool.push([{ group: "suited", suit, rank }, { group: "suited", suit, rank }]);
    }
  });
  WINDS.forEach((wind) => {
    pool.push([{ group: "wind", wind }, { group: "wind", wind }]);
    pool.push([{ group: "wind", wind }, { group: "wind", wind }]);
  });
  DRAGONS.forEach((dragon) => {
    pool.push([{ group: "dragon", dragon }, { group: "dragon", dragon }]);
    pool.push([{ group: "dragon", dragon }, { group: "dragon", dragon }]);
  });
  const flowerIdx = shuffle([0, 1, 2, 3]);
  pool.push([{ group: "flower", variant: flowerIdx[0] }, { group: "flower", variant: flowerIdx[1] }]);
  pool.push([{ group: "flower", variant: flowerIdx[2] }, { group: "flower", variant: flowerIdx[3] }]);
  const seasonIdx = shuffle([0, 1, 2, 3]);
  pool.push([{ group: "season", variant: seasonIdx[0] }, { group: "season", variant: seasonIdx[1] }]);
  pool.push([{ group: "season", variant: seasonIdx[2] }, { group: "season", variant: seasonIdx[3] }]);
  return shuffle(pool);
}

function extractTileData(t) {
  return { group: t.group, suit: t.suit, rank: t.rank, wind: t.wind, dragon: t.dragon, variant: t.variant };
}

/* ============================== Board layout ============================== */

// A stepped "jade pagoda" of 5 layers, each rectangle fully nested inside the
// one below it, on a shared integer grid (no half-tile stagger - the classic
// stacked look comes purely from a small per-layer pixel offset at render
// time). Areas: 72 + 36 + 18 + 12 + 6 = 144 tiles.
const LAYERS = [
  { w: 12, h: 6, x: 0, y: 0, z: 0 },
  { w: 9, h: 4, x: 1, y: 1, z: 1 },
  { w: 6, h: 3, x: 3, y: 1, z: 2 },
  { w: 6, h: 2, x: 3, y: 2, z: 3 },
  { w: 3, h: 2, x: 4, y: 2, z: 4 },
];
const GRID_COLS = 12;
const GRID_ROWS = 6;
const MAX_Z = 4;

function buildPositions() {
  const positions = [];
  LAYERS.forEach((layer) => {
    for (let ry = 0; ry < layer.h; ry++) {
      for (let rx = 0; rx < layer.w; rx++) {
        positions.push({ x: layer.x + rx, y: layer.y + ry, z: layer.z });
      }
    }
  });
  return positions;
}

/** A position is free if nothing remains directly above it, and at least one
 *  of its left/right neighbors at the same layer is empty. */
function computeFreeSet(remaining) {
  const free = [];
  for (const p of remaining) {
    let coveredAbove = false;
    let blockedLeft = false;
    let blockedRight = false;
    for (const q of remaining) {
      if (q === p) continue;
      if (q.x === p.x && q.y === p.y && q.z > p.z) coveredAbove = true;
      if (q.z === p.z && q.y === p.y) {
        if (q.x === p.x - 1) blockedLeft = true;
        if (q.x === p.x + 1) blockedRight = true;
      }
    }
    if (!coveredAbove && (!blockedLeft || !blockedRight)) free.push(p);
  }
  return free;
}

/** Assigns pool's pair-data to allPositions such that a solvable removal
 *  order exists: at every step we only ever hand a pair-event to two
 *  positions that are simultaneously free given everything placed so far
 *  (working backward from a full board), which is exactly the situation the
 *  player will face going forward. Returns a Map(position -> tileData), or
 *  null if a dead end was hit (caller should retry with a fresh shuffle). */
function tryAssign(allPositions, pool) {
  let remaining = allPositions.slice();
  const assignment = new Map();
  for (let i = 0; i < pool.length; i++) {
    const free = computeFreeSet(remaining);
    if (free.length < 2) return null;
    const a = free[Math.floor(Math.random() * free.length)];
    let b;
    do { b = free[Math.floor(Math.random() * free.length)]; } while (b === a);
    assignment.set(a, pool[i][0]);
    assignment.set(b, pool[i][1]);
    remaining = remaining.filter((p) => p !== a && p !== b);
  }
  return assignment;
}

function generateBoard() {
  const basePositions = buildPositions();
  for (let attempt = 0; attempt < 60; attempt++) {
    const pool = buildPairPool();
    const assignment = tryAssign(basePositions, pool);
    if (assignment) {
      return basePositions.map((p, idx) => ({
        id: "t" + idx,
        x: p.x, y: p.y, z: p.z,
        removed: false,
        ...assignment.get(p),
      }));
    }
  }
  throw new Error("Could not generate a solvable board");
}

/* ============================== State ============================== */

let tiles = [];
let selectedId = null;
let currentFreeIds = new Set();
let moves = 0;
let matchedPairs = 0;
let history = [];

let timerInterval = null;
let startTime = null;

function readSetting(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

let soundOn = readSetting("mahjong.sound", "off") === "on";
let fullscreenPref = readSetting("mahjong.fullscreen", "on");
let theme = readSetting("mahjong.theme", "lacquer");

function tileById(id) { return tiles.find((t) => t.id === id); }

function newGame() {
  tiles = generateBoard();
  selectedId = null;
  moves = 0;
  matchedPairs = 0;
  history = [];
  startTime = Date.now();
  document.getElementById("winOverlay").classList.add("hidden");
  hideToast();
  render();
  startTimer();
}

/* ============================== Timer ============================== */

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}
function stopTimer() { clearInterval(timerInterval); }
function elapsedSeconds() { return Math.floor((Date.now() - startTime) / 1000); }
function updateTimerDisplay() {
  const secs = elapsedSeconds();
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  document.getElementById("timeVal").textContent = m + ":" + String(s).padStart(2, "0");
}

/* ============================== History ============================== */

function pushHistory() {
  history.push(JSON.stringify({ tiles, moves, matchedPairs }));
  if (history.length > 200) history.shift();
}

function undo() {
  if (!history.length) return;
  const snap = JSON.parse(history.pop());
  tiles = snap.tiles;
  moves = snap.moves;
  matchedPairs = snap.matchedPairs;
  selectedId = null;
  render();
  playUndoSound();
  checkDeadlock();
}

/* ============================== Moves ============================== */

function remainingTiles() { return tiles.filter((t) => !t.removed); }

function hasAnyFreeMatch() {
  const free = [...currentFreeIds].map(tileById);
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (tilesMatch(free[i], free[j])) return true;
    }
  }
  return false;
}

function checkDeadlock() {
  if (remainingTiles().length > 0 && !hasAnyFreeMatch()) {
    showToast("No matches left — try Shuffle.", true);
  } else {
    hideToast();
  }
}

function removeMatchedPair(a, b) {
  pushHistory();
  const elA = tileEl(a.id), elB = tileEl(b.id);
  playVanishFx(elA);
  playVanishFx(elB);
  a.removed = true;
  b.removed = true;
  moves++;
  matchedPairs++;
  selectedId = null;
  render();
  playMatchSound();
  checkWin();
  checkDeadlock();
}

function onTileTap(id) {
  const tile = tileById(id);
  if (!tile || tile.removed) return;

  if (!currentFreeIds.has(id)) {
    shakeTile(id);
    playInvalidSound();
    return;
  }

  if (!selectedId) {
    selectedId = id;
    render();
    return;
  }
  if (selectedId === id) {
    selectedId = null;
    render();
    return;
  }
  const first = tileById(selectedId);
  if (tilesMatch(first, tile)) {
    removeMatchedPair(first, tile);
  } else {
    shakeTile(id);
    playInvalidSound();
    selectedId = null;
    render();
  }
}

/* ============================== Hint / Shuffle ============================== */

function findFreeMatch() {
  const free = [...currentFreeIds].map(tileById);
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (tilesMatch(free[i], free[j])) return [free[i], free[j]];
    }
  }
  return null;
}

function hint() {
  const pair = findFreeMatch();
  if (!pair) {
    showToast("No matches left — try Shuffle.", true);
    return;
  }
  pair.forEach((t) => {
    const el = tileEl(t.id);
    if (!el) return;
    el.classList.add("tile-hint");
    setTimeout(() => el.classList.remove("tile-hint"), 1000);
  });
  playHintSound();
}

function reshuffle() {
  const remaining = remainingTiles();
  if (remaining.length === 0) return;

  const byKey = new Map();
  remaining.forEach((t) => {
    const k = matchKeyOf(t);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
  });
  let pool = [];
  byKey.forEach((list) => {
    for (let i = 0; i < list.length; i += 2) {
      pool.push([extractTileData(list[i]), extractTileData(list[i + 1])]);
    }
  });

  const positions = remaining.map((t) => ({ x: t.x, y: t.y, z: t.z, ref: t }));
  let assignment = null;
  for (let attempt = 0; attempt < 80 && !assignment; attempt++) {
    shuffle(pool);
    assignment = tryAssign(positions, pool);
  }
  if (!assignment) {
    showToast("Shuffle didn't find a layout — try again.", true);
    return;
  }
  pushHistory();
  positions.forEach((p) => { Object.assign(p.ref, assignment.get(p)); });
  selectedId = null;
  render();
  playShuffleSound();
  checkDeadlock();
}

/* ============================== Win ============================== */

function checkWin() {
  if (remainingTiles().length === 0) {
    stopTimer();
    const secs = elapsedSeconds();
    document.getElementById("winStats").textContent =
      `Cleared in ${moves} moves and ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}.`;
    document.getElementById("winOverlay").classList.remove("hidden");
    launchConfetti();
    playWinSound();
  }
}

/* ============================== Sound ============================== */

let audioCtx = null;
function getAudioCtx() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}
function playTone(freq, duration, opts = {}) {
  if (!soundOn) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.value = freq;
    const vol = opts.volume || 0.14;
    const t0 = ctx.currentTime + (opts.delay || 0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch (e) {}
}
function playMatchSound() {
  playTone(660, 0.09, { type: "triangle", volume: 0.12 });
  playTone(990, 0.13, { type: "sine", volume: 0.1, delay: 0.05 });
}
function playInvalidSound() { playTone(150, 0.15, { type: "sawtooth", volume: 0.08 }); }
function playHintSound() { playTone(880, 0.12, { type: "sine", volume: 0.1 }); }
function playShuffleSound() {
  [440, 494, 554, 622].forEach((f, i) => playTone(f, 0.08, { type: "square", volume: 0.06, delay: i * 0.04 }));
}
function playUndoSound() {
  playTone(500, 0.09, { type: "triangle", volume: 0.1 });
  playTone(380, 0.11, { type: "triangle", volume: 0.09, delay: 0.06 });
}
function playWinSound() {
  [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.22, { type: "sine", volume: 0.15, delay: i * 0.11 }));
}
function playNewGameSound() {
  [392, 523, 659].forEach((f, i) => playTone(f, 0.13, { type: "sine", volume: 0.12, delay: i * 0.07 }));
}

/* ============================== FX ============================== */

function launchConfetti() {
  const layer = document.getElementById("fxLayer");
  const colors = ["#ffd54f", "#e64545", "#4fc3f7", "#7fd67f", "#d38bd3"];
  const pieces = [];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.left = Math.random() * 100 + "vw";
    el.style.background = colors[i % colors.length];
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(el);
    pieces.push(el);
  }
  requestAnimationFrame(() => {
    pieces.forEach((el) => {
      el.style.top = "110vh";
      el.style.transform = `rotate(${Math.random() * 720}deg)`;
      el.style.opacity = "0.15";
    });
  });
  setTimeout(() => pieces.forEach((el) => el.remove()), 2400);
}

function spawnSparkles(rect) {
  if (!rect) return;
  const layer = document.getElementById("fxLayer");
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 8; i++) {
    const el = document.createElement("div");
    el.className = "sparkle-piece";
    el.style.left = cx + "px";
    el.style.top = cy + "px";
    const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
    const dist = 26 + Math.random() * 20;
    el.style.setProperty("--dx", Math.cos(angle) * dist + "px");
    el.style.setProperty("--dy", Math.sin(angle) * dist + "px");
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add("sparkle-active"));
    setTimeout(() => el.remove(), 550);
  }
}

function playVanishFx(el) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  spawnSparkles(rect);
  const clone = el.cloneNode(true);
  clone.classList.add("tile-vanish-clone");
  clone.style.position = "fixed";
  clone.style.left = rect.left + "px";
  clone.style.top = rect.top + "px";
  clone.style.width = rect.width + "px";
  clone.style.height = rect.height + "px";
  document.getElementById("fxLayer").appendChild(clone);
  requestAnimationFrame(() => clone.classList.add("tile-vanish-active"));
  setTimeout(() => clone.remove(), 420);
}

function cssEscape(s) { return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
function tileEl(id) { return document.querySelector(`.tile[data-id="${cssEscape(id)}"]`); }

function shakeTile(id) {
  const el = tileEl(id);
  if (!el) return;
  el.classList.remove("tile-shake");
  void el.offsetWidth;
  el.classList.add("tile-shake");
  el.addEventListener("animationend", () => el.classList.remove("tile-shake"), { once: true });
}

let toastTimer = null;
function showToast(msg, persist) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  document.getElementById("shuffleBtn").classList.add("pulse");
  clearTimeout(toastTimer);
  if (!persist) toastTimer = setTimeout(hideToast, 2200);
}
function hideToast() {
  document.getElementById("toast").classList.add("hidden");
  document.getElementById("shuffleBtn").classList.remove("pulse");
}

/* ============================== Sizing ============================== */

const TILE_ASPECT = 1.32;
let tileW = 40, tileH = 52, shiftPx = 6;

function computeTileSize() {
  const topbarH = document.getElementById("topbar").offsetHeight || 64;
  const shiftGuess = 8;
  const pad = 10;
  const availW = window.innerWidth - pad * 2 - shiftGuess * MAX_Z;
  const availH = window.innerHeight - topbarH - pad * 2 - shiftGuess * MAX_Z - 10;

  let w = Math.floor(availW / GRID_COLS);
  let h = w * TILE_ASPECT;
  if (h * GRID_ROWS > availH) {
    h = Math.floor(availH / GRID_ROWS);
    w = h / TILE_ASPECT;
  }
  w = Math.max(22, Math.floor(w));
  h = Math.max(Math.round(22 * TILE_ASPECT), Math.round(w * TILE_ASPECT));

  tileW = w;
  tileH = h;
  shiftPx = Math.max(3, Math.round(w * 0.14));

  const boardPad = shiftPx * MAX_Z + 6;
  document.documentElement.style.setProperty("--tile-w", tileW + "px");
  document.documentElement.style.setProperty("--tile-h", tileH + "px");
  document.documentElement.style.setProperty("--board-pad", boardPad + "px");
  const board = document.getElementById("board");
  board.style.width = GRID_COLS * tileW + boardPad * 2 + "px";
  board.style.height = GRID_ROWS * tileH + boardPad * 2 + "px";
}

let resizeTimer = null;
function onViewportResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    computeTileSize();
    if (tiles.length) render();
  }, 120);
}

/* ============================== Rendering ============================== */

function tileGlyph(t) {
  if (t.group === "suited") {
    if (t.suit === "characters") {
      return { kind: "kanji-stack", top: KANJI_NUM[t.rank], bottom: "萬", ink: "ink-red" };
    }
    if (t.suit === "bamboo" && t.rank === 1) {
      return { kind: "icon", icon: "🐦", ink: "ink-green" };
    }
    if (t.suit === "bamboo") {
      return { kind: "pips", pattern: DOT_PATTERNS[t.rank], shape: "bar", ink: "ink-green" };
    }
    return { kind: "pips", pattern: DOT_PATTERNS[t.rank], shape: "circle", ink: "ink-blue" };
  }
  if (t.group === "wind") return { kind: "glyph", ch: WIND_CHAR[t.wind], ink: "ink-navy" };
  if (t.group === "dragon") {
    if (t.dragon === "white") return { kind: "blank", ink: "ink-blue" };
    return { kind: "glyph", ch: DRAGON_CHAR[t.dragon], ink: t.dragon === "red" ? "ink-red" : "ink-green" };
  }
  if (t.group === "flower") return { kind: "icon", icon: FLOWER_EMOJI[t.variant], ink: "ink-pink" };
  if (t.group === "season") return { kind: "icon", icon: SEASON_EMOJI[t.variant], ink: "ink-amber" };
  return { kind: "glyph", ch: "?", ink: "" };
}

function buildFace(t) {
  const g = tileGlyph(t);
  const face = document.createElement("div");
  face.className = "tile-face " + g.ink;
  if (g.kind === "pips") {
    face.classList.add("pips-" + g.shape);
    g.pattern.forEach(([r, c]) => {
      const pip = document.createElement("span");
      pip.className = "pip";
      pip.style.gridRow = String(r + 1);
      pip.style.gridColumn = String(c + 1);
      face.appendChild(pip);
    });
  } else if (g.kind === "kanji-stack") {
    const top = document.createElement("span");
    top.className = "kanji-top";
    top.textContent = g.top;
    const bottom = document.createElement("span");
    bottom.className = "kanji-bottom";
    bottom.textContent = g.bottom;
    face.appendChild(top);
    face.appendChild(bottom);
  } else if (g.kind === "glyph") {
    face.classList.add("glyph-single");
    face.textContent = g.ch;
  } else if (g.kind === "blank") {
    face.classList.add("glyph-blank");
    const frame = document.createElement("span");
    frame.className = "blank-frame";
    face.appendChild(frame);
  } else if (g.kind === "icon") {
    face.classList.add("glyph-icon");
    face.textContent = g.icon;
  }
  return face;
}

function render() {
  const remaining = remainingTiles();
  // computeFreeSet() returns the same tile objects it was given (by
  // reference), so each result already carries its own id.
  currentFreeIds = new Set(computeFreeSet(remaining).map((t) => t.id));

  const board = document.getElementById("board");
  board.innerHTML = "";

  remaining.forEach((t) => {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.id = t.id;
    const free = currentFreeIds.has(t.id);
    el.classList.toggle("tile-free", free);
    el.classList.toggle("tile-blocked", !free);
    el.classList.toggle("tile-selected", selectedId === t.id);
    el.style.left = `calc(var(--board-pad) + ${t.x * tileW - t.z * shiftPx}px)`;
    el.style.top = `calc(var(--board-pad) + ${t.y * tileH - t.z * shiftPx}px)`;
    el.style.zIndex = String(t.z * 1000 + t.y * 20 + t.x + 1);
    el.appendChild(buildFace(t));
    board.appendChild(el);
  });

  document.getElementById("movesVal").textContent = moves;
  document.getElementById("tilesLeftVal").textContent = remaining.length;
}

/* ============================== Input ============================== */

function onBoardPointerUp(e) {
  const el = e.target.closest(".tile");
  if (!el) return;
  onTileTap(el.dataset.id);
}

/* ---------- Full screen ---------- */

function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return;
  try { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function exitFullscreenIfActive() {
  if (!isFullscreen()) return;
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn) return;
  try { const p = fn.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function setupFullscreen() {
  const supported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const seg = document.getElementById("fullscreenSeg");
  if (!supported) {
    seg.closest(".menu-row").style.display = "none";
    return;
  }
  document.addEventListener("click", () => {
    if (fullscreenPref === "on" && !isFullscreen()) requestFullscreen();
  });
}

/* ============================== Wiring ============================== */

function wireSegmented(id, current, onSelect) {
  const seg = document.getElementById(id);
  seg.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      onSelect(btn.dataset.mode);
    });
    btn.classList.toggle("active", btn.dataset.mode === current);
  });
}

function applyTheme(name) {
  Array.from(document.body.classList)
    .filter((c) => c.startsWith("theme-"))
    .forEach((c) => document.body.classList.remove(c));
  document.body.classList.add("theme-" + name);
}

function init() {
  applyTheme(theme);
  computeTileSize();
  window.addEventListener("resize", onViewportResize);
  window.addEventListener("orientationchange", onViewportResize);

  const board = document.getElementById("board");
  board.addEventListener("pointerup", onBoardPointerUp);

  document.getElementById("newGameBtn").addEventListener("click", () => {
    if (moves > 0 && remainingTiles().length > 0) {
      document.getElementById("confirmOverlay").classList.remove("hidden");
    } else {
      playNewGameSound();
      newGame();
    }
  });
  document.getElementById("confirmYesBtn").addEventListener("click", () => {
    document.getElementById("confirmOverlay").classList.add("hidden");
    playNewGameSound();
    newGame();
  });
  document.getElementById("confirmCancelBtn").addEventListener("click", () => {
    document.getElementById("confirmOverlay").classList.add("hidden");
  });

  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("hintBtn").addEventListener("click", hint);
  document.getElementById("shuffleBtn").addEventListener("click", reshuffle);
  document.getElementById("playAgainBtn").addEventListener("click", () => {
    playNewGameSound();
    newGame();
  });

  document.getElementById("menuBtn").addEventListener("click", () => {
    document.getElementById("menuOverlay").classList.remove("hidden");
  });
  document.getElementById("closeMenuBtn").addEventListener("click", () => {
    document.getElementById("menuOverlay").classList.add("hidden");
  });

  setupFullscreen();

  wireSegmented("fullscreenSeg", fullscreenPref, (mode) => {
    fullscreenPref = mode;
    writeSetting("mahjong.fullscreen", mode);
    if (mode === "on") requestFullscreen();
    else exitFullscreenIfActive();
  });

  wireSegmented("soundSeg", soundOn ? "on" : "off", (mode) => {
    soundOn = mode === "on";
    writeSetting("mahjong.sound", mode);
    if (soundOn) playMatchSound();
  });

  const themeGrid = document.getElementById("themeGrid");
  themeGrid.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      theme = btn.dataset.theme;
      writeSetting("mahjong.theme", theme);
      themeGrid.querySelectorAll(".theme-swatch").forEach((b) => b.classList.toggle("active", b === btn));
      applyTheme(theme);
    });
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  newGame();
}

document.addEventListener("DOMContentLoaded", init);
})();

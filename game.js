(() => {
"use strict";

/* ============================== State ============================== */

const SUITS = ["S", "H", "D", "C"];
const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_COLOR = { S: "black", H: "red", D: "red", C: "black" };
const RANK_LABEL = { 1: "A", 11: "J", 12: "Q", 13: "K" };

/* ============================== Responsive card sizing ============================== */

const CARD_ASPECT = 88 / 62;

// Mirrors the stacking offset used at render time (see stackOffset()).
function clampOffsetForHeight(cardH) {
  return Math.max(16, Math.min(28, cardH * 0.28));
}

// Cached in computeCardSize() so stackOffset() (called every drag frame)
// doesn't need a getComputedStyle() read on each call.
let cachedStackOffset = clampOffsetForHeight(88);

function computeCardSize() {
  const cols = 7;
  const gap = window.innerWidth >= 700 ? 6 : 4;
  const topbarH = document.getElementById("topbar").offsetHeight || 64;

  const availW = window.innerWidth - gap * 2;
  let cardW = Math.floor((availW - gap * (cols - 1)) / cols);
  let cardH = cardW * CARD_ASPECT;

  // Vertical space for: top row (stock/waste/foundations, one card tall) +
  // gap between rows + tableau row (one card tall plus up to 6 stacked offsets
  // for the initial 7-card deal).
  const availH = window.innerHeight - topbarH - gap * 2 - gap * 1.5;
  const neededH = (h) => h + (h + 6 * clampOffsetForHeight(h));
  if (neededH(cardH) > availH) {
    let lo = 20, hi = cardH;
    for (let i = 0; i < 25; i++) {
      const mid = (lo + hi) / 2;
      if (neededH(mid) <= availH) lo = mid; else hi = mid;
    }
    cardH = lo;
    cardW = cardH / CARD_ASPECT;
  }

  cardW = Math.max(38, Math.floor(cardW));
  cardH = Math.max(Math.round(38 * CARD_ASPECT), Math.round(cardW * CARD_ASPECT));

  document.documentElement.style.setProperty("--card-w", cardW + "px");
  document.documentElement.style.setProperty("--card-h", cardH + "px");
  document.documentElement.style.setProperty("--gap", gap + "px");
  cachedStackOffset = clampOffsetForHeight(cardH);
}

let resizeTimer = null;
function onViewportResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    computeCardSize();
    if (state) render();
  }, 120);
}

let state = null;
let history = [];
function readStoredDrawMode() {
  try {
    return Number(localStorage.getItem("solitaire.drawMode")) || 1;
  } catch (e) {
    return 1;
  }
}
let drawMode = readStoredDrawMode();

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

let handMode = readSetting("solitaire.hand", "right");
let fullscreenPref = readSetting("solitaire.fullscreen", "on");
let soundOn = readSetting("solitaire.sound", "off") === "on";
let background = readSetting("solitaire.background", "classic");

let timerInterval = null;
let startTime = null;
let elapsedFrozen = 0;

function rankLabel(r) { return RANK_LABEL[r] || String(r); }

function freshDeck() {
  const cards = [];
  for (const s of SUITS) {
    for (let r = 1; r <= 13; r++) {
      cards.push({ id: s + r, suit: s, rank: r, faceUp: false });
    }
  }
  return cards;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newGame() {
  const deck = shuffle(freshDeck());
  const tableau = [[], [], [], [], [], [], []];
  for (let i = 0; i < 7; i++) {
    for (let j = i; j < 7; j++) {
      const card = deck.pop();
      card.faceUp = j === i;
      tableau[j].push(card);
    }
  }
  state = {
    tableau,
    stock: deck,
    waste: [],
    foundations: { S: [], H: [], D: [], C: [] },
    moves: 0,
  };
  history = [];
  startTime = Date.now();
  elapsedFrozen = 0;
  document.getElementById("winOverlay").classList.add("hidden");
  render();
  startTimer();
}

/* ============================== Timer ============================== */

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

function stopTimer() {
  clearInterval(timerInterval);
}

function updateTimerDisplay() {
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  document.getElementById("timeVal").textContent = m + ":" + String(s).padStart(2, "0");
}

/* ============================== Rules ============================== */

function isRed(suit) { return suit === "H" || suit === "D"; }

function canStackTableau(moving, targetTop) {
  if (!targetTop) return moving.rank === 13;
  return moving.rank === targetTop.rank - 1 && isRed(moving.suit) !== isRed(targetTop.suit);
}

function canStackFoundation(moving, foundationSuit) {
  const pile = state.foundations[foundationSuit];
  if (moving.suit !== foundationSuit) return false;
  if (pile.length === 0) return moving.rank === 1;
  return moving.rank === pile[pile.length - 1].rank + 1;
}

/* ============================== History / snapshot ============================== */

function snapshot() {
  return JSON.stringify({
    tableau: state.tableau,
    stock: state.stock,
    waste: state.waste,
    foundations: state.foundations,
    moves: state.moves,
  });
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > 200) history.shift();
}

function undo() {
  if (!history.length) return;
  const prevRects = captureRects();
  const snap = JSON.parse(history.pop());
  state.tableau = snap.tableau;
  state.stock = snap.stock;
  state.waste = snap.waste;
  state.foundations = snap.foundations;
  state.moves = snap.moves;
  render();
  animateFromRects(prevRects);
  playUndoSound();
}

/* ============================== Moves ============================== */

function drawFromStock() {
  pushHistory();
  const prevRects = captureRects();
  if (state.stock.length === 0) {
    if (state.waste.length === 0) { history.pop(); return; }
    while (state.waste.length) {
      const c = state.waste.pop();
      c.faceUp = false;
      state.stock.push(c);
    }
  } else {
    // Seed the newly-drawn cards' "previous" position as the stock pile
    // itself, so they visibly slide out of the stock into the waste.
    const stockEl = document.querySelector('#stockPile .card[data-id="__stock__"]');
    const stockRect = stockEl ? stockEl.getBoundingClientRect() : null;
    const n = Math.min(drawMode, state.stock.length);
    for (let i = 0; i < n; i++) {
      const c = state.stock.pop();
      c.faceUp = true;
      state.waste.push(c);
      if (stockRect) prevRects.set(c.id, stockRect);
    }
    playDrawSound();
  }
  state.moves++;
  render();
  animateFromRects(prevRects);
}

function locateCard(cardId) {
  for (let i = 0; i < 7; i++) {
    const pile = state.tableau[i];
    const idx = pile.findIndex((c) => c.id === cardId);
    if (idx !== -1) return { type: "tableau", index: i, cardIndex: idx, pile };
  }
  const wIdx = state.waste.findIndex((c) => c.id === cardId);
  if (wIdx !== -1) return { type: "waste", index: 0, cardIndex: wIdx, pile: state.waste };
  for (const s of SUITS) {
    const fIdx = state.foundations[s].findIndex((c) => c.id === cardId);
    if (fIdx !== -1) return { type: "foundation", index: s, cardIndex: fIdx, pile: state.foundations[s] };
  }
  return null;
}

/** Returns the run of cards (array) starting at cardId to the end of its pile,
 *  if that run is legally draggable (all face up, properly alternating/descending
 *  for tableau). For waste/foundation only the very top card is draggable. */
function getDraggableRun(loc) {
  if (loc.type === "waste") {
    if (loc.cardIndex !== loc.pile.length - 1) return null;
    return [loc.pile[loc.cardIndex]];
  }
  if (loc.type === "foundation") {
    // Only the exposed top card of a foundation can be taken back, same as
    // real play - the cards underneath it aren't reachable.
    if (loc.cardIndex !== loc.pile.length - 1) return null;
    return [loc.pile[loc.cardIndex]];
  }
  // tableau
  const pile = loc.pile;
  const run = pile.slice(loc.cardIndex);
  if (!run.every((c) => c.faceUp)) return null;
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1];
    if (b.rank !== a.rank - 1 || isRed(a.suit) === isRed(b.suit)) return null;
  }
  return run;
}

function removeRun(loc, run) {
  loc.pile.splice(loc.cardIndex, run.length);
  if (loc.type === "tableau" && loc.pile.length && !loc.pile[loc.pile.length - 1].faceUp) {
    loc.pile[loc.pile.length - 1].faceUp = true;
  }
}

function canDropRunOnTableau(run, pileIndex) {
  const pile = state.tableau[pileIndex];
  const top = pile.length ? pile[pile.length - 1] : null;
  return canStackTableau(run[0], top);
}

function canDropRunOnFoundation(run, suit) {
  if (run.length !== 1) return false;
  return canStackFoundation(run[0], suit);
}

/** Attempt to move the run identified by cardId to the given target.
 *  target = {type:'tableau', index} | {type:'foundation', index: suit}
 *  opts.animate (default true) slides the card into place; pass false when
 *  the move already has its own animation (e.g. a drag-and-drop drop). */
function tryMove(cardId, target, opts = {}) {
  const animate = opts.animate !== false;
  const loc = locateCard(cardId);
  if (!loc) return false;
  const run = getDraggableRun(loc);
  if (!run) return false;

  let ok = false;
  if (target.type === "tableau") {
    ok = canDropRunOnTableau(run, target.index);
  } else if (target.type === "foundation") {
    ok = canDropRunOnFoundation(run, target.index);
  }
  if (!ok) return false;

  // no-op guard: dropping onto the pile it's already the tail of
  if (loc.type === "tableau" && target.type === "tableau" && loc.index === target.index) return false;

  const prevRects = animate ? captureRects() : null;

  pushHistory();
  removeRun(loc, run);
  if (target.type === "tableau") {
    state.tableau[target.index].push(...run);
  } else {
    state.foundations[target.index].push(...run);
  }
  state.moves++;
  render();
  if (prevRects) animateFromRects(prevRects);
  if (target.type === "foundation") playFoundationSound(); else playMoveSound();
  checkWin();
  return true;
}

function tryAutoMoveToFoundation(cardId) {
  const loc = locateCard(cardId);
  if (!loc) return false;
  const run = getDraggableRun(loc);
  if (!run || run.length !== 1) return false;
  const card = run[0];
  if (!canStackFoundation(card, card.suit)) return false;
  return tryMove(cardId, { type: "foundation", index: card.suit });
}

function tryAutoMoveAnywhere(cardId) {
  if (tryAutoMoveToFoundation(cardId)) return true;
  const loc = locateCard(cardId);
  if (!loc) return false;
  const run = getDraggableRun(loc);
  if (!run) return false;
  for (let i = 0; i < 7; i++) {
    if (loc.type === "tableau" && loc.index === i) continue;
    if (canDropRunOnTableau(run, i)) return tryMove(cardId, { type: "tableau", index: i });
  }
  return false;
}

/* ============================== Win / Auto-finish ============================== */

function checkWin() {
  const total = SUITS.reduce((n, s) => n + state.foundations[s].length, 0);
  if (total === 52) {
    stopTimer();
    const secs = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById("winStats").textContent =
      `Solved in ${state.moves} moves and ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}.`;
    document.getElementById("winOverlay").classList.remove("hidden");
    launchConfetti();
    playWinSound();
  }
}

function allTableauFaceUp() {
  return state.tableau.every((pile) => pile.every((c) => c.faceUp));
}

function updateAutoFinishVisibility() {
  const btn = document.getElementById("autoFinishBtn");
  const eligible = state.stock.length === 0 && state.waste.length === 0 && allTableauFaceUp();
  btn.classList.toggle("hidden", !eligible);
}

function autoFinishStep() {
  // find any single top card (tableau tail or waste top) that can go to a foundation
  for (let i = 0; i < 7; i++) {
    const pile = state.tableau[i];
    if (!pile.length) continue;
    const top = pile[pile.length - 1];
    if (canStackFoundation(top, top.suit)) {
      const prevRects = captureRects();
      pushHistory();
      pile.pop();
      state.foundations[top.suit].push(top);
      state.moves++;
      render();
      animateFromRects(prevRects);
      playFoundationSound();
      return true;
    }
  }
  if (state.waste.length) {
    const top = state.waste[state.waste.length - 1];
    if (canStackFoundation(top, top.suit)) {
      const prevRects = captureRects();
      pushHistory();
      state.waste.pop();
      state.foundations[top.suit].push(top);
      state.moves++;
      render();
      animateFromRects(prevRects);
      playFoundationSound();
      return true;
    }
  }
  return false;
}

function autoFinish() {
  const step = () => {
    if (autoFinishStep()) {
      checkWin();
      setTimeout(step, 140);
    }
  };
  step();
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

function playMoveSound() { playTone(520, 0.09, { type: "triangle", volume: 0.1 }); }
function playFoundationSound() {
  playTone(784, 0.1, { type: "sine", volume: 0.14 });
  playTone(1047, 0.14, { type: "sine", volume: 0.11, delay: 0.05 });
}
function playDrawSound() { playTone(440, 0.05, { type: "square", volume: 0.05 }); }
function playInvalidSound() { playTone(160, 0.16, { type: "sawtooth", volume: 0.08 }); }
function playWinSound() {
  [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.22, { type: "sine", volume: 0.15, delay: i * 0.11 }));
}
function playUndoSound() {
  playTone(500, 0.09, { type: "triangle", volume: 0.1 });
  playTone(380, 0.11, { type: "triangle", volume: 0.09, delay: 0.06 });
}
function playNewGameSound() {
  [440, 587, 740].forEach((f, i) => playTone(f, 0.13, { type: "sine", volume: 0.12, delay: i * 0.07 }));
}

/* ============================== Confetti ============================== */

function launchConfetti() {
  const layer = document.getElementById("dragLayer");
  const colors = ["#ffd54f", "#ff6f61", "#4fc3f7", "#81c784", "#ba68c8"];
  const pieces = [];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.top = "-10px";
    el.style.left = Math.random() * 100 + "vw";
    el.style.width = "8px";
    el.style.height = "8px";
    el.style.background = colors[i % colors.length];
    el.style.opacity = "0.9";
    el.style.borderRadius = "2px";
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    el.style.transition = `transform 2.2s ease-in, top 2.2s ease-in, opacity 2.2s`;
    layer.appendChild(el);
    pieces.push(el);
  }
  requestAnimationFrame(() => {
    pieces.forEach((el) => {
      el.style.top = "110vh";
      el.style.transform = `rotate(${Math.random() * 720}deg)`;
      el.style.opacity = "0.2";
    });
  });
  setTimeout(() => pieces.forEach((el) => el.remove()), 2400);
}

/* ============================== Rendering ============================== */

function cardEl(card, extraClass) {
  const el = document.createElement("div");
  el.className = "card " + (card.faceUp ? SUIT_COLOR[card.suit] : "facedown") + (extraClass ? " " + extraClass : "");
  el.dataset.id = card.id;
  if (card.faceUp) {
    const rank = document.createElement("div");
    rank.className = "corner-rank";
    rank.textContent = rankLabel(card.rank);
    const suit = document.createElement("div");
    suit.className = "corner-suit";
    suit.textContent = SUIT_SYMBOL[card.suit];
    const pip = document.createElement("div");
    pip.className = "pip-center";
    pip.textContent = SUIT_SYMBOL[card.suit];
    el.appendChild(rank);
    el.appendChild(suit);
    el.appendChild(pip);
  }
  return el;
}

function stackOffset() {
  return cachedStackOffset;
}

function render() {
  // Foundations
  document.querySelectorAll(".foundation").forEach((slot) => {
    const suit = slot.dataset.suit;
    slot.setAttribute("data-suit-symbol", SUIT_SYMBOL[suit]);
    slot.querySelectorAll(".card").forEach((c) => c.remove());
    const pile = state.foundations[suit];
    if (pile.length) {
      const top = pile[pile.length - 1];
      const el = cardEl(top);
      slot.appendChild(el);
    }
  });

  // Stock
  const stockSlot = document.getElementById("stockPile");
  stockSlot.querySelectorAll(".card").forEach((c) => c.remove());
  if (state.stock.length) {
    const el = cardEl({ suit: "S", rank: 1, faceUp: false }, "");
    el.dataset.id = "__stock__";
    stockSlot.appendChild(el);
  }

  // Waste
  const wasteSlot = document.getElementById("wastePile");
  wasteSlot.querySelectorAll(".card").forEach((c) => c.remove());
  const wasteShown = drawMode === 3 ? state.waste.slice(-3) : state.waste.slice(-1);
  wasteShown.forEach((card, i) => {
    const el = cardEl(card);
    el.style.left = i * 14 + "px";
    if (i === wasteShown.length - 1) {
      el.classList.add("interactive-top");
    } else {
      el.style.pointerEvents = "none";
    }
    wasteSlot.appendChild(el);
  });

  // Tableau
  const offset = stackOffset();
  for (let i = 0; i < 7; i++) {
    const slot = document.querySelector(`.tableau-pile[data-index="${i}"]`);
    slot.querySelectorAll(".card").forEach((c) => c.remove());
    const pile = state.tableau[i];
    pile.forEach((card, idx) => {
      const el = cardEl(card);
      el.style.top = idx * offset + "px";
      el.style.zIndex = String(idx);
      slot.appendChild(el);
    });
  }

  document.getElementById("movesVal").textContent = state.moves;
  updateAutoFinishVisibility();
}

/* ---------- Slide animation (FLIP) ----------
   render() always rebuilds the board from scratch, so to make a move look
   like a slide rather than a jump: snapshot every card's on-screen position
   before the state change, let render() rebuild at the new positions, then
   nudge each card back to its old spot with a transform and let it
   transition to zero, which reads as a smooth slide into place. */

function captureRects() {
  const rects = new Map();
  document.querySelectorAll(".card[data-id]").forEach((el) => {
    const id = el.dataset.id;
    if (id === "__stock__") return;
    rects.set(id, el.getBoundingClientRect());
  });
  return rects;
}

function animateFromRects(prevRects) {
  const toAnimate = [];
  document.querySelectorAll(".card[data-id]").forEach((el) => {
    const id = el.dataset.id;
    if (id === "__stock__") return;
    const prev = prevRects.get(id);
    if (!prev) return;
    const next = el.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    toAnimate.push(el);
  });
  if (!toAnimate.length) return;
  void document.body.offsetHeight; // force reflow so the start position takes effect
  requestAnimationFrame(() => {
    toAnimate.forEach((el) => {
      el.style.transition = "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)";
      el.style.transform = "";
    });
    setTimeout(() => {
      toAnimate.forEach((el) => { el.style.transition = ""; });
    }, 260);
  });
}

/* ============================== Input ============================== */

function cssEscape(s) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function pileFromElement(el) {
  const slot = el.closest(".pile-slot");
  if (!slot) return null;
  const type = slot.dataset.pile;
  if (type === "tableau") return { type: "tableau", index: Number(slot.dataset.index), el: slot };
  if (type === "foundation") return { type: "foundation", index: slot.dataset.suit, el: slot };
  if (type === "waste") return { type: "waste", el: slot };
  if (type === "stock") return { type: "stock", el: slot };
  return null;
}

function shakeCard(cardId) {
  const el = document.querySelector(`.card[data-id="${cssEscape(cardId)}"]`);
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth; // restart the animation if it's already running
  el.classList.add("shake");
  el.addEventListener("animationend", () => el.classList.remove("shake"), { once: true });
  playInvalidSound();
}

// A tap on a card tries to send it straight to wherever it belongs
// (foundation first, then any legal tableau pile). Dragging still lets you
// choose the destination by hand.
function handleCardTap(cardId) {
  const loc = locateCard(cardId);
  if (!loc) return;

  if (loc.type === "stock") { drawFromStock(); return; }

  const moved = tryAutoMoveAnywhere(cardId);
  if (!moved) shakeCard(cardId);
}

/* ---------- Pointer-based drag ---------- */

let dragState = null;
const DRAG_THRESHOLD = 6;

function onPointerDown(e) {
  const cardEl = e.target.closest(".card");
  if (!cardEl) return;
  const cardId = cardEl.dataset.id;
  if (cardId === "__stock__") return;

  const loc = locateCard(cardId);
  if (!loc) return;
  const run = getDraggableRun(loc);
  if (!run) return;

  dragState = {
    cardId,
    loc,
    run,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
    els: [],
    originEl: cardEl,
  };
  e.preventDefault();
}

function beginDragVisuals() {
  const layer = document.getElementById("dragLayer");
  const rect = dragState.originEl.getBoundingClientRect();
  dragState.originRect = rect;
  dragState.run.forEach((card, i) => {
    const el = cardEl(card, "dragging");
    el.style.position = "fixed";
    el.style.left = rect.left + "px";
    el.style.top = rect.top + i * stackOffset() + "px";
    el.style.width = rect.width + "px";
    el.style.height = rect.height + "px";
    layer.appendChild(el);
    dragState.els.push(el);
    const orig = document.querySelector(`.card[data-id="${cssEscape(card.id)}"]`);
    if (orig) orig.style.visibility = "hidden";
  });
}

function onPointerMove(e) {
  if (!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  if (!dragState.active) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragState.active = true;
    beginDragVisuals();
  }
  dragState.els.forEach((el, i) => {
    el.style.left = dragState.originRect.left + dx + "px";
    el.style.top = dragState.originRect.top + dy + i * stackOffset() + "px";
  });
}

function endDragVisuals(ds) {
  ds.els.forEach((el) => el.remove());
  ds.run.forEach((card) => {
    const orig = document.querySelector(`.card[data-id="${cssEscape(card.id)}"]`);
    if (orig) orig.style.visibility = "";
  });
}

function onPointerUp(e) {
  if (!dragState) return;
  const ds = dragState;
  dragState = null;

  if (!ds.active) {
    // simple tap
    handleCardTap(ds.cardId);
    return;
  }

  endDragVisuals(ds);

  const dropEl = document.elementFromPoint(e.clientX, e.clientY);
  let pileTarget = dropEl ? pileFromElement(dropEl) : null;
  if (!pileTarget && dropEl) {
    const cardUnder = dropEl.closest(".card");
    if (cardUnder) pileTarget = pileFromElement(cardUnder);
  }

  if (pileTarget && (pileTarget.type === "tableau" || pileTarget.type === "foundation")) {
    // The drag itself already animated the card to this spot, so skip the
    // extra slide here - it would otherwise jump back to the origin first.
    tryMove(ds.cardId, pileTarget, { animate: false });
  } else {
    render();
  }
}

function onBoardClick(e) {
  if (e.target.closest("#stockPile")) { drawFromStock(); return; }
  // Card taps are handled via pointerup; empty pile slots aren't tap targets.
}

/* ---------- Full screen ---------- */

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return;
  try {
    const p = fn.call(el);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {}
}

function exitFullscreenIfActive() {
  if (!isFullscreen()) return;
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn) return;
  try {
    const p = fn.call(document);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {}
}

function setupFullscreen() {
  const supported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const seg = document.getElementById("fullscreenSeg");
  if (!supported) {
    seg.closest(".menu-row").style.display = "none";
    return;
  }

  // Browsers only allow entering full screen from within a real user
  // gesture. Some mobile browsers don't reliably honor it from a bare
  // pointerdown, so retry on every click (not just the first) until it
  // actually takes - this also re-enters full screen if the player leaves
  // it by some other means (e.g. the system back gesture) while the
  // preference is still on. Once already full screen this is a no-op.
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

function applyBackground(name) {
  Array.from(document.body.classList)
    .filter((c) => c.startsWith("bg-"))
    .forEach((c) => document.body.classList.remove(c));
  if (name !== "classic") document.body.classList.add("bg-" + name);
}

function init() {
  document.body.classList.toggle("hand-left", handMode === "left");
  applyBackground(background);
  computeCardSize();
  window.addEventListener("resize", onViewportResize);
  window.addEventListener("orientationchange", onViewportResize);

  const board = document.getElementById("board");
  board.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  board.addEventListener("click", onBoardClick);

  document.getElementById("newGameBtn").addEventListener("click", () => {
    if (state.moves > 0) {
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

  document.getElementById("autoFinishBtn").addEventListener("click", autoFinish);

  setupFullscreen();

  wireSegmented("drawModeSeg", String(drawMode), (mode) => {
    drawMode = Number(mode);
    writeSetting("solitaire.drawMode", String(drawMode));
  });

  wireSegmented("handModeSeg", handMode, (mode) => {
    handMode = mode;
    writeSetting("solitaire.hand", mode);
    document.body.classList.toggle("hand-left", mode === "left");
  });

  wireSegmented("fullscreenSeg", fullscreenPref, (mode) => {
    fullscreenPref = mode;
    writeSetting("solitaire.fullscreen", mode);
    if (mode === "on") requestFullscreen();
    else exitFullscreenIfActive();
  });

  wireSegmented("soundSeg", soundOn ? "on" : "off", (mode) => {
    soundOn = mode === "on";
    writeSetting("solitaire.sound", mode);
    if (soundOn) playMoveSound();
  });

  const bgGrid = document.getElementById("bgGrid");
  bgGrid.querySelectorAll(".bg-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      background = btn.dataset.bg;
      writeSetting("solitaire.background", background);
      bgGrid.querySelectorAll(".bg-swatch").forEach((b) => b.classList.toggle("active", b === btn));
      applyBackground(background);
    });
    btn.classList.toggle("active", btn.dataset.bg === background);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  newGame();
}

document.addEventListener("DOMContentLoaded", init);
})();

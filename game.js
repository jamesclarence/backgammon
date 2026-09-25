/* ---------------------------------------------------------------------
   Backgammon — local hot-seat game
   Points are numbered 1-24. White moves 24 -> 1 and bears off past 1.
   Black moves 1 -> 24 and bears off past 24.
   ------------------------------------------------------------------- */

const HOME = {
  white: [1, 2, 3, 4, 5, 6],
  black: [19, 20, 21, 22, 23, 24],
};

const QUADRANTS = {
  quadTopLeft: [13, 14, 15, 16, 17, 18],
  quadTopRight: [19, 20, 21, 22, 23, 24],
  quadBottomLeft: [12, 11, 10, 9, 8, 7],
  quadBottomRight: [6, 5, 4, 3, 2, 1],
};

function opponent(player) {
  return player === "white" ? "black" : "white";
}

function freshState() {
  const points = {};
  for (let i = 1; i <= 24; i++) points[i] = { owner: null, count: 0 };
  points[24] = { owner: "white", count: 2 };
  points[13] = { owner: "white", count: 5 };
  points[8] = { owner: "white", count: 3 };
  points[6] = { owner: "white", count: 5 };
  points[1] = { owner: "black", count: 2 };
  points[12] = { owner: "black", count: 5 };
  points[17] = { owner: "black", count: 3 };
  points[19] = { owner: "black", count: 5 };

  return {
    points,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    turn: "white",
    dice: [],       // all dice values rolled this turn (for display)
    remaining: [],  // dice values not yet used
    usedValues: [],  // dice values already consumed this turn, in order used
    selectedDie: null,
    selectedSource: null, // the point number (or "bar") of the checker currently picked up
    hasRolled: false,
    gameOver: false,
  };
}

let state = freshState();
let mode = "beginner"; // "beginner" | "normal" — how much guidance is shown
let opponentType = "computer"; // "computer" | "human" — who plays Black
let humanColor = "white"; // "white" | "black" — which side the human plays vs Computer
let moveNumber = 0; // increments once per checker move, for the move log
let score = { white: 0, black: 0 }; // cumulative match score, across "New game" clicks
let matchTarget = 5; // first side to reach or pass this many points wins the match
let matchOver = false; // true once someone has reached matchTarget
let colorChosenForMatch = false; // true once the player has confirmed White/Black for this match

function aiPlayerColor() {
  return opponent(humanColor);
}
function isAiTurn() {
  return opponentType === "computer" && state.turn === aiPlayerColor();
}
function isHumanTurn() {
  return !isAiTurn();
}
function displayName(player) {
  if (opponentType === "computer" && player === aiPlayerColor()) return "Computer";
  return cap(player);
}

// True at the very start of a match — before either side has scored or
// made a single move. Used to gate the color choice and match-target
// picker, which shouldn't change mid-match.
function isMatchNotStarted() {
  return score.white === 0 && score.black === 0 && moveNumber === 0;
}

/* ----------------------------- Rules ------------------------------- */

function pointOpenFor(player, pointNum) {
  const p = state.points[pointNum];
  if (!p.owner || p.owner === player) return true;
  return p.count <= 1; // single opposing blot can be hit
}

function distanceToOff(player, pointNum) {
  return player === "white" ? pointNum : 25 - pointNum;
}

function allCheckersInHome(player) {
  if (state.bar[player] > 0) return false;
  const home = HOME[player];
  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.owner === player && p.count > 0 && !home.includes(i)) return false;
  }
  return true;
}

function hasFartherChecker(player, pointNum) {
  // "farther" = farther from bearing off than pointNum
  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.owner !== player || p.count === 0) continue;
    if (player === "white" && i > pointNum) return true;
    if (player === "black" && i < pointNum) return true;
  }
  return false;
}

// Returns array of legal move sources ('bar' or point number) for a given die.
function legalSourcesForDie(player, die) {
  const sources = [];

  if (state.bar[player] > 0) {
    const entry = player === "white" ? 25 - die : die;
    if (pointOpenFor(player, entry)) sources.push("bar");
    return sources;
  }

  const canBearOff = allCheckersInHome(player);

  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.owner !== player || p.count === 0) continue;

    const dest = player === "white" ? i - die : i + die;

    if (dest >= 1 && dest <= 24) {
      if (pointOpenFor(player, dest)) sources.push(i);
    } else {
      // would move off the board
      if (!canBearOff) continue;
      const dist = distanceToOff(player, i);
      if (die === dist) {
        sources.push(i);
      } else if (die > dist && !hasFartherChecker(player, i)) {
        sources.push(i);
      }
    }
  }
  return sources;
}

function destinationForDie(player, source, die) {
  if (source === "bar") return player === "white" ? 25 - die : die;
  const dest = player === "white" ? source - die : source + die;
  return dest; // may be < 1 or > 24, meaning bear off
}

/* ------------------------ Click-saving automation -------------------- */
// Small conveniences, all triggered right after a roll or a move:
// - a checker on the bar is the only legal source for any die, so pick it
//   up automatically once a die is selected;
// - whenever there's only one usable die value left this turn — whether
//   that's because it's a doubles roll (all four the same) or because the
//   other die of a normal roll has already been used — there's nothing
//   left to choose between, so select it automatically.

function autoSelectDie() {
  if (!isHumanTurn() || state.gameOver || !state.hasRolled) return;
  if (state.selectedDie !== null || state.remaining.length === 0) return;
  const uniqueValues = [...new Set(state.remaining)];
  if (uniqueValues.length !== 1) return;
  const value = uniqueValues[0];
  if (legalSourcesForDie(state.turn, value).length > 0) {
    state.selectedDie = value;
  }
}

function autoSelectBarSource() {
  if (!isHumanTurn() || state.gameOver || !state.hasRolled) return;
  if (state.selectedDie === null || state.selectedSource !== null) return;
  if (state.bar[state.turn] === 0) return;
  if (legalSourcesForDie(state.turn, state.selectedDie).includes("bar")) {
    state.selectedSource = "bar";
  }
}

/* ---------------------------- Drag and drop --------------------------- */
// Every checker can also be dragged instead of clicked. Dragging a checker
// computes, up front, every remaining die that legally moves it, then
// drops onto whichever destination matches one of those dice.

let dragSourceValue = null; // point number or "bar" currently being dragged
let dragCandidates = [];    // [{die, dest}] legal destinations for that source

function clearDragHighlights() {
  document.querySelectorAll(".drag-target").forEach((el) => el.classList.remove("drag-target"));
}

function highlightDragTargets() {
  clearDragHighlights();
  for (const { dest } of dragCandidates) {
    if (dest < 1 || dest > 24) {
      document.getElementById(state.turn === "white" ? "offWhite" : "offBlack").classList.add("drag-target");
    } else {
      const el = document.querySelector(`.point[data-point="${dest}"]`);
      if (el) el.classList.add("drag-target");
    }
  }
}

function onCheckerDragStart(e, source) {
  if (!isHumanTurn() || state.gameOver || !state.hasRolled) { e.preventDefault(); return; }
  const validDice = [...new Set(state.remaining)]
    .filter((d) => legalSourcesForDie(state.turn, d).includes(source))
    .sort((a, b) => a - b);
  if (validDice.length === 0) { e.preventDefault(); return; }
  dragSourceValue = source;
  dragCandidates = validDice.map((d) => ({ die: d, dest: destinationForDie(state.turn, source, d) }));
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(source));
  highlightDragTargets();
}

function onCheckerDragEnd() {
  dragSourceValue = null;
  dragCandidates = [];
  clearDragHighlights();
}

function handleDrop(target) {
  if (dragSourceValue === null) return;
  const candidate = dragCandidates.find((c) => (target === "off" ? (c.dest < 1 || c.dest > 24) : c.dest === target));
  const source = dragSourceValue;
  onCheckerDragEnd();
  if (!candidate) return;
  state.selectedDie = candidate.die;
  state.selectedSource = source;
  performMove(source);
}

function applyMove(player, source, die, detail = null) {
  const dest = destinationForDie(player, source, die);

  if (source === "bar") {
    state.bar[player]--;
  } else {
    state.points[source].count--;
    if (state.points[source].count === 0) state.points[source].owner = null;
  }

  let logText;
  const fromLabel = source === "bar" ? "bar" : source;

  if (dest < 1 || dest > 24) {
    state.off[player]++;
    logText = `${displayName(player)}: ${fromLabel} \u2192 off (${die})`;
  } else {
    const p = state.points[dest];
    if (p.owner && p.owner !== player && p.count === 1) {
      state.bar[opponent(player)]++;
      p.owner = player;
      p.count = 1;
      logText = `${displayName(player)}: ${fromLabel} \u2192 ${dest} (${die}) — hit!`;
    } else {
      p.owner = player;
      p.count++;
      logText = `${displayName(player)}: ${fromLabel} \u2192 ${dest} (${die})`;
    }
  }

  moveNumber++;
  addLog({ player, main: logText, detail, number: moveNumber });

  const idx = state.remaining.indexOf(die);
  state.remaining.splice(idx, 1);
  state.usedValues.push(die);

  if (state.off[player] === 15) {
    state.gameOver = true;
    showWin(player);
  }
}

function anyLegalMoveRemaining(player) {
  const diceToCheck = [...new Set(state.remaining)];
  for (const d of diceToCheck) {
    if (legalSourcesForDie(player, d).length > 0) return true;
  }
  return false;
}

/* ------------------------------- AI -------------------------------- */

// A simple heuristic opponent: no lookahead, just scores each candidate
// move by immediate value (bearing off, hitting, safety, point-making).
function evaluateMove(player, source, die) {
  const dest = destinationForDie(player, source, die);
  let score = 0;

  if (dest < 1 || dest > 24) {
    score += 60; // bearing off is always good progress
  } else {
    const destPoint = state.points[dest];
    const isHit = !!(destPoint.owner && destPoint.owner !== player && destPoint.count === 1);
    if (isHit) score += 35;
    const priorOwnCount = destPoint.owner === player ? destPoint.count : 0;
    const countAfter = priorOwnCount + 1;
    if (countAfter >= 2) score += 12; // makes/reinforces a safe point
    else if (!isHit) score -= 8; // leaves a new blot
  }

  if (source !== "bar") {
    const countAfterSource = state.points[source].count - 1;
    if (countAfterSource === 1) score -= 8; // leaves a blot behind
  }

  score += die * 0.5; // small tiebreak toward bigger progress
  return score;
}

function chooseAiMove() {
  const player = state.turn;
  const diceValues = [...new Set(state.remaining)];
  let best = null;
  for (const die of diceValues) {
    for (const source of legalSourcesForDie(player, die)) {
      const score = evaluateMove(player, source, die);
      if (!best || score > best.score) best = { source, die, score };
    }
  }
  return best;
}

// Short reason for the computer's move, nested under the move line in the
// log. Must be called BEFORE applyMove mutates the board, since it reads
// the pre-move state of the source and destination points.
function describeAiMove(player, source, die) {
  const dest = destinationForDie(player, source, die);

  if (dest < 1 || dest > 24) return "Bearing off \u2014 pure progress.";

  const destPoint = state.points[dest];
  const isHit = !!(destPoint.owner && destPoint.owner !== player && destPoint.count === 1);
  const priorOwnCount = destPoint.owner === player ? destPoint.count : 0;
  const makesPoint = !isHit && priorOwnCount + 1 >= 2;
  const sourceCountAfter = source === "bar" ? null : state.points[source].count - 1;
  const leavesBlotBehind = source !== "bar" && sourceCountAfter === 1;

  if (isHit) return "Hits your blot, sending it to the bar.";
  if (makesPoint) return "Makes a safe point.";
  if (leavesBlotBehind) return "Leaves a blot \u2014 other options were worse.";
  return "Just advancing toward home.";
}

function aiPlayTurn() {
  if (state.gameOver || !isAiTurn()) return;

  if (state.remaining.length === 0 || !anyLegalMoveRemaining(state.turn)) {
    if (state.remaining.length > 0) {
      addLog({ player: state.turn, main: `${displayName(state.turn)} has no more legal moves.` });
      state.remaining = [];
      render();
    }
    setTimeout(() => {
      if (!state.gameOver) endTurn();
    }, 500);
    return;
  }

  const move = chooseAiMove();
  const reason = describeAiMove(state.turn, move.source, move.die);
  applyMove(state.turn, move.source, move.die, reason);
  render();

  if (!state.gameOver) setTimeout(aiPlayTurn, 700);
}

/* ----------------------------- Dice -------------------------------- */

function rollDice() {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  state.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  state.remaining = [...state.dice];
  state.usedValues = [];
  state.hasRolled = true;
  state.selectedDie = null;
  state.selectedSource = null;
  addLog({ player: state.turn, main: `${displayName(state.turn)} rolls ${d1} and ${d2}${d1 === d2 ? " (doubles!)" : ""}` });

  if (!anyLegalMoveRemaining(state.turn)) {
    addLog({ player: state.turn, main: `${displayName(state.turn)} has no legal moves.` });
    state.remaining = [];
  }

  autoSelectDie();
  autoSelectBarSource();
  render();
}

function maybeStartAiTurn() {
  if (!state.gameOver && isAiTurn()) {
    setTimeout(() => {
      rollDice();
      setTimeout(aiPlayTurn, 650);
    }, 500);
  }
}

// Forces an explicit White/Black choice at the start of a fresh match
// against the computer, rather than silently defaulting to White.
function maybeShowColorChoice() {
  const modal = document.getElementById("colorChoiceModal");
  if (opponentType === "computer" && isMatchNotStarted() && !colorChosenForMatch) {
    modal.classList.add("open");
  } else {
    modal.classList.remove("open");
  }
}

function endTurn() {
  state.turn = opponent(state.turn);
  state.dice = [];
  state.remaining = [];
  state.usedValues = [];
  state.selectedDie = null;
  state.selectedSource = null;
  state.hasRolled = false;
  render();
  maybeStartAiTurn();
}

/* ----------------------------- Logging ------------------------------ */

function addLog({ player, main, detail = null, number = null }) {
  const log = document.getElementById("moveLog");
  const li = document.createElement("li");
  li.className = `log-entry log-${player}`;

  if (number !== null) {
    const num = document.createElement("span");
    num.className = "log-number";
    num.textContent = `${number}.`;
    li.appendChild(num);
  }

  const mainEl = document.createElement("span");
  mainEl.className = "log-main";
  mainEl.textContent = main;
  li.appendChild(mainEl);

  if (detail) {
    const detailEl = document.createElement("span");
    detailEl.className = "log-detail";
    detailEl.textContent = detail;
    li.appendChild(detailEl);
  }

  log.insertBefore(li, log.firstChild);
  log.scrollTop = 0;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ----------------------------- Rendering ----------------------------- */

function render() {
  renderBoard();
  renderDice();
  renderTurnIndicator();
  renderButtons();
  renderTips();
  renderToggles();
  renderScoreboard();
  renderPipCount();
  renderCheckersCount();
}

function renderBoard() {
  for (const quadId of Object.keys(QUADRANTS)) {
    const el = document.getElementById(quadId);
    el.innerHTML = "";
    const isTop = quadId.startsWith("quadTop");
    QUADRANTS[quadId].forEach((pointNum) => {
      el.appendChild(buildPointEl(pointNum, isTop));
    });
  }
  renderBar();
  renderOff();
}

function buildPointEl(pointNum, isTop) {
  const div = document.createElement("div");
  div.className = `point ${isTop ? "top" : "bottom"} ${pointNum % 2 === 0 ? "light" : "dark"}`;
  div.dataset.point = pointNum;

  const tri = document.createElement("div");
  tri.className = "triangle";
  div.appendChild(tri);

  const label = document.createElement("div");
  label.className = "point-number";
  label.textContent = pointNum;
  div.appendChild(label);

  const legalSrc = isLegalSource(pointNum);
  const legalDest = isLegalDestination(pointNum);

  const stack = document.createElement("div");
  stack.className = "checker-stack";
  const p = state.points[pointNum];
  const canDragFromHere = p.owner === state.turn && isHumanTurn() && state.hasRolled && !state.gameOver;
  for (let i = 0; i < p.count; i++) {
    const c = document.createElement("div");
    c.className = `checker ${p.owner}`;
    if (i === p.count - 1 && p.count > 5) c.textContent = p.count;
    if (i === p.count - 1 && pointNum === state.selectedSource) {
      c.classList.add("selected");
    } else if (i === p.count - 1 && legalSrc) {
      // The checker nearest the point's tip is the one that would actually
      // move, so it — not the whole stack — gets the "you can pick this
      // checker up" glow.
      c.classList.add("movable");
    }
    if (p.count === 1 && isHittableBlot(pointNum)) c.classList.add("hittable");
    if (canDragFromHere) {
      c.draggable = true;
      c.addEventListener("dragstart", (e) => onCheckerDragStart(e, pointNum));
      c.addEventListener("dragend", onCheckerDragEnd);
    }
    if (p.count > 5 && i > 0 && i < p.count - 1) continue; // avoid overdraw, handled below
    stack.appendChild(c);
  }
  div.appendChild(stack);

  if (legalSrc) div.classList.add("legal-source");
  if (legalDest && mode === "beginner") div.classList.add("legal-destination");
  if (legalSrc || legalDest) {
    div.addEventListener("click", () => onPointClick(pointNum));
  }

  div.addEventListener("dragover", (e) => {
    if (dragSourceValue === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  div.addEventListener("drop", (e) => {
    e.preventDefault();
    handleDrop(pointNum);
  });

  return div;
}

function renderBar() {
  ["barTop", "barBottom"].forEach((id) => {
    const el = document.getElementById(id);
    el.innerHTML = "";
    // Top bar shows black's bar checkers (black home is top-right quadrant),
    // bottom bar shows white's bar checkers.
    const player = id === "barTop" ? "black" : "white";
    const count = state.bar[player];
    const canDrag = player === state.turn && isHumanTurn() && state.hasRolled && !state.gameOver && count > 0;
    const legalSrc = player === state.turn && isLegalSource("bar");
    for (let i = 0; i < Math.min(count, 5); i++) {
      const c = document.createElement("div");
      c.className = `bar-checker ${player}`;
      if (i === 0 && state.selectedSource === "bar" && player === state.turn) {
        c.classList.add("selected");
      } else if (i === 0 && legalSrc) {
        c.classList.add("movable");
      }
      if (canDrag) {
        c.draggable = true;
        c.addEventListener("dragstart", (e) => onCheckerDragStart(e, "bar"));
        c.addEventListener("dragend", onCheckerDragEnd);
      }
      el.appendChild(c);
    }
    if (count > 0) {
      const label = document.createElement("div");
      label.className = "bar-count";
      label.textContent = count;
      el.appendChild(label);
    }
    el.classList.toggle("legal-source", isLegalSource("bar") && state.bar[state.turn] > 0 && player === state.turn);
    el.onclick = () => {
      if (player === state.turn) onBarClick();
    };
  });
}

function renderOff() {
  const offWhite = document.getElementById("offWhite");
  const offBlack = document.getElementById("offBlack");
  offWhite.innerHTML = "";
  offBlack.innerHTML = "";
  for (let i = 0; i < state.off.white; i++) {
    const c = document.createElement("div");
    c.className = "checker white";
    offWhite.appendChild(c);
  }
  for (let i = 0; i < state.off.black; i++) {
    const c = document.createElement("div");
    c.className = "checker black";
    offBlack.appendChild(c);
  }

  offWhite.classList.remove("legal-destination");
  offBlack.classList.remove("legal-destination");
  offWhite.onclick = null;
  offBlack.onclick = null;

  const bearOffTray = state.turn === "white" ? offWhite : offBlack;
  if (isBearOffDestination(state.turn)) {
    bearOffTray.onclick = () => performMove(state.selectedSource);
    if (mode === "beginner") bearOffTray.classList.add("legal-destination");
  }
}

function isLegalSource(source) {
  if (state.gameOver || !state.hasRolled || state.selectedDie === null || !isHumanTurn()) return false;
  const sources = legalSourcesForDie(state.turn, state.selectedDie);
  return sources.includes(source);
}

function isLegalDestination(pointNum) {
  if (state.gameOver || !state.hasRolled || state.selectedDie === null || state.selectedSource === null || !isHumanTurn()) return false;
  const dest = destinationForDie(state.turn, state.selectedSource, state.selectedDie);
  return dest === pointNum;
}

function isBearOffDestination(player) {
  if (state.gameOver || !state.hasRolled || state.selectedDie === null || state.selectedSource === null || !isHumanTurn()) return false;
  if (state.turn !== player) return false;
  const dest = destinationForDie(state.turn, state.selectedSource, state.selectedDie);
  return dest < 1 || dest > 24;
}

function renderDice() {
  const row = document.getElementById("diceRow");
  row.innerHTML = "";

  // Pair each rolled die with whether it has been used, matching by value
  // (order-independent, so doubles are handled correctly).
  const usedPool = [...state.usedValues];
  let selectedAssigned = false;

  state.dice.forEach((value) => {
    const die = document.createElement("div");
    die.className = "die";
    die.textContent = value;

    const usedIdx = usedPool.indexOf(value);
    if (usedIdx !== -1) {
      usedPool.splice(usedIdx, 1);
      die.classList.add("used");
    } else {
      const legalNow = isHumanTurn() && legalSourcesForDie(state.turn, value).length > 0;
      if (!legalNow) die.classList.add("disabled");
      if (state.selectedDie === value && !selectedAssigned) {
        die.classList.add("selected");
        selectedAssigned = true;
      }
      die.addEventListener("click", () => onDieClick(value));
    }
    row.appendChild(die);
  });
}

function onDieClick(value) {
  if (!isHumanTurn() || legalSourcesForDie(state.turn, value).length === 0) return;
  state.selectedDie = state.selectedDie === value ? null : value;
  state.selectedSource = null;
  autoSelectBarSource();
  render();
}

// Completes a move: applies it, clears selection state, and advances the
// turn if no more dice can be played.
function performMove(source) {
  const die = state.selectedDie;
  applyMove(state.turn, source, die);
  state.selectedDie = null;
  state.selectedSource = null;

  if (state.gameOver) {
    render();
    return;
  }

  if (state.remaining.length === 0 || !anyLegalMoveRemaining(state.turn)) {
    if (state.remaining.length > 0) addLog({ player: state.turn, main: `${displayName(state.turn)} has no more legal moves.` });
    render();
    setTimeout(() => {
      if (!state.gameOver) endTurn();
    }, 700);
    return;
  }

  autoSelectDie();
  autoSelectBarSource();
  render();
}

// Handles a click on a board point. If a checker is already picked up and
// this point is where it can legally go, the move is completed. Otherwise,
// if this point holds a checker that can move with the selected die, it
// gets picked up (highlighted) — clicking it again confirms the move.
function onPointClick(pointNum) {
  if (!isHumanTurn() || state.selectedDie === null) return;

  if (state.selectedSource !== null) {
    const dest = destinationForDie(state.turn, state.selectedSource, state.selectedDie);
    if (dest === pointNum) {
      performMove(state.selectedSource);
      return;
    }
  }

  if (!legalSourcesForDie(state.turn, state.selectedDie).includes(pointNum)) return;

  if (state.selectedSource === pointNum) {
    state.selectedSource = null;
    render();
  } else {
    state.selectedSource = pointNum;
    render();
  }
}

// Same pick-up/confirm pattern as onPointClick, but for entering from the bar.
function onBarClick() {
  if (!isHumanTurn() || state.selectedDie === null) return;
  if (!legalSourcesForDie(state.turn, state.selectedDie).includes("bar")) return;

  if (state.selectedSource === "bar") {
    state.selectedSource = null;
    render();
  } else {
    state.selectedSource = "bar";
    render();
  }
}

function renderTurnIndicator() {
  const el = document.getElementById("turnIndicator");
  if (state.gameOver) {
    el.textContent = "Game over";
    return;
  }
  if (isAiTurn()) {
    el.textContent = state.hasRolled ? "Computer is moving\u2026" : "Computer is thinking\u2026";
    return;
  }
  if (!state.hasRolled) {
    el.textContent = `${displayName(state.turn)} to roll`;
  } else if (state.bar[state.turn] > 0) {
    el.textContent = `${displayName(state.turn)} must enter from the bar`;
  } else if (state.selectedDie !== null && state.selectedSource !== null) {
    el.textContent = `${displayName(state.turn)}: click the destination to move`;
  } else if (state.selectedDie !== null) {
    el.textContent = `${displayName(state.turn)}: pick a checker to move ${state.selectedDie}`;
  } else {
    el.textContent = `${displayName(state.turn)}: pick a die`;
  }
}

function renderButtons() {
  const human = isHumanTurn();
  document.getElementById("rollBtn").disabled = !human || (state.hasRolled && state.remaining.length > 0);
  document.getElementById("rollBtn").style.display = state.hasRolled || !human ? "none" : "block";
  document.getElementById("endTurnBtn").disabled =
    state.gameOver || !human || !state.hasRolled || (state.remaining.length > 0 && anyLegalMoveRemaining(state.turn));
}

/* ----------------------------- Beginner tips -------------------------- */

// Total pips (board spaces) a player still has to travel to bear everything
// off. Lower is better. A checker on the bar counts as needing the full trip.
function pipCount(player) {
  let pips = state.bar[player] * 25;
  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.owner === player) pips += p.count * distanceToOff(player, i);
  }
  return pips;
}

// Points where this player currently has two or more checkers (a "made" point).
function madePointsList(player) {
  const pts = [];
  for (let i = 1; i <= 24; i++) {
    if (state.points[i].owner === player && state.points[i].count >= 2) pts.push(i);
  }
  return pts;
}

// Which single-die values (1-6) would let an opposing checker land directly
// on pointNum right now, given the current board (ignores combined-die shots).
function directShotsAt(pointNum, blotOwner) {
  const attacker = opponent(blotOwner);
  const shots = new Set();
  for (let j = 1; j <= 24; j++) {
    const p = state.points[j];
    if (p.owner !== attacker || p.count === 0) continue;
    for (let d = 1; d <= 6; d++) {
      if (destinationForDie(attacker, j, d) === pointNum) shots.add(d);
    }
  }
  return [...shots].sort((a, b) => a - b);
}

// Any way the current player can hit an opposing blot using the dice they
// actually have left to play this turn.
function findHitOpportunities(turn) {
  const opp = opponent(turn);
  const blotPoints = [];
  for (let i = 1; i <= 24; i++) {
    if (state.points[i].owner === opp && state.points[i].count === 1) blotPoints.push(i);
  }
  if (blotPoints.length === 0) return [];

  const opportunities = [];
  for (const die of [...new Set(state.remaining)]) {
    for (const source of legalSourcesForDie(turn, die)) {
      const dest = destinationForDie(turn, source, die);
      if (blotPoints.includes(dest)) opportunities.push({ source, die, dest });
    }
  }
  return opportunities;
}

// True if pointNum holds a single opposing checker that the current player
// could hit right now with one of the dice they have left this turn.
function isHittableBlot(pointNum) {
  if (state.gameOver || !state.hasRolled || !isHumanTurn()) return false;
  const p = state.points[pointNum];
  if (p.owner !== opponent(state.turn) || p.count !== 1) return false;
  for (const die of [...new Set(state.remaining)]) {
    for (const source of legalSourcesForDie(state.turn, die)) {
      if (destinationForDie(state.turn, source, die) === pointNum) return true;
    }
  }
  return false;
}

// Rotating glossary shown in place of a contextual tip — a steady stream
// of simple backgammon term definitions, cycled on a timer.
const GLOSSARY = [
  { term: "Blot", def: "A single checker alone on a point. It can be hit and sent to the bar." },
  { term: "Anchor", def: "A point you hold deep in your opponent's home board, giving you a safe base while behind in the race." },
  { term: "Prime", def: "A row of six consecutive points you own, trapping any opposing checker behind it." },
  { term: "Pip", def: "One space of movement. \"Pip count\" is how far a player's checkers still have to travel in total." },
  { term: "Bear off", def: "Removing a checker from the board for good, once all of your checkers are in your home board." },
  { term: "Hit", def: "Landing on an opponent's blot, sending it back to the bar." },
  { term: "Home board", def: "The six points where a player must gather all their checkers before they can bear off." },
  { term: "The bar", def: "Where hit checkers go. They must re-enter through the opponent's home board before any other move." },
  { term: "Gammon", def: "Winning a game before your opponent bears off a single checker — worth double the points." },
  { term: "Made point", def: "A point held by two or more of your own checkers, which your opponent can't land on." },
  { term: "Race", def: "A position where hitting is unlikely and the game comes down to who gets home and bears off first." },
  { term: "Back game", def: "A risky strategy of holding two or more deep anchors while far behind, hoping for a late hit." },
];
let glossaryIndex = 0;

function renderGlossaryTip() {
  const box = document.getElementById("tipsBox");
  const text = document.getElementById("tipsText");
  if (mode !== "beginner") {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  const entry = GLOSSARY[glossaryIndex % GLOSSARY.length];
  text.innerHTML = `<strong>${entry.term}:</strong> ${entry.def}`;
}

setInterval(() => {
  glossaryIndex++;
  renderGlossaryTip();
}, 30000);

// Short, high-signal strategy line shown under the board. Prioritizes the
// single most useful thing right now: a core-concept reminder at the very
// start of the game, then blot danger, then a hit, then bear-off status,
// then the race.
function getStrategyTip() {
  const turn = state.turn;
  const opp = opponent(turn);

  // 0. Very first turn of the game: explain the goal and bearing off once.
  if (moveNumber === 0) {
    return `Goal: move all 15 checkers around the board into your home board, then "bear off" (remove them from play). First to bear off all 15 wins.`;
  }

  // 1. A blot of yours — the most urgent thing on the board.
  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.owner === turn && p.count === 1) {
      const shots = directShotsAt(i, turn);
      const shotText = shots.length > 0
        ? ` ${displayName(opp)} can hit it with a ${shots.join(" or ")}.`
        : ` No direct shot available right now.`;
      return `Blot on point ${i} \u2014 a lone checker can be hit and sent to the bar.${shotText} Cover it when you can.`;
    }
  }

  // 2. A hit available with the dice you have left.
  const opportunities = findHitOpportunities(turn);
  if (opportunities.length > 0) {
    const { source, die, dest } = opportunities[0];
    const fromLabel = source === "bar" ? "the bar" : `point ${source}`;
    return `Hit available: ${fromLabel} \u2192 point ${dest} with your ${die}, sending ${displayName(opp)}'s checker to the bar.`;
  }

  // 3. Bearing off in progress.
  if (allCheckersInHome(turn)) {
    const orderedHome = turn === "white"
      ? [...HOME[turn]].sort((a, b) => b - a)
      : [...HOME[turn]].sort((a, b) => a - b);
    let farthest = null;
    for (const pt of orderedHome) {
      if (state.points[pt].owner === turn && state.points[pt].count > 0) { farthest = pt; break; }
    }
    const remaining = 15 - state.off[turn];
    const farthestText = farthest !== null ? ` Clear point ${farthest} first if you have a choice.` : "";
    return `Bearing off: ${remaining} checker${remaining === 1 ? "" : "s"} left to remove from the board.${farthestText}`;
  }

  // 4. Otherwise, the race.
  const myPips = pipCount(turn);
  const oppPips = pipCount(opp);
  const diff = Math.abs(myPips - oppPips);

  if (myPips < oppPips) {
    return `Ahead by ${diff} pips \u2014 run your checkers home and avoid risks.`;
  } else if (myPips > oppPips) {
    return `Behind by ${diff} pips \u2014 playing safe won't win here. Look to hit or hold an anchor.`;
  } else {
    return `Race is even \u2014 focus on making points and keeping your checkers covered.`;
  }
}

function renderTips() {
  const stratBox = document.getElementById("strategyBox");
  const stratText = document.getElementById("strategyText");

  renderGlossaryTip();

  if (mode !== "beginner") {
    stratBox.classList.add("hidden");
    return;
  }

  if (state.gameOver || isAiTurn()) {
    stratBox.classList.add("hidden");
  } else {
    stratBox.classList.remove("hidden");
    stratText.textContent = getStrategyTip();
  }
}

function renderToggles() {
  document.getElementById("modeBeginnerBtn").classList.toggle("active", mode === "beginner");
  document.getElementById("modeNormalBtn").classList.toggle("active", mode === "normal");
  document.getElementById("opponentHumanBtn").classList.toggle("active", opponentType === "human");
  document.getElementById("opponentComputerBtn").classList.toggle("active", opponentType === "computer");

  const matchFresh = isMatchNotStarted();

  const colorToggle = document.getElementById("colorToggle");
  colorToggle.style.display = (opponentType === "computer" && matchFresh) ? "flex" : "none";
  document.getElementById("colorWhiteBtn").classList.toggle("active", humanColor === "white");
  document.getElementById("colorBlackBtn").classList.toggle("active", humanColor === "black");

  const matchTargetGroup = document.getElementById("matchTargetGroup");
  matchTargetGroup.style.display = matchFresh ? "flex" : "none";
  document.getElementById("matchTargetSelect").value = String(matchTarget);
}

/* ----------------------------- Scoring ------------------------------- */

// Standard gammon/backgammon scoring: 1 point for a normal win, 2 if the
// loser hasn't borne off a single checker (a "gammon"), 3 if on top of
// that the loser still has a checker on the bar or in the winner's home
// board (a "backgammon").
function computeWinPoints(winner) {
  const loser = opponent(winner);
  if (state.off[loser] > 0) return 1;

  if (state.bar[loser] > 0) return 3;
  for (const pt of HOME[winner]) {
    if (state.points[pt].owner === loser && state.points[pt].count > 0) return 3;
  }
  return 2;
}

function renderScoreboard() {
  document.getElementById("scoreTarget").textContent = `Match to ${matchTarget}`;
  document.getElementById("scoreNameWhite").textContent = displayName("white");
  document.getElementById("scoreNameBlack").textContent = displayName("black");
  document.getElementById("scoreValueWhite").textContent = score.white;
  document.getElementById("scoreValueBlack").textContent = score.black;
}

// Pip count: total spaces each side still has to travel to bear everything
// off (see pipCount() below). Recomputed on every render, so it stays
// current after every move.
function renderPipCount() {
  document.getElementById("pipNameWhite").textContent = displayName("white");
  document.getElementById("pipNameBlack").textContent = displayName("black");
  document.getElementById("pipValueWhite").textContent = pipCount("white");
  document.getElementById("pipValueBlack").textContent = pipCount("black");
}

// How many checkers each side has borne off vs. still has in play.
function renderCheckersCount() {
  document.getElementById("ccNameWhite").textContent = displayName("white");
  document.getElementById("ccNameBlack").textContent = displayName("black");
  document.getElementById("ccTextWhite").textContent = `${state.off.white} off \u00b7 ${15 - state.off.white} left`;
  document.getElementById("ccTextBlack").textContent = `${state.off.black} off \u00b7 ${15 - state.off.black} left`;
}

/* ----------------------------- Win modal ----------------------------- */

function showWin(player) {
  const points = computeWinPoints(player);
  score[player] += points;
  renderScoreboard();

  const bonus = points === 3 ? " \u2014 a backgammon!" : points === 2 ? " \u2014 a gammon!" : "";
  matchOver = score[player] >= matchTarget;

  document.getElementById("winTitle").textContent = matchOver ? "Match over!" : "Game over";
  const gameText = `${displayName(player)} wins the game by bearing off all 15 checkers!${bonus} (+${points} point${points === 1 ? "" : "s"})`;
  const matchText = matchOver
    ? ` ${displayName(player)} wins the match, ${score.white}\u2013${score.black}!`
    : "";
  document.getElementById("winText").textContent = gameText + matchText;
  document.getElementById("playAgainBtn").textContent = matchOver ? "Start new match" : "Play again";

  document.getElementById("winModal").classList.add("open");
}

/* ----------------------------- Wiring -------------------------------- */

function resetGame(resetScore = false) {
  state = freshState();
  moveNumber = 0;
  document.getElementById("moveLog").innerHTML = "";
  document.getElementById("winModal").classList.remove("open");
  if (resetScore) {
    score = { white: 0, black: 0 };
    matchOver = false;
  }
  render();
  // Don't let the AI (or anyone) start playing until a pending color choice
  // for this match has actually been made.
  if (opponentType === "computer" && !colorChosenForMatch) {
    maybeShowColorChoice();
  } else {
    maybeStartAiTurn();
  }
}

document.getElementById("rollBtn").addEventListener("click", rollDice);
document.getElementById("endTurnBtn").addEventListener("click", endTurn);

// Generic confirm modal, reused by both "New Game" and "New Match" so each
// gets its own gentle reminder of exactly what it will discard.
let pendingConfirmAction = null;
function openConfirmModal({ title, text, confirmLabel, onConfirm }) {
  document.getElementById("confirmActionTitle").textContent = title;
  document.getElementById("confirmActionText").textContent = text;
  document.getElementById("confirmActionBtn").textContent = confirmLabel;
  pendingConfirmAction = onConfirm;
  document.getElementById("confirmActionModal").classList.add("open");
}
document.getElementById("cancelActionBtn").addEventListener("click", () => {
  document.getElementById("confirmActionModal").classList.remove("open");
  pendingConfirmAction = null;
});
document.getElementById("confirmActionBtn").addEventListener("click", () => {
  document.getElementById("confirmActionModal").classList.remove("open");
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  if (action) action();
});

// New Game: restarts just the current game, keeping the match score.
document.getElementById("newGameBtn").addEventListener("click", () => {
  const gameInProgress = moveNumber > 0 || state.hasRolled;
  if (!gameInProgress) {
    resetGame(false);
    return;
  }
  openConfirmModal({
    title: "Restart this game?",
    text: `This will restart the current game from the starting position. Your match score (${displayName("white")} ${score.white} \u2013 ${displayName("black")} ${score.black}) stays as is.`,
    confirmLabel: "Restart game",
    onConfirm: () => resetGame(false),
  });
});

// New Match: resets the score to 0-0 and starts fresh (including a new
// game already in progress).
function startNewMatch() {
  colorChosenForMatch = false;
  resetGame(true);
}
document.getElementById("newMatchBtn").addEventListener("click", () => {
  const matchInProgress = !(score.white === 0 && score.black === 0 && moveNumber === 0 && !state.hasRolled);
  if (!matchInProgress) {
    startNewMatch();
    return;
  }
  const inGameNote = (moveNumber > 0 || state.hasRolled) ? ", including the game you're in the middle of," : "";
  openConfirmModal({
    title: "Start a new match?",
    text: `This will end the current match${inGameNote} and reset the score back to 0\u20130.`,
    confirmLabel: "Reset match",
    onConfirm: startNewMatch,
  });
});

document.getElementById("matchTargetSelect").addEventListener("change", (e) => {
  matchTarget = parseInt(e.target.value, 10);
  render();
});

document.getElementById("modeBeginnerBtn").addEventListener("click", () => {
  mode = "beginner";
  render();
});
document.getElementById("modeNormalBtn").addEventListener("click", () => {
  mode = "normal";
  render();
});

document.getElementById("opponentHumanBtn").addEventListener("click", () => {
  if (opponentType === "human") return;
  opponentType = "human";
  resetGame(true);
  document.getElementById("colorChoiceModal").classList.remove("open");
});
document.getElementById("opponentComputerBtn").addEventListener("click", () => {
  if (opponentType === "computer") return;
  opponentType = "computer";
  colorChosenForMatch = false;
  resetGame(true);
});
document.getElementById("colorWhiteBtn").addEventListener("click", () => {
  if (opponentType !== "computer" || humanColor === "white") return;
  humanColor = "white";
  resetGame(true);
});
document.getElementById("colorBlackBtn").addEventListener("click", () => {
  if (opponentType !== "computer" || humanColor === "black") return;
  humanColor = "black";
  resetGame(true);
});
function chooseColor(color) {
  humanColor = color;
  colorChosenForMatch = true;
  document.getElementById("colorChoiceModal").classList.remove("open");
  render();
  maybeStartAiTurn();
}
document.getElementById("chooseWhiteBtn").addEventListener("click", () => chooseColor("white"));
document.getElementById("chooseBlackBtn").addEventListener("click", () => chooseColor("black"));

document.getElementById("rulesBtn").addEventListener("click", () => {
  document.getElementById("rulesModal").classList.add("open");
});
document.getElementById("closeRules").addEventListener("click", () => {
  document.getElementById("rulesModal").classList.remove("open");
});
document.getElementById("playAgainBtn").addEventListener("click", () => resetGame(matchOver));

// Off-trays are static elements (unlike points/bar, they aren't rebuilt
// every render), so their drag-and-drop listeners are wired once here.
["offWhite", "offBlack"].forEach((id) => {
  const ownerColor = id === "offWhite" ? "white" : "black";
  const el = document.getElementById(id);
  el.addEventListener("dragover", (e) => {
    if (dragSourceValue === null || state.turn !== ownerColor) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    if (state.turn !== ownerColor) return;
    handleDrop("off");
  });
});

render();
maybeShowColorChoice();

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
let moveNumber = 0; // increments once per checker move, for the move log

function isAiTurn() {
  return opponentType === "computer" && state.turn === "black";
}
function isHumanTurn() {
  return !isAiTurn();
}
function displayName(player) {
  if (opponentType === "computer" && player === "black") return "Computer";
  return cap(player);
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

  render();
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

  if (!state.gameOver && isAiTurn()) {
    setTimeout(() => {
      rollDice();
      setTimeout(aiPlayTurn, 650);
    }, 500);
  }
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

  const stack = document.createElement("div");
  stack.className = "checker-stack";
  const p = state.points[pointNum];
  for (let i = 0; i < p.count; i++) {
    const c = document.createElement("div");
    c.className = `checker ${p.owner}`;
    if (i === p.count - 1 && p.count > 5) c.textContent = p.count;
    if (i === p.count - 1 && pointNum === state.selectedSource) c.classList.add("selected");
    if (p.count > 5 && i > 0 && i < p.count - 1) continue; // avoid overdraw, handled below
    stack.appendChild(c);
  }
  div.appendChild(stack);

  const legalSrc = isLegalSource(pointNum);
  const legalDest = isLegalDestination(pointNum);

  if (legalSrc) div.classList.add("legal-source");
  if (legalDest && mode === "beginner") div.classList.add("legal-destination");
  if (legalSrc || legalDest) {
    div.addEventListener("click", () => onPointClick(pointNum));
  }

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
    for (let i = 0; i < Math.min(count, 5); i++) {
      const c = document.createElement("div");
      c.className = `bar-checker ${player}`;
      if (i === 0 && state.selectedSource === "bar" && player === state.turn) {
        c.classList.add("selected");
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

function getBeginnerTip() {
  const turn = state.turn;

  if (state.gameOver) return "";

  if (isAiTurn()) {
    return `${displayName("black")} is taking its turn \u2014 you'll get control back once it finishes.`;
  }

  if (!state.hasRolled) {
    return `${displayName(turn)}'s turn. Click "Roll dice" to see how far you can move — each die is a number of points to travel.`;
  }

  if (state.bar[turn] > 0) {
    if (state.selectedDie === null) {
      return `${displayName(turn)} has a checker on the bar. Pick a die below, then click the bar to bring it back onto the board. You must do this before making any other move.`;
    }
    const entry = turn === "white" ? 25 - state.selectedDie : state.selectedDie;
    const canEnter = legalSourcesForDie(turn, state.selectedDie).includes("bar");
    if (canEnter) {
      return `Click the bar to enter your checker on point ${entry}.`;
    }
    return `Point ${entry} is blocked (held by two or more opposing checkers), so that die can't be used to enter. Try the other die.`;
  }

  if (state.remaining.length === 0) {
    return `No dice left to play. Click "End turn" to pass to ${displayName(opponent(turn))}.`;
  }

  if (!anyLegalMoveRemaining(turn)) {
    return `No legal moves available with the remaining dice. Click "End turn" to pass to ${displayName(opponent(turn))}.`;
  }

  if (state.selectedDie === null) {
    let tip = `Pick one of the highlighted dice below — that's how many points your checker will travel.`;
    if (allCheckersInHome(turn)) {
      tip += ` All of ${displayName(turn)}'s checkers are home, so bearing off has started.`;
    }
    return tip;
  }

  if (state.selectedSource !== null) {
    return `That checker is picked up \u2014 click the glowing destination to move it there, or click the checker again to put it back down.`;
  }

  return `Click a glowing checker (or the bar, if lit up) to move it ${state.selectedDie} point${state.selectedDie === 1 ? "" : "s"}. Landing on a lone opposing checker — a "blot" — sends it to the bar!`;
}

function getStrategyTip() {
  const turn = state.turn;
  const opp = opponent(turn);

  // 1. A blot of yours is the single most urgent thing on the board — call
  //    it out by exact point, and say precisely whether it can be hit right now.
  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.owner === turn && p.count === 1) {
      const shots = directShotsAt(i, turn);
      const shotText = shots.length > 0
        ? ` Right now, ${displayName(opp)} could hit it directly with a roll of ${shots.join(" or ")}.`
        : ` ${displayName(opp)} doesn't have a checker positioned to hit it directly on the next roll, but it's still worth covering when you get the chance.`;
      return `Heads up: point ${i} has only one of ${displayName(turn)}'s checkers on it, with no second checker there to protect it. That's called a \u201cblot\u201d \u2014 if an opposing checker lands exactly there, your checker gets \u201chit\u201d and sent all the way back to the bar, forcing it to re-enter and travel the whole board again.${shotText} When you get the chance, move it onto a point where you already have another checker \u2014 two or more together can't be hit.`;
    }
  }

  // 2. No blot of your own? Check whether you can hit one of the opponent's,
  //    using the actual dice you currently have left to play.
  const opportunities = findHitOpportunities(turn);
  if (opportunities.length > 0) {
    const { source, die, dest } = opportunities[0];
    const fromLabel = source === "bar" ? "your checker on the bar" : `your checker on point ${source}`;
    return `You have a hit available right now: ${fromLabel} can move to point ${dest} using your ${die}, landing on ${displayName(opp)}'s lone checker there. That would send it all the way back to the bar and cost ${displayName(opp)} a lot of ground \u2014 usually well worth taking.`;
  }

  // 3. Bearing off is underway — report exactly how many checkers are left
  //    and which point is farthest back.
  if (allCheckersInHome(turn)) {
    const orderedHome = turn === "white"
      ? [...HOME[turn]].sort((a, b) => b - a)
      : [...HOME[turn]].sort((a, b) => a - b);
    let farthest = null;
    for (const pt of orderedHome) {
      if (state.points[pt].owner === turn && state.points[pt].count > 0) { farthest = pt; break; }
    }
    const remaining = 15 - state.off[turn];
    const farthestText = farthest !== null
      ? ` Your farthest-back checker${state.points[farthest].count > 1 ? "s sit" : " sits"} on point ${farthest} \u2014 clear that point first when you have a choice, so an unlucky roll later can't strand a straggler out there alone.`
      : "";
    return `Every one of ${displayName(turn)}'s checkers has made it into the home board, so you're bearing off now \u2014 permanently removing checkers once they've completed the full trip. You have ${remaining} checker${remaining === 1 ? "" : "s"} left to bear off.${farthestText}`;
  }

  // 4. Nothing urgent — report the actual race and board shape with real numbers.
  const myPips = pipCount(turn);
  const oppPips = pipCount(opp);
  const diff = Math.abs(myPips - oppPips);
  const mine = madePointsList(turn);
  const theirs = madePointsList(opp);
  const pointsText = `${displayName(turn)} has made ${mine.length ? mine.length + " point" + (mine.length === 1 ? "" : "s") + " so far (" + mine.join(", ") + ")" : "no points yet"}, and ${displayName(opp)} has made ${theirs.length ? theirs.length + " (" + theirs.join(", ") + ")" : "none yet"}.`;

  if (myPips < oppPips) {
    return `${displayName(turn)} has ${myPips} pips left to travel versus ${oppPips} for ${displayName(opp)} \u2014 you're ahead in the race by ${diff}. (A \u201cpip\u201d is just one space of movement; fewer left is better.) When you're ahead, the safest plan is usually to run your checkers home directly and avoid unnecessary risks. ${pointsText}`;
  } else if (myPips > oppPips) {
    return `${displayName(turn)} has ${myPips} pips left to travel versus ${oppPips} for ${displayName(opp)} \u2014 you're behind in the race by ${diff}. When you're behind, playing it purely safe usually won't win \u2014 you'll just lose more slowly. Look for chances to hit a blot, or hold a point deep in ${displayName(opp)}'s home board (an \u201canchor\u201d) so you have a safe base to wait for one. ${pointsText}`;
  } else {
    return `The race is essentially even \u2014 both ${displayName(turn)} and ${displayName(opp)} have about ${myPips} pips left to travel. With things this close, focus on making solid points (two or more checkers together, which can't be hit) and avoiding blots of your own. ${pointsText}`;
  }
}

function renderTips() {
  const box = document.getElementById("tipsBox");
  const text = document.getElementById("tipsText");
  const stratBox = document.getElementById("strategyBox");
  const stratText = document.getElementById("strategyText");

  if (mode !== "beginner") {
    box.classList.add("hidden");
    stratBox.classList.add("hidden");
    return;
  }

  const tip = getBeginnerTip();
  if (!tip) {
    box.classList.add("hidden");
  } else {
    box.classList.remove("hidden");
    text.textContent = tip;
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
}

/* ----------------------------- Win modal ----------------------------- */

function showWin(player) {
  document.getElementById("winTitle").textContent = "Game over";
  document.getElementById("winText").textContent = `${displayName(player)} wins by bearing off all 15 checkers!`;
  document.getElementById("winModal").classList.add("open");
}

/* ----------------------------- Wiring -------------------------------- */

function resetGame() {
  state = freshState();
  moveNumber = 0;
  document.getElementById("moveLog").innerHTML = "";
  document.getElementById("winModal").classList.remove("open");
  render();
}

document.getElementById("rollBtn").addEventListener("click", rollDice);
document.getElementById("endTurnBtn").addEventListener("click", endTurn);
document.getElementById("newGameBtn").addEventListener("click", resetGame);

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
  resetGame();
});
document.getElementById("opponentComputerBtn").addEventListener("click", () => {
  if (opponentType === "computer") return;
  opponentType = "computer";
  resetGame();
});

document.getElementById("rulesBtn").addEventListener("click", () => {
  document.getElementById("rulesModal").classList.add("open");
});
document.getElementById("closeRules").addEventListener("click", () => {
  document.getElementById("rulesModal").classList.remove("open");
});
document.getElementById("playAgainBtn").addEventListener("click", resetGame);

render();

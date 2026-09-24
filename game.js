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
    hasRolled: false,
    gameOver: false,
  };
}

let state = freshState();
let mode = "beginner"; // "beginner" | "normal" — how much guidance is shown
let opponentType = "computer"; // "computer" | "human" — who plays Black

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

function applyMove(player, source, die) {
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

  addLog(logText);

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

function aiPlayTurn() {
  if (state.gameOver || !isAiTurn()) return;

  if (state.remaining.length === 0 || !anyLegalMoveRemaining(state.turn)) {
    if (state.remaining.length > 0) {
      addLog(`${displayName(state.turn)} has no more legal moves.`);
      state.remaining = [];
      render();
    }
    setTimeout(() => {
      if (!state.gameOver) endTurn();
    }, 500);
    return;
  }

  const move = chooseAiMove();
  applyMove(state.turn, move.source, move.die);
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
  addLog(`${displayName(state.turn)} rolls ${d1} and ${d2}${d1 === d2 ? " (doubles!)" : ""}`);

  if (!anyLegalMoveRemaining(state.turn)) {
    addLog(`${displayName(state.turn)} has no legal moves.`);
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

function addLog(text) {
  const log = document.getElementById("moveLog");
  const li = document.createElement("li");
  li.textContent = text;
  log.appendChild(li);
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
    if (p.count > 5 && i > 0 && i < p.count - 1) continue; // avoid overdraw, handled below
    stack.appendChild(c);
  }
  div.appendChild(stack);

  if (isLegalSource(pointNum)) {
    div.classList.add("legal-source");
    div.addEventListener("click", () => onSourceClick(pointNum));
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
      if (isLegalSource("bar") && player === state.turn) onSourceClick("bar");
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
}

function isLegalSource(source) {
  if (state.gameOver || !state.hasRolled || state.selectedDie === null || !isHumanTurn()) return false;
  const sources = legalSourcesForDie(state.turn, state.selectedDie);
  return sources.includes(source);
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
  render();
}

function onSourceClick(source) {
  if (!isHumanTurn() || state.selectedDie === null) return;
  applyMove(state.turn, source, state.selectedDie);
  state.selectedDie = null;

  if (state.gameOver) {
    render();
    return;
  }

  if (state.remaining.length === 0 || !anyLegalMoveRemaining(state.turn)) {
    if (state.remaining.length > 0) addLog(`${displayName(state.turn)} has no more legal moves.`);
    render();
    setTimeout(() => {
      if (!state.gameOver) endTurn();
    }, 700);
    return;
  }

  render();
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

const STRATEGY_TIPS = [
  "Try to make your own 5-point early (point 5 for White, point 20 for Black) \u2014 it's the single most valuable point on the board for blocking your opponent.",
  "A \u201cblot\u201d is a checker alone on a point. Avoid leaving one within reach of enemy checkers unless you have a good reason to.",
  "Two or more of your checkers together \u201cmake\u201d a point your opponent can't land on. A row of made points forms a \u201cprime\u201d that's very hard to escape past.",
  "If you're ahead in the race (fewer total pips to travel), focus on running your checkers home safely rather than taking risks.",
  "If you're behind in the race, playing it safe rarely wins \u2014 look for chances to hit an opposing blot and slow them down instead.",
  "Holding a made point deep in your opponent's home board (an \u201canchor\u201d) is a safe way to stay in the game when you're behind.",
  "Hitting an opponent's blot sends it all the way back to the bar \u2014 often a bigger swing than the pips you moved.",
];

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

  return `Click a glowing checker (or the bar, if lit up) to move it ${state.selectedDie} point${state.selectedDie === 1 ? "" : "s"}. Landing on a lone opposing checker — a "blot" — sends it to the bar!`;
}

function getStrategyTip() {
  const turn = state.turn;

  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.owner === turn && p.count === 1) {
      return `Point ${i} has just one of ${displayName(turn)}'s checkers on it \u2014 that's a blot. If an opposing checker can reach it, consider moving it somewhere safer.`;
    }
  }

  if (allCheckersInHome(turn)) {
    return `All checkers are home \u2014 when bearing off, clear your farthest-back point first when you have a choice, so a lucky roll can't punish a straggler.`;
  }

  const logCount = document.getElementById("moveLog").children.length;
  return STRATEGY_TIPS[logCount % STRATEGY_TIPS.length];
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

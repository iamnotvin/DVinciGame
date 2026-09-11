/* =========================================================
   THE VINCI GAME
   Sections: DATA LOADING, GAME STATE, INITIALIZATION, RENDERING,
   INPUT HANDLING, WORD VALIDATION, HEART SYSTEM, HINT SYSTEM,
   REFRESH-REWARD SYSTEM, COOLDOWN SYSTEM, LEVEL PROGRESSION,
   LOCAL STORAGE, RESET, COMPLETION
   ========================================================= */

/* ============ OWNER-EDITABLE ============ */
// Shown only after Level 100 is genuinely completed through normal gameplay.
const prizeContactMessage =
  "You've completed The Vinci Game. Contact me to claim your prize.";

const STORAGE_KEY = "vinciGameProgress_v2";
const COOLDOWN_MS = 15 * 60 * 1000;      // 15 minutes
const REFRESHES_PER_REWARD = 10;         // every 10 page refreshes...
const HINTS_PER_REWARD = 2;              // ...grants 2 hints

const HEART_MILESTONES = [
  {level: 1, max: 5},
  {level: 25, max: 6},
  {level: 50, max: 7},
  {level: 75, max: 8},
  {level: 100, max: 9},
];

function maxHeartsForLevel(level){
  let max = 5;
  for(const m of HEART_MILESTONES){ if(level >= m.level) max = m.max; }
  return max;
}

/* ============ GAME STATE ============ */
var LEVELS = [];

var state = {
  currentLevel: 1,
  highestLevelReached: 1,
  hearts: 5,
  maxHearts: 5,
  completedLevels: [],
  hintBalance: 0,          // hints available to spend, earned via refreshes
  refreshCount: 0,         // total page loads counted
  refreshRewardsClaimed: 0,// how many 10-refresh milestones already paid out
  cooldownUntil: null,     // timestamp (ms) when lockout ends, or null
};

var levelRuntime = {
  solvedMask: [],
  hintReveals: {}, // index -> letters revealed via hint, resets per level
};

var cooldownInterval = null;
var submitLock = false; // prevents duplicate/rapid submissions

/* ============ LOCAL STORAGE ============ */
function saveProgress(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentLevel: state.currentLevel,
      highestLevelReached: state.highestLevelReached,
      hearts: state.hearts,
      maxHearts: state.maxHearts,
      completedLevels: state.completedLevels,
      hintBalance: state.hintBalance,
      refreshCount: state.refreshCount,
      refreshRewardsClaimed: state.refreshRewardsClaimed,
      cooldownUntil: state.cooldownUntil,
    }));
  }catch(e){ /* localStorage unavailable; game still works this session */ }
}

function loadProgress(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(typeof data.currentLevel !== "number") return null;
    return data;
  }catch(e){
    return null; // corrupted storage: start fresh rather than crash
  }
}

function hasSavedProgress(){
  const p = loadProgress();
  return !!(p && p.currentLevel && p.currentLevel > 1);
}

function resetProgress(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  const preservedRefreshCount = state.refreshCount; // refresh history is real-world behavior, not "cheating" to keep, but reset for a clean slate on explicit reset
  state = {
    currentLevel: 1,
    highestLevelReached: 1,
    hearts: 5,
    maxHearts: 5,
    completedLevels: [],
    hintBalance: 0,
    refreshCount: 0,
    refreshRewardsClaimed: 0,
    cooldownUntil: null,
  };
  clearCooldownTimer();
  saveProgress();
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

/* ============ DATA LOADING ============ */
async function loadLevels(){
  try{
    const res = await fetch("data/levels.json");
    if(!res.ok) throw new Error("bad response");
    LEVELS = await res.json();
  }catch(e){
    document.getElementById("start-progress").textContent =
      "Could not load level data. Please serve this project over http(s) (not file://) — e.g. GitHub Pages or a local server.";
    throw e;
  }
}

/* ============ INITIALIZATION ============ */
async function boot(){
  await loadLevels();

  const saved = loadProgress();
  if(saved){
    state.currentLevel = clamp(saved.currentLevel, 1, 100);
    state.highestLevelReached = clamp(saved.highestLevelReached || saved.currentLevel, 1, 100);
    state.maxHearts = saved.maxHearts || maxHeartsForLevel(state.currentLevel);
    state.hearts = clamp(typeof saved.hearts === "number" ? saved.hearts : state.maxHearts, 0, state.maxHearts);
    state.completedLevels = Array.isArray(saved.completedLevels) ? saved.completedLevels : [];
    state.hintBalance = typeof saved.hintBalance === "number" ? saved.hintBalance : 0;
    state.refreshCount = typeof saved.refreshCount === "number" ? saved.refreshCount : 0;
    state.refreshRewardsClaimed = typeof saved.refreshRewardsClaimed === "number" ? saved.refreshRewardsClaimed : 0;
    state.cooldownUntil = typeof saved.cooldownUntil === "number" ? saved.cooldownUntil : null;
  }

  registerThisRefresh();
  saveProgress();
  refreshStartScreen();

  if(isCooldownActive()){
    showScreen("screen-cooldown");
    startCooldownDisplay();
  } else {
    showScreen("screen-start");
  }

  wireEvents();
}

/* ============ REFRESH-REWARD SYSTEM ============ */
// Counts real page loads (refreshes), persisted so it cannot be reset by
// simply reloading. Every 10 refreshes grants 2 hints, exactly once each.
function registerThisRefresh(){
  state.refreshCount += 1;
  const milestonesReached = Math.floor(state.refreshCount / REFRESHES_PER_REWARD);
  const newMilestones = milestonesReached - state.refreshRewardsClaimed;
  if(newMilestones > 0){
    state.hintBalance += newMilestones * HINTS_PER_REWARD;
    state.refreshRewardsClaimed = milestonesReached;
    // Defer the toast until the DOM/toast element exists.
    setTimeout(() => showToast(`+${newMilestones * HINTS_PER_REWARD} hints earned (refresh #${state.refreshCount})`), 400);
  }
}

/* ============ COOLDOWN SYSTEM ============ */
function isCooldownActive(){
  return typeof state.cooldownUntil === "number" && state.cooldownUntil > Date.now();
}

function startCooldown(){
  state.cooldownUntil = Date.now() + COOLDOWN_MS;
  saveProgress();
}

function clearCooldownTimer(){
  if(cooldownInterval){ clearInterval(cooldownInterval); cooldownInterval = null; }
}

function formatMMSS(ms){
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function startCooldownDisplay(){
  clearCooldownTimer();
  const timerEl = document.getElementById("cooldown-timer-main");
  const statusEl = document.getElementById("cooldown-status");
  const continueBtn = document.getElementById("btn-cooldown-continue");

  function tick(){
    const remaining = state.cooldownUntil - Date.now();
    if(remaining <= 0){
      timerEl.textContent = "00:00";
      statusEl.textContent = "Your hearts are restored!";
      continueBtn.disabled = false;
      clearCooldownTimer();
      return;
    }
    timerEl.textContent = formatMMSS(remaining);
    continueBtn.disabled = true;
  }
  tick();
  cooldownInterval = setInterval(tick, 1000);
}

function endCooldownAndRestore(){
  state.cooldownUntil = null;
  state.hearts = state.maxHearts;
  clearCooldownTimer();
  saveProgress();
}

/* ============ SCREEN NAV ============ */
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
function showOverlay(id){ document.getElementById(id).classList.add("active"); }
function hideOverlay(id){ document.getElementById(id).classList.remove("active"); }

function refreshStartScreen(){
  const el = document.getElementById("start-progress");
  const continueBtn = document.getElementById("btn-continue");
  if(hasSavedProgress()){
    el.textContent = `Highest level reached: ${state.highestLevelReached} / 100`;
    continueBtn.style.display = "";
  } else {
    el.textContent = "";
    continueBtn.style.display = "none";
  }
}

/* ============ TOAST ============ */
var toastTimer = null;
function showToast(msg){
  const el = document.getElementById("toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ============ LEVEL PROGRESSION ============ */
function startLevel(levelNum){
  state.currentLevel = levelNum;
  state.maxHearts = maxHeartsForLevel(levelNum);
  state.hearts = clamp(state.hearts, 0, state.maxHearts);
  const level = LEVELS[levelNum - 1];
  levelRuntime.solvedMask = level.visible.slice();
  levelRuntime.hintReveals = {};
  showScreen("screen-game");
  renderAll();
  saveProgress();
  focusInput();
}

function firstUnsolvedIndex(){
  const mask = levelRuntime.solvedMask;
  for(let i = 0; i < mask.length; i++){ if(!mask[i]) return i; }
  return -1;
}

function goToNextLevel(){
  hideOverlay("overlay-complete");
  const next = state.currentLevel + 1;
  if(next > 100){ finishGame(); return; }
  state.highestLevelReached = Math.max(state.highestLevelReached, next);
  startLevel(next);
}

/* ============ RENDERING ============ */
function renderAll(){
  renderHeader();
  renderChain();
  renderHearts();
  const fb = document.getElementById("feedback-line");
  fb.textContent = "";
  fb.classList.remove("error","success");
  document.getElementById("guess-input").value = "";
  updateHintButton();
}

function renderHeader(){
  const level = LEVELS[state.currentLevel - 1];
  document.getElementById("level-label").textContent = `LEVEL ${state.currentLevel} / 100`;
  document.getElementById("difficulty-label").textContent = level.difficulty.toUpperCase();
  document.getElementById("progress-fill").style.width = (state.currentLevel / 100 * 100) + "%";
}

function renderHearts(justLost){
  const wrap = document.getElementById("hearts-display");
  wrap.innerHTML = "";
  for(let i = 0; i < state.maxHearts; i++){
    const span = document.createElement("span");
    const isLostHeart = justLost && i === state.hearts;
    span.className = "heart" + (i < state.hearts ? "" : " empty") + (isLostHeart ? " lost" : "");
    span.textContent = i < state.hearts ? "\u2665" : "\u2661";
    wrap.appendChild(span);
  }
  wrap.setAttribute("aria-label", `${state.hearts} of ${state.maxHearts} hearts remaining`);
}

function renderChain(){
  const level = LEVELS[state.currentLevel - 1];
  const container = document.getElementById("chain-container");
  container.innerHTML = "";
  const activeIdx = firstUnsolvedIndex();

  level.words.forEach((word, i) => {
    const row = document.createElement("div");
    row.className = "chain-row" + (i === activeIdx ? " active" : "");
    row.id = "row-" + i;

    const idxLabel = document.createElement("div");
    idxLabel.className = "chain-index";
    idxLabel.textContent = i + 1;
    row.appendChild(idxLabel);

    const tiles = document.createElement("div");
    tiles.className = "word-tiles";

    if(levelRuntime.solvedMask[i]){
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = word;
      tiles.appendChild(pill);
    } else {
      const revealed = levelRuntime.hintReveals[i] || 0;
      for(let c = 0; c < word.length; c++){
        const tile = document.createElement("div");
        const isHint = c < revealed;
        tile.className = "tile" + (isHint ? " hint-filled" : "");
        tile.textContent = isHint ? word[c] : "";
        tiles.appendChild(tile);
      }
    }
    row.appendChild(tiles);
    container.appendChild(row);
  });
}

function updateHintButton(){
  const btn = document.getElementById("btn-hint");
  const countEl = document.getElementById("hint-count");
  const activeIdx = firstUnsolvedIndex();
  const alreadyHinted = activeIdx >= 0 && levelRuntime.hintReveals[activeIdx];
  btn.disabled = state.hintBalance <= 0 || activeIdx === -1 || alreadyHinted;
  countEl.textContent = `${state.hintBalance} hint${state.hintBalance === 1 ? "" : "s"} available`;
}

/* ============ INPUT HANDLING ============ */
function focusInput(){
  const input = document.getElementById("guess-input");
  if(window.innerWidth > 480){ input.focus(); }
}

function normalizeAnswer(raw){
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

function submitGuess(){
  if(submitLock) return; // prevent duplicate/rapid submissions
  const input = document.getElementById("guess-input");
  const raw = normalizeAnswer(input.value);
  if(!raw) return;
  const idx = firstUnsolvedIndex();
  if(idx === -1) return;

  submitLock = true;
  const level = LEVELS[state.currentLevel - 1];
  const target = level.words[idx];

  if(raw === target){
    handleCorrectGuess(idx);
  } else {
    handleIncorrectGuess();
  }
  input.value = "";
  setTimeout(() => { submitLock = false; }, 250);
}

/* ============ WORD VALIDATION ============ */
function handleCorrectGuess(idx){
  levelRuntime.solvedMask[idx] = true;
  const fb = document.getElementById("feedback-line");
  fb.classList.remove("error");
  fb.classList.add("success");
  fb.textContent = pickMessage(CORRECT_MESSAGES);
  renderChain();
  renderHeader();
  const row = document.getElementById("row-" + idx);
  if(row){ row.classList.add("solved-flash"); }
  updateHintButton();
  saveProgress();

  if(isLevelComplete()){
    setTimeout(() => onLevelComplete(), 400);
  }
}

function handleIncorrectGuess(){
  const fb = document.getElementById("feedback-line");
  fb.classList.remove("success");
  fb.classList.add("error");
  fb.textContent = pickMessage(WRONG_MESSAGES);
  const row = document.getElementById("input-row");
  row.classList.remove("shake");
  void row.offsetWidth;
  row.classList.add("shake");
  loseHeart();
  if(state.hearts <= 0){
    setTimeout(() => onGameOver(), 350);
  }
}

const WRONG_MESSAGES = [
  "Not quite — try again.",
  "Close, but not that word.",
  "Think about the connection.",
  "That word doesn't fit here.",
  "Not a valid connection.",
];
const CORRECT_MESSAGES = [
  "Connection confirmed!",
  "Nice — that's the link.",
  "Correct!",
  "That's it exactly.",
];
function pickMessage(list){
  return list[Math.floor(Math.random() * list.length)];
}

function isLevelComplete(){
  return levelRuntime.solvedMask.every(Boolean);
}

/* ============ HEART SYSTEM ============ */
function loseHeart(){
  state.hearts = clamp(state.hearts - 1, 0, state.maxHearts);
  renderHearts(true);
  saveProgress();
}

function onGameOver(){
  startCooldown();
  showOverlay("overlay-gameover");
}

/* ============ HINT SYSTEM ============ */
function useHint(){
  const activeIdx = firstUnsolvedIndex();
  if(activeIdx === -1) return;
  if(state.hintBalance <= 0) return;
  if(levelRuntime.hintReveals[activeIdx]) return;
  levelRuntime.hintReveals[activeIdx] = 1;
  state.hintBalance -= 1;
  renderChain();
  updateHintButton();
  saveProgress();
  focusInput();
}

/* ============ COMPLETION ============ */
function onLevelComplete(){
  const level = LEVELS[state.currentLevel - 1];
  if(!validateLevelCompletion(level)) return; // integrity guard; should not trigger in normal play
  if(!state.completedLevels.includes(state.currentLevel)){
    state.completedLevels.push(state.currentLevel);
  }
  renderCompleteChain(level);
  showOverlay("overlay-complete");
  saveProgress();
}

function validateLevelCompletion(level){
  if(levelRuntime.solvedMask.some(v => !v)) return false;
  for(let i = 0; i < level.words.length; i++){ if(!level.words[i]) return false; }
  return true;
}

function renderCompleteChain(level){
  const wrap = document.getElementById("complete-chain");
  wrap.innerHTML = "";
  level.words.forEach(word => {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = word;
    wrap.appendChild(pill);
  });
}

function finishGame(){
  if(!state.completedLevels.includes(100)){ state.completedLevels.push(100); }
  saveProgress();
  document.getElementById("final-message").textContent = prizeContactMessage;
  showOverlay("overlay-final");
}

/* ============ EVENT WIRING ============ */
function wireEvents(){
  document.getElementById("btn-continue").addEventListener("click", () => {
    if(isCooldownActive()){ showScreen("screen-cooldown"); startCooldownDisplay(); return; }
    startLevel(state.currentLevel);
  });

  document.getElementById("btn-new").addEventListener("click", () => {
    if(isCooldownActive()){ showScreen("screen-cooldown"); startCooldownDisplay(); return; }
    if(hasSavedProgress()){ resetProgress(); }
    startLevel(1);
  });

  document.getElementById("btn-reset").addEventListener("click", () => showOverlay("overlay-reset"));
  document.getElementById("btn-reset-cancel").addEventListener("click", () => hideOverlay("overlay-reset"));
  document.getElementById("btn-reset-confirm").addEventListener("click", () => {
    resetProgress();
    hideOverlay("overlay-reset");
    refreshStartScreen();
    showScreen("screen-start");
  });

  document.getElementById("btn-quit").addEventListener("click", () => {
    saveProgress();
    if(isCooldownActive()){ showScreen("screen-cooldown"); startCooldownDisplay(); return; }
    refreshStartScreen();
    showScreen("screen-start");
  });

  document.getElementById("btn-check").addEventListener("click", submitGuess);
  document.getElementById("guess-input").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){ e.preventDefault(); submitGuess(); }
  });

  document.getElementById("btn-hint").addEventListener("click", useHint);
  document.getElementById("btn-next-level").addEventListener("click", goToNextLevel);

  document.getElementById("btn-gameover-ok").addEventListener("click", () => {
    hideOverlay("overlay-gameover");
    showScreen("screen-cooldown");
    startCooldownDisplay();
  });

  document.getElementById("btn-cooldown-continue").addEventListener("click", () => {
    if(isCooldownActive()) return; // guarded: button is also disabled while active
    endCooldownAndRestore();
    startLevel(state.currentLevel);
  });
  document.getElementById("btn-cooldown-menu").addEventListener("click", () => {
    // Menu is viewable during cooldown, but re-entering the game is still gated.
    refreshStartScreen();
    showScreen("screen-start");
  });

  document.getElementById("btn-final-menu").addEventListener("click", () => {
    hideOverlay("overlay-final");
    refreshStartScreen();
    showScreen("screen-start");
  });

}

/* ============ BOOT ============ */
boot();

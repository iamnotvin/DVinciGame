(() => {
  'use strict';
  const LEVELS = Array.isArray(window.LEVELS) ? window.LEVELS : [];
  const STORAGE_KEY = 'wordChainPinkStateV1';
  const RECOVERY_MS = 15 * 60 * 1000;
  const $ = (id) => document.getElementById(id);
  const screens = ['welcome-screen','tutorial-screen','game-screen','recovery-screen','complete-screen'];
  const defaults = { playerName:'', tutorialCompleted:false, currentLevel:1, completedLevels:[], hearts:5, hints:1, refreshCount:0, rewardedRefreshMilestones:[], cooldownUntil:0, gameCompleted:false, sound:true };
  let state = loadState();
  let solvedMask = [];
  let revealed = {};
  let busy = false;
  let recoveryTimer = null;
  let tutorialPage = 1;

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return {...defaults};
      return {...defaults, ...raw, completedLevels:Array.isArray(raw.completedLevels) ? raw.completedLevels : [], rewardedRefreshMilestones:Array.isArray(raw.rewardedRefreshMilestones) ? raw.rewardedRefreshMilestones : []};
    } catch { return {...defaults}; }
  }
  function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { toast('Progress could not be saved.', true); } }
  function showScreen(id) { screens.forEach((screen) => $(screen).classList.toggle('active', screen === id)); }
  function normalize(value) { return String(value || '').trim().toUpperCase().replace(/\s+/g, ' '); }
  function currentLevel() { return LEVELS.find((item) => item.id === state.currentLevel) || LEVELS[0]; }
  function activeIndex() { return solvedMask.findIndex((solved) => !solved); }
  function isRecovering() { return Number.isFinite(state.cooldownUntil) && state.cooldownUntil > Date.now(); }

  function toast(message, error = false) {
    const el = $('toast'); el.textContent = message; el.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function ping(kind) {
    if (!state.sound || !window.AudioContext) return;
    try { const ctx = ping.ctx || (ping.ctx = new AudioContext()); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = kind === 'bad' ? 170 : kind === 'win' ? 680 : 430; gain.gain.value = .035; osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .09); } catch { /* audio is optional */ }
  }
  function setBunnyReaction(kind) { document.querySelector('.mascot')?.classList.remove('react-correct','react-wrong'); if (kind) document.querySelector('.mascot')?.classList.add(`react-${kind}`); }

  function renderWelcome() {
    $('player-name').value = state.playerName || '';
    $('welcome-error').textContent = '';
  }
  function renderTutorial() {
    const steps = [
      ['HOW TO PLAY · 1 / 3','Every word links to the next.','A chain is made from familiar compounds and phrases. Solve the active row, then the next link unlocks.','RAIN ↓ ? ↓ COAT'],
      ['HOW TO PLAY · 2 / 3','One connection at a time.','The original chain stays intact: visible words guide you toward the next missing word.','SEA ↓ WALL ↓ ? ↓ BACK'],
      ['HOW TO PLAY · 3 / 3','Hearts, hints, and progress.','Wrong answers cost a heart. Reveal a letter when you need help. Your progress is saved locally.','♥ ♥ ♥ ♥ ♥  ·  HINT']
    ][tutorialPage - 1];
    $('tutorial-step').textContent = steps[0]; $('tutorial-title').textContent = steps[1]; $('tutorial-copy').textContent = steps[2];
    $('tutorial-chain').innerHTML = steps[3].split(' ').map((part) => `<span>${part}</span>`).join('');
    $('tutorial-next').innerHTML = tutorialPage === 3 ? 'START CHAIN <span>→</span>' : 'NEXT <span>→</span>';
  }
  function startTutorial() { tutorialPage = 1; renderTutorial(); showScreen('tutorial-screen'); }

  function startLevel(levelNumber) {
    if (!LEVELS.length) { toast('Game data is missing.', true); return; }
    state.currentLevel = Math.max(1, Math.min(100, levelNumber));
    const level = currentLevel();
    solvedMask = Array.isArray(level.visible) ? level.visible.slice() : level.words.map((_, index) => index === 0);
    revealed = {};
    state.hearts = Math.max(0, Math.min(5, state.hearts || 5));
    if (state.hearts === 0) state.hearts = 5;
    saveState(); renderGame(); showScreen('game-screen');
    if (window.innerWidth > 650) $('answer-input').focus();
  }
  function renderGame() {
    const level = currentLevel();
    $('level-mini').textContent = `${String(level.id).padStart(2,'0')} / 100`;
    $('progress-text').textContent = `LEVEL ${String(level.id).padStart(2,'0')} / 100`;
    $('player-greeting').textContent = (state.playerName || 'PLAYER').toUpperCase();
    $('difficulty').textContent = level.difficulty.toUpperCase();
    $('chain-count').textContent = `CHAIN ${level.words.length - 1} LINKS`;
    $('progress-fill').style.width = `${level.id}%`;
    $('hearts').textContent = Array.from({length:5}, (_, index) => index < state.hearts ? '♥' : '♡').join(' ');
    $('hints').textContent = state.hints;
    $('hint-button').disabled = state.hints <= 0 || activeIndex() < 0;
    const board = $('chain-board'); board.innerHTML = '';
    level.words.forEach((word, index) => {
      const row = document.createElement('div'); row.className = `chain-row${index === activeIndex() ? ' active' : ''}${solvedMask[index] ? ' solved' : ''}`;
      row.innerHTML = `<span class="row-index">${String(index + 1).padStart(2,'0')}</span><div class="letter-grid"></div>`;
      const grid = row.querySelector('.letter-grid');
      const known = solvedMask[index] ? word : (revealed[index] ? word.slice(0, revealed[index]) : '');
      [...word].forEach((letter, letterIndex) => { const tile = document.createElement('span'); const isKnown = solvedMask[index] || letterIndex < known.length; tile.className = `letter-tile ${isKnown ? (solvedMask[index] ? 'given' : 'revealed') : 'blank'}`; tile.textContent = isKnown ? letter : ''; grid.appendChild(tile); });
      board.appendChild(row);
    });
  }
  function submitAnswer() {
    if (busy) return; const input = $('answer-input'); const answer = normalize(input.value); const index = activeIndex();
    if (!answer || index < 0) return; busy = true; setTimeout(() => { busy = false; }, 450);
    const level = currentLevel(); const target = normalize(level.words[index]);
    if (answer === target) solveWord(index); else wrongAnswer(); input.value = '';
  }
  function solveWord(index) {
    solvedMask[index] = true; saveState(); ping('win'); setBunnyReaction('correct'); $('feedback').textContent = 'CONNECTION CONFIRMED'; $('feedback').style.color = 'var(--accent-dark)'; renderGame();
    const row = document.querySelectorAll('.chain-row')[index]; row?.classList.add('solved'); toast(index === currentLevel().words.length - 1 ? 'Chain complete!' : 'That’s the link!');
    if (solvedMask.every(Boolean)) setTimeout(completeLevel, 500); else setTimeout(() => $('answer-input').focus(), 100);
  }
  function wrongAnswer() {
    state.hearts = Math.max(0, state.hearts - 1); saveState(); ping('bad'); setBunnyReaction('wrong'); const form = $('answer-input').parentElement; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); $('feedback').textContent = ['Not quite.','Try another link.','That’s not the connection.','Look at the neighboring words.'][Math.floor(Math.random() * 4)]; $('feedback').style.color = 'var(--accent-dark)'; renderGame(); toast('Heart lost — keep thinking.', true);
    if (state.hearts === 0) { state.cooldownUntil = Date.now() + RECOVERY_MS; saveState(); setTimeout(openRecovery, 550); }
  }
  function useHint() {
    const index = activeIndex(); if (index < 0 || state.hints <= 0) { toast('No hints available.', true); return; }
    state.hints--; revealed[index] = Math.min(1, currentLevel().words[index].length); saveState(); ping('hint'); renderGame(); $('feedback').textContent = 'HINT: the first letter is revealed.'; toast('Hint used.');
  }
  function completeLevel() {
    state.completedLevels = [...new Set([...state.completedLevels, state.currentLevel])]; saveState(); ping('win'); if (state.currentLevel >= 100) { state.gameCompleted = true; saveState(); $('complete-name').textContent = `${state.playerName || 'Player'}, every link is yours.`; showScreen('complete-screen'); } else { state.currentLevel++; state.hearts = 5; startLevel(state.currentLevel); }
  }
  function openRecovery() { showScreen('recovery-screen'); updateRecovery(); }
  function updateRecovery() { clearInterval(recoveryTimer); const tick = () => { const left = Math.max(0, state.cooldownUntil - Date.now()); const seconds = Math.ceil(left / 1000); $('recovery-clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; $('recovery-button').disabled = left > 0; if (left <= 0) { clearInterval(recoveryTimer); state.cooldownUntil = 0; state.hearts = 5; saveState(); toast('Recovery complete. Your hearts are back.'); } }; tick(); recoveryTimer = setInterval(tick, 500); }
  function resetProgress() { localStorage.removeItem(STORAGE_KEY); location.reload(); }
  function countPageReload() { const nav = performance.getEntriesByType('navigation')[0]; if (nav?.type !== 'reload') return; state.refreshCount++; const milestone = Math.floor(state.refreshCount / 10); if (milestone && !state.rewardedRefreshMilestones.includes(milestone)) { state.rewardedRefreshMilestones.push(milestone); state.hints += 2; saveState(); setTimeout(() => toast('Refresh reward: +2 hints.'), 300); } else saveState(); }

  $('start-button').onclick = () => { const name = $('player-name').value.trim(); if (!name) { $('welcome-error').textContent = 'Please enter a name to begin.'; $('player-name').focus(); return; } state.playerName = name; saveState(); state.tutorialCompleted ? startLevel(state.currentLevel) : startTutorial(); };
  $('player-name').onkeydown = (event) => { if (event.key === 'Enter') $('start-button').click(); };
  $('tutorial-next').onclick = () => { if (tutorialPage < 3) { tutorialPage++; renderTutorial(); } else { state.tutorialCompleted = true; saveState(); startLevel(state.currentLevel); } };
  $('check-button').onclick = submitAnswer; $('answer-input').onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); submitAnswer(); } };
  $('hint-button').onclick = useHint; $('recovery-button').onclick = () => { if (!isRecovering()) startLevel(state.currentLevel); };
  $('sound-toggle').onclick = () => { state.sound = !state.sound; saveState(); $('sound-toggle').textContent = state.sound ? '♩' : '×'; toast(state.sound ? 'Sound on.' : 'Sound off.'); };
  $('reset-button').onclick = () => { $('reset-dialog').hidden = false; }; $('cancel-reset').onclick = () => { $('reset-dialog').hidden = true; }; $('confirm-reset').onclick = resetProgress;
  $('play-again').onclick = () => { state.gameCompleted = false; state.currentLevel = 1; state.hearts = 5; state.completedLevels = []; saveState(); startLevel(1); };

  if (isRecovering()) openRecovery(); else if (state.gameCompleted) { $('complete-name').textContent = `${state.playerName || 'Player'}, every link is yours.`; showScreen('complete-screen'); } else if (state.playerName) { renderWelcome(); state.tutorialCompleted ? startLevel(state.currentLevel) : startTutorial(); } else { renderWelcome(); showScreen('welcome-screen'); }
  $('sound-toggle').textContent = state.sound ? '♩' : '×'; countPageReload();
})();

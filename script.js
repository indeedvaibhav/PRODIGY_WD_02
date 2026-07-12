// ---------- Elements ----------
const timeMainEl    = document.getElementById('timeMain');
const timeCentisEl  = document.getElementById('timeCentis');
const statePillEl   = document.getElementById('statePill');
const ringProgressEl = document.getElementById('ringProgress');
const startBtn      = document.getElementById('startBtn');
const resetBtn      = document.getElementById('resetBtn');
const lapBtn        = document.getElementById('lapBtn');
const lapsListEl    = document.getElementById('lapsList');
const lapsEmptyEl   = document.getElementById('lapsEmpty');
const watchEl       = document.querySelector('.watch');
const toastContainer = document.getElementById('toastContainer');

// ---------- State ----------
let running = false;
let startTimestamp = 0;       // performance.now() when current run segment started
let elapsedBeforePause = 0;   // accumulated ms from previous run segments
let rafId = null;
let laps = [];                // { splitMs, totalMs }

// All-time fastest split (persisted across refreshes); null = no laps yet
let allTimeFastestMs = null;

const RING_CIRCUMFERENCE = 590.6; // 2 * PI * r(94)
const RING_LOOP_MS = 60000;       // one full ring revolution = 60 seconds

const LS_LAPS_KEY   = 'split_laps';
const LS_BEST_KEY   = 'split_alltime_best';

// ---------- Helpers ----------
function formatTime(ms) {
  const totalCentis = Math.floor(ms / 10);
  const centis      = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const seconds     = totalSeconds % 60;
  const minutes     = Math.floor(totalSeconds / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    main:   `${pad(minutes)}:${pad(seconds)}`,
    centis: `.${pad(centis)}`,
  };
}

function currentElapsedMs() {
  if (!running) return elapsedBeforePause;
  return elapsedBeforePause + (performance.now() - startTimestamp);
}

function render(ms) {
  const { main, centis } = formatTime(ms);
  timeMainEl.textContent  = main;
  timeCentisEl.textContent = centis;

  const progressInLoop = (ms % RING_LOOP_MS) / RING_LOOP_MS;
  const offset = RING_CIRCUMFERENCE * (1 - progressInLoop);
  ringProgressEl.style.strokeDashoffset = offset;
}

function tick() {
  render(currentElapsedMs());
  rafId = requestAnimationFrame(tick);
}

// ---------- Toast system ----------
function showToast(message, isBest = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isBest ? ' toast-best' : '');
  el.textContent = message;
  toastContainer.appendChild(el);

  // Trigger visible state on next frame so transition fires
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('toast-visible'));
  });

  // Fade out after 2s, then remove from DOM
  const hideAfter = isBest ? 2200 : 1800;
  setTimeout(() => {
    el.classList.remove('toast-visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, hideAfter);
}

// ---------- Personal-best celebration ----------
function triggerPersonalBest() {
  // Pulse the ring stroke green
  ringProgressEl.classList.remove('personal-best');
  // Force reflow so the animation restarts if triggered rapidly
  void ringProgressEl.offsetWidth;
  ringProgressEl.classList.add('personal-best');
  ringProgressEl.addEventListener('animationend', () => {
    ringProgressEl.classList.remove('personal-best');
  }, { once: true });

  // Show the best toast
  showToast('New best split ⚡', true);

  // Haptic: short tap
  if (navigator.vibrate) navigator.vibrate(10);
}

// ---------- localStorage helpers ----------
function saveLaps() {
  try {
    localStorage.setItem(LS_LAPS_KEY, JSON.stringify(laps));
    if (allTimeFastestMs !== null) {
      localStorage.setItem(LS_BEST_KEY, String(allTimeFastestMs));
    }
  } catch (_) { /* quota or private-mode error — silently ignore */ }
}

function loadPersistedData() {
  try {
    const savedLaps = localStorage.getItem(LS_LAPS_KEY);
    const savedBest = localStorage.getItem(LS_BEST_KEY);

    if (savedLaps) {
      const parsed = JSON.parse(savedLaps);
      if (Array.isArray(parsed) && parsed.length > 0) {
        laps = parsed;
      }
    }
    if (savedBest !== null) {
      const n = Number(savedBest);
      if (!isNaN(n) && n > 0) allTimeFastestMs = n;
    }
  } catch (_) { /* corrupt data — ignore */ }
}

function clearPersistedData() {
  try {
    localStorage.removeItem(LS_LAPS_KEY);
    localStorage.removeItem(LS_BEST_KEY);
  } catch (_) {}
}

// ---------- Controls ----------
function start() {
  running = true;
  startTimestamp = performance.now();
  statePillEl.textContent = 'running';
  statePillEl.classList.add('running');
  statePillEl.classList.remove('paused');
  startBtn.querySelector('.btn-label').textContent = 'Pause';
  startBtn.classList.add('is-running');
  resetBtn.disabled = true;
  lapBtn.disabled   = false;
  watchEl.classList.add('is-running');
  rafId = requestAnimationFrame(tick);
}

function pause() {
  elapsedBeforePause = currentElapsedMs(); // must run while `running` is still true
  running = false;
  cancelAnimationFrame(rafId);
  statePillEl.textContent = 'paused';
  statePillEl.classList.remove('running');
  statePillEl.classList.add('paused');
  startBtn.querySelector('.btn-label').textContent = 'Resume';
  startBtn.classList.remove('is-running');
  resetBtn.disabled = false;
  lapBtn.disabled   = true;
  watchEl.classList.remove('is-running');
}

function reset() {
  running = false;
  cancelAnimationFrame(rafId);
  elapsedBeforePause = 0;
  laps = [];
  allTimeFastestMs = null;
  render(0);
  statePillEl.textContent = 'ready';
  statePillEl.classList.remove('running', 'paused');
  startBtn.querySelector('.btn-label').textContent = 'Start';
  startBtn.classList.remove('is-running');
  resetBtn.disabled = true;
  lapBtn.disabled   = true;
  watchEl.classList.remove('is-running');
  renderLaps();
  clearPersistedData();
  showToast('Reset');

  // Haptic: longer confirm pulse
  if (navigator.vibrate) navigator.vibrate(30);
}

function recordLap() {
  const totalMs       = currentElapsedMs();
  const previousTotal = laps.length > 0 ? laps[laps.length - 1].totalMs : 0;
  const splitMs       = totalMs - previousTotal;
  const lapNumber     = laps.length + 1;
  laps.push({ splitMs, totalMs });

  // Determine if this split is a new all-time best
  const isNewBest = allTimeFastestMs === null || splitMs < allTimeFastestMs;
  if (isNewBest) allTimeFastestMs = splitMs;

  renderLaps(isNewBest);
  saveLaps();
  showToast(`Lap ${lapNumber} recorded`);

  if (isNewBest) triggerPersonalBest();

  // Haptic: short tap for lap
  if (navigator.vibrate) navigator.vibrate(10);
}

function renderLaps(highlightBestRow = false) {
  lapsListEl.innerHTML = '';

  if (laps.length === 0) {
    lapsListEl.appendChild(lapsEmptyEl);
    return;
  }

  const splitTimes = laps.map((l) => l.splitMs);
  const fastest    = Math.min(...splitTimes);
  const slowest    = Math.max(...splitTimes);
  const hasVariance = fastest !== slowest;

  // Show most recent lap first
  [...laps].reverse().forEach((lap, i) => {
    const lapNumber = laps.length - i;
    const isFirst   = i === 0; // the newly added lap (most recent)
    const row       = document.createElement('li');
    row.className   = 'lap-row';

    if (hasVariance && lap.splitMs === fastest) row.classList.add('fastest');
    if (hasVariance && lap.splitMs === slowest) row.classList.add('slowest');

    // Apply personal-best class only to the newest lap row on new-best events
    if (highlightBestRow && isFirst) row.classList.add('personal-best');

    const { main: splitMain, centis: splitCentis } = formatTime(lap.splitMs);
    const { main: totalMain, centis: totalCentis } = formatTime(lap.totalMs);
    const barPct = hasVariance ? Math.max(8, (lap.splitMs / slowest) * 100) : 100;

    row.innerHTML = `
      <span class="lap-num">Lap ${lapNumber}</span>
      <span class="lap-split">${splitMain}${splitCentis}</span>
      <span class="lap-total">${totalMain}${totalCentis}</span>
      <span class="lap-bar" style="width: ${barPct}%"></span>
    `;
    lapsListEl.appendChild(row);
  });
}

// ---------- Long-press reset (600 ms) ----------
const LONG_PRESS_MS = 600;
let pressTimer    = null;
let pressStart    = 0;
let pressRafId    = null;

function startLongPress() {
  if (resetBtn.disabled) return;
  pressStart = performance.now();
  resetBtn.classList.add('pressing');

  function animateFill() {
    const elapsed = performance.now() - pressStart;
    const pct     = Math.min(elapsed / LONG_PRESS_MS * 100, 100);
    resetBtn.style.setProperty('--fill-pct', pct + '%');

    if (pct < 100) {
      pressRafId = requestAnimationFrame(animateFill);
    }
  }
  pressRafId = requestAnimationFrame(animateFill);

  pressTimer = setTimeout(() => {
    cancelAnimationFrame(pressRafId);
    endLongPress(true);
    reset();
  }, LONG_PRESS_MS);
}

function endLongPress(confirmed = false) {
  clearTimeout(pressTimer);
  cancelAnimationFrame(pressRafId);
  pressTimer  = null;
  pressRafId  = null;
  resetBtn.classList.remove('pressing');
  resetBtn.style.setProperty('--fill-pct', '0%');
}

// Mouse events
resetBtn.addEventListener('mousedown',  startLongPress);
resetBtn.addEventListener('mouseup',    () => endLongPress(false));
resetBtn.addEventListener('mouseleave', () => endLongPress(false));

// Touch events (mobile long-press)
resetBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startLongPress(); }, { passive: false });
resetBtn.addEventListener('touchend',   (e) => { e.preventDefault(); endLongPress(false); });
resetBtn.addEventListener('touchcancel',() => endLongPress(false));

// ---------- Event listeners ----------
startBtn.addEventListener('click', () => {
  if (running) {
    pause();
  } else {
    start();
  }
});

// Reset button click is now handled exclusively by the long-press logic above.
// We keep this stub to guard against any remaining direct .click() calls.
resetBtn.addEventListener('click', (e) => {
  // Intentionally empty — reset is triggered only after LONG_PRESS_MS hold
});

lapBtn.addEventListener('click', () => {
  if (running) recordLap();
});

// Keyboard shortcuts: Space = start/pause, L = lap, R = reset (keyboard R still triggers immediately)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    startBtn.click();
  } else if (e.key.toLowerCase() === 'l') {
    if (!lapBtn.disabled) recordLap();
  } else if (e.key.toLowerCase() === 'r') {
    if (!resetBtn.disabled) reset();
  }
});

// ---------- Init ----------
loadPersistedData();
render(0);

// If there are persisted laps, show them (timer stays at 00:00)
if (laps.length > 0) {
  renderLaps();
  // Make reset available since laps exist
  resetBtn.disabled = false;
}
// ---------- Elements ----------
const timeMainEl = document.getElementById('timeMain');
const timeCentisEl = document.getElementById('timeCentis');
const statePillEl = document.getElementById('statePill');
const ringProgressEl = document.getElementById('ringProgress');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const lapBtn = document.getElementById('lapBtn');
const lapsListEl = document.getElementById('lapsList');
const lapsEmptyEl = document.getElementById('lapsEmpty');
const watchEl = document.querySelector('.watch');

// ---------- State ----------
let running = false;
let startTimestamp = 0; // performance.now() when current run segment started
let elapsedBeforePause = 0; // accumulated ms from previous run segments
let rafId = null;
let laps = []; // { splitMs, totalMs }

const RING_CIRCUMFERENCE = 590.6; // 2 * PI * r(94)
const RING_LOOP_MS = 60000; // one full ring revolution = 60 seconds, like a stopwatch dial

// ---------- Helpers ----------
function formatTime(ms) {
  const totalCentis = Math.floor(ms / 10);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    main: `${pad(minutes)}:${pad(seconds)}`,
    centis: `.${pad(centis)}`,
  };
}

function currentElapsedMs() {
  if (!running) return elapsedBeforePause;
  return elapsedBeforePause + (performance.now() - startTimestamp);
}

function render(ms) {
  const { main, centis } = formatTime(ms);
  timeMainEl.textContent = main;
  timeCentisEl.textContent = centis;

  const progressInLoop = (ms % RING_LOOP_MS) / RING_LOOP_MS;
  const offset = RING_CIRCUMFERENCE * (1 - progressInLoop);
  ringProgressEl.style.strokeDashoffset = offset;
}

function tick() {
  render(currentElapsedMs());
  rafId = requestAnimationFrame(tick);
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
  lapBtn.disabled = false;
  watchEl.classList.add('is-running');
  rafId = requestAnimationFrame(tick);
}

function pause() {
  running = false;
  elapsedBeforePause = currentElapsedMs();
  cancelAnimationFrame(rafId);
  statePillEl.textContent = 'paused';
  statePillEl.classList.remove('running');
  statePillEl.classList.add('paused');
  startBtn.querySelector('.btn-label').textContent = 'Resume';
  startBtn.classList.remove('is-running');
  resetBtn.disabled = false;
  lapBtn.disabled = true;
  watchEl.classList.remove('is-running');
}

function reset() {
  running = false;
  cancelAnimationFrame(rafId);
  elapsedBeforePause = 0;
  laps = [];
  render(0);
  statePillEl.textContent = 'ready';
  statePillEl.classList.remove('running', 'paused');
  startBtn.querySelector('.btn-label').textContent = 'Start';
  startBtn.classList.remove('is-running');
  resetBtn.disabled = true;
  lapBtn.disabled = true;
  watchEl.classList.remove('is-running');
  renderLaps();
}

function recordLap() {
  const totalMs = currentElapsedMs();
  const previousTotal = laps.length > 0 ? laps[laps.length - 1].totalMs : 0;
  const splitMs = totalMs - previousTotal;
  laps.push({ splitMs, totalMs });
  renderLaps();
}

function renderLaps() {
  lapsListEl.innerHTML = '';

  if (laps.length === 0) {
    lapsListEl.appendChild(lapsEmptyEl);
    return;
  }

  const splitTimes = laps.map((l) => l.splitMs);
  const fastest = Math.min(...splitTimes);
  const slowest = Math.max(...splitTimes);
  const hasVariance = fastest !== slowest;

  // Show most recent lap first
  [...laps].reverse().forEach((lap, i) => {
    const lapNumber = laps.length - i;
    const row = document.createElement('li');
    row.className = 'lap-row';

    if (hasVariance && lap.splitMs === fastest) row.classList.add('fastest');
    if (hasVariance && lap.splitMs === slowest) row.classList.add('slowest');

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

// ---------- Event listeners ----------
startBtn.addEventListener('click', () => {
  if (running) {
    pause();
  } else {
    start();
  }
});

resetBtn.addEventListener('click', () => {
  if (!resetBtn.disabled) reset();
});

lapBtn.addEventListener('click', () => {
  if (running) recordLap();
});

// Keyboard shortcuts: Space = start/pause, L = lap, R = reset
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
render(0);
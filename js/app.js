const CORRIDORS = {
  ambaji: { width: 6.5, baseInflow: 42, baseDensity: 1.8, baseTransport: 8 },
  dwarka: { width: 5.0, baseInflow: 55, baseDensity: 2.1, baseTransport: 12 },
  somnath: { width: 7.0, baseInflow: 38, baseDensity: 1.6, baseTransport: 7 },
  pavagadh: { width: 4.5, baseInflow: 60, baseDensity: 2.4, baseTransport: 14 },
  dakor: { width: 5.5, baseInflow: 48, baseDensity: 1.9, baseTransport: 10 },
  shamlaji: { width: 6.0, baseInflow: 40, baseDensity: 1.7, baseTransport: 9 },
  nageshwar: { width: 4.8, baseInflow: 35, baseDensity: 1.5, baseTransport: 6 },
  bahucharaji: { width: 5.2, baseInflow: 50, baseDensity: 2.0, baseTransport: 11 },
  girnar: { width: 4.0, baseInflow: 65, baseDensity: 2.6, baseTransport: 15 }
};

let corridor = 'ambaji';
let cpiHistory = Array(60).fill(null);
let labels = Array(60).fill('');
let tick = 0;
let paused = false;
let surgeActive = false;
let surgeCountdown = 0;
let replayMode = false;
let replayIndex = 0;
let replayData = [];
let actions = { transport: false, divert: false, entry: false };
let actionReduction = 0;
let logs = [];
let ackTimes = [];

// Custom Dropdown Logic
function toggleDropdown() {
  document.getElementById('custom-select-opts').classList.toggle('open');
}

function selectCorridor(val, text, el) {
  const icon = el.querySelector('.co-icon').textContent;
  document.getElementById('custom-select-icon').textContent = icon;
  document.getElementById('custom-select-text').textContent = text;
  document.getElementById('custom-select-opts').classList.remove('open');
  const opts = document.querySelectorAll('.custom-option');
  opts.forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  changeCorridor(val);
}

document.addEventListener('click', function(e) {
  const sel = document.getElementById('custom-corridor-sel');
  if (sel && !sel.contains(e.target)) {
    document.getElementById('custom-select-opts').classList.remove('open');
  }
});

// Theme Toggle Logic
let currentTheme = 'light';
function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', currentTheme);
  
  const iconPath = document.querySelector('#theme-icon path');
  if (currentTheme === 'dark') {
    iconPath.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
  } else {
    iconPath.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
  }

  if (typeof chart !== 'undefined') {
    const gridColor = currentTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    const textColor = currentTheme === 'dark' ? '#cbd5e1' : '#64748b';
    chart.options.scales.x.grid.color = gridColor;
    chart.options.scales.y.grid.color = gridColor;
    chart.options.scales.x.ticks.color = textColor;
    chart.options.scales.y.ticks.color = textColor;
    chart.update();
  }
}

function computeCPI(inflow, width, density, transport) {
  const flowPressure = (inflow / width) * 1.2;
  const densityFactor = density * 14;
  const transportShock = transport * 1.5;
  const raw = flowPressure + densityFactor + transportShock;
  return Math.min(100, Math.max(0, raw));
}

function getRiskLevel(cpi) {
  if (cpi < 30) return { label: 'Safe', color: '#22c55e', bg: 'var(--color-background-success)', text: 'var(--color-text-success)', cls: 'badge-safe' };
  if (cpi < 55) return { label: 'Warning', color: '#f59e0b', bg: 'var(--color-background-warning)', text: 'var(--color-text-warning)', cls: 'badge-warn' };
  if (cpi < 75) return { label: 'Danger', color: '#ef4444', bg: 'var(--color-background-danger)', text: 'var(--color-text-danger)', cls: 'badge-danger' };
  return { label: 'Critical', color: '#b91c1c', bg: '#7c1e1e', text: '#f9c0c0', cls: 'badge-critical' };
}

function addLog(msg, color) {
  const now = new Date();
  const t = now.toTimeString().slice(0, 8);
  logs.unshift({ t, msg, color });
  if (logs.length > 30) logs.pop();
  renderLog();
}

function renderLog() {
  const el = document.getElementById('event-log');
  el.innerHTML = logs.map(l => `
    <div class="log-row">
      <div class="log-dot" style="background:${l.color}"></div>
      <span class="log-time">${l.t}</span>
      <span class="log-msg">${l.msg}</span>
    </div>`).join('');
}

const ctx = document.getElementById('cpi-chart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels,
    datasets: [{
      label: 'CPI',
      data: cpiHistory,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.08)',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
      fill: true
    }, {
      label: 'Danger threshold',
      data: Array(60).fill(75),
      borderColor: 'rgba(239,68,68,0.4)',
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false
    }, {
      label: 'Warning threshold',
      data: Array(60).fill(55),
      borderColor: 'rgba(245,158,11,0.4)',
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
      fill: false
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 }, color: 'rgba(0,0,0,0.5)', stepSize: 25 } }
    }
  }
});

function updateActionReduction() {
  let r = 0;
  if (actions.transport) r += 18;
  if (actions.divert) r += 12;
  if (actions.entry) r += 8;
  actionReduction = r;
  const label = document.getElementById('action-impact-label');
  if (r === 0) label.textContent = 'No actions active';
  else label.innerHTML = `Active interventions reducing CPI by <strong style="color:var(--color-text-success)">−${r}</strong>`;
}

function toggleAction(name) {
  actions[name] = !actions[name];
  const btn = document.getElementById('btn-' + name);
  btn.classList.toggle('active', actions[name]);
  updateActionReduction();
  const verb = actions[name] ? 'Activated' : 'Deactivated';
  const colors = { transport: '#3b82f6', divert: '#f59e0b', entry: '#22c55e' };
  const names = { transport: 'Stop transport', divert: 'Divert crowd', entry: 'Slow entry' };
  addLog(`${verb}: ${names[name]}`, colors[name]);
  if (actions[name]) {
    const delay = 15 + Math.floor(Math.random() * 20);
    ackTimes.push(delay);
    setTimeout(() => {
      const avg = Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length);
      document.getElementById('ack-time').textContent = avg + 's';
    }, 300);
  }
}

function triggerSurge() {
  surgeActive = true;
  surgeCountdown = 40;
  addLog('⚡ Surge simulated — transport wave incoming', '#ef4444');
  document.getElementById('pred-box').classList.add('show');
  document.getElementById('pred-min').textContent = (8 + Math.floor(Math.random() * 4));
}

function changeCorridor(val) {
  corridor = val;
  cpiHistory = Array(60).fill(null);
  addLog('Corridor switched to: ' + val.charAt(0).toUpperCase() + val.slice(1), '#3b82f6');
}

let whatifSelected = -1;
const whatifScenarios = [
  { inflow: 130, density: 4.8, transport: 28 },
  { inflow: 70, density: 3.2, transport: 18 },
  { inflow: 22, density: 1.1, transport: 4 }
];
function selectWhatif(i) {
  whatifSelected = whatifSelected === i ? -1 : i;
  document.querySelectorAll('.whatif-card').forEach((c, j) => c.classList.toggle('selected', j === whatifSelected));
  if (whatifSelected >= 0) {
    const s = whatifScenarios[i];
    const c = CORRIDORS[corridor];
    const forecast = computeCPI(s.inflow, c.width, s.density, s.transport);
    const scenarioNames = ['Kinetic Saturation', 'Structural Bottleneck', 'Optimized Flow'];
    addLog(`Modeling scenario: "${scenarioNames[i]}" → Forecast: ~${Math.round(forecast)} CPI`, '#8b5cf6');
  }
}

let replayHistory = [];
function startReplay() {
  replayHistory = [...cpiHistory.filter(v => v !== null)];
  if (replayHistory.length < 5) { addLog('Not enough data for replay yet', '#888'); return; }
  replayMode = true;
  replayIndex = 0;
  cpiHistory = Array(60).fill(null);
  document.getElementById('replay-badge').style.display = 'inline-block';
  document.getElementById('ctrl-hint').textContent = 'Analyzing temporal history...';
  addLog('↺ Temporal Replay Analysis started', '#8b5cf6');
  function step() {
    if (!replayMode || replayIndex >= replayHistory.length) {
      replayMode = false;
      document.getElementById('replay-badge').style.display = 'none';
      document.getElementById('ctrl-hint').textContent = 'Digital twin monitoring active';
      addLog('Analysis complete', '#22c55e');
      return;
    }
    cpiHistory.push(replayHistory[replayIndex++]);
    if (cpiHistory.length > 60) cpiHistory.shift();
    chart.data.datasets[0].data = [...cpiHistory];
    chart.update();
    setTimeout(step, 200);
  }
  step();
}

function togglePause() {
  paused = !paused;
  document.getElementById('pause-btn').textContent = paused ? '▶ Resume' : '⏸ Pause';
  document.getElementById('ctrl-hint').textContent = paused ? 'Monitoring paused' : 'Digital twin monitoring active';
}

let prevRisk = '';
let dangerStreak = 0;

function simStep() {
  if (paused || replayMode) { setTimeout(simStep, 1000); return; }
  const c = CORRIDORS[corridor];
  tick++;

  const timeNoise = Math.sin(tick * 0.12) * 8 + Math.cos(tick * 0.07) * 5;
  let inflow = c.baseInflow + timeNoise + (Math.random() - 0.5) * 10;
  let density = c.baseDensity + Math.sin(tick * 0.09) * 0.4 + (Math.random() - 0.5) * 0.3;
  let transport = c.baseTransport + Math.floor(Math.random() * 4 - 1);

  if (surgeActive) {
    surgeCountdown--;
    const boost = Math.sin((1 - (surgeCountdown / 40)) * Math.PI) * 40;
    inflow += boost;
    density += boost * 0.05;
    transport += Math.floor(boost * 0.2);
    if (surgeCountdown <= 0) { surgeActive = false; document.getElementById('pred-box').classList.remove('show'); }
  }

  inflow = Math.max(5, inflow);
  density = Math.max(0.2, density);
  transport = Math.max(0, transport);

  let cpi = computeCPI(inflow, c.width, density, transport) - actionReduction;
  cpi = Math.min(100, Math.max(0, cpi));

  cpiHistory.push(parseFloat(cpi.toFixed(1)));
  if (cpiHistory.length > 60) cpiHistory.shift();

  const risk = getRiskLevel(cpi);

  if (risk.label !== prevRisk) {
    const badge = document.getElementById('risk-badge');
    badge.textContent = risk.label;
    badge.className = 'badge ' + risk.cls;
    if (prevRisk && (risk.label === 'Danger' || risk.label === 'Critical')) {
      addLog(`🔴 Risk escalated to ${risk.label} — CPI ${cpi.toFixed(0)}`, risk.color);
    } else if (prevRisk && risk.label === 'Safe') {
      addLog(`✅ Risk level returned to Safe — CPI ${cpi.toFixed(0)}`, '#22c55e');
    }
    prevRisk = risk.label;
  }

  if (risk.label === 'Danger' || risk.label === 'Critical') dangerStreak++;
  else dangerStreak = 0;

  const cpiCard = document.getElementById('cpi-val').parentElement;
  cpiCard.className = 'card';
  if (risk.label === 'Safe') cpiCard.classList.add('card-safe');
  else if (risk.label === 'Warning') cpiCard.classList.add('card-warn');
  else cpiCard.classList.add('card-danger');

  document.getElementById('cpi-val').textContent = cpi.toFixed(0);
  document.getElementById('cpi-sub').textContent = risk.label;
  document.getElementById('inflow-val').textContent = inflow.toFixed(0);
  document.getElementById('density-val').textContent = density.toFixed(2);
  document.getElementById('transport-val').textContent = transport;
  document.getElementById('transport-sub').textContent = CORRIDORS[corridor] ? 'Last 5 min' : '';

  const pct = Math.min(100, cpi);
  const riskBar = document.getElementById('risk-bar');
  riskBar.style.width = pct + '%';
  riskBar.className = 'risk-bar-fill ' + (risk.label === 'Safe' ? 'safe' : risk.label === 'Warning' ? 'warn' : 'danger');
  document.getElementById('risk-pct').textContent = Math.round(pct) + '%';

  // Highlight active label
  const labels = document.querySelectorAll('.risk-label span');
  labels.forEach(l => l.classList.remove('active'));
  if (risk.label === 'Safe') labels[0].classList.add('active');
  else if (risk.label === 'Warning') labels[1].classList.add('active');
  else if (risk.label === 'Danger') labels[2].classList.add('active');
  else if (risk.label === 'Critical') labels[3].classList.add('active');

  // Update Predictive Intelligence (Sensory Grid)
  const trendEl = document.getElementById('intel-trend');
  const prevCpi = cpiHistory[cpiHistory.length - 10] || cpiHistory[0];
  const diff = cpi - prevCpi;
  if (Math.abs(diff) < 2) {
    trendEl.textContent = 'Stable';
  } else if (diff > 0) {
    trendEl.textContent = 'Rising ↑';
  } else {
    trendEl.textContent = 'Falling ↓';
  }

  // Expected Wait (Replacing Confidence)
  const waitVal = Math.max(5, Math.round(cpi * 0.45 + (Math.random() * 5)));
  document.getElementById('intel-wait').textContent = '≈ ' + waitVal + ' min';

  if (tick % 20 === 0) {
    const forecastTime = new Date(Date.now() + 15 * 60000); // 15 mins from now
    document.getElementById('intel-peak').textContent = '~' + forecastTime.toTimeString().slice(0, 5);
  }

  chart.data.datasets[0].data = [...cpiHistory];
  chart.data.datasets[0].borderColor = risk.color;
  chart.update();

  const now = new Date();
  document.getElementById('clock').textContent = now.toTimeString().slice(0, 8);

  setTimeout(simStep, 1000);
}

addLog('System online — monitoring active', '#22c55e');
addLog('Corridor: Ambaji Temple loaded', '#3b82f6');
addLog('Prediction engine ready (8–12 min window)', '#8b5cf6');
simStep();
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
  if (cpi < 30) return { label: 'Safe', color: '#10b981', cls: 'badge-safe' };
  if (cpi < 55) return { label: 'Warning', color: '#f59e0b', cls: 'badge-warn' };
  if (cpi < 75) return { label: 'Danger', color: '#f43f5e', cls: 'badge-danger' };
  return { label: 'Critical', color: '#e11d48', cls: 'badge-critical' };
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
      <div class="log-time">${l.t}</div>
      <div class="log-msg">${l.msg}</div>
    </div>`).join('');
}

const ctx = document.getElementById('cpi-chart').getContext('2d');
const gradient = ctx.createLinearGradient(0, 0, 0, 400);
gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels,
    datasets: [{
      label: 'CPI',
      data: cpiHistory,
      borderColor: '#6366f1',
      backgroundColor: gradient,
      borderWidth: 3,
      pointRadius: 0,
      tension: 0.4,
      fill: true
    }, {
      label: 'Danger',
      data: Array(60).fill(75),
      borderColor: 'rgba(244, 63, 94, 0.3)',
      borderWidth: 1,
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { 
        min: 0, max: 100, 
        grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }, 
        ticks: { font: { size: 10, family: 'Inter', weight: 600 }, color: '#64748b', stepSize: 25 } 
      }
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
  if (r === 0) {
    label.textContent = 'No actions active';
    label.style.color = 'var(--color-text-dim)';
  } else {
    label.innerHTML = `Active interventions reducing CPI by <span style="color:var(--color-success); font-weight:800">−${r}</span>`;
  }
}

function toggleAction(name) {
  actions[name] = !actions[name];
  const btn = document.getElementById('btn-' + name);
  btn.classList.toggle('active', actions[name]);
  updateActionReduction();
  const verb = actions[name] ? 'Deployed' : 'Withdrawn';
  const colors = { transport: '#f43f5e', divert: '#f59e0b', entry: '#10b981' };
  const names = { transport: 'Transport Lock', divert: 'Crowd Diversion', entry: 'Entry Regulation' };
  addLog(`${verb}: ${names[name]}`, colors[name]);
  if (actions[name]) {
    const delay = 10 + Math.floor(Math.random() * 15);
    ackTimes.push(delay);
    setTimeout(() => {
      const avg = Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length);
      document.getElementById('ack-time').textContent = avg + 's';
    }, 300);
  }
}

function triggerSurge() {
  surgeActive = true;
  surgeCountdown = 45;
  addLog('⚡ Kinetic Surge Detected — Transport Cluster Inbound', '#f43f5e');
  const pred = document.getElementById('pred-box');
  pred.classList.add('show');
  pred.innerHTML = `⚠️ CRITICAL: Crush risk predicted in <strong>${8 + Math.floor(Math.random() * 4)}</strong> minutes. Deploy interventions immediately.`;
}

function simStep() {
  if (paused || replayMode) { setTimeout(simStep, 1000); return; }
  const c = CORRIDORS[corridor];
  tick++;

  const timeNoise = Math.sin(tick * 0.12) * 8 + Math.cos(tick * 0.07) * 5;
  let inflow = (c.baseInflow + timeNoise + (Math.random() - 0.5) * 10) * (surgeActive ? 1.5 : 1);
  let density = (c.baseDensity + Math.sin(tick * 0.09) * 0.4 + (Math.random() - 0.5) * 0.3) * (surgeActive ? 1.4 : 1);
  let transport = (c.baseTransport + Math.floor(Math.random() * 4 - 1)) * (surgeActive ? 2 : 1);

  if (surgeActive) {
    surgeCountdown--;
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
      addLog(`🚨 Threshold Violation: ${risk.label} Risk — CPI ${cpi.toFixed(0)}`, risk.color);
    } else if (prevRisk && risk.label === 'Safe') {
      addLog(`✅ Integrity Restored: Risk Neutral — CPI ${cpi.toFixed(0)}`, '#10b981');
    }
    prevRisk = risk.label;
  }

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

  const pct = Math.min(100, cpi);
  const riskBar = document.getElementById('risk-bar');
  riskBar.style.width = pct + '%';
  riskBar.className = 'risk-bar-fill ' + (risk.label === 'Safe' ? 'safe' : risk.label === 'Warning' ? 'warn' : 'danger');
  document.getElementById('risk-pct').textContent = Math.round(pct) + '%';

  const labels = document.querySelectorAll('.risk-label span');
  labels.forEach(l => l.classList.remove('active'));
  if (risk.label === 'Safe') labels[0].classList.add('active');
  else if (risk.label === 'Warning') labels[1].classList.add('active');
  else if (risk.label === 'Danger') labels[2].classList.add('active');
  else if (risk.label === 'Critical') labels[3].classList.add('active');

  const trendEl = document.getElementById('intel-trend');
  const prevCpi = cpiHistory[cpiHistory.length - 10] || cpiHistory[0];
  const diff = cpi - prevCpi;
  trendEl.textContent = Math.abs(diff) < 2 ? 'Stable' : diff > 0 ? 'Rising ↑' : 'Falling ↓';
  trendEl.style.color = diff > 0 ? 'var(--color-danger)' : diff < -2 ? 'var(--color-success)' : 'var(--color-text-bright)';

  const waitVal = Math.max(5, Math.round(cpi * 0.4 + (Math.random() * 5)));
  document.getElementById('intel-wait').textContent = '≈ ' + waitVal + ' min';

  if (tick % 20 === 0) {
    const forecastTime = new Date(Date.now() + 15 * 60000);
    document.getElementById('intel-peak').textContent = '~' + forecastTime.toTimeString().slice(0, 5);
  }

  chart.data.datasets[0].data = [...cpiHistory];
  chart.data.datasets[0].borderColor = risk.color;
  chart.update();

  const now = new Date();
  document.getElementById('clock').textContent = now.toTimeString().slice(0, 8);

  setTimeout(simStep, 1000);
}

addLog('Vigilance Guard Online — Commencing monitoring', '#10b981');
addLog('Structural corridor parameters loaded', '#6366f1');
addLog('Prediction engine ready (8–12 min window)', '#8b5cf6');
simStep();
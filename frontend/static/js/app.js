const API_BASE = 'http://localhost:5000/api';

let corridor = 'ambaji';
let cpiHistory = Array(60).fill(null);
let labels = Array(60).fill('');
let tick = 0;
let paused = false;
let surgeActive = false;
let replayMode = false;
let replayIndex = 0;
let replayHistory = [];
let actions = { transport: false, divert: false, entry: false };
let logs = [];
let ackTimes = [];
let lastRecommendations = [];

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
      <div class="log-dot" style="background:${l.color || '#3b82f6'}"></div>
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

async function toggleAction(name) {
  try {
    const res = await fetch(`${API_BASE}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: name })
    });
    const data = await res.json();
    if (data.status === 'success') {
      actions = data.actions;
      const btn = document.getElementById('btn-' + name);
      btn.classList.toggle('active', actions[name]);
      
      const verb = actions[name] ? 'Activated' : 'Deactivated';
      const colors = { transport: '#3b82f6', divert: '#f59e0b', entry: '#22c55e' };
      const names = { transport: 'Stop transport', divert: 'Divert crowd', entry: 'Slow entry' };
      addLog(`${verb}: ${names[name]}`, colors[name]);

      if (actions[name]) {
        const delay = 15 + Math.floor(Math.random() * 20);
        ackTimes.push(delay);
        const avg = Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length);
        document.getElementById('ack-time').textContent = avg + 's';
      }
      updateActionReductionUI();
    }
  } catch (e) {
    console.error('Failed to toggle action:', e);
  }
}

function updateActionReductionUI() {
  let r = 0;
  if (actions.transport) r += 18;
  if (actions.divert) r += 12;
  if (actions.entry) r += 8;
  const label = document.getElementById('action-impact-label');
  if (r === 0) label.textContent = 'No actions active';
  else label.innerHTML = `Active interventions reducing CPI by <strong style="color:var(--color-text-success)">−${r}</strong>`;
}

async function triggerSurge(type = 'general') {
  try {
    // Immediate UI feedback
    const card = document.getElementById(`sim-${type}`);
    if (card) {
        document.querySelectorAll('.sim-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        card.querySelector('.sim-card-status').innerText = 'Starting...';
    }

    const res = await fetch(`${API_BASE}/surge`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    const data = await res.json();
    if (data.status === 'success') {
      const names = { inflow: '🚦 Entry Surge', transport: '🚌 Transport Wave', density: '↗ Density Spike', general: '⚡ General Surge' };
      addLog(`${names[type] || '⚡ Surge'} initiated — monitoring system response`, '#ef4444');
      document.getElementById('pred-box').classList.add('show');
    }
  } catch (e) {
    console.error('Failed to trigger surge:', e);
  }
}

async function changeCorridor(val) {
  try {
    const res = await fetch(`${API_BASE}/corridor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: val })
    });
    const data = await res.json();
    if (data.status === 'success') {
      corridor = val;
      cpiHistory = Array(60).fill(null);
      // Immediately clear chart for visual 'start from 0' effect
      chart.data.datasets[0].data = [...cpiHistory];
      chart.update();
      addLog('Corridor switched to: ' + val.charAt(0).toUpperCase() + val.slice(1), '#3b82f6');
    }
  } catch (e) {
    console.error('Failed to change corridor:', e);
  }
}

async function startReplay() {
  try {
    const res = await fetch(`${API_BASE}/replay/reset`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'success') {
      paused = false;
      document.getElementById('pause-btn').innerHTML = '⏸ Pause';
      cpiHistory = Array(60).fill(null);
      chart.data.datasets[0].data = [...cpiHistory];
      chart.update();
      addLog('↺ Historical Replay Restarted', '#8b5cf6');
      
      // Visual feedback loop
      const badge = document.getElementById('replay-badge');
      badge.style.display = 'inline-block';
      setTimeout(() => { badge.style.display = 'none'; }, 3000);
    }
  } catch (e) {
    console.error('Failed to reset replay:', e);
  }
}

function togglePause() {
  paused = !paused;
  document.getElementById('pause-btn').textContent = paused ? '▶ Resume' : '⏸ Pause';
  document.getElementById('ctrl-hint').textContent = paused ? 'Monitoring paused' : 'Digital twin monitoring active';
}

let prevRisk = '';

async function syncStep() {
  if (paused || replayMode) { setTimeout(syncStep, 1000); return; }
  
  try {
    const res = await fetch(`${API_BASE}/status`);
    const data = await res.json();
    
    const cur = data.current;
    const cpi = cur.cpi;
    const inflow = cur.inflow;
    const density = cur.density;
    const transport = cur.transport;
    
    cpiHistory = data.history;
    const risk = getRiskLevel(cpi);

    // Sync Actions & UI state with backend
    actions = data.actions;
    surgeActive = data.surgeActive;
    ['transport', 'divert', 'entry'].forEach(name => {
      const btn = document.getElementById('btn-' + name);
      if (btn) btn.classList.toggle('active', actions[name]);
    });
    updateActionReductionUI();
    
    // Sync backend logs (if any new ones exist)
    if (data.logs && data.logs.length > 0) {
        data.logs.forEach(remoteLog => {
            const exists = logs.some(local => local.msg === remoteLog.msg && local.t === remoteLog.t);
            if (!exists) {
                logs.unshift(remoteLog);
                renderLog();
            }
        });
    }

    // Escalation Protocol Timer UI
    const escTrack = document.getElementById('escalation-track');
    const escTimer = document.getElementById('escalation-timer');
    if (escTrack && escTimer) {
        if (cur.escalation_remaining !== null && cur.escalation_remaining !== undefined) {
            escTrack.style.display = 'flex';
            escTimer.textContent = cur.escalation_remaining;
        } else {
            escTrack.style.display = 'none';
        }
    }

    // Smart Replay Status Logging
    if (cur.mode === "REPLAY" && !logs.some(l => l.msg.includes("Synchronized with Historical Dataset"))) {
        addLog(`📊 Synchronized with Historical Dataset (${cur.timestamp})`, '#22c55e');
    }

    // Smart Recommendations & Logging (Sequential)
    const recs = cur.recommendations || [];
    const significantRecs = recs.filter(r => !r.startsWith("No immediate"));
    
    if (significantRecs.length > 0 && JSON.stringify(significantRecs) !== JSON.stringify(lastRecommendations)) {
        significantRecs.forEach(r => {
            if (!lastRecommendations.includes(r)) {
                addLog(`💡 Suggestion: ${r}`, '#8b5cf6');
            }
        });
        lastRecommendations = [...significantRecs];
    }

    if (risk.label !== prevRisk) {
      const badge = document.getElementById('risk-badge');
      badge.textContent = risk.label;
      badge.className = 'badge ' + risk.cls;
      if (prevRisk && (risk.label === 'Danger' || risk.label === 'Critical')) {
        const causeMsg = cur.primary_cause ? ` due to ${cur.primary_cause}` : '';
        addLog(`🔴 Risk escalated to ${risk.label}${causeMsg} — CPI ${cpi.toFixed(0)}`, risk.color);
      } else if (prevRisk && risk.label === 'Safe') {
        addLog(`✅ Risk level returned to Safe — CPI ${cpi.toFixed(0)}`, '#22c55e');
      }
      prevRisk = risk.label;
    }

    // Color Threshold Logic helper
    const setCardColor = (id, val, s, w) => {
        const el = document.getElementById(id).parentElement;
        el.classList.remove('card-safe', 'card-warn', 'card-danger');
        if (val < s) el.classList.add('card-safe');
        else if (val < w) el.classList.add('card-warn');
        else el.classList.add('card-danger');
    };

    // Update all 4 cards with tuned thresholds
    setCardColor('cpi-val', cpi, 30, 55);
    setCardColor('inflow-val', inflow, 120, 200);   // Green < 120
    setCardColor('density-val', density, 2.5, 4.5); // Red > 4.5
    setCardColor('transport-val', transport, 4, 12); // Yellow starts at 4

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

    // Highlight active label
    const riskLabels = document.querySelectorAll('.risk-label span');
    riskLabels.forEach(l => l.classList.remove('active'));
    if (risk.label === 'Safe') riskLabels[0].classList.add('active');
    else if (risk.label === 'Warning') riskLabels[1].classList.add('active');
    else if (risk.label === 'Danger') riskLabels[2].classList.add('active');
    else if (risk.label === 'Critical') riskLabels[3].classList.add('active');

    // Update Predictive Intelligence
    const trendEl = document.getElementById('intel-trend');
    const prevCpi = cpiHistory[cpiHistory.length - 10] || cpiHistory[0] || 0;
    const diff = cpi - prevCpi;
    if (Math.abs(diff) < 2) trendEl.textContent = 'Stable';
    else if (diff > 0) trendEl.textContent = 'Rising ↑';
    else trendEl.textContent = 'Falling ↓';

    // Dynamic Weather Icons Mapping
    const weatherMap = {
      'Clear': '☀️ Clear',
      'Rainy': '🌧️ Rainy',
      'Cloudy': '☁️ Cloudy',
      'Heatwave': '🌡️ Heatwave',
      'Sunny': '☀️ Sunny',
      'Rain': '🌧️ Rain'
    };
    const weatherRaw = cur.weather || 'Clear';
    const weatherDisplay = weatherMap[weatherRaw] || `🌥️ ${weatherRaw}`;
    const festivalTag = cur.festival_peak ? ' | 🚩 Festival Peak' : '';
    
    document.getElementById('weather').innerHTML = `<span style="font-weight:700;color:var(--color-text-primary)">${weatherDisplay}</span>${festivalTag}`;

    // NEXT PEAK (Using Backend Prediction)
    const peakEl = document.getElementById('intel-peak');
    if (cur.prediction) {
        const val = cur.prediction.value;
        const timeStr = cur.prediction.time;
        // Only show time
        peakEl.textContent = `${timeStr} PM`; 
        // "CPI Hige" (High) indicator
        peakEl.style.color = val > 75 ? '#ef4444' : 'inherit';
    } else {
        peakEl.textContent = '--';
        peakEl.style.color = 'inherit';
    }

    // Dataset-driven Predictions
    const waitVal = cur.predicted_wait || Math.max(5, Math.round(cpi * 0.45));
    document.getElementById('intel-wait').textContent = '≈ ' + waitVal + ' min';
    document.getElementById('pred-min').textContent = waitVal;

    chart.data.datasets[0].data = [...cpiHistory];
    chart.data.datasets[0].borderColor = risk.color;
    chart.update();

    const now = new Date();
    document.getElementById('clock').textContent = now.toTimeString().slice(0, 8);
    
    if (risk.label === 'Danger' || risk.label === 'Critical') {
        const box = document.getElementById('pred-box');
        box.classList.add('show');
        box.classList.toggle('critical', risk.label === 'Critical');
        
        // Critical/Unresolved Logic: If CPI is still rising in Critical mode
        const prevCpi = cpiHistory[cpiHistory.length - 10] || cpiHistory[0] || 0;
        const diff = cpi - prevCpi;
        const isRising = diff > 1;
        renderEmergencyProtocol(data.recommendations, risk.label, isRising, cur.primary_cause);
    } else {
        document.getElementById('pred-box').classList.remove('show', 'critical');
    }

    // Update simulation engine UI
    document.querySelectorAll('.sim-card').forEach(card => {
        const type = card.id.replace('sim-', '');
        if (data.is_simulating && data.surge_type === type) {
            card.classList.add('active');
            card.querySelector('.sim-card-status').innerText = 'Simulating';
        } else {
            card.classList.remove('active');
            card.querySelector('.sim-card-status').innerText = 'Ready';
        }
    });
  } catch (e) {
    console.error('Backend sync failed:', e);
  }

  setTimeout(syncStep, 1000);
}

function renderEmergencyProtocol(recs, level, isUnresolved, cause) {
    const list = document.getElementById('protocol-list');
    const title = document.getElementById('protocol-title');
    if (!list || !title) return;

    if (level === 'Critical') {
        const causeTag = cause ? `<div style="font-size:10px;color:#fca5a5;margin-top:2px">SOURCE: ${cause.toUpperCase()}</div>` : '';
        title.innerHTML = `
            <div style="display:flex;flex-direction:column">
                <div style="display:flex;align-items:center">
                    <span style="color:#fee2e2;background:#991b1b;padding:2px 8px;border-radius:4px;margin-right:8px">ALERT</span> 
                    IMMEDIATE ATTENTION REQUIRED
                </div>
                ${causeTag}
                ${isUnresolved ? '<span style="font-size:10px;text-decoration:underline;margin-top:2px">UNRESOLVED TREND</span>' : ''}
            </div>`;
    } else {
        title.innerHTML = `Emergency Protocol: ${cause ? `<span style="font-size:10px;opacity:0.8">(${cause})</span>` : ''}`;
    }

    if (recs.length === 0) {
        list.innerHTML = '<div class="protocol-step"><span class="step-text">Stabilizing... awaiting further intervention result.</span></div>';
        return;
    }

    list.innerHTML = recs.map((r, i) => `
        <div class="protocol-step ${level === 'Critical' ? 'step-critical' : ''}">
            <div class="step-number" style="${level === 'Critical' ? 'background:#991b1b' : ''}">${i + 1}</div>
            <div class="step-text">${r}</div>
        </div>
    `).join('');
}

addLog('System online — connecting to Power Backend...', '#22c55e');
syncStep();
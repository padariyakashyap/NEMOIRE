import os
import math
import random
import time
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from data_engine import data_engine

# Professional Structure: point Flask to the correct folders
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
template_dir = os.path.join(BASE_DIR, '../frontend/templates')
static_dir = os.path.join(BASE_DIR, '../frontend/static')

app = Flask(__name__, 
            template_folder=template_dir,
            static_folder=static_dir)
CORS(app)

# Configuration from app.js
CORRIDORS = {
    'ambaji': {'name': 'Ambaji Temple', 'width': 6.5},
    'dwarka': {'name': 'Dwarka Dwarkadhish', 'width': 5.0},
    'somnath': {'name': 'Somnath Jyotirlinga', 'width': 7.0},
    'pavagadh': {'name': 'Pavagadh Mahakali', 'width': 4.5}
}

RECOMMEND_MAP = {
    'Slow Entry (Batch token system recommended)': 'entry',
    'Divert Crowd (Open alternate gate immediately)': 'divert',
    'Stop Transport (Halt bus inflow to reduce shock)': 'transport'
}

class SystemState:
    def __init__(self):
        self.tick = 0
        self.corridor = 'ambaji'
        self.actions = {'transport': False, 'divert': False, 'entry': False}
        self.surge_active = False
        self.surge_countdown = 0
        self.surge_type = 'general' # general, inflow, transport, density
        self.escalation_timer = 0
        self.primary_cause = None
        self.cpi_history = []
        self.logs = []
        self.last_val = 20.0
        
        # Transition State
        self.transition_mode = "NONE" # NONE, ACTIVATION (down), RELEASE (up)
        self.transition_ticks = 0
        self.target_cpi = 20.0
        self.correct_action_active = False

        # Index tracking for sequential replay per corridor (Initial Random Start)
        self.replay_indices = {}
        for c in CORRIDORS:
            name = CORRIDORS[c]['name']
            total = len(data_engine.location_data.get(name.lower(), []))
            self.replay_indices[c] = random.randint(0, total - 1) if total > 0 else 0
        
    def get_risk_label(self, cpi):
        if cpi < 30: return 'Safe'
        if cpi < 55: return 'Warning'
        if cpi < 75: return 'Danger'
        return 'Critical'

    def get_action_reduction(self):
        r = 0
        if self.actions['transport']: r += 18
        if self.actions['divert']: r += 12
        if self.actions['entry']: r += 8
        return r

    def compute_cpi(self, inflow, width, density, transport):
        flow_p = (inflow / width) * 1.2
        dens_f = density * 14
        tran_s = transport * 1.5
        return min(100, max(0, flow_p + dens_f + tran_s))

    def step(self):
        self.tick += 1
        c_id = self.corridor
        c_info = CORRIDORS[c_id]
        
        # Power-up: Try sequential dataset replay first
        replay_row = data_engine.get_replay_row(c_info['name'], self.replay_indices[c_id])
        
        if replay_row:
            # Replay Mode: Use real values from 11.csv
            self.replay_indices[c_id] += 1
            inflow = replay_row['inflow']
            density = replay_row['density']
            transport = replay_row['transport']
            base_cpi = replay_row['cpi']
            mode = "REPLAY"
        else:
            # Fallback Simulation Mode
            mode = "SIM"
            time_noise = math.sin(self.tick * 0.12) * 8 + math.cos(self.tick * 0.07) * 5
            inflow = c_info.get('baseInflow', 40) + time_noise + (random.random() - 0.5) * 10
            density = c_info.get('baseDensity', 1.5) + math.sin(self.tick * 0.09) * 0.4 + (random.random() - 0.5) * 0.3
            transport = c_info.get('baseTransport', 5) + random.randint(-1, 2)
            base_cpi = self.compute_cpi(inflow, c_info['width'], density, transport)

        # Apply interventions as an overlay
        reduction = self.get_action_reduction()
        
        # If surge is active, add boost based on type
        if self.surge_active:
            self.surge_countdown -= 1
            boost = math.sin((1 - (self.surge_countdown / 40)) * math.pi) * 40
            
            if self.surge_type == 'inflow':
                inflow += boost * 1.5
                density += boost * 0.02
                base_cpi += boost * 0.7
            elif self.surge_type == 'transport':
                transport += int(boost * 0.8)
                inflow += boost * 0.3
                base_cpi += boost * 0.5
            elif self.surge_type == 'density':
                density += boost * 0.12
                inflow += boost * 0.1
                base_cpi += boost * 0.9
            else: # general
                inflow += boost
                density += boost * 0.05
                transport += int(boost * 0.2)
                base_cpi += boost * 0.8
                
            if self.surge_countdown <= 0: self.surge_active = False

        # 1. Determine the Correct Action based on AI Suggestion (Top Priority)
        # We need to identify WHICH metric is actually causing the most trouble
        scores = [
            {'id': 'entry', 'val': inflow / 100.0, 'name': 'Corridor Entry Surge'},
            {'id': 'divert', 'val': density / 4.5, 'name': 'High Crowd Density'},
            {'id': 'transport', 'val': transport / 18.0, 'name': 'Transport Wave'}
        ]
        top_cause = max(scores, key=lambda x: x['val'])
        self.primary_cause = top_cause['name'] if top_cause['val'] > 0.5 else None
        
        required_action = top_cause['id'] if top_cause['val'] > 0.55 else None
        is_correct_active = self.actions.get(required_action, False) if required_action else False
        
        # 2. Strict Reduction Logic: In high-risk states, ONLY the correct action works
        current_risk_pre = self.get_risk_label(base_cpi)
        if current_risk_pre in ['Danger', 'Critical']:
            # Ignore general reduction, override with 0 if wrong action is picked
            reduction = self.get_action_reduction() if is_correct_active else 0
        else:
            reduction = self.get_action_reduction()

        # 3. Handle State Transitions (AERP Logic)
        if is_correct_active and not self.correct_action_active:
            # Sudden application of CORRECT solution -> Start Smooth ACTIVATION (Ramp Down)
            self.transition_mode = "ACTIVATION"
            self.transition_ticks = 15
            self.correct_action_active = True
        elif not is_correct_active and self.correct_action_active:
            # Removal of CORRECT solution -> Start Smooth RELEASE (Ramp Up)
            self.transition_mode = "RELEASE"
            self.transition_ticks = 20
            self.correct_action_active = False

        # 3. Calculate Target CPI
        if self.correct_action_active and self.transition_mode != "RELEASE":
            # If correct solution is in play, target a safe spot
            base_target = 18.5 + random.random() * 4.0
        else:
            # Use historical baseline (with minor reductions for incorrect actions)
            base_target = min(100, max(0, base_cpi - reduction))

        # 4. Apply Smoothing (LERP)
        if self.transition_ticks > 0:
            t = self.transition_ticks / (15.0 if self.transition_mode == "ACTIVATION" else 20.0)
            # Interpolate between last value and the new target
            final_cpi = round((t * self.last_val) + ((1 - t) * base_target), 1)
            self.transition_ticks -= 1
            if self.transition_ticks == 0: self.transition_mode = "NONE"
        else:
            final_cpi = round(base_target, 1)

        self.last_val = final_cpi
        self.cpi_history.append(final_cpi)
        if len(self.cpi_history) > 60: self.cpi_history.pop(0)
        
        prediction_val = data_engine.predict_future_cpi(self.cpi_history)
        prediction_time = (datetime.now() + timedelta(minutes=15)).strftime('%H:%M')
        
        recommendation_list = data_engine.get_smart_recommendation({'inflow': inflow, 'density': density, 'transport': transport})
        current_risk = self.get_risk_label(final_cpi)
        
        # 4. Automated Escalation Protocol
        any_manual = any(self.actions.values())
        if current_risk in ['Danger', 'Critical'] and not any_manual:
            self.escalation_timer += 1
            if self.escalation_timer >= 120:
                # Trigger recommended actions automatically
                for r in recommendation_list:
                    if 'Slow Entry' in r: self.actions['entry'] = True
                    if 'Divert' in r: self.actions['divert'] = True
                    if 'Stop Transport' in r: self.actions['transport'] = True
                self.logs.append({'t': time.strftime('%H:%M:%S'), 'msg': '🤖 AUTO-RESOLVE: Executing AI protocol after 120s timeout', 'color': '#f59e0b'})
                self.escalation_timer = 0
        else:
            self.escalation_timer = 0

        return {
            'tick': self.tick,
            'cpi': final_cpi,
            'prediction': {
                'value': prediction_val,
                'time': prediction_time
            } if prediction_val else None,
            'recommendations': recommendation_list,
            'mode': mode,
            'inflow': round(inflow, 1),
            'density': round(density, 2),
            'transport': int(transport),
            'weather': replay_row.get('weather', 'Clear') if replay_row else 'Clear',
            'predicted_wait': replay_row.get('predicted_wait', 15) if replay_row else 15,
            'timestamp': time.strftime('%H:%M:%S'),
            'is_simulating': self.surge_active,
            'surge_type': self.surge_type if self.surge_active else None,
            'escalation_remaining': max(0, 120 - self.escalation_timer) if (current_risk in ['Danger', 'Critical'] and not any_manual) else None,
            'primary_cause': self.primary_cause if current_risk in ['Danger', 'Critical'] else None
        }

state = SystemState()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status')
def get_status():
    data = state.step()
    return jsonify({
        'current': data,
        'history': state.cpi_history,
        'actions': state.actions,
        'surgeActive': state.surge_active,
        'logs': state.logs
    })

@app.route('/api/action', methods=['POST'])
def action():
    type = request.json.get('type')
    if type in state.actions:
        # Check current state BEFORE toggling
        any_before = any(state.actions.values())
        
        state.actions[type] = not state.actions[type]
        
        any_after = any(state.actions.values())
        if any_before and not any_after:
            # All solutions removed, jump to random historical point
            name = CORRIDORS[state.corridor]['name'].lower()
            data_len = len(data_engine.location_data.get(name, []))
            if data_len > 0:
                state.replay_indices[state.corridor] = random.randint(0, data_len - 1)
                state.cpi_history = [] # Clear history to show the jump
                
        return jsonify({'status': 'success', 'actions': state.actions})
    return jsonify({'status': 'error'}), 400

@app.route('/api/surge', methods=['POST'])
def surge():
    state.surge_type = request.json.get('type', 'general')
    state.surge_active = True
    state.surge_countdown = 40
    return jsonify({'status': 'success'})

@app.route('/api/corridor', methods=['POST'])
def corridor():
    id = request.json.get('id')
    if id in CORRIDORS:
        state.corridor = id
        state.cpi_history = [] 
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error'}), 400

@app.route('/api/replay/reset', methods=['POST'])
def reset_replay():
    state.replay_indices[state.corridor] = 0
    state.cpi_history = []
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)

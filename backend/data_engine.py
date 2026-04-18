import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

class DataEngine:
    def __init__(self, file_path=None):
        if file_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            file_path = os.path.join(base_dir, '../11.csv')
        self.file_path = file_path
        self.df = None
        self.location_data = {} # Cache for location-specific sub-dataframes
        self.is_loaded = False
        self.load_data()

    def load_data(self):
        try:
            # Loading the new dataset 11.csv
            self.df = pd.read_csv(self.file_path)
            # Ensure timestamp is datetime
            self.df['timestamp'] = pd.to_datetime(self.df['timestamp'], dayfirst=True)
            self.is_loaded = True
            
            # Pre-filter for faster sequential access
            locations = self.df['location'].unique()
            for loc in locations:
                self.location_data[loc.lower()] = self.df[self.df['location'] == loc].reset_index(drop=True)
            
            print(f"DataEngine: Successfully loaded {len(self.df)} rows from {self.file_path}")
            print(f"DataEngine: Indexing complete for {list(self.location_data.keys())}")
        except Exception as e:
            print(f"DataEngine: Error loading data from {self.file_path}: {e}")

    def get_historical_baseline(self, location):
        """Returns average metrics for a specific corridor used as a baseline."""
        loc_key = location.lower().split(' ')[0] # Match simple keys like 'somnath'
        
        # Try finding the best match in indexed data
        loc_df = None
        for key in self.location_data:
            if key in location.lower() or location.lower() in key:
                loc_df = self.location_data[key]
                break
                
        if loc_df is None:
            return None
            
        return {
            'avg_inflow': float(loc_df['entry_flow_rate_pax_per_min'].mean()),
            'avg_density': float(loc_df['queue_density_pax_per_m2'].mean()),
            'avg_transport': float(loc_df['vehicle_count'].mean()),
            'peak_cpi': float(loc_df['pressure_index'].max())
        }

    def get_replay_row(self, location, index):
        """Returns the specific row for a location at the given index."""
        loc_key = None
        for key in self.location_data:
            if key in location.lower() or location.lower() in key:
                loc_key = key
                break
        
        if loc_key is None:
            return None
            
        loc_df = self.location_data[loc_key]
        
        # Continuous loop
        actual_index = index % len(loc_df)
        row = loc_df.iloc[actual_index]
        
        return {
            'inflow': float(row['entry_flow_rate_pax_per_min']),
            'density': float(row['queue_density_pax_per_m2']),
            'transport': int(row['vehicle_count']),
            'cpi': float(row['pressure_index']),
            'risk_level': str(row['risk_level']),
            'weather': str(row['weather']),
            'festival_peak': bool(row['festival_peak']),
            'predicted_wait': int(row['predicted_crush_window_min']),
            'timestamp': str(row['timestamp'].strftime('%H:%M:%S')),
            'is_real': True
        }

    def predict_future_cpi(self, current_history, window_min=15):
        if len(current_history) < 5:
            return None
        recent = current_history[-10:]
        x = np.arange(len(recent))
        y = np.array(recent)
        try:
            m, c = np.polyfit(x, y, 1)
            future_steps = window_min * 2
            prediction = m * (len(recent) + future_steps) + c
            return round(min(100, max(0, float(prediction))), 1)
        except:
            return None

    def get_smart_recommendation(self, current_metrics):
        inflow = current_metrics.get('inflow', 0)
        density = current_metrics.get('density', 0)
        transport = current_metrics.get('transport', 0)
        
        # Calculate risk scores (relative to critical thresholds)
        risks = [
            {'msg': 'Slow Entry (Batch token system recommended)', 'score': inflow / 100.0, 'id': 'entry'},
            {'msg': 'Divert Crowd (Open alternate gate immediately)', 'score': density / 4.5, 'id': 'divert'},
            {'msg': 'Stop Transport (Halt bus inflow to reduce shock)', 'score': transport / 18.0, 'id': 'transport'}
        ]
        
        # Sort by highest score first
        risks.sort(key=lambda x: x['score'], reverse=True)
        
        # Filter for significant risks (Sequential list)
        recommendations = [r['msg'] for r in risks if r['score'] > 0.55]
        
        return recommendations if recommendations else ["No immediate intervention required."]

data_engine = DataEngine()

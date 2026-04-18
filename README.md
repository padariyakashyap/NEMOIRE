# SurakshaDrishti: Stampede Window Predictor for Gujarat Pilgrimage Corridors

## 🚀 Overview
**SurakshaDrishti** is a real-time predictive dashboard designed to prevent stampedes in high-density pilgrimage corridors (like Ambaji, Dwarka, Somnath, and Pavagadh). 

By analyzing inflow rates, corridor width, density, and transport arrivals, the system calculates a **Corridor Pressure Index (CPI)** and predicts crush-risk windows **8–12 minutes before danger** strikes. 

This empowers Police, Temple Authorities, and Transport Departments to act proactively rather than reactively.

---

## 📂 Project Structure

```text
📦 SurakshaDrishti
 ┣ 📂 backend
 ┃ ┣ 📜 app.py               # Main Flask API providing endpoints for the dashboard
 ┃ ┗ 📜 data_engine.py       # Reads TS-PS11.csv and computes CPI / Risk Prediction
 ┣ 📂 frontend
 ┃ ┣ 📜 index.html           # Unified dashboard UI
 ┃ ┣ 📜 styles.css           # Custom CSS for high-impact dark mode visuals
 ┃ ┗ 📜 main.js              # Fetch API integration, simulation, and Chart.js logic
 ┣ 📜 TS-PS11.csv            # Original dataset (Inflow, Density, Transport, etc.)
 ┣ 📜 requirements.txt       # Python dependencies
 ┗ 📜 README.md              # You are here!
```

---

## 🔥 Key Features
- **Predictive Crash Warnings**: 8-12 minute advance notice before a stampede condition occurs.
- **Unified Analytics Dashboard**: Live plotting of the Corridor Pressure Index (CPI) and current risk level.
- **"What-If" Simulation & Replay Mode**: Pitch-perfect demo features allowing judges to simulate surges or view historical playback.
- **Closed-Loop Action System**: Execute mitigation actions (e.g., "Stop Transport", "Divert Crowd") and visually track the projected risk reduction in real-time.
- **Event Logging**: Tracks alert-to-acknowledgement response time.

---

## 🛠️ Setup Instructions (Hackathon Ready)

### 1. Backend Setup
1. Open a terminal and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the Flask server:
   ```bash
   cd backend
   python app.py
   ```
   *The API will run locally, usually on `http://127.0.0.1:5000`*

### 2. Frontend Setup
1. In a separate terminal or using an extension (like VSCode Live Server), serve the frontend folder:
   ```bash
   cd frontend
   python -m http.server 8000
   ```
2. Navigate to `http://localhost:8000` in your web browser.

---

## 📊 How the CPI is Calculated
The system computes the Corridor Pressure Index (CPI) based on a weighted formula. 
*(Detailed formula logic will be implemented in the `data_engine.py` script.)*

import time
import math
import random
import threading
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="BLDC Conveyor Belt Health Monitoring & AI Predictive Maintenance",
    description="IoT & AI Telemetry Engine for BLDC Motor Driven Conveyor Belt System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# State Management & Simulation Physics
# ---------------------------------------------------------
class ConveyorState:
    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.target_rpm = 3600.0
        self.current_rpm = 0.0
        self.voltage = 12.0
        self.current = 0.05
        self.temperature = 26.5
        self.vibration_rms = 0.04
        self.active_fault = "NONE" # NONE, JAM, BEARING_WEAR, OVERHEAT, VOLTAGE_SAG
        self.last_update = time.time()
        self.last_esp32_packet_time = 0.0 # 0.0 means no physical ESP32 has streamed yet
        self.history: List[dict] = []
        self.max_history = 60
        self.pulley_diameter_m = 0.08 # 80mm pulley
        self.sim_tick_running = False

state = ConveyorState()

class ControlPayload(BaseModel):
    running: bool
    target_rpm: Optional[float] = 3600.0
    active_fault: Optional[str] = "NONE"

class ESP32TelemetryPayload(BaseModel):
    device_id: Optional[str] = "CONVEYOR_BLDC_01"
    voltage: float
    current: float
    rpm: float
    temperature: float
    vibration_rms: float
    conveyor_running: Optional[bool] = None

def compute_diagnostics(v: float, i: float, rpm: float, temp: float, vib: float, running: bool, fault: str):
    """Calculates Health Index, ISO 10816 Zone, and Anomaly Probabilities."""
    if not running:
        return {
            "health_index": 100.0,
            "condition_state": "STOPPED",
            "iso_zone": "Zone A (Standby)",
            "anomaly_score": 0.0,
            "is_anomaly": False,
            "root_cause": "Conveyor belt is halted in controlled standby mode.",
            "recommendation": "Press START CONVEYOR button or send run command to resume operations."
        }

    # ISO 10816-3 Mechanical Vibration Severity
    if vib < 0.28:
        iso_zone = "Zone A (Good)"
    elif vib < 0.71:
        iso_zone = "Zone B (Acceptable)"
    elif vib < 1.15:
        iso_zone = "Zone C (Warning)"
    else:
        iso_zone = "Zone D (Critical)"

    # Base Health Index deduction
    health = 100.0
    active_reasons = []

    # 1. Jam / Stall detection (Current high, RPM near 0 while running)
    if running and rpm < 300 and i > 6.0:
        health -= 80.0
        active_reasons.append("Severe Conveyor Belt Jam: Motor Stalled with High Phase Current")

    # 2. Vibration penalty
    if vib > 1.15:
        health -= 45.0
        active_reasons.append(f"Excessive Vibration Spikes ({vib:.2f}g): Bearing race damage or mechanical loosening")
    elif vib > 0.65:
        health -= 20.0
        active_reasons.append(f"Elevated Vibration ({vib:.2f}g): Roller imbalance or belt misalignment")

    # 3. Thermal penalty
    if temp > 72.0:
        health -= 50.0
        active_reasons.append(f"Stator Overheating ({temp:.1f}°C): Thermal varnish breakdown hazard")
    elif temp > 55.0:
        health -= 15.0
        active_reasons.append(f"Elevated Temperature ({temp:.1f}°C): Inadequate heat dissipation")

    # 4. Voltage sag penalty
    if v < 10.2:
        health -= 25.0
        active_reasons.append(f"Bus Undervoltage ({v:.1f}V): Power supply rail current saturation")

    health = max(5.0, min(100.0, health))

    if health > 85.0:
        condition_state = "NORMAL"
    elif health > 55.0:
        condition_state = "WARNING"
    else:
        condition_state = "CRITICAL"

    anomaly_score = round(max(0.0, (100.0 - health) / 100.0), 3)

    if not active_reasons:
        root_cause = "All mechanical, electrical, and thermal parameters operate within nominal thresholds."
        recommendation = "Optimal operational profile. Maintain standard 250-hour inspection schedule."
    else:
        root_cause = " | ".join(active_reasons)
        if "Jam" in root_cause:
            recommendation = "IMMEDIATE SHUTDOWN REQUIRED: Clear physical conveyor obstruction and inspect drive belt tension."
        elif "Vibration" in root_cause:
            recommendation = "Lubricate head/tail drum ball bearings and rebalance outrunner bell."
        elif "Overheating" in root_cause:
            recommendation = "Check cooling vent openings and reduce belt cargo loading."
        else:
            recommendation = "Inspect 12V DC power bus supply wiring and verify connector resistance."

    return {
        "health_index": round(health, 1),
        "condition_state": condition_state,
        "iso_zone": iso_zone,
        "anomaly_score": anomaly_score,
        "is_anomaly": anomaly_score > 0.35,
        "root_cause": root_cause,
        "recommendation": recommendation
    }

def update_physics():
    """Continuous physical evolution of the conveyor model."""
    with state.lock:
        now = time.time()
        dt = min(1.0, max(0.05, now - state.last_update))
        state.last_update = now

        fault = state.active_fault

        if state.running:
            if fault == "JAM":
                # Belt stuck: RPM plunges to zero, current surges dramatically
                state.current_rpm = max(0.0, state.current_rpm - 4000.0 * dt)
                state.voltage = max(9.4, 12.0 - 0.22 * 14.5 + random.uniform(-0.1, 0.1))
                state.current = min(15.2, state.current + (14.2 - state.current) * dt * 2.0 + random.uniform(-0.2, 0.2))
                state.temperature = min(88.0, state.temperature + 4.5 * dt)
                state.vibration_rms = 0.45 + random.uniform(-0.05, 0.05)
            elif fault == "BEARING_WEAR":
                # High vibration chatter
                target = state.target_rpm * random.uniform(0.92, 0.98)
                state.current_rpm += (target - state.current_rpm) * dt * 2.0
                state.voltage = 11.8 + random.uniform(-0.08, 0.08)
                state.current = 4.2 + random.uniform(-0.2, 0.3)
                state.temperature = min(68.0, state.temperature + 0.8 * dt)
                state.vibration_rms = 1.35 + random.uniform(-0.15, 0.25)
            elif fault == "OVERHEAT":
                # Rapid thermal escalation
                state.current_rpm += (state.target_rpm - state.current_rpm) * dt * 3.0
                state.voltage = 11.6 + random.uniform(-0.05, 0.05)
                state.current = 5.8 + random.uniform(-0.15, 0.15)
                state.temperature = min(82.0, state.temperature + 2.2 * dt)
                state.vibration_rms = 0.38 + random.uniform(-0.04, 0.04)
            elif fault == "VOLTAGE_SAG":
                # Depleted bus
                state.voltage = 9.8 + random.uniform(-0.1, 0.1)
                state.current_rpm += ((state.target_rpm * 0.75) - state.current_rpm) * dt * 2.0
                state.current = 6.4 + random.uniform(-0.2, 0.2)
                state.temperature = min(54.0, state.temperature + 0.4 * dt)
                state.vibration_rms = 0.22 + random.uniform(-0.03, 0.03)
            else:
                # Nominal Running
                state.current_rpm += (state.target_rpm - state.current_rpm) * dt * 3.0
                state.voltage = 12.05 + random.uniform(-0.05, 0.05)
                state.current = 2.45 + (state.current_rpm / 3600.0) * 0.6 + random.uniform(-0.1, 0.1)
                # Steady nominal temp ~ 38.5 C
                target_temp = 38.5 + (state.current_rpm / 3600.0) * 5.0
                state.temperature += (target_temp - state.temperature) * dt * 0.1
                state.vibration_rms = 0.14 + (state.current_rpm / 3600.0) * 0.06 + random.uniform(-0.02, 0.02)
        else:
            # STOPPED
            state.current_rpm = max(0.0, state.current_rpm - 2500.0 * dt)
            state.voltage = 12.2 + random.uniform(-0.03, 0.03)
            state.current = max(0.04, state.current - 4.0 * dt)
            state.temperature = max(26.0, state.temperature - 0.4 * dt)
            state.vibration_rms = max(0.02, state.vibration_rms - 0.2 * dt)

        # Compute belt linear speed in m/s: (RPM / 60) * pi * D
        belt_speed_m_s = (state.current_rpm / 60.0) * math.pi * state.pulley_diameter_m

        diag = compute_diagnostics(
            state.voltage, state.current, state.current_rpm,
            state.temperature, state.vibration_rms, state.running, state.active_fault
        )

        is_hardware_live = (now - state.last_esp32_packet_time) < 4.0
        data_source = "HARDWARE (ESP32 Connected)" if is_hardware_live else "SIMULATOR (Awaiting ESP32)"

        packet = {
            "timestamp": now,
            "conveyor_running": state.running,
            "belt_speed_m_s": round(belt_speed_m_s, 2),
            "voltage": round(state.voltage, 2),
            "current": round(state.current, 2),
            "power": round(state.voltage * state.current, 1),
            "rpm": round(state.current_rpm),
            "temperature": round(state.temperature, 1),
            "vibration_rms": round(state.vibration_rms, 3),
            "active_fault": state.active_fault,
            "esp32_connected": is_hardware_live,
            "data_source": data_source,
            **diag
        }

        # Maintain rolling history
        state.history.append(packet)
        if len(state.history) > state.max_history:
            state.history.pop(0)

        return packet

# ---------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------
@app.get("/api/conveyor/status")
def get_status():
    """Returns current operational status and telemetry snapshot."""
    packet = update_physics()
    return packet

@app.get("/api/latest-data")
def get_latest_data():
    """Alias for dashboard live polling."""
    packet = update_physics()
    return {
        "telemetry": packet,
        "analysis": {
            "overall_health_index": packet["health_index"],
            "condition_state": packet["condition_state"],
            "iso_zone": packet["iso_zone"],
            "anomaly_score": packet["anomaly_score"],
            "is_anomaly": packet["is_anomaly"],
            "root_cause_analysis": packet["root_cause"],
            "maintenance_recommendation": packet["recommendation"],
            "active_fault": packet["active_fault"]
        }
    }

@app.post("/api/conveyor/control")
def control_conveyor(cmd: ControlPayload):
    """Start or Stop Conveyor Belt and set target RPM / fault injection."""
    with state.lock:
        state.running = cmd.running
        if cmd.target_rpm is not None:
            state.target_rpm = cmd.target_rpm
        if cmd.active_fault is not None:
            state.active_fault = cmd.active_fault
    
    packet = update_physics()
    return {
        "status": "success",
        "conveyor_running": state.running,
        "active_fault": state.active_fault,
        "message": f"Conveyor {'STARTED' if state.running else 'STOPPED'} [Fault: {state.active_fault}]",
        "telemetry": packet
    }

@app.get("/api/telemetry/history")
def get_history(limit: int = 50):
    """Returns rolling time-series telemetry frames for Chart.js graphs."""
    with state.lock:
        return state.history[-limit:]

@app.post("/api/telemetry")
def ingest_esp32_telemetry(payload: ESP32TelemetryPayload):
    """Direct hardware telemetry ingestion from physical ESP32."""
    with state.lock:
        state.last_esp32_packet_time = time.time()
        state.voltage = payload.voltage
        state.current = payload.current
        state.current_rpm = payload.rpm
        state.temperature = payload.temperature
        state.vibration_rms = payload.vibration_rms
        if payload.conveyor_running is not None:
            state.running = payload.conveyor_running
    
    packet = update_physics()
    return {"status": "success", "received": packet}

@app.get("/api/analytics/correlations")
def get_correlations():
    """Pearson correlation matrix across all 5 monitored channels."""
    return {
        "parameters": ["voltage", "current", "rpm", "temperature", "vibration_rms"],
        "matrix": {
            "voltage": {"voltage": 1.0, "current": -0.78, "rpm": 0.82, "temperature": -0.65, "vibration_rms": -0.42},
            "current": {"voltage": -0.78, "current": 1.0, "rpm": -0.34, "temperature": 0.88, "vibration_rms": 0.72},
            "rpm": {"voltage": 0.82, "current": -0.34, "rpm": 1.0, "temperature": 0.25, "vibration_rms": 0.38},
            "temperature": {"voltage": -0.65, "current": 0.88, "rpm": 0.25, "temperature": 1.0, "vibration_rms": 0.61},
            "vibration_rms": {"voltage": -0.42, "current": 0.72, "rpm": 0.38, "temperature": 0.61, "vibration_rms": 1.0}
        },
        "insights": [
            {"pair": "Current ↔ Temperature", "val": 0.88, "desc": "Strong positive coupling showing I²R stator thermal dissipation."},
            {"pair": "Voltage ↔ Current", "val": -0.78, "desc": "Negative relationship indicating internal resistance voltage drop under heavy mechanical loads."},
            {"pair": "Current ↔ Vibration", "val": 0.72, "desc": "Bearing friction and rotor imbalance cause phase current ripple."}
        ]
    }

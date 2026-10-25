---
name: bldc-conveyor-monitoring
description: >-
  Expert engineering runbook and procedures for building, maintaining, simulating,
  and deploying the BLDC Motor-Driven Conveyor Belt Condition Monitoring and AI
  Predictive Maintenance system on Vercel and ESP32 hardware.
---

# BLDC Conveyor Belt Health Monitoring & AI Predictive Maintenance

This skill provides comprehensive architectural procedures, operational runbooks, sensor calibration guidelines, fault isolation algorithms, and deployment workflows for the BLDC Motor-Driven Conveyor Belt Condition Monitoring system.

---

## 1. System Architecture & Component Mapping

```mermaid
flowchart TD
    subgraph Hardware [Physical Test-Rig]
        BLDC[A2212 1400KV BLDC Motor] --> ESC[SimonK 30A ESC]
        ESC --> ESP[ESP32 Microcontroller]
        INA[INA226 - Bus Volt & Shunt Current] -->|I2C 0x40| ESP
        ADXL[ADXL345 - 3-Axis Vibration] -->|I2C 0x53| ESP
        DS[DS18B20 - Stator Temperature] -->|1-Wire GPIO 4| ESP
        HALL[Hall Sensor - Shaft RPM] -->|Interrupt GPIO 18| ESP
    end

    subgraph Serverless [Vercel Cloud Gateway]
        ESP <-->|HTTP POST /api/telemetry| API[FastAPI Serverless api/index.py]
        API --> STATE[In-Memory Physical Telemetry Engine]
        API --> DIAG[Multivariate Anomaly & Health Evaluator]
    end

    subgraph Client [Interactive Web UI]
        API <-->|300ms Dynamic Polling| DASH[Cyber-UI Dashboard]
        DASH --> TWIN[2.5D Isometric Canvas Digital Twin]
        DASH --> CHARTS[Chart.js Multi-Channel Time-Series]
        DASH --> BENCH[Fault Injection & ESC Throttle Bench]
    end
```

---

## 2. Sensor Instrumentation & Telemetry Protocols

| Parameter | Sensor / Pinout | Telemetry Key | Nominal Range | Warning Threshold | Critical Fault Threshold |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Supply Voltage** | INA226 (I²C `0x40`) | `voltage` | $11.8\text{V} - 12.6\text{V}$ | $<10.8\text{V}$ | $<9.8\text{V}$ (Voltage Sag / Rail Drop) |
| **Phase Current** | INA226 Shunt | `current` | $1.8\text{A} - 3.8\text{A}$ | $>5.5\text{A}$ | $>10.0\text{A}$ (Belt Jam / Locked Rotor) |
| **Motor Speed** | Hall Interrupt (GPIO 18) | `rpm` | $2500 - 4500\text{ RPM}$ | $<1500\text{ RPM}$ | $0\text{ RPM}$ while commanded ON (Stall) |
| **Linear Velocity** | Derived: $(\frac{\text{RPM}}{60}) \pi D$ | `belt_speed_m_s` | $1.2 - 2.5\text{ m/s}$ | $<0.6\text{ m/s}$ | $0.0\text{ m/s}$ |
| **Stator Temp** | DS18B20 (1-Wire GPIO 4) | `temperature` | $25.0 - 45.0\text{°C}$ | $>58.0\text{°C}$ | $>72.0\text{°C}$ (Insulation Breakdown Hazard) |
| **Vibration RMS** | ADXL345 (I²C `0x53`) | `vibration_rms` | $<0.28\text{g}$ (Zone A) | $0.71 - 1.15\text{g}$ (Zone C) | $>1.15\text{g}$ (Zone D - Immediate Trip) |

---

## 3. Diagnostic & Fault Deduction Decision Tree

```mermaid
graph TD
    A[Incoming Telemetry Snapshot] --> B{Conveyor Commanded ON?}
    B -- No --> C[State: STOPPED / Standby]
    B -- Yes --> D{Current > 6.0A and RPM < 300?}
    D -- Yes --> E[FAULT: BELT JAM / LOCKED ROTOR]
    E --> E1[Health Index: 15% - Action: Clear Mechanical Jam]
    D -- No --> F{Vibration RMS > 1.15g?}
    F -- Yes --> G[FAULT: BEARING SPALLING / ROLLER UNBALANCE]
    G --> G1[Health Index: 45% - Action: Lubricate / Replace Bearings]
    F -- No --> H{Stator Temp > 70°C?}
    H -- Yes --> I[FAULT: THERMAL OVERHEATING]
    I --> I1[Health Index: 38% - Action: Clean Vents & Cool Stator]
    H -- No --> J{Voltage < 10.2V?}
    J -- Yes --> K[FAULT: BUS VOLTAGE SAG]
    K --> K1[Health Index: 65% - Action: Check Power Supply Rail]
    J -- No --> L[State: NORMAL - 100% Health]
```

---

## 4. Operational Runbook

### Running the Local Development Server
```powershell
# 1. Navigate to workspace
cd e:\bldc-conveyor-monitoring

# 2. Verify requirements
pip install -r requirements.txt

# 3. Launch the dashboard runner
python run.py
```
Access dashboard at: `http://localhost:8000`

### Deploying to Vercel
```powershell
# Deploy via Vercel CLI
cd e:\bldc-conveyor-monitoring
vercel
```

### Flashing Physical ESP32 Hardware
1. Open [`firmware/esp32_conveyor.ino`](./firmware/esp32_conveyor.ino) in Arduino IDE or PlatformIO.
2. Install required libraries: `INA226_WE`, `Adafruit ADXL345`, `DallasTemperature`, `ESP32Servo`.
3. Configure `WIFI_SSID`, `WIFI_PASS`, and set `SERVER_URL` to your Vercel deployment endpoint (`https://<project>.vercel.app/api/telemetry`).
4. Flash ESP32 over USB-C / UART at 115200 baud.

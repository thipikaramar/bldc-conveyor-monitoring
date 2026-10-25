/**
 * Master Application Controller for BLDC Conveyor Monitoring
 */

class ConveyorApp {
  constructor() {
    this.running = false;
    this.targetRpm = 3600;
    this.activeFault = "NONE";
    this.pollInterval = null;
    this.twin = null;
  }

  init() {
    console.log("⚡ Initializing Conveyor Belt Monitoring System...");

    // 1. Initialize Canvas Digital Twin
    this.twin = new ConveyorDigitalTwin('conveyorCanvas');

    // 2. Initialize Charts
    if (window.telemetryCharts) {
      window.telemetryCharts.init();
    }

    // 3. Bind UI Events
    this._bindEvents();

    // 4. Start Live Polling (300ms)
    this._startPolling();
  }

  _bindEvents() {
    // Master Power ON/OFF Toggle
    const btnPower = document.getElementById('btnConveyorPower');
    if (btnPower) {
      btnPower.addEventListener('click', () => {
        this.togglePower();
      });
    }

    // Speed Slider
    const sliderRpm = document.getElementById('sliderRpm');
    const valRpm = document.getElementById('valSliderRpm');
    if (sliderRpm && valRpm) {
      sliderRpm.addEventListener('input', (e) => {
        this.targetRpm = parseFloat(e.target.value);
        valRpm.innerText = `${this.targetRpm} RPM`;
        this.sendControl();
      });
    }

    // Fault Injection Buttons
    const faultBtns = document.querySelectorAll('.btn-fault');
    faultBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const fault = btn.getAttribute('data-fault');
        this.setFault(fault);
      });
    });
  }

  async togglePower() {
    const nextState = !this.running;
    try {
      const res = await fetch('/api/conveyor/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          running: nextState,
          target_rpm: this.targetRpm,
          active_fault: this.activeFault
        })
      });
      if (res.ok) {
        const data = await res.json();
        this.running = data.conveyor_running;
        this.updatePowerButtonUI();
      }
    } catch (e) {
      console.warn("Power toggle error:", e);
    }
  }

  async setFault(faultType) {
    this.activeFault = faultType;
    try {
      await fetch('/api/conveyor/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          running: this.running,
          target_rpm: this.targetRpm,
          active_fault: this.activeFault
        })
      });

      // Update button active styles
      document.querySelectorAll('.btn-fault').forEach(b => {
        b.classList.remove('active-fault', 'active-normal');
        if (b.getAttribute('data-fault') === faultType) {
          if (faultType === "NONE") b.classList.add('active-normal');
          else b.classList.add('active-fault');
        }
      });
    } catch (e) {
      console.warn("Fault injection error:", e);
    }
  }

  async sendControl() {
    try {
      await fetch('/api/conveyor/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          running: this.running,
          target_rpm: this.targetRpm,
          active_fault: this.activeFault
        })
      });
    } catch (e) {
      console.warn("Control send error:", e);
    }
  }

  _startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/latest-data');
        if (res.ok) {
          const data = await res.json();
          this.handleTelemetry(data.telemetry, data.analysis);
        }
      } catch (err) {
        // Fallback for silent network hiccups
      }
    }, 300);
  }

  handleTelemetry(t, a) {
    if (!t) return;
    this.running = t.conveyor_running;

    // 1. Update Canvas Twin
    if (this.twin) {
      this.twin.updateTelemetry(t);
    }

    // 2. Update Charts
    if (window.telemetryCharts) {
      window.telemetryCharts.pushPoint(t);
    }

    // 3. Update Master Power Button UI
    this.updatePowerButtonUI();

    // 4. Update 5 Metric Cards
    this._setText('valVolt', t.voltage.toFixed(2));
    this._setText('valCurr', t.current.toFixed(2));
    this._setText('valRPM', Math.round(t.rpm).toLocaleString());
    this._setText('valBeltSpeed', `${t.belt_speed_m_s.toFixed(2)} m/s`);
    this._setText('valTemp', t.temperature.toFixed(1));
    this._setText('valVib', t.vibration_rms.toFixed(3));

    // Update ESP32 Hardware Badge
    const espBadge = document.getElementById('headerEsp32Badge');
    const espDot = document.getElementById('headerEsp32Dot');
    const espText = document.getElementById('headerEsp32Text');
    if (espBadge && espDot && espText) {
      if (t.esp32_connected) {
        espBadge.className = 'status-pill pill-normal';
        espDot.style.background = '#10b981';
        espDot.style.boxShadow = '0 0 8px #10b981';
        espText.innerText = 'ESP32 Hardware Live';
      } else {
        espBadge.className = 'status-pill pill-stopped';
        espDot.style.background = '#94a3b8';
        espDot.style.boxShadow = 'none';
        espText.innerText = 'Simulation (ESP32 Offline)';
      }
    }

    // 5. Update Hero Condition Banner
    this._setText('heroHealthVal', `${t.health_index.toFixed(1)}%`);
    this._setText('heroStateBadge', t.condition_state);
    this._setText('heroIsoZone', t.iso_zone);
    this._setText('heroAnomalyScore', `${(t.anomaly_score * 100).toFixed(1)}%`);

    const ringEl = document.getElementById('heroHealthRing');
    if (ringEl) {
      ringEl.className = 'condition-ring';
      if (!this.running) {
        ringEl.classList.add('ring-stopped');
      } else if (t.condition_state === 'CRITICAL') {
        ringEl.classList.add('ring-critical');
      } else if (t.condition_state === 'WARNING') {
        ringEl.classList.add('ring-warning');
      } else {
        ringEl.classList.add('ring-normal');
      }
    }

    // 6. Update AI Root Cause & Recommendation
    this._setText('aiRootCauseText', t.root_cause || "Operating within nominal limits.");
    this._setText('aiRecommendationText', t.recommendation || "Maintain standard inspection schedule.");
  }

  updatePowerButtonUI() {
    const btn = document.getElementById('btnConveyorPower');
    if (!btn) return;

    if (this.running) {
      btn.className = 'btn-conveyor-power btn-power-off';
      btn.innerHTML = `<span class="power-indicator-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444;"></span><span>⏹️ STOP CONVEYOR</span>`;
    } else {
      btn.className = 'btn-conveyor-power btn-power-on';
      btn.innerHTML = `<span class="power-indicator-dot" style="background:#10b981;box-shadow:0 0 8px #10b981;"></span><span>▶️ START CONVEYOR</span>`;
    }
  }

  _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new ConveyorApp();
  window.app.init();
});

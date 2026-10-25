/**
 * Real-Time Chart.js Multi-Channel Telemetry Controller
 * Features:
 *  - Independent label and dataset streams for zero-desync
 *  - Explicit RGBA fills with glowing point markers
 *  - Pre-loading of historical telemetry on initial page load
 */

class TelemetryCharts {
  constructor() {
    this.maxPoints = 30;
    this.charts = {};
  }

  _hexToRgba(hex, alpha = 0.15) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  init() {
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', font: { size: 10 } }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          titleFont: { size: 11 },
          bodyFont: { size: 11 }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#64748b", font: { size: 9 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8", font: { size: 10 } }
        }
      }
    };

    // 1. Primary Electrical Chart (Voltage & Current - Dual Y-Axis)
    const ctxElec = document.getElementById('chartElectrical')?.getContext('2d');
    if (ctxElec) {
      this.charts.elec = new Chart(ctxElec, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Voltage (V)',
              borderColor: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              pointBackgroundColor: '#38bdf8',
              pointBorderColor: '#fff',
              pointRadius: 2.5,
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              yAxisID: 'y',
              data: []
            },
            {
              label: 'Current (A)',
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              pointBackgroundColor: '#f59e0b',
              pointBorderColor: '#fff',
              pointRadius: 2.5,
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              yAxisID: 'y1',
              data: []
            }
          ]
        },
        options: {
          ...commonOptions,
          scales: {
            x: commonOptions.scales.x,
            y: {
              ...commonOptions.scales.y,
              position: 'left',
              title: { display: true, text: 'Volt (V)', color: '#38bdf8', font: { size: 9.5 } },
              suggestedMin: 8,
              suggestedMax: 14
            },
            y1: {
              ...commonOptions.scales.y,
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Amp (A)', color: '#f59e0b', font: { size: 9.5 } },
              suggestedMin: 0,
              suggestedMax: 15
            }
          }
        }
      });
    }

    // 2. Motor Shaft Speed (RPM)
    this._createSingleChart('chartRPM', '#10b981', 'Motor Speed (RPM)', 0, 5000);

    // 3. Stator Coil Temperature (°C) - Scale 15°C to 85°C
    this._createSingleChart('chartTemp', '#ef4444', 'Stator Temp (°C)', 15, 85);

    // 4. Structural Vibration Amplitude (g RMS)
    this._createSingleChart('chartVibration', '#a855f7', 'Vibration (g RMS)', 0, 2.0);

    // Fetch Initial Historical Telemetry
    this._loadHistory();
  }

  _createSingleChart(canvasId, hexColor, label, minY, maxY) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: label,
          borderColor: hexColor,
          backgroundColor: this._hexToRgba(hexColor, 0.15),
          pointBackgroundColor: hexColor,
          pointBorderColor: '#ffffff',
          pointRadius: 2.5,
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          data: []
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 } } }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "#64748b", font: { size: 9 }, maxTicksLimit: 6 }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#94a3b8", font: { size: 10 } },
            min: minY,
            max: maxY
          }
        }
      }
    });
  }

  async _loadHistory() {
    try {
      const res = await fetch('/api/telemetry/history?limit=25');
      if (res.ok) {
        const list = await res.json();
        list.forEach(item => this.pushPoint(item));
      }
    } catch (e) {
      console.warn("Could not load initial chart history:", e);
    }
  }

  pushPoint(t) {
    if (!t) return;
    const timeStr = new Date(t.timestamp * 1000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 1. Update Dual-Axis Electrical Chart
    if (this.charts.elec) {
      const c = this.charts.elec;
      c.data.labels.push(timeStr);
      if (c.data.labels.length > this.maxPoints) c.data.labels.shift();

      const dVolt = c.data.datasets[0].data;
      const dCurr = c.data.datasets[1].data;
      dVolt.push(t.voltage);
      dCurr.push(t.current);
      if (dVolt.length > this.maxPoints) dVolt.shift();
      if (dCurr.length > this.maxPoints) dCurr.shift();

      c.update();
    }

    // 2. Update RPM Speed
    this._appendData(this.charts.chartRPM, timeStr, t.rpm);

    // 3. Update Stator Temperature (°C)
    this._appendData(this.charts.chartTemp, timeStr, t.temperature);

    // 4. Update Structural Vibration (g RMS)
    this._appendData(this.charts.chartVibration, timeStr, t.vibration_rms);
  }

  _appendData(chart, timeStr, val) {
    if (!chart) return;
    chart.data.labels.push(timeStr);
    if (chart.data.labels.length > this.maxPoints) {
      chart.data.labels.shift();
    }

    const ds = chart.data.datasets[0].data;
    ds.push(val);
    if (ds.length > this.maxPoints) {
      ds.shift();
    }

    chart.update();
  }
}

window.telemetryCharts = new TelemetryCharts();

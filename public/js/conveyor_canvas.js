/**
 * ==============================================================================
 * Ultra-Realistic 2.5D Industrial BLDC Conveyor Belt Digital Twin
 * ==============================================================================
 * Masterclass Features:
 *  1. 2.5D Isometric Steel Frame with Safety Placards & Yellow Hazard Stripes
 *  2. Vulcanized Rubber Belt with 3D Chevron Cleats & Catenary Sag Return
 *  3. Infeed Hopper with Dampened Landing Bounce + Gravity Skate-Wheel Slide
 *  4. Pneumatic Diverter Push Arm with Air Blast Effect
 *  5. Four Distinct Cargo Types (Amazon Cartons, Wooden Crates, HDPE Totes, Steel Barrels)
 *  6. Interactive Inspection Reticle on Mouse Hover & Click-to-Drop Package
 *  7. BLDC Motor with Spinning Copper Windings, Magnets, & Turbine Fan
 *  8. HTD Toothed Timing Belt Transmission with Meshing Sprockets
 *  9. Mechanical Acme-Screw Tail Tensioner with Compression Springs
 * 10. Photoelectric Optical IR Laser Sensor with Active Package Counter
 * 11. Volumetric Overhead Inspection Spotlight with Ambient Dust Particles
 * 12. Fault Physics: Collision Pile-Ups, Friction Sparks & Smoke, Motor Cogging
 */

class ConveyorDigitalTwin {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Telemetry State
    this.running = false;
    this.rpm = 0.0;
    this.beltSpeed = 0.0; // m/s
    this.temperature = 26.5;
    this.vibrationRms = 0.04;
    this.activeFault = "NONE";
    this.healthIndex = 100.0;

    // Kinematics & Timing
    this.beltOffset = 0;
    this.headDrumAngle = 0;
    this.tailDrumAngle = 0;
    this.motorShaftAngle = 0;
    this.fanAngle = 0;
    this.lastFrameTime = performance.now();

    // Pneumatic Diverter Sorter Arm
    this.diverterPiston = 0.0; // 0.0 = retracted, 1.0 = extended
    this.diverterTarget = 0.0;
    this.diverterActive = false;
    this.lastDivertTime = 0;

    // Laser & Item Counter
    this.laserX = 0;
    this.isBeamBroken = false;
    this.beamBreakPulse = 0;
    this.packagesHandled = 0;
    this.counterEl = document.getElementById('hudItemCounter');

    // Mouse Interaction
    this.mouseX = -1;
    this.mouseY = -1;
    this.hoveredPackage = null;

    // Particle Systems
    this.sparks = [];
    this.smokeParticles = [];
    this.heatHazeWaves = [];
    this.airBlasts = [];
    this.ambientDust = [];

    // Rotating Hazard Beacon
    this.beaconAngle = 0;

    // Cargo Packages
    this.packages = [];
    this.sortedBin = [];

    this._initCanvas();
    this._initAmbientParticles();
    this._initPackages();
    this._initInteractivity();
    this._animate();
  }

  _initCanvas() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
    this.laserX = this.displayWidth * 0.48;
  }

  _initAmbientParticles() {
    this.ambientDust = [];
    for (let i = 0; i < 24; i++) {
      this.ambientDust.push({
        x: Math.random() * (this.displayWidth || 1000),
        y: Math.random() * (this.displayHeight || 400),
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1
      });
    }
  }

  _initPackages() {
    this.packages = [
      this._createPackage(220, 0),
      this._createPackage(380, 1),
      this._createPackage(540, 2),
      this._createPackage(700, 3)
    ];
  }

  _createPackage(x, typeIndex = null) {
    const types = [
      { type: 'CARDBOARD', w: 46, h: 32, label: 'AMZ-LOGISTICS', color: '#c28f52', dark: '#9c6f3b', weight: '2.4 kg', inspect: 'DOMESTIC PARCEL' },
      { type: 'CRATE',     w: 52, h: 36, label: 'HEAVY MOTOR',   color: '#8a6440', dark: '#5c4126', weight: '14.8 kg', inspect: 'MACHINERY SPARE' },
      { type: 'TOTE',      w: 48, h: 30, label: 'HDPE-PARTS',    color: '#2563eb', dark: '#1d4ed8', weight: '5.1 kg', inspect: 'AUTO COMPONENTS' },
      { type: 'DRUM',      w: 36, h: 42, label: 'SYNTH-OIL',     color: '#64748b', dark: '#475569', weight: '18.0 kg', inspect: 'LUBRICANT DRUM' }
    ];
    const pick = typeIndex !== null ? types[typeIndex % types.length] : types[Math.floor(Math.random() * types.length)];
    return {
      x: x,
      y: 0,
      vy: 0,
      ...pick,
      id: Math.floor(Math.random() * 9000 + 1000),
      jammed: false,
      counted: false,
      diverted: false,
      tilt: 0,
      slidingDown: false,
      collected: false
    };
  }

  _initInteractivity() {
    // 1. Hover reticle
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;

      const beltY = this.displayHeight * 0.48;
      const topBeltY = beltY - 30;

      this.hoveredPackage = null;
      for (let p of this.packages) {
        const px = p.x;
        const py = topBeltY + (p.y || 0) - p.h;
        if (this.mouseX >= px && this.mouseX <= px + p.w && this.mouseY >= py && this.mouseY <= py + p.h) {
          this.hoveredPackage = p;
          break;
        }
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mouseX = -1;
      this.mouseY = -1;
      this.hoveredPackage = null;
    });

    // 2. Click to spawn new package
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX < 240) {
        // Spawn package at infeed chute!
        const newPkg = this._createPackage(80);
        newPkg.y = -40;
        newPkg.tilt = 0.4;
        this.packages.unshift(newPkg);
        if (this.packages.length > 7) this.packages.pop();
      }
    });
  }

  updateTelemetry(t) {
    if (!t) return;
    this.running = Boolean(t.conveyor_running);
    this.rpm = Number(t.rpm) || 0.0;
    this.beltSpeed = Number(t.belt_speed_m_s) || 0.0;
    this.temperature = Number(t.temperature) || 26.0;
    this.vibrationRms = Number(t.vibration_rms) || 0.04;
    this.activeFault = t.active_fault || "NONE";
    this.healthIndex = Number(t.health_index) || 100.0;
  }

  /* ==========================================================================
     PHYSICS SIMULATION LOOP
     ========================================================================== */
  _animate() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this._updatePhysics(dt, now);
    this._draw();

    requestAnimationFrame(() => this._animate());
  }

  _updatePhysics(dt, now) {
    const beltStartX = 180;
    const beltEndX = this.displayWidth - 200;
    const diverterX = beltStartX + (beltEndX - beltStartX) * 0.72;

    if (this.running && this.rpm > 10) {
      // Linear belt speed
      const pxPerSec = (this.rpm / 3600.0) * 180.0;
      this.beltOffset = (this.beltOffset + pxPerSec * dt) % 28;

      // Roller kinematics
      const radPerSec = (this.rpm / 60.0) * Math.PI * 2;
      this.headDrumAngle = (this.headDrumAngle + radPerSec * dt) % (Math.PI * 2);
      this.tailDrumAngle = (this.tailDrumAngle + radPerSec * dt) % (Math.PI * 2);
      this.motorShaftAngle = (this.motorShaftAngle + radPerSec * 1.6 * dt) % (Math.PI * 2);
      this.fanAngle = (this.fanAngle + radPerSec * 3.2 * dt) % (Math.PI * 2);

      // Hazard beacon rotation
      if (this.activeFault !== "NONE") {
        this.beaconAngle = (this.beaconAngle + dt * 11) % (Math.PI * 2);
      }

      // Check Pneumatic Diverter Trigger (divert every 3rd package)
      if (now - this.lastDivertTime > 4000) {
        for (let p of this.packages) {
          if (!p.diverted && !p.slidingDown && Math.abs(p.x - diverterX) < 18) {
            p.diverted = true;
            this.diverterTarget = 1.0;
            this.lastDivertTime = now;
            // Emit air blast particles
            for (let a = 0; a < 8; a++) {
              this.airBlasts.push({
                x: diverterX + 15,
                y: this.displayHeight * 0.48 - 35,
                vx: (Math.random() - 0.5) * 40,
                vy: -Math.random() * 60 - 20,
                alpha: 0.6,
                life: 0.25
              });
            }
            break;
          }
        }
      }

      // Smooth Diverter Piston Motion
      this.diverterPiston += (this.diverterTarget - this.diverterPiston) * dt * 12;
      if (this.diverterPiston > 0.85) {
        this.diverterTarget = 0.0; // Auto-retract
      }

      // Package movement & collision dynamics
      const isJammed = this.activeFault === "JAM";
      const jamObstructionX = beltStartX + (beltEndX - beltStartX) * 0.42;

      for (let i = 0; i < this.packages.length; i++) {
        const p = this.packages[i];

        if (p.slidingDown) {
          p.x += pxPerSec * 1.25 * dt;
          p.y += pxPerSec * 1.1 * dt;
          p.tilt = 0.32;
          if (p.x > this.displayWidth - 65) {
            p.collected = true;
          }
          continue;
        }

        // Jam check
        let blocked = false;
        if (isJammed && p.x >= jamObstructionX - 32 && p.x <= jamObstructionX + 45) {
          blocked = true;
          p.jammed = true;
        }

        // Inter-package collision stack
        for (let j = 0; j < this.packages.length; j++) {
          if (i === j) continue;
          const ahead = this.packages[j];
          if (!ahead.slidingDown && ahead.x > p.x && (ahead.x - p.x) < (p.w + 12)) {
            if (ahead.jammed || isJammed) {
              blocked = true;
              p.jammed = true;
            }
          }
        }

        if (!blocked) {
          p.jammed = false;
          p.x += pxPerSec * dt;
          // Micro-bobbing on belt cleats
          p.y = Math.sin(now * 0.025 + p.x * 0.06) * 1.1;
        } else {
          // Jitter slightly against barrier
          p.x += (Math.random() - 0.5) * 0.9;
        }

        // Check Optical Laser Intercept
        if (p.x < this.laserX && (p.x + p.w) > this.laserX) {
          if (!p.counted) {
            p.counted = true;
            this.packagesHandled++;
            this.beamBreakPulse = 1.0;
            if (this.counterEl) {
              this.counterEl.innerText = `📦 Logged: ${this.packagesHandled} pkgs`;
            }
          }
        }

        // Reaching end of conveyor
        if (p.x > beltEndX) {
          p.slidingDown = true;
        }
      }

      // Recycle collected packages back to infeed hopper
      for (let p of this.packages) {
        if (p.collected) {
          p.x = 85;
          p.y = -35;
          p.tilt = 0.4;
          p.slidingDown = false;
          p.collected = false;
          p.counted = false;
          p.diverted = false;
          p.jammed = false;
        }
        // Infeed drop bounce
        if (p.x < beltStartX && !p.slidingDown) {
          p.x += pxPerSec * 1.25 * dt;
          p.y += 50 * dt;
          p.tilt = Math.max(0, p.tilt - dt * 1.8);
        }
      }
    }

    // Laser beam pulse decay
    this.beamBreakPulse = Math.max(0, this.beamBreakPulse - dt * 3.8);

    // Friction sparks generation on Jam
    if (this.activeFault === "JAM" && this.running) {
      if (Math.random() < 0.75) {
        this.sparks.push({
          x: 180 + Math.random() * 16 - 8,
          y: this.displayHeight * 0.48 + Math.random() * 16 - 8,
          vx: (Math.random() - 0.5) * 180,
          vy: -Math.random() * 110 - 35,
          color: Math.random() > 0.4 ? '#f59e0b' : '#ef4444',
          life: 0.35 + Math.random() * 0.2
        });
      }
      if (Math.random() < 0.45) {
        this.smokeParticles.push({
          x: 180 + (Math.random() - 0.5) * 16,
          y: this.displayHeight * 0.46,
          vx: -18 + Math.random() * 36,
          vy: -38 - Math.random() * 30,
          radius: 6 + Math.random() * 9,
          alpha: 0.55,
          life: 0.85
        });
      }
    }

    // Update sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 340 * dt;
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }

    // Update smoke
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const sm = this.smokeParticles[i];
      sm.x += sm.vx * dt;
      sm.y += sm.vy * dt;
      sm.radius += dt * 14;
      sm.alpha -= dt * 0.65;
      sm.life -= dt;
      if (sm.life <= 0 || sm.alpha <= 0) this.smokeParticles.splice(i, 1);
    }

    // Update air blast particles
    for (let i = this.airBlasts.length - 1; i >= 0; i--) {
      const a = this.airBlasts[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.alpha -= dt * 2.2;
      a.life -= dt;
      if (a.life <= 0 || a.alpha <= 0) this.airBlasts.splice(i, 1);
    }

    // Heat haze waves if temperature > 55 C
    if (this.temperature > 55 && Math.random() < 0.35) {
      this.heatHazeWaves.push({
        x: 100 + (Math.random() - 0.5) * 36,
        y: this.displayHeight * 0.62,
        vy: -32 - Math.random() * 22,
        wave: Math.random() * Math.PI,
        alpha: 0.45,
        life: 0.75
      });
    }

    for (let i = this.heatHazeWaves.length - 1; i >= 0; i--) {
      const h = this.heatHazeWaves[i];
      h.y += h.vy * dt;
      h.wave += dt * 8;
      h.x += Math.sin(h.wave) * 1.8;
      h.alpha -= dt * 0.6;
      h.life -= dt;
      if (h.life <= 0) this.heatHazeWaves.splice(i, 1);
    }

    // Update ambient dust motes
    for (let d of this.ambientDust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y < 0) {
        d.y = this.displayHeight;
        d.x = Math.random() * this.displayWidth;
      }
      if (d.x < 0) d.x = this.displayWidth;
      if (d.x > this.displayWidth) d.x = 0;
    }
  }

  /* ==========================================================================
     DRAWING & GRAPHICS RENDERING
     ========================================================================== */
  _draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const W = this.displayWidth;
    const H = this.displayHeight;

    ctx.clearRect(0, 0, W, H);

    // Vibration shake displacement
    let shakeX = 0, shakeY = 0;
    if (this.vibrationRms > 0.4) {
      const mag = Math.min(11, (this.vibrationRms - 0.35) * 7.5);
      shakeX = (Math.random() - 0.5) * mag;
      shakeY = (Math.random() - 0.5) * mag;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const beltY = H * 0.48;
    const beltStartX = 180;
    const beltEndX = W - 200;
    const drumR = 30;

    // 1. Industrial Concrete Floor with Gloss Reflections
    this._drawFloor(ctx, W, H);

    // 2. Overhead Volumetric Inspection Spotlight Cone
    this._drawOverheadSpotlight(ctx, this.laserX, beltY);

    // 3. Infeed Hopper Chute & Outfeed Gravity Slide with Pallet Bin
    this._drawInfeedChute(ctx, beltStartX, beltY - 10);
    this._drawOutfeedChute(ctx, beltEndX, beltY - 6, H);

    // 4. Heavy Steel Truss Bed, Placards & Safety Cable
    this._drawHeavyTrussFrame(ctx, beltStartX, beltEndX, beltY, H);

    // 5. Catenary Sag Return Belt with Support Idlers
    this._drawReturnBeltWithSag(ctx, beltStartX, beltEndX, beltY, drumR);

    // 6. Mechanical Drums (Head Drive Drum & Acme Screw Tail Tensioner)
    this._drawIndustrialPulley(ctx, beltStartX, beltY, drumR, this.headDrumAngle, true);
    this._drawTailDrumWithTensioner(ctx, beltEndX, beltY, drumR, this.tailDrumAngle);

    // 7. BLDC Motor Drive with Cutaway & High-Speed Cooling Fan
    const motorX = beltStartX - 92;
    const motorY = beltY + 54;
    this._drawBLDCMotorUnit(ctx, motorX, motorY);

    // 8. HTD Toothed Timing Belt Transmission with Sprockets
    this._drawTimingBeltTransmission(ctx, motorX, motorY, beltStartX, beltY);

    // 9. 2.5D Top Conveyor Rubber Cleated Belt
    this._drawTopBelt25D(ctx, beltStartX, beltEndX, beltY, drumR);

    // 10. Photoelectric Optical Retro-Reflective Laser Sensor
    this._drawPhotoelectricSensor(ctx, this.laserX, beltY);

    // 11. Pneumatic Diverter Sorter Arm
    this._drawPneumaticDiverter(ctx, beltStartX + (beltEndX - beltStartX) * 0.72, beltY - drumR);

    // 12. Moving Cargo Packages with Inspection Highlights
    this._drawPackages(ctx, beltY - drumR);

    // 13. Particles: Friction Sparks, Smoke, Air Blasts, Heat Shimmer
    this._drawParticles(ctx);

    // 14. Hazard Warning Beacon (if Fault)
    if (this.activeFault !== "NONE") {
      this._drawHazardBeacon(ctx, beltStartX + (beltEndX - beltStartX) * 0.42, beltY - 68);
    }

    // 15. Inspection HUD & Reticle
    this._drawInspectionOverlay(ctx, W, H);

    ctx.restore();
  }

  _drawFloor(ctx, W, H) {
    const floorY = H * 0.82;
    const fGrad = ctx.createLinearGradient(0, floorY, 0, H);
    fGrad.addColorStop(0, "#0b1120");
    fGrad.addColorStop(0.3, "#0f172a");
    fGrad.addColorStop(1, "#020617");
    ctx.fillStyle = fGrad;
    ctx.fillRect(0, floorY, W, H - floorY);

    // Cyan seam reflection
    ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();

    // Perspective floor tiles
    ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 110) {
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x + 50, H);
      ctx.stroke();
    }
  }

  _drawOverheadSpotlight(ctx, x, beltY) {
    // Volumetric lighting cone
    ctx.save();
    const coneGrad = ctx.createRadialGradient(x, 0, 10, x, beltY, 180);
    coneGrad.addColorStop(0, "rgba(56, 189, 248, 0.06)");
    coneGrad.addColorStop(0.7, "rgba(56, 189, 248, 0.02)");
    coneGrad.addColorStop(1, "rgba(56, 189, 248, 0)");

    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(x - 30, 0);
    ctx.lineTo(x + 30, 0);
    ctx.lineTo(x + 120, beltY);
    ctx.lineTo(x - 120, beltY);
    ctx.closePath();
    ctx.fill();

    // Ambient floating dust particles in the beam
    for (let d of this.ambientDust) {
      ctx.fillStyle = `rgba(255, 255, 255, ${d.alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawHeavyTrussFrame(ctx, x1, x2, beltY, H) {
    const floorY = H * 0.82;
    const len = x2 - x1;

    // Main structural box beam
    const beamGrad = ctx.createLinearGradient(0, beltY - 8, 0, beltY + 16);
    beamGrad.addColorStop(0, "#475569");
    beamGrad.addColorStop(0.5, "#1e293b");
    beamGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = beamGrad;
    ctx.fillRect(x1 - 15, beltY - 8, len + 30, 24);

    // Hazard warning stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1 - 15, beltY + 10, len + 30, 6);
    ctx.clip();
    for (let hx = x1 - 30; hx < x2 + 30; hx += 16) {
      ctx.fillStyle = "#eab308";
      ctx.fillRect(hx, beltY + 10, 8, 6);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(hx + 8, beltY + 10, 8, 6);
    }
    ctx.restore();

    // Red Emergency Stop Pull-Wire Cable along the chassis
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x1 - 10, beltY + 22);
    ctx.lineTo(x2 + 10, beltY + 22);
    ctx.stroke();

    // Cable eyelet anchors
    for (let ex = x1 + 30; ex < x2; ex += 90) {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(ex, beltY + 22, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy vertical support legs
    const legs = [x1 + 40, x1 + len * 0.5, x2 - 40];
    legs.forEach(lx => {
      const legGrad = ctx.createLinearGradient(lx - 10, 0, lx + 10, 0);
      legGrad.addColorStop(0, "#334155");
      legGrad.addColorStop(0.5, "#1e293b");
      legGrad.addColorStop(1, "#475569");
      ctx.fillStyle = legGrad;
      ctx.fillRect(lx - 9, beltY + 16, 18, floorY - (beltY + 16));

      ctx.fillStyle = "#64748b";
      ctx.fillRect(lx - 20, floorY - 6, 40, 6);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(lx - 14, floorY - 14, 28, 8);
    });

    // Cross-truss diagonal bracing
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 3;
    for (let i = 0; i < legs.length - 1; i++) {
      const la = legs[i];
      const lb = legs[i + 1];
      ctx.beginPath();
      ctx.moveTo(la + 9, beltY + 30);
      ctx.lineTo(lb - 9, floorY - 16);
      ctx.moveTo(lb - 9, beltY + 30);
      ctx.lineTo(la + 9, floorY - 16);
      ctx.stroke();
    }

    // Industrial Safety Placard
    const placX = x1 + len * 0.22;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(placX, beltY - 4, 75, 14);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.strokeRect(placX, beltY - 4, 75, 14);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 6px sans-serif";
    ctx.fillText("⚠️ CAUTION: BELT", placX + 4, beltY + 6);
  }

  _drawInfeedChute(ctx, beltX, beltY) {
    ctx.save();
    const chGrad = ctx.createLinearGradient(60, beltY - 80, beltX - 5, beltY);
    chGrad.addColorStop(0, "#94a3b8");
    chGrad.addColorStop(0.5, "#475569");
    chGrad.addColorStop(1, "#cbd5e1");
    ctx.fillStyle = chGrad;

    ctx.beginPath();
    ctx.moveTo(60, beltY - 80);
    ctx.lineTo(beltX - 5, beltY - 6);
    ctx.lineTo(beltX - 5, beltY + 4);
    ctx.lineTo(55, beltY - 70);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Guardrail plate
    ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
    ctx.beginPath();
    ctx.moveTo(60, beltY - 80);
    ctx.lineTo(beltX - 5, beltY - 6);
    ctx.lineTo(beltX - 5, beltY - 26);
    ctx.lineTo(60, beltY - 100);
    ctx.closePath();
    ctx.fill();

    // Hopper Label
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 7px sans-serif";
    ctx.fillText("IN-FEED HOPPER", 65, beltY - 86);

    ctx.restore();
  }

  _drawOutfeedChute(ctx, beltX, beltY, H) {
    const floorY = H * 0.82;
    ctx.save();

    const chuteEndX = beltX + 110;
    const chuteEndY = beltY + 70;

    const cGrad = ctx.createLinearGradient(beltX, beltY, chuteEndX, chuteEndY);
    cGrad.addColorStop(0, "#64748b");
    cGrad.addColorStop(1, "#334155");
    ctx.fillStyle = cGrad;

    ctx.beginPath();
    ctx.moveTo(beltX + 5, beltY);
    ctx.lineTo(chuteEndX, chuteEndY);
    ctx.lineTo(chuteEndX, chuteEndY + 10);
    ctx.lineTo(beltX + 5, beltY + 10);
    ctx.closePath();
    ctx.fill();

    // Skate-wheel rollers
    for (let rx = beltX + 18; rx < chuteEndX; rx += 18) {
      const prog = (rx - beltX) / (chuteEndX - beltX);
      const ry = beltY + prog * 70;
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(rx, ry + 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Wire-mesh Pallet Container
    const palX = chuteEndX - 15;
    const palY = floorY - 45;
    const palW = 85;
    const palH = 45;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(palX, palY, palW, palH);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.strokeRect(palX, palY, palW, palH);

    // Wire-mesh grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1;
    for (let mx = palX + 10; mx < palX + palW; mx += 14) {
      ctx.beginPath();
      ctx.moveTo(mx, palY);
      ctx.lineTo(mx, palY + palH);
      ctx.stroke();
    }
    for (let my = palY + 10; my < palY + palH; my += 14) {
      ctx.beginPath();
      ctx.moveTo(palX, my);
      ctx.lineTo(palX + palW, my);
      ctx.stroke();
    }

    ctx.fillStyle = "#854d0e";
    ctx.fillRect(palX - 4, floorY - 8, palW + 8, 8);

    ctx.restore();
  }

  _drawIndustrialPulley(ctx, x, y, r, angle, isDrive) {
    ctx.save();
    ctx.translate(x, y);

    // Pillow-block bearing housing
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-r - 10, -8, (r + 10) * 2, 16);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.strokeRect(-r - 10, -8, (r + 10) * 2, 16);

    // Drum Rim with Cylindrical Gradient
    const drumGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, r);
    drumGrad.addColorStop(0, "#94a3b8");
    drumGrad.addColorStop(0.7, "#334155");
    drumGrad.addColorStop(1, isDrive ? "#0284c7" : "#1e293b");

    ctx.fillStyle = drumGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isDrive ? "#38bdf8" : "#94a3b8";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Rotating Spokes
    ctx.rotate(angle);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2.5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
      ctx.stroke();
    }

    // Center Spindle Hub
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  _drawTailDrumWithTensioner(ctx, x, y, r, angle) {
    ctx.save();
    ctx.translate(x, y);

    // Acme Screw Tensioner Sliding Bracket
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-r - 8, -12, (r + 8) * 2, 24);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.strokeRect(-r - 8, -12, (r + 8) * 2, 24);

    // Dual Compression Springs
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2.5;
    [-6, 6].forEach(sy => {
      ctx.beginPath();
      for (let sx = r + 8; sx < r + 38; sx += 6) {
        ctx.lineTo(sx, sy + (sx % 12 === 0 ? 3 : -3));
      }
      ctx.stroke();
    });

    // Acme Threaded Bolt & Hex Nut
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(r + 36, -3, 24, 6);
    ctx.fillStyle = "#f59e0b"; // Brass nut
    ctx.fillRect(r + 42, -5, 8, 10);

    // Tail Drum Body
    const dGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, r);
    dGrad.addColorStop(0, "#94a3b8");
    dGrad.addColorStop(0.7, "#334155");
    dGrad.addColorStop(1, "#1e293b");

    ctx.fillStyle = dGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Spokes
    ctx.rotate(angle);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2.5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawReturnBeltWithSag(ctx, x1, x2, beltY, r) {
    const bottomY = beltY + r + 3;
    const len = x2 - x1;

    const idlerX1 = x1 + len * 0.33;
    const idlerX2 = x1 + len * 0.67;

    [idlerX1, idlerX2].forEach(ix => {
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(ix, bottomY + 12, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Catenary Gravity Curve
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x1, bottomY);
    ctx.quadraticCurveTo((x1 + idlerX1) * 0.5, bottomY + 16, idlerX1, bottomY + 12);
    ctx.quadraticCurveTo((idlerX1 + idlerX2) * 0.5, bottomY + 22, idlerX2, bottomY + 12);
    ctx.quadraticCurveTo((idlerX2 + x2) * 0.5, bottomY + 16, x2, bottomY);
    ctx.stroke();

    ctx.strokeStyle = this.running ? "rgba(56, 189, 248, 0.4)" : "rgba(100, 116, 139, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawTopBelt25D(ctx, x1, x2, beltY, r) {
    const topY = beltY - r;
    const len = x2 - x1;

    // 2.5D Isometric Belt Surface
    const beltGrad = ctx.createLinearGradient(0, topY - 7, 0, topY);
    beltGrad.addColorStop(0, "#1e293b");
    beltGrad.addColorStop(0.6, "#0f172a");
    beltGrad.addColorStop(1, "#020617");

    ctx.fillStyle = beltGrad;
    ctx.fillRect(x1, topY - 6, len, 8);

    // Front edge thickness
    ctx.fillStyle = "#334155";
    ctx.fillRect(x1, topY + 2, len, 3);

    // Vulcanized Chevron Cleats (> > > pattern)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, topY - 8, len, 12);
    ctx.clip();

    ctx.strokeStyle = this.running ? "#38bdf8" : "#64748b";
    ctx.lineWidth = 2;

    const spacing = 28;
    const offset = x1 + (this.beltOffset % spacing);

    for (let tx = offset; tx < x2 + spacing; tx += spacing) {
      ctx.beginPath();
      ctx.moveTo(tx - 7, topY - 6);
      ctx.lineTo(tx, topY - 2);
      ctx.lineTo(tx - 7, topY + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawBLDCMotorUnit(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Thermal Aura
    const tempRatio = Math.max(0, Math.min(1, (this.temperature - 25) / 55));
    const auraRad = 54 + tempRatio * 24;
    const aura = ctx.createRadialGradient(0, 0, 18, 0, 0, auraRad);

    if (this.temperature > 70) {
      aura.addColorStop(0, "rgba(239, 68, 68, 0.5)");
      aura.addColorStop(0.6, "rgba(239, 68, 68, 0.2)");
      aura.addColorStop(1, "rgba(239, 68, 68, 0)");
    } else if (this.temperature > 50) {
      aura.addColorStop(0, "rgba(245, 158, 11, 0.4)");
      aura.addColorStop(0.6, "rgba(245, 158, 11, 0.15)");
      aura.addColorStop(1, "rgba(245, 158, 11, 0)");
    } else {
      aura.addColorStop(0, "rgba(56, 189, 248, 0.25)");
      aura.addColorStop(1, "rgba(56, 189, 248, 0)");
    }

    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, auraRad, 0, Math.PI * 2);
    ctx.fill();

    // Heavy Mounting Base
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-28, 20, 56, 22);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.strokeRect(-28, 20, 56, 22);

    // Copper Stator Coils
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();

    for (let c = 0; c < Math.PI * 2; c += Math.PI / 6) {
      ctx.fillStyle = this.temperature > 65 ? "#f87171" : "#d97706";
      ctx.beginPath();
      ctx.arc(Math.cos(c) * 16, Math.sin(c) * 16, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rotating Outrunner Bell
    ctx.save();
    ctx.rotate(this.motorShaftAngle);

    ctx.strokeStyle = this.temperature > 65 ? "#ef4444" : "#38bdf8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();

    // 14 Magnets
    for (let m = 0; m < Math.PI * 2; m += Math.PI / 7) {
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(Math.cos(m) * 23 - 2, Math.sin(m) * 23 - 2, 4, 4);
    }

    // Cooling Vents
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    for (let v = 0; v < Math.PI * 2; v += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(v) * 10, Math.sin(v) * 10);
      ctx.lineTo(Math.cos(v) * 22, Math.sin(v) * 22);
      ctx.stroke();
    }
    ctx.restore();

    // Rear High-Speed Cooling Fan
    ctx.save();
    ctx.translate(-26, 0);
    ctx.rotate(this.fanAngle);
    ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
    for (let f = 0; f < Math.PI * 2; f += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(f) * 14, Math.sin(f) * 14);
      ctx.lineTo(Math.cos(f + 0.3) * 12, Math.sin(f + 0.3) * 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Shaft & Sprocket
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  _drawTimingBeltTransmission(ctx, mx, my, px, py) {
    ctx.save();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(px, py);
    ctx.stroke();

    // HTD Timing Teeth
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -this.motorShaftAngle * 5;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawPhotoelectricSensor(ctx, x, beltY) {
    ctx.save();
    // Aluminum Mounting Arm
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 20, beltY + 16);
    ctx.lineTo(x - 20, beltY - 65);
    ctx.lineTo(x, beltY - 65);
    ctx.stroke();

    // Sensor Housing
    ctx.fillStyle = "#eab308";
    ctx.fillRect(x - 6, beltY - 68, 12, 18);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 6, beltY - 68, 12, 18);

    // Indicator LED
    const ledColor = this.beamBreakPulse > 0.1 ? "#ef4444" : "#10b981";
    ctx.fillStyle = ledColor;
    ctx.beginPath();
    ctx.arc(x, beltY - 72, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Optical Laser Beam
    const beamAlpha = 0.45 + this.beamBreakPulse * 0.55;
    ctx.strokeStyle = this.beamBreakPulse > 0.1 ? `rgba(239, 68, 68, ${beamAlpha})` : `rgba(16, 185, 129, ${beamAlpha})`;
    ctx.lineWidth = this.beamBreakPulse > 0.1 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, beltY - 50);
    ctx.lineTo(x, beltY - 32);
    ctx.stroke();

    // Reflector
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(x - 5, beltY - 2, 10, 3);
    ctx.restore();
  }

  _drawPneumaticDiverter(ctx, x, topBeltY) {
    ctx.save();
    ctx.translate(x, topBeltY);

    // Overhead pneumatic cylinder mount
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-15, -45, 30, 16);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-15, -45, 30, 16);

    // Linear Piston Stroke
    const strokeLen = this.diverterPiston * 24;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(-4, -29, 8, strokeLen);

    // Pusher Paddle / Rubber Pad
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(-18, -29 + strokeLen, 36, 7);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.strokeRect(-18, -29 + strokeLen, 36, 7);

    // Air hose fitting
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, -37);
    ctx.quadraticCurveTo(24, -55, 34, -40);
    ctx.stroke();

    ctx.restore();
  }

  _drawPackages(ctx, topBeltY) {
    for (let p of this.packages) {
      ctx.save();
      ctx.translate(p.x, topBeltY + (p.y || 0));
      if (p.tilt) ctx.rotate(p.tilt);

      // Cast shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(2, -2, p.w, 4);

      if (p.type === 'CARDBOARD') {
        ctx.fillStyle = p.color;
        ctx.fillRect(0, -p.h, p.w, p.h);
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -p.h, p.w, p.h);

        // Clear Packing Tape
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fillRect(p.w * 0.38, -p.h, p.w * 0.24, p.h);

        // Barcode
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(4, -p.h + 5, p.w - 18, 9);
        ctx.fillStyle = "#0f172a";
        ctx.font = "6px monospace";
        ctx.fillText("BARCODE", 6, -p.h + 12);

        // Fragile Icon
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 6px sans-serif";
        ctx.fillText("FRAGILE", 5, -p.h + 20);

      } else if (p.type === 'CRATE') {
        ctx.fillStyle = p.color;
        ctx.fillRect(0, -p.h, p.w, p.h);
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -p.h, p.w, p.h);

        // Cross Braces
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(3, -p.h + 3);
        ctx.lineTo(p.w - 3, -3);
        ctx.moveTo(p.w - 3, -p.h + 3);
        ctx.lineTo(3, -3);
        ctx.stroke();

        ctx.fillStyle = "#334155";
        ctx.fillRect(0, -p.h, 6, 6);
        ctx.fillRect(p.w - 6, -p.h, 6, 6);
        ctx.fillRect(0, -6, 6, 6);
        ctx.fillRect(p.w - 6, -6, 6, 6);

      } else if (p.type === 'TOTE') {
        ctx.fillStyle = p.color;
        ctx.fillRect(0, -p.h, p.w, p.h);
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -p.h, p.w, p.h);

        ctx.fillStyle = p.dark;
        ctx.fillRect(-2, -p.h, p.w + 4, 6);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(p.w * 0.35, -p.h + 10, p.w * 0.3, 4);

      } else if (p.type === 'DRUM') {
        const drumG = ctx.createLinearGradient(0, -p.h, p.w, 0);
        drumG.addColorStop(0, "#94a3b8");
        drumG.addColorStop(0.5, "#475569");
        drumG.addColorStop(1, "#334155");
        ctx.fillStyle = drumG;
        ctx.fillRect(0, -p.h, p.w, p.h);

        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(0, -p.h + 10, p.w, 3);
        ctx.fillRect(0, -p.h + 24, p.w, 3);

        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.moveTo(p.w * 0.5, -p.h + 14);
        ctx.lineTo(p.w * 0.5 + 5, -p.h + 18);
        ctx.lineTo(p.w * 0.5, -p.h + 22);
        ctx.lineTo(p.w * 0.5 - 5, -p.h + 18);
        ctx.closePath();
        ctx.fill();
      }

      // If hovered: Draw bounding box highlight
      if (this.hoveredPackage === p) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(-2, -p.h - 2, p.w + 4, p.h + 4);
        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    // 1. Friction Sparks
    for (let s of this.sparks) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. White Friction Smoke
    for (let sm of this.smokeParticles) {
      ctx.fillStyle = `rgba(226, 232, 240, ${sm.alpha})`;
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, sm.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Air blast particles
    for (let a of this.airBlasts) {
      ctx.fillStyle = `rgba(56, 189, 248, ${a.alpha})`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Heat Shimmer Waves
    for (let hw of this.heatHazeWaves) {
      ctx.fillStyle = `rgba(239, 68, 68, ${hw.alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(hw.x, hw.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawHazardBeacon(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-8, 8, 16, 12);

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(0, 0, 10, Math.PI, 0);
    ctx.fill();

    // Rotating Flash Cone
    ctx.rotate(this.beaconAngle);
    const flashGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 48);
    flashGrad.addColorStop(0, "rgba(239, 68, 68, 0.85)");
    flashGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 48, -0.4, 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawInspectionOverlay(ctx, W, H) {
    // 1. HUD Telemetry Banner
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(16, 14, 260, 74);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(16, 14, 260, 74);

    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = this.running ? "#10b981" : "#94a3b8";
    ctx.fillText(this.running ? "● CONVEYOR RUNNING (60 FPS)" : "○ CONVEYOR HALTED", 26, 32);

    ctx.font = "11px monospace";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(`Linear Speed : ${this.beltSpeed.toFixed(2)} m/s`, 26, 50);
    ctx.fillText(`Motor Drive  : ${Math.round(this.rpm).toLocaleString()} RPM`, 26, 68);

    // 2. Click to spawn infeed pill hint
    ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
    ctx.fillRect(W - 195, 14, 180, 26);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.strokeRect(W - 195, 14, 180, 26);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("💡 Click Left Hopper to Drop Box", W - 185, 30);

    // 3. Hover Package Inspection Reticle
    if (this.hoveredPackage) {
      const p = this.hoveredPackage;
      const boxX = Math.min(W - 180, Math.max(20, this.mouseX - 70));
      const boxY = Math.max(80, this.mouseY - 70);

      ctx.fillStyle = "rgba(2, 6, 23, 0.92)";
      ctx.fillRect(boxX, boxY, 150, 52);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boxX, boxY, 150, 52);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9.5px monospace";
      ctx.fillText(`[PKG #${p.id} - ${p.type}]`, boxX + 8, boxY + 16);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "9px sans-serif";
      ctx.fillText(`Type  : ${p.inspect}`, boxX + 8, boxY + 30);
      ctx.fillText(`Weight: ${p.weight} | SCAN: PASS`, boxX + 8, boxY + 44);
    }

    // 4. Critical Jam Alert
    if (this.activeFault === "JAM" && this.running) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
      ctx.fillRect(W * 0.5 - 130, 20, 260, 32);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W * 0.5 - 130, 20, 260, 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🚨 BELT JAM: LOCKED ROTOR!", W * 0.5, 41);
      ctx.textAlign = "left";
    }
  }
}

window.ConveyorDigitalTwin = ConveyorDigitalTwin;

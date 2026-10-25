/**
 * ==============================================================================
 * Industrial Factory BLDC Conveyor Belt Digital Twin (Closed-Loop Mechanism)
 * ==============================================================================
 * Accurately replicates the classic factory dual-drum closed-loop conveyor:
 *  - Two Green Rollers: Left Drive Drum & Right Tail Tension Drum (from sketch)
 *  - Intermediate Support Rollers: 5 Top Carry Idlers & 3 Bottom Return Idlers
 *  - One Continuous Red Closed Loop: Endless vulcanized rubber belt wrapping
 *    around both drums (top flat run -> right drum arc -> bottom return -> left drum arc)
 *  - Dynamic moving 3D cleats/ribs that wrap seamlessly around the circular drum ends
 *  - Hollow interior showing internal chassis, idler rollers, and cross-bracing
 *  - Synchronized mechanical roller spin matching linear belt velocity
 *  - Industrial BLDC Motor with stator coils, rotating bell, fan & toothed drive belt
 *  - Diverse cargo (Amazon parcels, industrial wooden crates, HDPE totes, oil drums)
 *  - Interactive: Hover inspection reticle, click-to-drop packages on infeed
 *  - Physics Faults: Locked rotor jam pile-up with sparks & smoke, thermal glow, vibration
 *  - ZERO sound effects (silent operation)
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

    // Kinematics & Loop Offset
    this.beltDistance = 0.0; // Cumulative distance traveled along the closed loop (pixels)
    this.drumAngle = 0.0;    // Synchronized drum rotation angle (rad)
    this.motorAngle = 0.0;
    this.fanAngle = 0.0;
    this.lastFrameTime = performance.now();

    // Laser & Package Counter
    this.laserX = 0;
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

    // Hazard Strobe Beacon
    this.beaconAngle = 0.0;

    // Cargo Packages
    this.packages = [];

    this._initCanvas();
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
    this.laserX = this.displayWidth * 0.50;
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
      { type: 'CARDBOARD', w: 50, h: 34, label: 'AMZ-LOGISTICS', color: '#c28f52', dark: '#9c6f3b', weight: '2.4 kg', desc: 'DOMESTIC PARCEL' },
      { type: 'CRATE',     w: 56, h: 38, label: 'HEAVY MOTOR',   color: '#8a6440', dark: '#5c4126', weight: '14.8 kg', desc: 'MACHINERY SPARE' },
      { type: 'TOTE',      w: 48, h: 30, label: 'HDPE-PARTS',    color: '#2563eb', dark: '#1d4ed8', weight: '5.1 kg', desc: 'AUTO COMPONENTS' },
      { type: 'DRUM',      w: 36, h: 44, label: 'SYNTH-OIL',     color: '#64748b', dark: '#475569', weight: '18.0 kg', desc: 'LUBRICANT DRUM' }
    ];
    const pick = typeIndex !== null ? types[typeIndex % types.length] : types[Math.floor(Math.random() * types.length)];
    return {
      x: x,
      y: 0,
      ...pick,
      id: Math.floor(Math.random() * 9000 + 1000),
      jammed: false,
      counted: false,
      tilt: 0,
      slidingDown: false,
      collected: false
    };
  }

  _initInteractivity() {
    // Hover reticle
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;

      const beltY = this.displayHeight * 0.48;
      const drumR = 36;
      const beltThickness = 8;
      const topBeltY = beltY - drumR - beltThickness;

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

    // Click to drop box at infeed
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX < 240) {
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
     PHYSICS ENGINE
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
    const drumR = 36;
    const beltThickness = 8;
    const midR = drumR + beltThickness / 2;
    const beltSpan = beltEndX - beltStartX;
    const loopPerimeter = 2 * beltSpan + 2 * Math.PI * midR;

    if (this.running && this.rpm > 10) {
      // Linear belt movement velocity (pixels per second)
      const pxPerSec = (this.rpm / 3600.0) * 190.0;
      this.beltDistance = (this.beltDistance + pxPerSec * dt) % loopPerimeter;

      // Angular velocity of the drums (omega = v / midR)
      const radPerSec = (this.rpm / 60.0) * Math.PI * 2;
      this.drumAngle = (this.drumAngle + radPerSec * dt) % (Math.PI * 2);
      this.motorAngle = (this.motorAngle + radPerSec * 1.5 * dt) % (Math.PI * 2);
      this.fanAngle = (this.fanAngle + radPerSec * 3.0 * dt) % (Math.PI * 2);

      // Rotating beacon strobe
      if (this.activeFault !== "NONE") {
        this.beaconAngle = (this.beaconAngle + dt * 10) % (Math.PI * 2);
      }

      // Package movement & collision mechanics
      const isJammed = this.activeFault === "JAM";
      const jamX = beltStartX + beltSpan * 0.44;

      for (let i = 0; i < this.packages.length; i++) {
        const p = this.packages[i];

        if (p.slidingDown) {
          // Slide down offload chute
          p.x += pxPerSec * 1.25 * dt;
          p.y += pxPerSec * 1.1 * dt;
          p.tilt = 0.35;
          if (p.x > this.displayWidth - 65) {
            p.collected = true;
          }
          continue;
        }

        // Jam obstruction check
        let blocked = false;
        if (isJammed && p.x >= jamX - 30 && p.x <= jamX + 40) {
          blocked = true;
          p.jammed = true;
        }

        // Inter-package collision stack
        for (let j = 0; j < this.packages.length; j++) {
          if (i === j) continue;
          const ahead = this.packages[j];
          if (!ahead.slidingDown && ahead.x > p.x && (ahead.x - p.x) < (p.w + 14)) {
            if (ahead.jammed || isJammed) {
              blocked = true;
              p.jammed = true;
            }
          }
        }

        if (!blocked) {
          p.jammed = false;
          p.x += pxPerSec * dt;
          // Micro-vibrations riding along the belt
          p.y = Math.sin(now * 0.025 + p.x * 0.06) * 0.9;
        } else {
          // Physical jitter against barrier
          p.x += (Math.random() - 0.5) * 0.8;
        }

        // Laser beam break
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

        // End of belt -> slide down
        if (p.x > beltEndX - 10) {
          p.slidingDown = true;
        }
      }

      // Recycle collected packages
      for (let p of this.packages) {
        if (p.collected) {
          p.x = 85;
          p.y = -35;
          p.tilt = 0.4;
          p.slidingDown = false;
          p.collected = false;
          p.counted = false;
          p.jammed = false;
        }
        if (p.x < beltStartX && !p.slidingDown) {
          p.x += pxPerSec * 1.25 * dt;
          p.y += 50 * dt;
          p.tilt = Math.max(0, p.tilt - dt * 1.8);
        }
      }
    }

    this.beamBreakPulse = Math.max(0, this.beamBreakPulse - dt * 3.5);

    // Friction sparks & smoke on Jam
    if (this.activeFault === "JAM" && this.running) {
      if (Math.random() < 0.75) {
        this.sparks.push({
          x: beltStartX + Math.random() * 16 - 8,
          y: this.displayHeight * 0.48 + Math.random() * 16 - 8,
          vx: (Math.random() - 0.5) * 180,
          vy: -Math.random() * 100 - 30,
          color: Math.random() > 0.4 ? '#f59e0b' : '#ef4444',
          life: 0.35 + Math.random() * 0.2
        });
      }
      if (Math.random() < 0.4) {
        this.smokeParticles.push({
          x: beltStartX + (Math.random() - 0.5) * 16,
          y: this.displayHeight * 0.46,
          vx: -15 + Math.random() * 30,
          vy: -35 - Math.random() * 25,
          radius: 6 + Math.random() * 8,
          alpha: 0.5,
          life: 0.8
        });
      }
    }

    // Particle updates
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 320 * dt;
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const sm = this.smokeParticles[i];
      sm.x += sm.vx * dt;
      sm.y += sm.vy * dt;
      sm.radius += dt * 14;
      sm.alpha -= dt * 0.6;
      sm.life -= dt;
      if (sm.life <= 0 || sm.alpha <= 0) this.smokeParticles.splice(i, 1);
    }

    // Heat haze waves if temperature > 55 C
    if (this.temperature > 55 && Math.random() < 0.3) {
      this.heatHazeWaves.push({
        x: beltStartX - 90 + (Math.random() - 0.5) * 36,
        y: this.displayHeight * 0.62,
        vy: -30 - Math.random() * 20,
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
  }

  /* ==========================================================================
     CLOSED-LOOP GEOMETRY COMPUTATION
     ========================================================================== */
  /**
   * Computes exact (x, y) coordinates and tangent angle along the
   * continuous racetrack closed loop for a given distance along the perimeter.
   * Parameterized along centerline radius midR = R + T/2.
   */
  _getBeltPoint(dist, x1, x2, yc, R, T) {
    const W = x2 - x1;
    const midR = R + T / 2;
    const arcLen = Math.PI * midR;
    const totalP = 2 * W + 2 * arcLen;
    const s = ((dist % totalP) + totalP) % totalP;

    // 1. Top Flat Run (0 <= s < W) - Moves Left to Right ->
    if (s < W) {
      return {
        x: x1 + s,
        y: yc - midR,
        angle: 0
      };
    }

    // 2. Right Drum Semi-Circle Wrap (W <= s < W + arcLen) - Curves Downwards
    if (s < W + arcLen) {
      const phi = (s - W) / midR; // 0 to PI
      const theta = -Math.PI / 2 + phi; // -PI/2 to +PI/2
      return {
        x: x2 + midR * Math.cos(theta),
        y: yc + midR * Math.sin(theta),
        angle: theta + Math.PI / 2
      };
    }

    // 3. Bottom Return Flat Run (W + arcLen <= s < 2W + arcLen) - Moves Right to Left <-
    if (s < 2 * W + arcLen) {
      const d = s - (W + arcLen);
      return {
        x: x2 - d,
        y: yc + midR,
        angle: Math.PI
      };
    }

    // 4. Left Drum Semi-Circle Wrap (2W + arcLen <= s < totalP) - Curves Upwards
    const phi = (s - (2 * W + arcLen)) / midR; // 0 to PI
    const theta = Math.PI / 2 + phi; // PI/2 to 3PI/2
    return {
      x: x1 + midR * Math.cos(theta),
      y: yc + midR * Math.sin(theta),
      angle: theta + Math.PI / 2
    };
  }

  /* ==========================================================================
     CANVAS RENDERING ENGINE
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
      const mag = Math.min(10, (this.vibrationRms - 0.35) * 7.0);
      shakeX = (Math.random() - 0.5) * mag;
      shakeY = (Math.random() - 0.5) * mag;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const beltY = H * 0.48;     // Vertical center of the conveyor drums
    const beltStartX = 180;     // Left Drive Drum center X
    const beltEndX = W - 200;   // Right Tail Drum center X
    const drumR = 36;           // Drum radius (Green circles from sketch)
    const beltThickness = 8;    // Continuous belt thickness (Red loop from sketch)

    // 1. Factory Floor & Background Elements
    this._drawFloor(ctx, W, H);

    // 2. Heavy Steel Support Stand & Structural Truss
    this._drawSupportStructure(ctx, beltStartX, beltEndX, beltY, H);

    // 3. Infeed Hopper (Left) & Outfeed Gravity Roller Chute (Right)
    this._drawInfeedChute(ctx, beltStartX, beltY - 10);
    this._drawOutfeedChute(ctx, beltEndX, beltY - 6, H);

    // 4. Intermediate Support Rollers (5 Top Carry Idlers + 3 Bottom Return Idlers)
    this._drawIntermediateIdlers(ctx, beltStartX, beltEndX, beltY, drumR);

    // 5. THE TWO MAIN DRUMS / PULLEYS (Green Circles from sketch)
    this._drawRollerDrum(ctx, beltStartX, beltY, drumR, this.drumAngle, "DRIVE");
    this._drawRollerDrum(ctx, beltEndX, beltY, drumR, this.drumAngle, "TENSION");

    // 6. THE UNBROKEN CONTINUOUS CLOSED-LOOP BELT (Red Loop from sketch with 3D Cleats)
    this._drawContinuousBeltLoop(ctx, beltStartX, beltEndX, beltY, drumR, beltThickness);

    // 7. Industrial BLDC Motor Unit linked to Left Drive Drum
    const motorX = beltStartX - 95;
    const motorY = beltY + 58;
    this._drawBLDCMotor(ctx, motorX, motorY);
    this._drawDriveTransmission(ctx, motorX, motorY, beltStartX, beltY);

    // 8. Photoelectric Laser Sensor & Beam
    this._drawLaserSensor(ctx, this.laserX, beltY - drumR - beltThickness);

    // 9. Cargo Packages on Top Belt Run
    this._drawPackages(ctx, beltY - drumR - beltThickness);

    // 10. Particles (Sparks, Smoke, Heat Haze)
    this._drawParticles(ctx);

    // 11. Hazard Beacon on Jam/Fault
    if (this.activeFault !== "NONE") {
      this._drawHazardBeacon(ctx, beltStartX + (beltEndX - beltStartX) * 0.44, beltY - 70);
    }

    // 12. HUD Telemetry & Inspection Reticle
    this._drawHUD(ctx, W, H);

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

    ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 110) {
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x + 50, H);
      ctx.stroke();
    }
  }

  _drawSupportStructure(ctx, x1, x2, beltY, H) {
    const floorY = H * 0.82;
    const len = x2 - x1;

    // Longitudinal chassis channel (brushed dark steel)
    const beamGrad = ctx.createLinearGradient(0, beltY - 10, 0, beltY + 14);
    beamGrad.addColorStop(0, "#475569");
    beamGrad.addColorStop(0.5, "#1e293b");
    beamGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = beamGrad;
    ctx.fillRect(x1 - 14, beltY - 7, len + 28, 16);

    // Safety yellow/black hazard warning chevron stripe
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1 - 14, beltY + 9, len + 28, 5);
    ctx.clip();
    for (let hx = x1 - 30; hx < x2 + 30; hx += 16) {
      ctx.fillStyle = "#eab308";
      ctx.fillRect(hx, beltY + 9, 8, 5);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(hx + 8, beltY + 9, 8, 5);
    }
    ctx.restore();

    // Heavy vertical support legs
    const legs = [x1 + 35, x1 + len * 0.5, x2 - 35];
    legs.forEach(lx => {
      ctx.fillStyle = "#334155";
      ctx.fillRect(lx - 9, beltY + 15, 18, floorY - (beltY + 15));
      ctx.fillStyle = "#64748b";
      ctx.fillRect(lx - 19, floorY - 6, 38, 6);
    });

    // Cross bracing
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < legs.length - 1; i++) {
      const la = legs[i];
      const lb = legs[i + 1];
      ctx.beginPath();
      ctx.moveTo(la + 9, beltY + 25);
      ctx.lineTo(lb - 9, floorY - 12);
      ctx.moveTo(lb - 9, beltY + 25);
      ctx.lineTo(la + 9, floorY - 12);
      ctx.stroke();
    }
  }

  /**
   * Intermediate Support Rollers (Carry Idlers & Return Idlers)
   * Essential factory conveyor mechanism: smaller cylindrical rollers
   * supporting the carrying deck and return deck, spinning in sync with belt.
   */
  _drawIntermediateIdlers(ctx, x1, x2, yc, drumR) {
    const W = x2 - x1;
    const topBeltInnerY = yc - drumR;
    const botBeltInnerY = yc + drumR;

    // 1. TOP CARRY IDLERS (5 Rollers supporting carrying belt)
    const carryCount = 5;
    const carryR = 10;
    const carryY = topBeltInnerY + carryR;
    const carryAngle = (this.beltDistance / carryR) % (Math.PI * 2);

    for (let i = 1; i <= carryCount; i++) {
      const rx = x1 + (W * i) / (carryCount + 1);

      // Support bracket mounted to chassis
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(rx - 3.5, carryY, 7, yc - carryY);

      // Machined stainless steel roller body
      const rGrad = ctx.createRadialGradient(rx, carryY, 1, rx, carryY, carryR);
      rGrad.addColorStop(0, "#f8fafc");
      rGrad.addColorStop(0.4, "#cbd5e1");
      rGrad.addColorStop(0.85, "#475569");
      rGrad.addColorStop(1.0, "#1e293b");

      ctx.fillStyle = rGrad;
      ctx.beginPath();
      ctx.arc(rx, carryY, carryR, 0, Math.PI * 2);
      ctx.fill();

      // Green tinted rim matching factory conveyor aesthetic
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Rotating spoke cross
      ctx.save();
      ctx.translate(rx, carryY);
      ctx.rotate(carryAngle);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.75)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-carryR + 2, 0);
      ctx.lineTo(carryR - 2, 0);
      ctx.moveTo(0, -carryR + 2);
      ctx.lineTo(0, carryR - 2);
      ctx.stroke();

      // Center axle bolt
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. BOTTOM RETURN IDLERS (3 Rollers supporting return belt)
    const retCount = 3;
    const retR = 10;
    const retY = botBeltInnerY - retR;
    // Bottom belt travels leftward, so top of roller moves leftward -> clockwise rotation
    const retAngle = (this.beltDistance / retR) % (Math.PI * 2);

    for (let i = 1; i <= retCount; i++) {
      const rx = x1 + (W * i) / (retCount + 1);

      // Bracket hanging from chassis
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(rx - 3.5, yc, 7, retY - yc);

      // Roller body
      const rGrad = ctx.createRadialGradient(rx, retY, 1, rx, retY, retR);
      rGrad.addColorStop(0, "#f8fafc");
      rGrad.addColorStop(0.4, "#cbd5e1");
      rGrad.addColorStop(0.85, "#475569");
      rGrad.addColorStop(1.0, "#1e293b");

      ctx.fillStyle = rGrad;
      ctx.beginPath();
      ctx.arc(rx, retY, retR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Rotating spoke cross
      ctx.save();
      ctx.translate(rx, retY);
      ctx.rotate(retAngle);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.75)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-retR + 2, 0);
      ctx.lineTo(retR - 2, 0);
      ctx.moveTo(0, -retR + 2);
      ctx.lineTo(0, retR - 2);
      ctx.stroke();

      // Center axle bolt
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Draws one of the two cylindrical drums (Green Circles in user's sketch)
   * High-contrast precision machined pulleys with rotating spoke cutouts and hub bolts.
   */
  _drawRollerDrum(ctx, x, y, r, angle, role) {
    ctx.save();
    ctx.translate(x, y);

    // Cast Pillow Block Bearing Housing Behind Drum
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-r - 12, -12, (r + 12) * 2, 24);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-r - 12, -12, (r + 12) * 2, 24);

    // Grease Zerk Fitting on Bearing Housing
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(0, -18, 5, 6);
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.arc(2.5, -18, 3, 0, Math.PI * 2);
    ctx.fill();

    // Drum Face: Radial Metallic Stainless Steel Gradient
    const drumGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
    drumGrad.addColorStop(0, "#f1f5f9");
    drumGrad.addColorStop(0.35, "#cbd5e1");
    drumGrad.addColorStop(0.72, "#475569");
    drumGrad.addColorStop(0.92, "#1e293b");
    drumGrad.addColorStop(1.0, "#0f172a");

    ctx.fillStyle = drumGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // PROMINENT GREEN MACHINED RIM (Matching User's Hand-Drawn Sketch)
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle neon green glow on the rim
    ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Outer Chrome Retaining Ring
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // ROTATING SPOKE WINDOWS (Showing High-Speed Mechanical Rotation)
    ctx.save();
    ctx.rotate(angle);

    // 6 Spoke Lightening Holes with Depth
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const hx = Math.cos(a) * (r * 0.58);
      const hy = Math.sin(a) * (r * 0.58);

      // Hole depth
      ctx.fillStyle = "#090d16";
      ctx.beginPath();
      ctx.arc(hx, hy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Hole inner bevel
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Heavy Drive Spokes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
      ctx.lineTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5));
      ctx.stroke();
    }

    // 6 Machined Hex Hub Bolts
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      const bx = Math.cos(a) * 17;
      const by = Math.sin(a) * 17;
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();

    // Central Steel Axle Hub (Stationary Bearing Cap)
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();

    const hubGrad = ctx.createLinearGradient(-8, -8, 8, 8);
    hubGrad.addColorStop(0, "#e2e8f0");
    hubGrad.addColorStop(1, "#64748b");
    ctx.fillStyle = hubGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Role Label Tag Below Roller
    ctx.fillStyle = role === "DRIVE" ? "#10b981" : "#38bdf8";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(role === "DRIVE" ? "HEAD DRIVE DRUM" : "TAIL IDLER DRUM", 0, r + 18);
    ctx.textAlign = "left";

    ctx.restore();
  }

  /**
   * Draws the UNBROKEN, CONTINUOUS CLOSED-LOOP BELT (Red line in user's sketch)
   * Traced as a hollow band wrapping completely around both green drums with 3D moving cleats!
   */
  _drawContinuousBeltLoop(ctx, x1, x2, yc, R, T) {
    const W = x2 - x1;
    const midR = R + T / 2;
    const arcLen = Math.PI * midR;
    const totalP = 2 * W + 2 * arcLen;

    ctx.save();

    // Trace helper for the centerline racetrack path
    const traceBeltPath = (radius) => {
      ctx.beginPath();
      // Top flat run (moving left to right)
      ctx.moveTo(x1, yc - radius);
      ctx.lineTo(x2, yc - radius);
      // Right drum semi-circle wrap
      ctx.arc(x2, yc, radius, -Math.PI / 2, Math.PI / 2, false);
      // Bottom flat return run (moving right to left)
      ctx.lineTo(x1, yc + radius);
      // Left drum semi-circle wrap
      ctx.arc(x1, yc, radius, Math.PI / 2, -Math.PI / 2, false);
      ctx.closePath();
    };

    // =========================================================================
    // 1. RED ACCENT OUTLINE DIRECTLY MATCHING USER'S SKETCH
    // =========================================================================
    traceBeltPath(midR);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = T + 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // =========================================================================
    // 2. VULCANIZED RUBBER BELT BODY (Dark slate elastomer band)
    // =========================================================================
    traceBeltPath(midR);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = T;
    ctx.stroke();

    // =========================================================================
    // 3. INNER BELT FRICTION LINING (Hugs the drum surfaces)
    // =========================================================================
    traceBeltPath(midR);
    ctx.strokeStyle = "#090d16";
    ctx.lineWidth = T - 4;
    ctx.stroke();

    // =========================================================================
    // 4. LONGITUDINAL GUIDE TRACKING STRIPE (Industrial cyan runner)
    // =========================================================================
    traceBeltPath(midR);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // =========================================================================
    // 5. DYNAMIC 3D MOVING CLEATS / RIBS WRAPPING AROUND THE ENTIRE LOOP
    // =========================================================================
    // Spaced every 20 pixels along the continuous perimeter
    const cleatSpacing = 20;
    const startDist = this.beltDistance % cleatSpacing;

    for (let d = startDist; d < totalP; d += cleatSpacing) {
      const pt = this._getBeltPoint(d, x1, x2, yc, R, T);

      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.angle);

      // Cleat drop shadow
      ctx.strokeStyle = "#020617";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-1, -T / 2 - 1.5);
      ctx.lineTo(-1, T / 2 + 1.5);
      ctx.stroke();

      // Cleat rubber rib body
      ctx.strokeStyle = this.running ? "#38bdf8" : "#64748b";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -T / 2 - 1.5);
      ctx.lineTo(0, T / 2 + 1.5);
      ctx.stroke();

      // Cleat top highlight (3D bevel)
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(0.8, -T / 2 - 1.5);
      ctx.lineTo(0.8, T / 2 + 1.5);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
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
    ctx.lineTo(beltX - 5, beltY - 10);
    ctx.lineTo(beltX - 5, beltY);
    ctx.lineTo(55, beltY - 70);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
    ctx.beginPath();
    ctx.moveTo(60, beltY - 80);
    ctx.lineTo(beltX - 5, beltY - 10);
    ctx.lineTo(beltX - 5, beltY - 28);
    ctx.lineTo(60, beltY - 100);
    ctx.closePath();
    ctx.fill();

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

    // Rollers on chute
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

    // Pallet Container
    const palX = chuteEndX - 15;
    const palY = floorY - 45;
    const palW = 85;
    const palH = 45;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(palX, palY, palW, palH);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.strokeRect(palX, palY, palW, palH);

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

  _drawBLDCMotor(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Thermal Aura
    const tempRatio = Math.max(0, Math.min(1, (this.temperature - 25) / 55));
    const auraRad = 52 + tempRatio * 24;
    const aura = ctx.createRadialGradient(0, 0, 16, 0, 0, auraRad);

    if (this.temperature > 70) {
      aura.addColorStop(0, "rgba(239, 68, 68, 0.5)");
      aura.addColorStop(1, "rgba(239, 68, 68, 0)");
    } else if (this.temperature > 50) {
      aura.addColorStop(0, "rgba(245, 158, 11, 0.4)");
      aura.addColorStop(1, "rgba(245, 158, 11, 0)");
    } else {
      aura.addColorStop(0, "rgba(56, 189, 248, 0.25)");
      aura.addColorStop(1, "rgba(56, 189, 248, 0)");
    }

    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, auraRad, 0, Math.PI * 2);
    ctx.fill();

    // Motor Base
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-26, 18, 52, 20);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.strokeRect(-26, 18, 52, 20);

    // Stator Core & Coils
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();

    for (let c = 0; c < Math.PI * 2; c += Math.PI / 6) {
      ctx.fillStyle = this.temperature > 65 ? "#f87171" : "#d97706";
      ctx.beginPath();
      ctx.arc(Math.cos(c) * 15, Math.sin(c) * 15, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rotating Outrunner Bell
    ctx.save();
    ctx.rotate(this.motorAngle);
    ctx.strokeStyle = this.temperature > 65 ? "#ef4444" : "#38bdf8";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.stroke();

    for (let m = 0; m < Math.PI * 2; m += Math.PI / 7) {
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(Math.cos(m) * 22 - 2, Math.sin(m) * 22 - 2, 4, 4);
    }
    ctx.restore();

    // Rear Fan
    ctx.save();
    ctx.translate(-24, 0);
    ctx.rotate(this.fanAngle);
    ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
    for (let f = 0; f < Math.PI * 2; f += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(f) * 13, Math.sin(f) * 13);
      ctx.lineTo(Math.cos(f + 0.3) * 11, Math.sin(f + 0.3) * 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Shaft Hub
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  _drawDriveTransmission(ctx, mx, my, px, py) {
    ctx.save();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Moving teeth / chain links
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -this.motorAngle * 5;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawLaserSensor(ctx, x, topBeltY) {
    ctx.save();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 20, topBeltY + 30);
    ctx.lineTo(x - 20, topBeltY - 55);
    ctx.lineTo(x, topBeltY - 55);
    ctx.stroke();

    // Housing
    ctx.fillStyle = "#eab308";
    ctx.fillRect(x - 6, topBeltY - 58, 12, 18);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 6, topBeltY - 58, 12, 18);

    // Indicator LED
    ctx.fillStyle = this.beamBreakPulse > 0.1 ? "#ef4444" : "#10b981";
    ctx.beginPath();
    ctx.arc(x, topBeltY - 62, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Laser Beam
    const alpha = 0.45 + this.beamBreakPulse * 0.55;
    ctx.strokeStyle = this.beamBreakPulse > 0.1 ? `rgba(239, 68, 68, ${alpha})` : `rgba(16, 185, 129, ${alpha})`;
    ctx.lineWidth = this.beamBreakPulse > 0.1 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, topBeltY - 40);
    ctx.lineTo(x, topBeltY);
    ctx.stroke();

    ctx.restore();
  }

  _drawPackages(ctx, topBeltY) {
    for (let p of this.packages) {
      ctx.save();
      ctx.translate(p.x, topBeltY + (p.y || 0));
      if (p.tilt) ctx.rotate(p.tilt);

      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(2, -2, p.w, 4);

      if (p.type === 'CARDBOARD') {
        ctx.fillStyle = p.color;
        ctx.fillRect(0, -p.h, p.w, p.h);
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -p.h, p.w, p.h);

        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fillRect(p.w * 0.38, -p.h, p.w * 0.24, p.h);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(4, -p.h + 5, p.w - 18, 9);
        ctx.fillStyle = "#0f172a";
        ctx.font = "6px monospace";
        ctx.fillText("BARCODE", 6, -p.h + 12);

        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 6px sans-serif";
        ctx.fillText("FRAGILE", 5, -p.h + 20);

      } else if (p.type === 'CRATE') {
        ctx.fillStyle = p.color;
        ctx.fillRect(0, -p.h, p.w, p.h);
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -p.h, p.w, p.h);

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

      // Highlight on hover
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
    for (let s of this.sparks) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let sm of this.smokeParticles) {
      ctx.fillStyle = `rgba(226, 232, 240, ${sm.alpha})`;
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, sm.radius, 0, Math.PI * 2);
      ctx.fill();
    }

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

  _drawHUD(ctx, W, H) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(16, 14, 260, 74);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(16, 14, 260, 74);

    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = this.running ? "#10b981" : "#94a3b8";
    ctx.fillText(this.running ? "● CONVEYOR ACTIVE (Closed-Loop)" : "○ CONVEYOR HALTED", 26, 32);

    ctx.font = "11px monospace";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(`Linear Speed : ${this.beltSpeed.toFixed(2)} m/s`, 26, 50);
    ctx.fillText(`Drive Motor  : ${Math.round(this.rpm).toLocaleString()} RPM`, 26, 68);

    // Infeed Hint
    ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
    ctx.fillRect(W - 195, 14, 180, 26);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.strokeRect(W - 195, 14, 180, 26);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("💡 Click Left Hopper to Drop Box", W - 185, 30);

    // Hover Inspection Reticle
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
      ctx.fillText(`Type  : ${p.desc}`, boxX + 8, boxY + 30);
      ctx.fillText(`Weight: ${p.weight} | SCAN: PASS`, boxX + 8, boxY + 44);
    }

    // Critical Jam Alert Banner
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

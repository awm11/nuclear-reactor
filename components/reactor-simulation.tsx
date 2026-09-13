'use client';

import { useEffect, useRef } from 'react';

export type Telemetry = {
  neutrons: number;
  fissionsPerSecond: number;
  totalFissions: number;
  energyGJ: number;
  activeNuclei: number;
  spentNuclei: number;
};

export const TOTAL_NUCLEI = 2400;

const NUCLEUS_INTERACTION_RADIUS = 2.6;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trailX: number;
  trailY: number;
  age: number;
  lifetime: number;
  generation: number;
  passedControlRods: Set<number>;
};

type Flash = {
  x: number;
  y: number;
  age: number;
  kind: 'fission' | 'absorbed';
};

type Props = {
  rods: number[];
  running: boolean;
  speed: number;
  rodAbsorption: number;
  pulseVersion: number;
  resetVersion: number;
  onRodBankChange: (value: number) => void;
  onTelemetry: (telemetry: Telemetry) => void;
};

const WIDTH = 1000;
const HEIGHT = 860;
const NUCLEUS_GRID_SIZE = 20;
const NUCLEUS_GRID_COLUMNS = Math.ceil(WIDTH / NUCLEUS_GRID_SIZE);
const CORE = { x: 70, y: 72, width: 860, height: 754 };
const ROD_X = [195, 348, 500, 652, 805];
const FUEL_ASSEMBLIES = Array.from({ length: 10 }, (_, index) => ({
  x: CORE.x + 25 + index * 82,
  y: CORE.y + 26,
  width: 72,
  height: 700,
}));

const NUCLEI = createNuclei(TOTAL_NUCLEI);
const NUCLEUS_GRID = createNucleusGrid();

function createNuclei(count: number) {
  let seed = 235;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const nuclei: { x: number; y: number; rotation: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const assemblyIndex = index % FUEL_ASSEMBLIES.length;
    const localIndex = Math.floor(index / FUEL_ASSEMBLIES.length);
    const assembly = FUEL_ASSEMBLIES[assemblyIndex];
    const localColumns = 5;
    const localRows = Math.ceil(Math.ceil(count / FUEL_ASSEMBLIES.length) / localColumns);
    const column = localIndex % localColumns;
    const row = Math.floor(localIndex / localColumns);
    const cellWidth = assembly.width / localColumns;
    const cellHeight = assembly.height / localRows;
    nuclei.push({
      x: assembly.x + (column + 0.5 + (random() - 0.5) * 0.34) * cellWidth,
      y: assembly.y + (row + 0.5 + (random() - 0.5) * 0.58) * cellHeight,
      rotation: random() * Math.PI * 2,
    });
  }
  return nuclei;
}

function createNucleusGrid() {
  const grid: number[][] = Array.from(
    { length: NUCLEUS_GRID_COLUMNS * Math.ceil(HEIGHT / NUCLEUS_GRID_SIZE) },
    () => [],
  );
  NUCLEI.forEach((nucleus, index) => {
    const cellX = Math.floor(nucleus.x / NUCLEUS_GRID_SIZE);
    const cellY = Math.floor(nucleus.y / NUCLEUS_GRID_SIZE);
    grid[cellY * NUCLEUS_GRID_COLUMNS + cellX].push(index);
  });
  return grid;
}

function createNeutron(x: number, y: number, generation = 0, angle = Math.random() * Math.PI * 2): Particle {
  const velocity = 58 + Math.random() * 38;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  return {
    x,
    y,
    vx: directionX * velocity,
    vy: directionY * velocity,
    trailX: directionX * 7,
    trailY: directionY * 7,
    age: 0,
    lifetime: 11 + Math.random() * 6,
    generation,
    passedControlRods: new Set(),
  };
}

export function ReactorSimulation({
  rods,
  running,
  speed,
  rodAbsorption,
  pulseVersion,
  resetVersion,
  onRodBankChange,
  onTelemetry,
}: Props) {
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const rodsCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const rodsRef = useRef(rods);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const rodAbsorptionRef = useRef(rodAbsorption);
  const telemetryCallbackRef = useRef(onTelemetry);
  const totalFissionsRef = useRef(0);
  const energyRef = useRef(0);
  const fissionTimesRef = useRef<number[]>([]);
  const spentNucleiRef = useRef<Set<number>>(new Set());
  const baseLayerRef = useRef<HTMLCanvasElement | null>(null);
  const nucleiLayerRef = useRef<HTMLCanvasElement | null>(null);
  const nucleiLayerNeedsResetRef = useRef(true);
  const staticCanvasNeedsRedrawRef = useRef(true);
  const nucleiVisualDirtyRef = useRef(false);
  const lastStaticCanvasDrawRef = useRef(0);
  const rodsCanvasNeedsRedrawRef = useRef(true);
  const drawnRodValueRef = useRef(-1);
  const draggingRef = useRef(false);

  useEffect(() => {
    rodsRef.current = rods;
    rodsCanvasNeedsRedrawRef.current = true;
  }, [rods]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { rodAbsorptionRef.current = rodAbsorption; }, [rodAbsorption]);
  useEffect(() => { telemetryCallbackRef.current = onTelemetry; }, [onTelemetry]);

  useEffect(() => {
    if (pulseVersion === 0) return;
    const particles = particlesRef.current;
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      particles.push(createNeutron(WIDTH / 2, CORE.y + CORE.height / 2, 0, angle));
    }
  }, [pulseVersion]);

  useEffect(() => {
    particlesRef.current = [];
    flashesRef.current = [];
    fissionTimesRef.current = [];
    spentNucleiRef.current = new Set();
    nucleiLayerNeedsResetRef.current = true;
    staticCanvasNeedsRedrawRef.current = true;
    totalFissionsRef.current = 0;
    energyRef.current = 0;
  }, [resetVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const staticCanvas = staticCanvasRef.current;
    const rodsCanvas = rodsCanvasRef.current;
    if (!canvas || !staticCanvas || !rodsCanvas) return;
    const updateSize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      staticCanvas.width = width;
      staticCanvas.height = height;
      rodsCanvas.width = width;
      rodsCanvas.height = height;
      canvas.width = width;
      canvas.height = height;
      staticCanvasNeedsRedrawRef.current = true;
      rodsCanvasNeedsRedrawRef.current = true;
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let previousTime = performance.now();
    let lastTelemetry = 0;
    let previousTelemetry: Telemetry | null = null;
    const particleRenderer = createParticleRenderer(canvas);

    const ensureBaseLayer = () => {
      let layer = baseLayerRef.current;
      if (!layer) {
        layer = document.createElement('canvas');
        layer.width = WIDTH;
        layer.height = HEIGHT;
        const context = layer.getContext('2d');
        if (context) drawStaticCore(context);
        baseLayerRef.current = layer;
      }
      return layer;
    };

    const ensureNucleiLayer = () => {
      let layer = nucleiLayerRef.current;
      if (!layer) {
        layer = document.createElement('canvas');
        layer.width = WIDTH;
        layer.height = HEIGHT;
        nucleiLayerRef.current = layer;
      }
      if (nucleiLayerNeedsResetRef.current) {
        const context = layer.getContext('2d');
        if (context) {
          context.clearRect(0, 0, WIDTH, HEIGHT);
          NUCLEI.forEach((nucleus, index) => drawNucleus(context, nucleus, index));
        }
        nucleiLayerNeedsResetRef.current = false;
      }
      return layer;
    };

    const markNucleusSpent = (index: number) => {
      const layer = ensureNucleiLayer();
      const context = layer.getContext('2d');
      if (!context) return;
      const nucleus = NUCLEI[index];
      context.clearRect(nucleus.x - 6.5, nucleus.y - 6.5, 13, 13);
      drawFissionProducts(context, nucleus, index);
      nucleiVisualDirtyRef.current = true;
    };

    const animate = (now: number) => {
      const elapsed = now - previousTime;
      const rawDelta = Math.min(elapsed / 1000, 0.04);
      previousTime = now;
      const delta = rawDelta * speedRef.current;

      if (runningRef.current) updateSimulation(delta, now);
      updateFlashes(delta);
      draw(canvas, now);

      if (now - lastTelemetry > 500) {
        lastTelemetry = now;
        const cutoff = now - 1000;
        fissionTimesRef.current = fissionTimesRef.current.filter((time) => time >= cutoff);
        const telemetry = {
          neutrons: particlesRef.current.length,
          fissionsPerSecond: fissionTimesRef.current.length,
          totalFissions: totalFissionsRef.current,
          energyGJ: energyRef.current,
          activeNuclei: NUCLEI.length - spentNucleiRef.current.size,
          spentNuclei: spentNucleiRef.current.size,
        };
        const changed = !previousTelemetry || Object.keys(telemetry).some(
          (key) => telemetry[key as keyof Telemetry] !== previousTelemetry?.[key as keyof Telemetry],
        );
        if (changed) {
          previousTelemetry = telemetry;
          telemetryCallbackRef.current(telemetry);
        }
      }
      frame = requestAnimationFrame(animate);
    };

    const updateSimulation = (delta: number, now: number) => {
      const particles = particlesRef.current;
      const next: Particle[] = [];
      const newborns: Particle[] = [];
      const rodDepth = (rodsRef.current[0] / 100) * (CORE.height - 22);

      for (const neutron of particles) {
        neutron.age += delta;
        neutron.x += neutron.vx * delta;
        neutron.y += neutron.vy * delta;

        const escaped =
          neutron.x < CORE.x || neutron.x > CORE.x + CORE.width ||
          neutron.y < CORE.y || neutron.y > CORE.y + CORE.height ||
          neutron.age > neutron.lifetime;
        if (escaped) continue;

        const directRodHit = ROD_X.findIndex(
          (rodX, index) => !neutron.passedControlRods.has(index) && Math.abs(neutron.x - rodX) < 16 && neutron.y < CORE.y + rodDepth,
        );
        if (directRodHit !== -1) {
          if (Math.random() < rodAbsorptionRef.current / 100) {
            flashesRef.current.push({ x: neutron.x, y: neutron.y, age: 0, kind: 'absorbed' });
            continue;
          }
          neutron.passedControlRods.add(directRodHit);
        }

        const nearbyIndex = collidingNucleus(
          neutron.x,
          neutron.y,
          spentNucleiRef.current,
          NUCLEUS_INTERACTION_RADIUS ** 2,
        );
        if (nearbyIndex !== -1 && particles.length + newborns.length < 360) {
          const nearby = NUCLEI[nearbyIndex];
          const fissionX = nearby.x;
          const fissionY = nearby.y;
          const count = Math.random() < 0.58 ? 2 : 3;
          const baseAngle = Math.random() * Math.PI * 2;
          for (let child = 0; child < count; child += 1) {
            const angle = baseAngle + (child / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            newborns.push(createNeutron(fissionX, fissionY, neutron.generation + 1, angle));
          }
          flashesRef.current.push({ x: fissionX, y: fissionY, age: 0, kind: 'fission' });
          spentNucleiRef.current.add(nearbyIndex);
          markNucleusSpent(nearbyIndex);
          fissionTimesRef.current.push(now);
          totalFissionsRef.current += 1;
          energyRef.current += 0.0064;
          continue;
        }

        next.push(neutron);
      }
      next.push(...newborns);
      if (next.length > 360) next.length = 360;
      particlesRef.current = next;
    };

    const updateFlashes = (delta: number) => {
      const flashes = flashesRef.current;
      let writeIndex = 0;
      for (const flash of flashes) {
        flash.age += delta;
        if (flash.age < (flash.kind === 'fission' ? 0.38 : 0.36)) {
          flashes[writeIndex] = flash;
          writeIndex += 1;
        }
      }
      flashes.length = writeIndex;
    };

    const draw = (target: HTMLCanvasElement, now: number) => {
      const staticCanvas = staticCanvasRef.current;
      const rodsCanvas = rodsCanvasRef.current;
      if (!staticCanvas || !rodsCanvas) return;

      const shouldRefreshStatic = staticCanvasNeedsRedrawRef.current || (
        nucleiVisualDirtyRef.current && now - lastStaticCanvasDrawRef.current >= 125
      );
      if (shouldRefreshStatic) {
        const staticContext = staticCanvas.getContext('2d');
        if (staticContext) {
          staticContext.setTransform(staticCanvas.width / WIDTH, 0, 0, staticCanvas.height / HEIGHT, 0, 0);
          staticContext.clearRect(0, 0, WIDTH, HEIGHT);
          staticContext.drawImage(ensureBaseLayer(), 0, 0);
          staticContext.drawImage(ensureNucleiLayer(), 0, 0);
        }
        staticCanvasNeedsRedrawRef.current = false;
        nucleiVisualDirtyRef.current = false;
        lastStaticCanvasDrawRef.current = now;
      }

      const rodValue = rodsRef.current[0];
      if (rodsCanvasNeedsRedrawRef.current || drawnRodValueRef.current !== rodValue) {
        const rodsContext = rodsCanvas.getContext('2d');
        if (rodsContext) {
          rodsContext.setTransform(rodsCanvas.width / WIDTH, 0, 0, rodsCanvas.height / HEIGHT, 0, 0);
          rodsContext.clearRect(0, 0, WIDTH, HEIGHT);
          drawRodBank(rodsContext, rodValue);
        }
        drawnRodValueRef.current = rodValue;
        rodsCanvasNeedsRedrawRef.current = false;
      }

      if (particleRenderer) {
        particleRenderer.draw(particlesRef.current, flashesRef.current);
      } else {
        const context = target.getContext('2d');
        if (!context) return;
        context.setTransform(target.width / WIDTH, 0, 0, target.height / HEIGHT, 0, 0);
        context.clearRect(0, 0, WIDTH, HEIGHT);
        drawDynamicCore(context, particlesRef.current, flashesRef.current);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
    };
  };

  const isNearRodBank = (x: number, y: number) => {
    const rodDepth = (rodsRef.current[0] / 100) * (CORE.height - 22);
    return ROD_X.some((rodX) => Math.abs(x - rodX) < 30) && y >= 30 && y <= CORE.y + rodDepth + 34;
  };

  const updateBankFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { y } = pointerPosition(event);
    const value = Math.max(0, Math.min(100, ((y - CORE.y) / (CORE.height - 22)) * 100));
    rodsRef.current = rodsRef.current.map(() => value);
    onRodBankChange(value);
  };

  return (
    <div className="reactor-canvas-stack">
      <canvas ref={staticCanvasRef} className="reactor-canvas-layer" aria-hidden="true" />
      <canvas ref={rodsCanvasRef} className="reactor-canvas-layer" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="reactor-canvas reactor-canvas-layer"
        aria-label="Interactive reactor core. The clustered red and blue particles are uranium-235 nuclei. Bright white particles are neutrons. Drag any cyan control rod grip vertically to move the whole rod bank."
        onPointerDown={(event) => {
          const point = pointerPosition(event);
          if (!isNearRodBank(point.x, point.y)) return;
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateBankFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) {
            updateBankFromPointer(event);
            return;
          }
          const point = pointerPosition(event);
          event.currentTarget.style.cursor = isNearRodBank(point.x, point.y) ? 'ns-resize' : 'default';
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { draggingRef.current = false; }}
      />
    </div>
  );
}

function collidingNucleus(x: number, y: number, spent: Set<number>, radiusSquared: number) {
  const cellX = Math.floor(x / NUCLEUS_GRID_SIZE);
  const cellY = Math.floor(y / NUCLEUS_GRID_SIZE);
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const candidateCellX = cellX + offsetX;
      const candidateCellY = cellY + offsetY;
      if (candidateCellX < 0 || candidateCellY < 0 || candidateCellX >= NUCLEUS_GRID_COLUMNS) continue;
      const candidates = NUCLEUS_GRID[candidateCellY * NUCLEUS_GRID_COLUMNS + candidateCellX];
      if (!candidates) continue;
      for (const index of candidates) {
        if (spent.has(index)) continue;
        const nucleus = NUCLEI[index];
        if ((nucleus.x - x) ** 2 + (nucleus.y - y) ** 2 < radiusSquared) return index;
      }
    }
  }
  return -1;
}

function drawStaticCore(context: CanvasRenderingContext2D) {
  context.save();
  context.fillStyle = 'rgba(7, 28, 37, .82)';
  roundedRect(context, CORE.x, CORE.y, CORE.width, CORE.height, 28);
  context.fill();
  context.strokeStyle = '#2b5d6b';
  context.lineWidth = 8;
  context.stroke();

  const water = context.createLinearGradient(0, CORE.y, 0, CORE.y + CORE.height);
  water.addColorStop(0, 'rgba(55, 196, 218, .13)');
  water.addColorStop(1, 'rgba(20, 90, 112, .25)');
  context.fillStyle = water;
  roundedRect(context, CORE.x + 8, CORE.y + 8, CORE.width - 16, CORE.height - 16, 20);
  context.fill();

  context.strokeStyle = 'rgba(92, 198, 216, .07)';
  context.lineWidth = 1;
  for (let y = CORE.y + 40; y < CORE.y + CORE.height; y += 48) {
    context.beginPath();
    context.moveTo(CORE.x + 18, y);
    context.bezierCurveTo(CORE.x + 240, y - 9, CORE.x + 560, y + 10, CORE.x + CORE.width - 18, y);
    context.stroke();
  }

  context.fillStyle = 'rgba(5, 18, 24, .38)';
  for (const assembly of FUEL_ASSEMBLIES) {
    roundedRect(context, assembly.x, assembly.y, assembly.width, assembly.height, 11);
    context.fill();
    context.strokeStyle = 'rgba(73, 158, 190, .16)';
    context.lineWidth = 1;
    context.stroke();
  }

  context.fillStyle = '#102b35';
  context.fillRect(CORE.x + 20, CORE.y - 35, CORE.width - 40, 27);
  context.strokeStyle = '#396675';
  context.lineWidth = 2;
  context.strokeRect(CORE.x + 20, CORE.y - 35, CORE.width - 40, 27);
  context.fillStyle = '#72909a';
  context.font = '600 10px monospace';
  context.textAlign = 'center';
  context.fillText('COUPLED CONTROL ROD BANK', WIDTH / 2, CORE.y - 18);
  context.fillStyle = 'rgba(130, 184, 196, .44)';
  context.font = '600 9px monospace';
  context.textAlign = 'left';
  context.fillText(`${TOTAL_NUCLEI} × U-235 FUEL NUCLEI`, CORE.x + 22, CORE.y + CORE.height - 17);
  context.textAlign = 'right';
  context.fillText('COLOURED FRAGMENTS = DAUGHTER PRODUCTS', CORE.x + CORE.width - 22, CORE.y + CORE.height - 17);
  context.restore();
}

function drawRodBank(context: CanvasRenderingContext2D, rodValue: number) {
  context.save();
  const rodDepth = (rodValue / 100) * (CORE.height - 22);
  for (const rodX of ROD_X) {
    const rodGradient = context.createLinearGradient(rodX - 13, 0, rodX + 13, 0);
    rodGradient.addColorStop(0, '#233943');
    rodGradient.addColorStop(0.48, '#8ca1a9');
    rodGradient.addColorStop(1, '#1b3039');
    context.fillStyle = rodGradient;
    context.fillRect(rodX - 12, CORE.y - 28, 24, rodDepth + 28);
    context.strokeStyle = '#a3b7be';
    context.lineWidth = 1;
    context.strokeRect(rodX - 12, CORE.y - 28, 24, rodDepth + 28);

    const gripY = CORE.y + rodDepth;
    context.fillStyle = 'rgba(62, 228, 225, .2)';
    roundedRect(context, rodX - 23, gripY - 9, 46, 18, 9);
    context.fill();
    context.fillStyle = '#3ee4e1';
    roundedRect(context, rodX - 20, gripY - 6, 40, 12, 6);
    context.fill();
    context.fillStyle = '#062027';
    context.font = '900 9px monospace';
    context.fillText('↕', rodX, gripY + 3);
  }
  context.restore();
}

function createParticleRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const lineProgram = createWebGLProgram(gl, `
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    }
  `, `
    precision mediump float;
    void main() { gl_FragColor = vec4(0.5, 0.93, 0.98, 0.32); }
  `);
  const pointProgram = createWebGLProgram(gl, `
    attribute vec2 a_position;
    attribute float a_size;
    attribute float a_style;
    attribute float a_progress;
    uniform vec2 u_resolution;
    varying float v_style;
    varying float v_progress;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      gl_PointSize = a_size;
      v_style = a_style;
      v_progress = a_progress;
    }
  `, `
    precision mediump float;
    varying float v_style;
    varying float v_progress;
    void main() {
      float distanceFromCentre = length(gl_PointCoord - vec2(0.5)) * 2.0;
      if (distanceFromCentre > 1.0) discard;
      if (v_style < 0.5) {
        float glow = 1.0 - smoothstep(0.3, 1.0, distanceFromCentre);
        float core = 1.0 - smoothstep(0.05, 0.38, distanceFromCentre);
        gl_FragColor = vec4(0.72, 0.97, 1.0, glow * 0.25 + core * 0.9);
        return;
      }
      float ringPosition = 0.28 + v_progress * 0.58;
      float ring = 1.0 - smoothstep(0.035, 0.13, abs(distanceFromCentre - ringPosition));
      float core = (1.0 - v_progress) * (1.0 - smoothstep(0.02, 0.22, distanceFromCentre));
      float alpha = (ring * 0.78 + core) * (1.0 - v_progress * 0.78);
      vec3 colour = v_style < 1.5 ? vec3(1.0, 0.81, 0.34) : vec3(0.24, 0.9, 0.88);
      if (alpha < 0.02) discard;
      gl_FragColor = vec4(colour, alpha);
    }
  `);
  const lineBuffer = gl.createBuffer();
  const pointBuffer = gl.createBuffer();
  if (!lineProgram || !pointProgram || !lineBuffer || !pointBuffer) return null;

  const linePosition = gl.getAttribLocation(lineProgram, 'a_position');
  const lineResolution = gl.getUniformLocation(lineProgram, 'u_resolution');
  const pointPosition = gl.getAttribLocation(pointProgram, 'a_position');
  const pointSize = gl.getAttribLocation(pointProgram, 'a_size');
  const pointStyle = gl.getAttribLocation(pointProgram, 'a_style');
  const pointProgress = gl.getAttribLocation(pointProgram, 'a_progress');
  const pointResolution = gl.getUniformLocation(pointProgram, 'u_resolution');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    draw(particles: Particle[], flashes: Flash[]) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (particles.length > 0) {
        const lineData = new Float32Array(particles.length * 4);
        particles.forEach((particle, index) => {
          const offset = index * 4;
          lineData[offset] = particle.x - particle.trailX;
          lineData[offset + 1] = particle.y - particle.trailY;
          lineData[offset + 2] = particle.x;
          lineData[offset + 3] = particle.y;
        });
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(linePosition);
        gl.vertexAttribPointer(linePosition, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(lineResolution, WIDTH, HEIGHT);
        gl.drawArrays(gl.LINES, 0, particles.length * 2);
      }

      const pointCount = particles.length + flashes.length;
      if (pointCount === 0) return;
      const pointData = new Float32Array(pointCount * 5);
      const pixelScale = canvas.width / WIDTH;
      let pointIndex = 0;
      for (const particle of particles) {
        const offset = pointIndex * 5;
        pointData[offset] = particle.x;
        pointData[offset + 1] = particle.y;
        pointData[offset + 2] = Math.max(3, 10 * pixelScale);
        pointData[offset + 3] = 0;
        pointData[offset + 4] = 0;
        pointIndex += 1;
      }
      for (const flash of flashes) {
        const offset = pointIndex * 5;
        pointData[offset] = flash.x;
        pointData[offset + 1] = flash.y;
        pointData[offset + 2] = Math.max(12, (flash.kind === 'fission' ? 32 : 34) * pixelScale);
        pointData[offset + 3] = flash.kind === 'fission' ? 1 : 2;
        pointData[offset + 4] = flash.age / (flash.kind === 'fission' ? 0.38 : 0.36);
        pointIndex += 1;
      }

      gl.useProgram(pointProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.DYNAMIC_DRAW);
      const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
      gl.enableVertexAttribArray(pointPosition);
      gl.vertexAttribPointer(pointPosition, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(pointSize);
      gl.vertexAttribPointer(pointSize, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(pointStyle);
      gl.vertexAttribPointer(pointStyle, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(pointProgress);
      gl.vertexAttribPointer(pointProgress, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
      gl.uniform2f(pointResolution, WIDTH, HEIGHT);
      gl.drawArrays(gl.POINTS, 0, pointCount);
    },
  };
}

function createWebGLProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;
  gl.shaderSource(vertexShader, vertexSource);
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(vertexShader);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function drawDynamicCore(context: CanvasRenderingContext2D, particles: Particle[], flashes: Flash[]) {
  context.save();
  context.beginPath();
  for (const particle of particles) {
    context.moveTo(particle.x - particle.trailX, particle.y - particle.trailY);
    context.lineTo(particle.x, particle.y);
  }
  context.strokeStyle = 'rgba(127, 236, 249, .38)';
  context.lineWidth = 1.4;
  context.stroke();

  context.beginPath();
  for (const particle of particles) {
    context.rect(particle.x - 4.5, particle.y - 4.5, 9, 9);
  }
  context.fillStyle = 'rgba(105, 231, 244, .14)';
  context.fill();

  context.beginPath();
  for (const particle of particles) {
    context.rect(particle.x - 2, particle.y - 2, 4, 4);
  }
  context.fillStyle = '#eaffff';
  context.fill();

  drawFlashes(context, flashes);

  const surge = Math.max(0, Math.min(1, (particles.length - 55) / 115));
  if (surge > 0) {
    context.strokeStyle = `rgba(255, 104, 62, ${0.18 + surge * 0.56})`;
    context.lineWidth = 3;
    roundedRect(context, CORE.x + 8, CORE.y + 8, CORE.width - 16, CORE.height - 16, 20);
    context.stroke();
    context.fillStyle = `rgba(255, 196, 92, ${Math.min(1, surge * 1.5)})`;
    context.font = '900 12px monospace';
    context.textAlign = 'center';
    context.fillText('⚠ NEUTRON FLUX SURGE', WIDTH / 2, CORE.y + CORE.height - 36);
  }

  context.restore();
}

function drawNucleus(context: CanvasRenderingContext2D, nucleus: (typeof NUCLEI)[number], index: number) {
  context.save();
  context.translate(nucleus.x, nucleus.y);
  context.rotate(nucleus.rotation);
  context.beginPath();
  context.arc(0, 0, 5.6, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 189, 67, .05)';
  context.fill();
  context.strokeStyle = 'rgba(255, 211, 96, .24)';
  context.lineWidth = 1;
  context.stroke();

  const nucleons = [
    { x: 0, y: -2.6 }, { x: -2.55, y: -.6 }, { x: 2.55, y: -.6 },
    { x: -1.8, y: 2.1 }, { x: 1.8, y: 2.1 }, { x: 0, y: 0 },
  ];
  nucleons.forEach((point, particleIndex) => {
    context.beginPath();
    context.arc(point.x, point.y, 1.72, 0, Math.PI * 2);
    context.fillStyle = (particleIndex + index) % 2 === 0 ? '#ff775f' : '#68d4dc';
    context.fill();
    context.strokeStyle = '#10252e';
    context.lineWidth = .6;
    context.stroke();
    context.beginPath();
    context.arc(point.x - .48, point.y - .48, .34, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255,255,255,.48)';
    context.fill();
  });
  context.restore();
}

function drawFissionProducts(context: CanvasRenderingContext2D, nucleus: (typeof NUCLEI)[number], index: number) {
  context.save();
  context.translate(nucleus.x, nucleus.y);
  context.rotate(-nucleus.rotation * 0.7);
  context.globalAlpha = 0.78;
  const products = [
    { x: -2.9, y: -1.7, radius: 2.45, colour: '#b88cff' },
    { x: 2.8, y: 1.8, radius: 2.15, colour: '#8bdc7a' },
  ];
  products.forEach((product, productIndex) => {
    context.beginPath();
    context.arc(product.x, product.y, product.radius, 0, Math.PI * 2);
    context.fillStyle = product.colour;
    context.fill();
    context.strokeStyle = '#172b33';
    context.lineWidth = .9;
    context.stroke();
    context.beginPath();
    context.arc(product.x - .7, product.y - .7, .75, 0, Math.PI * 2);
    context.fillStyle = productIndex === (index % 2) ? '#f4a17e' : '#5bcbd2';
    context.fill();
  });
  context.restore();
}

function drawFlashes(context: CanvasRenderingContext2D, flashes: Flash[]) {
  const buckets: Flash[][] = [[], [], []];
  const absorbedBuckets: Flash[][] = [[], [], []];
  for (const flash of flashes) {
    const duration = flash.kind === 'fission' ? 0.38 : 0.36;
    const bucket = Math.min(2, Math.floor((flash.age / duration) * 3));
    (flash.kind === 'fission' ? buckets : absorbedBuckets)[bucket].push(flash);
  }

  buckets.forEach((bucket, bucketIndex) => {
    if (bucket.length === 0) return;
    const alpha = 1 - (bucketIndex + 0.35) / 3;
    context.beginPath();
    for (const flash of bucket) {
      const progress = flash.age / 0.38;
      const radius = 4 + progress * 12;
      context.moveTo(flash.x + radius, flash.y);
      context.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
      for (let ray = 0; ray < 2; ray += 1) {
        const angle = ray * Math.PI + progress * 0.3;
        context.moveTo(flash.x + Math.cos(angle) * 3, flash.y + Math.sin(angle) * 3);
        context.lineTo(flash.x + Math.cos(angle) * radius, flash.y + Math.sin(angle) * radius);
      }
    }
    context.strokeStyle = `rgba(255, 210, 100, ${alpha})`;
    context.lineWidth = 1.3;
    context.stroke();

    context.beginPath();
    for (const flash of bucket) {
      const progress = flash.age / 0.38;
      const radius = Math.max(1.2, 3.5 * (1 - progress));
      context.moveTo(flash.x + radius, flash.y);
      context.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
    }
    context.fillStyle = `rgba(255, 244, 176, ${alpha})`;
    context.fill();
  });

  absorbedBuckets.forEach((bucket, bucketIndex) => {
    if (bucket.length === 0) return;
    const alpha = 1 - (bucketIndex + 0.35) / 3;
    context.beginPath();
    for (const flash of bucket) {
      const progress = flash.age / 0.36;
      const radius = 4 + progress * 13;
      context.moveTo(flash.x + radius, flash.y);
      context.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
    }
    context.strokeStyle = `rgba(62, 228, 225, ${alpha})`;
    context.lineWidth = 2;
    context.stroke();
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

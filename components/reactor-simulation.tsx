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

export const TOTAL_NUCLEI = 4830;

type ParticleBuffer = {
  count: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  trailX: Float32Array;
  trailY: Float32Array;
  age: Float32Array;
  lifetime: Float32Array;
  generation: Uint16Array;
  passedControlRods: Uint8Array;
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
  zoomEnabled: boolean;
  rodAbsorption: number;
  nucleusInteractionRadius: number;
  selectedFuelAssembly: number | null;
  replacementFuelAssembly: number | null;
  replacementVersion: number;
  pulseVersion: number;
  resetVersion: number;
  onRodBankChange: (value: number) => void;
  onFuelAssemblySelect: (index: number | null) => void;
  onTelemetry: (telemetry: Telemetry) => void;
};

const WIDTH = 1000;
const HEIGHT = 860;
const NUCLEUS_GRID_SIZE = 20;
const NUCLEUS_GRID_COLUMNS = Math.ceil(WIDTH / NUCLEUS_GRID_SIZE);
const NUCLEUS_GRID_ROWS = Math.ceil(HEIGHT / NUCLEUS_GRID_SIZE);
const MAX_RENDERED_NEUTRONS = 8000;
const NUCLEUS_U235 = 0;
const NUCLEUS_DAUGHTER = 1;
const CORE = { x: 70, y: 72, width: 860, height: 754 };
const CORE_LAYOUT = 'FCFFCFFCFFCFFCF';
const CONTROL_ROD_CHANNEL_WIDTH = 32;
const ADJACENT_FUEL_GAP = 10;
const { rodPositions: ROD_X, fuelAssemblies: FUEL_ASSEMBLIES } = createCoreLayout();
export const FUEL_ASSEMBLY_COUNT = FUEL_ASSEMBLIES.length;
const NUCLEI_PER_FUEL_ASSEMBLY = TOTAL_NUCLEI / FUEL_ASSEMBLY_COUNT;
const SPENT_FUEL_THRESHOLD = Math.ceil(NUCLEI_PER_FUEL_ASSEMBLY * 0.8);
const PULSE_SOURCE = {
  x: FUEL_ASSEMBLIES[3].x + FUEL_ASSEMBLIES[3].width * 0.5,
  y: FUEL_ASSEMBLIES[3].y + FUEL_ASSEMBLIES[3].height * 0.43,
};

const NUCLEI = createNuclei(TOTAL_NUCLEI);
const NUCLEUS_GRID = createNucleusGrid();

function createCoreLayout() {
  const contentX = CORE.x + 25;
  const contentWidth = CORE.width - 50;
  const layoutItems = CORE_LAYOUT.split('');
  const fuelCount = layoutItems.filter((item) => item === 'F').length;
  const controlRodCount = layoutItems.filter((item) => item === 'C').length;
  const adjacentFuelGapCount = layoutItems.reduce(
    (count, item, index) => count + (item === 'F' && layoutItems[index - 1] === 'F' ? 1 : 0),
    0,
  );
  const fuelWidth = (
    contentWidth -
    controlRodCount * CONTROL_ROD_CHANNEL_WIDTH -
    adjacentFuelGapCount * ADJACENT_FUEL_GAP
  ) / fuelCount;
  const rodPositions: number[] = [];
  const fuelAssemblies: { x: number; y: number; width: number; height: number }[] = [];

  let x = contentX;
  for (let index = 0; index < layoutItems.length; index += 1) {
    const item = layoutItems[index];
    if (item === 'F') {
      if (layoutItems[index - 1] === 'F') x += ADJACENT_FUEL_GAP;
      fuelAssemblies.push({ x, y: CORE.y + 26, width: fuelWidth, height: 700 });
      x += fuelWidth;
    } else {
      rodPositions.push(x + CONTROL_ROD_CHANNEL_WIDTH / 2);
      x += CONTROL_ROD_CHANNEL_WIDTH;
    }
  }
  return { rodPositions, fuelAssemblies };
}

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
    const localColumns = 7;
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
    { length: NUCLEUS_GRID_COLUMNS * NUCLEUS_GRID_ROWS },
    () => [],
  );
  NUCLEI.forEach((nucleus, index) => {
    const cellX = Math.floor(nucleus.x / NUCLEUS_GRID_SIZE);
    const cellY = Math.floor(nucleus.y / NUCLEUS_GRID_SIZE);
    grid[cellY * NUCLEUS_GRID_COLUMNS + cellX].push(index);
  });
  return grid;
}

function createParticleBuffer(capacity = 512): ParticleBuffer {
  return {
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    trailX: new Float32Array(capacity),
    trailY: new Float32Array(capacity),
    age: new Float32Array(capacity),
    lifetime: new Float32Array(capacity),
    generation: new Uint16Array(capacity),
    passedControlRods: new Uint8Array(capacity),
  };
}

function ensureParticleCapacity(buffer: ParticleBuffer, required: number) {
  if (required <= buffer.x.length) return;
  let capacity = buffer.x.length;
  while (capacity < required) capacity *= 2;
  const growFloat = (source: Float32Array) => {
    const next = new Float32Array(capacity);
    next.set(source);
    return next;
  };
  const growUint16 = (source: Uint16Array) => {
    const next = new Uint16Array(capacity);
    next.set(source);
    return next;
  };
  const growUint8 = (source: Uint8Array) => {
    const next = new Uint8Array(capacity);
    next.set(source);
    return next;
  };
  buffer.x = growFloat(buffer.x);
  buffer.y = growFloat(buffer.y);
  buffer.vx = growFloat(buffer.vx);
  buffer.vy = growFloat(buffer.vy);
  buffer.trailX = growFloat(buffer.trailX);
  buffer.trailY = growFloat(buffer.trailY);
  buffer.age = growFloat(buffer.age);
  buffer.lifetime = growFloat(buffer.lifetime);
  buffer.generation = growUint16(buffer.generation);
  buffer.passedControlRods = growUint8(buffer.passedControlRods);
}

function addNeutron(buffer: ParticleBuffer, x: number, y: number, generation = 0, angle = Math.random() * Math.PI * 2) {
  ensureParticleCapacity(buffer, buffer.count + 1);
  const index = buffer.count;
  buffer.count += 1;
  const velocity = 58 + Math.random() * 38;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  buffer.x[index] = x;
  buffer.y[index] = y;
  buffer.vx[index] = directionX * velocity;
  buffer.vy[index] = directionY * velocity;
  buffer.trailX[index] = directionX * 7;
  buffer.trailY[index] = directionY * 7;
  buffer.age[index] = 0;
  buffer.lifetime[index] = 11 + Math.random() * 6;
  buffer.generation[index] = generation;
  buffer.passedControlRods[index] = 0;
}

function copyParticle(source: ParticleBuffer, sourceIndex: number, target: ParticleBuffer) {
  ensureParticleCapacity(target, target.count + 1);
  const targetIndex = target.count;
  target.count += 1;
  target.x[targetIndex] = source.x[sourceIndex];
  target.y[targetIndex] = source.y[sourceIndex];
  target.vx[targetIndex] = source.vx[sourceIndex];
  target.vy[targetIndex] = source.vy[sourceIndex];
  target.trailX[targetIndex] = source.trailX[sourceIndex];
  target.trailY[targetIndex] = source.trailY[sourceIndex];
  target.age[targetIndex] = source.age[sourceIndex];
  target.lifetime[targetIndex] = source.lifetime[sourceIndex];
  target.generation[targetIndex] = source.generation[sourceIndex];
  target.passedControlRods[targetIndex] = source.passedControlRods[sourceIndex];
}

export function ReactorSimulation({
  rods,
  running,
  speed,
  zoomEnabled,
  rodAbsorption,
  nucleusInteractionRadius,
  selectedFuelAssembly,
  replacementFuelAssembly,
  replacementVersion,
  pulseVersion,
  resetVersion,
  onRodBankChange,
  onFuelAssemblySelect,
  onTelemetry,
}: Props) {
  const particleBuffersRef = useRef<{ active: ParticleBuffer; scratch: ParticleBuffer } | null>(null);
  const spentNucleiRef = useRef<Uint8Array | null>(null);
  const fissionTimesRef = useRef<Float64Array | null>(null);
  if (particleBuffersRef.current === null) {
    particleBuffersRef.current = { active: createParticleBuffer(), scratch: createParticleBuffer() };
  }
  if (spentNucleiRef.current === null) spentNucleiRef.current = new Uint8Array(TOTAL_NUCLEI);
  if (fissionTimesRef.current === null) fissionTimesRef.current = new Float64Array(TOTAL_NUCLEI);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const rodsCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomPixelRatioRef = useRef(2);
  const zoomPointerRef = useRef<{ x: number; y: number } | null>(null);
  const flashesRef = useRef<Flash[]>([]);
  const rodsRef = useRef(rods);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const zoomEnabledRef = useRef(zoomEnabled);
  const rodAbsorptionRef = useRef(rodAbsorption);
  const nucleusInteractionRadiusRef = useRef(nucleusInteractionRadius);
  const telemetryCallbackRef = useRef(onTelemetry);
  const totalFissionsRef = useRef(0);
  const energyRef = useRef(0);
  const fissionTimesCountRef = useRef(0);
  const fissionTimesHeadRef = useRef(0);
  const spentNucleiCountRef = useRef(0);
  const spentByAssemblyRef = useRef(new Uint16Array(FUEL_ASSEMBLY_COUNT));
  const activeU235CountRef = useRef(TOTAL_NUCLEI);
  const baseLayerRef = useRef<HTMLCanvasElement | null>(null);
  const nucleiLayerRef = useRef<HTMLCanvasElement | null>(null);
  const nucleiLayerNeedsResetRef = useRef(true);
  const staticCanvasNeedsRedrawRef = useRef(true);
  const nucleiVisualDirtyRef = useRef(false);
  const lastStaticCanvasDrawRef = useRef(0);
  const rodsCanvasNeedsRedrawRef = useRef(true);
  const drawnRodValueRef = useRef(-1);
  const lastSpentWarningDrawRef = useRef(0);
  const selectedFuelAssemblyRef = useRef(selectedFuelAssembly);
  const replacementRef = useRef<{ assemblyIndex: number; startedAt: number; swapped: boolean } | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    rodsRef.current = rods;
    rodsCanvasNeedsRedrawRef.current = true;
  }, [rods]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    zoomEnabledRef.current = zoomEnabled;
    if (!zoomEnabled) zoomPointerRef.current = null;
  }, [zoomEnabled]);
  useEffect(() => { rodAbsorptionRef.current = rodAbsorption; }, [rodAbsorption]);
  useEffect(() => { nucleusInteractionRadiusRef.current = nucleusInteractionRadius; }, [nucleusInteractionRadius]);
  useEffect(() => { telemetryCallbackRef.current = onTelemetry; }, [onTelemetry]);
  useEffect(() => {
    selectedFuelAssemblyRef.current = selectedFuelAssembly;
    rodsCanvasNeedsRedrawRef.current = true;
  }, [selectedFuelAssembly]);
  useEffect(() => {
    if (replacementVersion === 0 || replacementFuelAssembly === null) return;
    replacementRef.current = { assemblyIndex: replacementFuelAssembly, startedAt: performance.now(), swapped: false };
    rodsCanvasNeedsRedrawRef.current = true;
  }, [replacementVersion, replacementFuelAssembly]);

  useEffect(() => {
    if (pulseVersion === 0) return;
    const particles = particleBuffersRef.current!.active;
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      addNeutron(particles, PULSE_SOURCE.x, PULSE_SOURCE.y, 0, angle);
    }
  }, [pulseVersion]);

  useEffect(() => {
    const particleBuffers = particleBuffersRef.current!;
    const spentNuclei = spentNucleiRef.current!;
    particleBuffers.active.count = 0;
    particleBuffers.scratch.count = 0;
    flashesRef.current = [];
    fissionTimesCountRef.current = 0;
    fissionTimesHeadRef.current = 0;
    spentNuclei.fill(0);
    spentNucleiCountRef.current = 0;
    spentByAssemblyRef.current.fill(0);
    activeU235CountRef.current = TOTAL_NUCLEI;
    replacementRef.current = null;
    nucleiLayerNeedsResetRef.current = true;
    staticCanvasNeedsRedrawRef.current = true;
    totalFissionsRef.current = 0;
    energyRef.current = 0;
  }, [resetVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const staticCanvas = staticCanvasRef.current;
    const rodsCanvas = rodsCanvasRef.current;
    const zoomCanvas = zoomCanvasRef.current;
    if (!canvas || !staticCanvas || !rodsCanvas || !zoomCanvas) return;
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
      const zoomPixelRatio = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
      zoomPixelRatioRef.current = zoomPixelRatio;
      zoomCanvas.width = Math.round(width * zoomPixelRatio);
      zoomCanvas.height = Math.round(height * zoomPixelRatio);
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
    const particleBuffers = particleBuffersRef.current!;
    const spentNuclei = spentNucleiRef.current!;
    const spentByAssembly = spentByAssemblyRef.current;
    const fissionTimes = fissionTimesRef.current!;

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
          NUCLEI.forEach((nucleus, index) => {
            if (spentNuclei[index] === NUCLEUS_DAUGHTER) drawFissionProducts(context, nucleus, index);
            else drawNucleus(context, nucleus, index);
          });
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
      context.clearRect(nucleus.x - 5.5, nucleus.y - 5.5, 11, 11);
      drawFissionProducts(context, nucleus, index);
      nucleiVisualDirtyRef.current = true;
    };

    const replaceFuelAssembly = (assemblyIndex: number) => {
      for (let nucleusIndex = assemblyIndex; nucleusIndex < NUCLEI.length; nucleusIndex += FUEL_ASSEMBLIES.length) {
        const previousState = spentNuclei[nucleusIndex];
        if (previousState === NUCLEUS_DAUGHTER) {
          spentNucleiCountRef.current -= 1;
          activeU235CountRef.current += 1;
        }
        spentNuclei[nucleusIndex] = NUCLEUS_U235;
      }
      spentByAssembly[assemblyIndex] = 0;
      nucleiLayerNeedsResetRef.current = true;
      staticCanvasNeedsRedrawRef.current = true;
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
        while (
          fissionTimesHeadRef.current < fissionTimesCountRef.current &&
          fissionTimes[fissionTimesHeadRef.current] < cutoff
        ) {
          fissionTimesHeadRef.current += 1;
        }
        const telemetry = {
          neutrons: particleBuffers.active.count,
          fissionsPerSecond: fissionTimesCountRef.current - fissionTimesHeadRef.current,
          totalFissions: totalFissionsRef.current,
          energyGJ: energyRef.current,
          activeNuclei: activeU235CountRef.current,
          spentNuclei: spentNucleiCountRef.current,
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
      const particles = particleBuffers.active;
      const next = particleBuffers.scratch;
      next.count = 0;
      const rodDepth = (rodsRef.current[0] / 100) * (CORE.height - 22);

      for (let particleIndex = 0; particleIndex < particles.count; particleIndex += 1) {
        const previousX = particles.x[particleIndex];
        const previousY = particles.y[particleIndex];
        particles.age[particleIndex] += delta;
        particles.x[particleIndex] += particles.vx[particleIndex] * delta;
        particles.y[particleIndex] += particles.vy[particleIndex] * delta;
        const neutronX = particles.x[particleIndex];
        const neutronY = particles.y[particleIndex];

        const escaped =
          neutronX < CORE.x || neutronX > CORE.x + CORE.width ||
          neutronY < CORE.y || neutronY > CORE.y + CORE.height ||
          particles.age[particleIndex] > particles.lifetime[particleIndex];
        if (escaped) continue;

        let directRodHit = -1;
        const passedControlRods = particles.passedControlRods[particleIndex];
        for (let rodIndex = 0; rodIndex < ROD_X.length; rodIndex += 1) {
          if (
            (passedControlRods & (1 << rodIndex)) === 0 &&
            Math.abs(neutronX - ROD_X[rodIndex]) < 16 &&
            neutronY < CORE.y + rodDepth
          ) {
            directRodHit = rodIndex;
            break;
          }
        }
        if (directRodHit !== -1) {
          if (Math.random() < rodAbsorptionRef.current / 100) {
            flashesRef.current.push({ x: neutronX, y: neutronY, age: 0, kind: 'absorbed' });
            continue;
          }
          particles.passedControlRods[particleIndex] |= 1 << directRodHit;
        }

        const nearbyIndex = collidingNucleusAlongPath(
          previousX,
          previousY,
          neutronX,
          neutronY,
          spentNuclei,
          nucleusInteractionRadiusRef.current,
        );
        if (nearbyIndex !== -1) {
          const nearby = NUCLEI[nearbyIndex];
          const fissionX = nearby.x;
          const fissionY = nearby.y;
          const count = Math.random() < 0.58 ? 2 : 3;
          const baseAngle = Math.random() * Math.PI * 2;
          for (let child = 0; child < count; child += 1) {
            const angle = baseAngle + (child / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            addNeutron(next, fissionX, fissionY, particles.generation[particleIndex] + 1, angle);
          }
          flashesRef.current.push({ x: fissionX, y: fissionY, age: 0, kind: 'fission' });
          spentNuclei[nearbyIndex] = NUCLEUS_DAUGHTER;
          spentNucleiCountRef.current += 1;
          const assemblyIndex = nearbyIndex % FUEL_ASSEMBLIES.length;
          spentByAssembly[assemblyIndex] += 1;
          if (spentByAssembly[assemblyIndex] >= SPENT_FUEL_THRESHOLD) rodsCanvasNeedsRedrawRef.current = true;
          activeU235CountRef.current -= 1;
          markNucleusSpent(nearbyIndex);
          fissionTimes[fissionTimesCountRef.current] = now;
          fissionTimesCountRef.current += 1;
          totalFissionsRef.current += 1;
          energyRef.current += 0.0064;
          continue;
        }

        copyParticle(particles, particleIndex, next);
      }
      particleBuffers.active = next;
      particleBuffers.scratch = particles;
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

    const drawZoomLens = (
      now: number,
      replacementOverlay: { assemblyIndex: number; progress: number } | null,
    ) => {
      const zoomCanvas = zoomCanvasRef.current;
      if (!zoomCanvas) return;
      const context = zoomCanvas.getContext('2d');
      if (!context) return;
      const pixelRatio = zoomPixelRatioRef.current;
      const outputWidth = zoomCanvas.width / pixelRatio;
      const outputHeight = zoomCanvas.height / pixelRatio;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, outputWidth, outputHeight);

      const pointer = zoomPointerRef.current;
      if (!zoomEnabledRef.current || !pointer) return;

      const scaleX = outputWidth / WIDTH;
      const scaleY = outputHeight / HEIGHT;
      const lensX = pointer.x * scaleX;
      const lensY = pointer.y * scaleY;
      const baseRadius = Math.max(72, Math.min(104, outputWidth * 0.085));
      const radius = baseRadius * Math.sqrt(1.3);
      const logicalRadius = radius / (Math.min(scaleX, scaleY) * 5);

      context.save();
      context.beginPath();
      context.arc(lensX, lensY, radius, 0, Math.PI * 2);
      context.clip();
      context.fillStyle = '#06151d';
      context.fillRect(lensX - radius, lensY - radius, radius * 2, radius * 2);
      context.translate(lensX, lensY);
      context.scale(5, 5);
      context.translate(-lensX, -lensY);
      context.scale(scaleX, scaleY);
      context.drawImage(ensureBaseLayer(), 0, 0);
      const visibleNucleusRadiusSquared = (logicalRadius + 8) ** 2;
      NUCLEI.forEach((nucleus, index) => {
        const distanceSquared = (nucleus.x - pointer.x) ** 2 + (nucleus.y - pointer.y) ** 2;
        if (distanceSquared > visibleNucleusRadiusSquared) return;
        if (spentNuclei[index] === NUCLEUS_DAUGHTER) drawFissionProducts(context, nucleus, index);
        else drawNucleus(context, nucleus, index);
      });
      drawRodBank(context, rodsRef.current[0]);
      drawFuelAssemblySelection(
        context,
        selectedFuelAssemblyRef.current,
        replacementOverlay,
        spentByAssembly,
        now,
      );
      drawMagnifiedDynamics(
        context,
        particleBuffers.active,
        flashesRef.current,
        pointer.x,
        pointer.y,
        logicalRadius,
      );
      context.restore();

      context.save();
      context.shadowColor = 'rgba(62, 228, 225, .68)';
      context.shadowBlur = 18;
      context.strokeStyle = '#071219';
      context.lineWidth = 8;
      context.beginPath();
      context.arc(lensX, lensY, radius, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.strokeStyle = '#70f3ef';
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = 'rgba(5, 19, 27, .9)';
      context.beginPath();
      context.arc(lensX + radius * 0.61, lensY - radius * 0.61, 17, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#70f3ef';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = '#dffeff';
      context.font = '900 10px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('5×', lensX + radius * 0.61, lensY - radius * 0.61 + 0.5);
      context.restore();
    };

    const draw = (target: HTMLCanvasElement, now: number) => {
      const staticCanvas = staticCanvasRef.current;
      const rodsCanvas = rodsCanvasRef.current;
      if (!staticCanvas || !rodsCanvas) return;

      const replacement = replacementRef.current;
      let replacementProgress: number | null = null;
      if (replacement) {
        replacementProgress = Math.min(1, (now - replacement.startedAt) / 920);
        if (!replacement.swapped && replacementProgress >= 0.48) {
          replacement.swapped = true;
          replaceFuelAssembly(replacement.assemblyIndex);
        }
        rodsCanvasNeedsRedrawRef.current = true;
        if (replacementProgress >= 1) replacementRef.current = null;
      }

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
      const hasSpentFuel = spentByAssembly.some((count) => count >= SPENT_FUEL_THRESHOLD);
      if (hasSpentFuel && now - lastSpentWarningDrawRef.current >= 160) {
        rodsCanvasNeedsRedrawRef.current = true;
        lastSpentWarningDrawRef.current = now;
      }
      if (rodsCanvasNeedsRedrawRef.current || drawnRodValueRef.current !== rodValue) {
        const rodsContext = rodsCanvas.getContext('2d');
        if (rodsContext) {
          rodsContext.setTransform(rodsCanvas.width / WIDTH, 0, 0, rodsCanvas.height / HEIGHT, 0, 0);
          rodsContext.clearRect(0, 0, WIDTH, HEIGHT);
          drawRodBank(rodsContext, rodValue);
          drawFuelAssemblySelection(
            rodsContext,
            selectedFuelAssemblyRef.current,
            replacement ? { assemblyIndex: replacement.assemblyIndex, progress: replacementProgress ?? 0 } : null,
            spentByAssembly,
            now,
          );
        }
        drawnRodValueRef.current = rodValue;
        rodsCanvasNeedsRedrawRef.current = false;
      }

      if (particleRenderer) {
        particleRenderer.draw(particleBuffers.active, flashesRef.current);
      } else {
        const context = target.getContext('2d');
        if (!context) return;
        context.setTransform(target.width / WIDTH, 0, 0, target.height / HEIGHT, 0, 0);
        context.clearRect(0, 0, WIDTH, HEIGHT);
        drawDynamicCore(context, particleBuffers.active, flashesRef.current);
      }
      drawZoomLens(
        now,
        replacement ? { assemblyIndex: replacement.assemblyIndex, progress: replacementProgress ?? 0 } : null,
      );
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const pointerPosition = (event: React.MouseEvent<HTMLCanvasElement>) => {
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

  const fuelAssemblyAtPoint = (x: number, y: number) => FUEL_ASSEMBLIES.findIndex(
    (assembly) => x >= assembly.x && x <= assembly.x + assembly.width && y >= assembly.y && y <= assembly.y + assembly.height,
  );

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
        className={`reactor-canvas reactor-canvas-layer ${zoomEnabled ? 'zoom-active' : ''}`}
        aria-label="Interactive reactor core. Double-click a fuel rod to select it for replacement. Drag any cyan control rod grip vertically to move the whole control-rod bank. Press Z to toggle the five times inspection loupe."
        onClick={(event) => {
          const point = pointerPosition(event);
          if (fuelAssemblyAtPoint(point.x, point.y) === -1 && !isNearRodBank(point.x, point.y)) {
            onFuelAssemblySelect(null);
          }
        }}
        onDoubleClick={(event) => {
          const point = pointerPosition(event);
          const assemblyIndex = fuelAssemblyAtPoint(point.x, point.y);
          onFuelAssemblySelect(assemblyIndex === -1 ? null : assemblyIndex);
        }}
        onPointerDown={(event) => {
          const point = pointerPosition(event);
          if (!isNearRodBank(point.x, point.y)) return;
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateBankFromPointer(event);
        }}
        onPointerMove={(event) => {
          const point = pointerPosition(event);
          zoomPointerRef.current = zoomEnabledRef.current ? point : null;
          if (draggingRef.current) {
            updateBankFromPointer(event);
            return;
          }
          event.currentTarget.style.cursor = isNearRodBank(point.x, point.y)
            ? 'ns-resize'
            : zoomEnabledRef.current ? 'zoom-in'
              : fuelAssemblyAtPoint(point.x, point.y) !== -1 ? 'pointer' : 'default';
        }}
        onPointerLeave={() => { zoomPointerRef.current = null; }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          zoomPointerRef.current = null;
        }}
      />
      <canvas ref={zoomCanvasRef} className="reactor-canvas-layer zoom-canvas-layer" aria-hidden="true" />
    </div>
  );
}

function collidingNucleusAlongPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  spent: Uint8Array,
  radius: number,
) {
  const minCellX = Math.max(0, Math.floor((Math.min(startX, endX) - radius) / NUCLEUS_GRID_SIZE));
  const maxCellX = Math.min(NUCLEUS_GRID_COLUMNS - 1, Math.floor((Math.max(startX, endX) + radius) / NUCLEUS_GRID_SIZE));
  const minCellY = Math.max(0, Math.floor((Math.min(startY, endY) - radius) / NUCLEUS_GRID_SIZE));
  const maxCellY = Math.min(NUCLEUS_GRID_ROWS - 1, Math.floor((Math.max(startY, endY) + radius) / NUCLEUS_GRID_SIZE));
  const pathX = endX - startX;
  const pathY = endY - startY;
  const pathLengthSquared = pathX * pathX + pathY * pathY;
  const radiusSquared = radius * radius;
  let firstHit = -1;
  let firstHitProgress = Number.POSITIVE_INFINITY;

  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const candidates = NUCLEUS_GRID[cellY * NUCLEUS_GRID_COLUMNS + cellX];
      for (const index of candidates) {
        if (spent[index] !== 0) continue;
        const nucleus = NUCLEI[index];
        const progress = pathLengthSquared === 0
          ? 0
          : Math.max(0, Math.min(1, ((nucleus.x - startX) * pathX + (nucleus.y - startY) * pathY) / pathLengthSquared));
        const closestX = startX + pathX * progress;
        const closestY = startY + pathY * progress;
        const distanceSquared = (nucleus.x - closestX) ** 2 + (nucleus.y - closestY) ** 2;
        if (distanceSquared < radiusSquared && progress < firstHitProgress) {
          firstHit = index;
          firstHitProgress = progress;
        }
      }
    }
  }
  return firstHit;
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
  context.fillText('CONTROL RODS', WIDTH / 2, CORE.y - 18);
  context.fillStyle = 'rgba(130, 184, 196, .44)';
  context.font = '600 9px monospace';
  context.textAlign = 'left';
  context.fillText(`${TOTAL_NUCLEI} × FUEL NUCLEI`, CORE.x + 22, CORE.y + CORE.height - 17);
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

function drawFuelAssemblySelection(
  context: CanvasRenderingContext2D,
  selectedAssembly: number | null,
  replacement: { assemblyIndex: number; progress: number } | null,
  spentByAssembly: Uint16Array,
  now: number,
) {
  const hasSpentFuel = spentByAssembly.some((count) => count >= SPENT_FUEL_THRESHOLD);
  if (selectedAssembly === null && replacement === null && !hasSpentFuel) return;
  context.save();
  if (selectedAssembly !== null) {
    const assembly = FUEL_ASSEMBLIES[selectedAssembly];
    context.strokeStyle = '#ffcf5a';
    context.lineWidth = 3;
    context.shadowColor = '#ffbd43';
    context.shadowBlur = 13;
    roundedRect(context, assembly.x - 4, assembly.y - 4, assembly.width + 8, assembly.height + 8, 14);
    context.stroke();
  }
  if (replacement) {
    const assembly = FUEL_ASSEMBLIES[replacement.assemblyIndex];
    const flash = Math.sin(replacement.progress * Math.PI);
    const fade = replacement.progress < 0.48
      ? replacement.progress / 0.48
      : 1 - (replacement.progress - 0.48) / 0.52;
    context.shadowColor = '#b9ffff';
    context.shadowBlur = 34 * flash;
    context.fillStyle = `rgba(190, 255, 248, ${Math.max(0, fade) * 0.72})`;
    roundedRect(context, assembly.x - 2, assembly.y - 2, assembly.width + 4, assembly.height + 4, 13);
    context.fill();
    context.strokeStyle = `rgba(126, 255, 226, ${0.35 + flash * 0.65})`;
    context.lineWidth = 4;
    context.stroke();
  }
  if (hasSpentFuel) {
    const pulse = 0.38 + ((Math.sin(now / 125) + 1) / 2) * 0.62;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '900 7px monospace';
    for (let assemblyIndex = 0; assemblyIndex < FUEL_ASSEMBLIES.length; assemblyIndex += 1) {
      if (spentByAssembly[assemblyIndex] < SPENT_FUEL_THRESHOLD) continue;
      const assembly = FUEL_ASSEMBLIES[assemblyIndex];
      const centreX = assembly.x + assembly.width / 2;
      const labelY = assembly.y - 20;
      context.fillStyle = `rgba(255, 191, 55, ${0.72 * pulse})`;
      context.shadowColor = '#ffbd43';
      context.shadowBlur = 12 * pulse;
      roundedRect(context, centreX - 29, labelY - 7, 58, 14, 5);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#241701';
      context.fillText('FUEL ROD SPENT', centreX, labelY + 0.5);
    }
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

  let lineData: Float32Array<ArrayBuffer> = new Float32Array(0);
  let pointData: Float32Array<ArrayBuffer> = new Float32Array(0);
  let lineGpuCapacity = 0;
  let pointGpuCapacity = 0;
  const growStagingBuffer = (current: Float32Array<ArrayBuffer>, required: number): Float32Array<ArrayBuffer> => {
    if (current.length >= required) return current;
    let capacity = Math.max(1024, current.length);
    while (capacity < required) capacity *= 2;
    return new Float32Array(capacity);
  };

  return {
    draw(particles: ParticleBuffer, flashes: Flash[]) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const renderStride = Math.max(1, Math.ceil(particles.count / MAX_RENDERED_NEUTRONS));
      const renderedParticleCount = Math.ceil(particles.count / renderStride);

      if (renderedParticleCount > 0) {
        const lineValueCount = renderedParticleCount * 4;
        lineData = growStagingBuffer(lineData, lineValueCount);
        let renderedIndex = 0;
        for (let particleIndex = 0; particleIndex < particles.count; particleIndex += renderStride) {
          const offset = renderedIndex * 4;
          lineData[offset] = particles.x[particleIndex] - particles.trailX[particleIndex];
          lineData[offset + 1] = particles.y[particleIndex] - particles.trailY[particleIndex];
          lineData[offset + 2] = particles.x[particleIndex];
          lineData[offset + 3] = particles.y[particleIndex];
          renderedIndex += 1;
        }
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        if (lineGpuCapacity < lineData.byteLength) {
          lineGpuCapacity = lineData.byteLength;
          gl.bufferData(gl.ARRAY_BUFFER, lineGpuCapacity, gl.DYNAMIC_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData.subarray(0, lineValueCount));
        gl.enableVertexAttribArray(linePosition);
        gl.vertexAttribPointer(linePosition, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(lineResolution, WIDTH, HEIGHT);
        gl.drawArrays(gl.LINES, 0, renderedParticleCount * 2);
      }

      const pointCount = renderedParticleCount + flashes.length;
      if (pointCount === 0) return;
      const pointValueCount = pointCount * 5;
      pointData = growStagingBuffer(pointData, pointValueCount);
      const pixelScale = canvas.width / WIDTH;
      let pointIndex = 0;
      for (let particleIndex = 0; particleIndex < particles.count; particleIndex += renderStride) {
        const offset = pointIndex * 5;
        pointData[offset] = particles.x[particleIndex];
        pointData[offset + 1] = particles.y[particleIndex];
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
      if (pointGpuCapacity < pointData.byteLength) {
        pointGpuCapacity = pointData.byteLength;
        gl.bufferData(gl.ARRAY_BUFFER, pointGpuCapacity, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pointData.subarray(0, pointValueCount));
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

function drawDynamicCore(context: CanvasRenderingContext2D, particles: ParticleBuffer, flashes: Flash[]) {
  const renderStride = Math.max(1, Math.ceil(particles.count / MAX_RENDERED_NEUTRONS));
  context.save();
  context.beginPath();
  for (let index = 0; index < particles.count; index += renderStride) {
    context.moveTo(particles.x[index] - particles.trailX[index], particles.y[index] - particles.trailY[index]);
    context.lineTo(particles.x[index], particles.y[index]);
  }
  context.strokeStyle = 'rgba(127, 236, 249, .38)';
  context.lineWidth = 1.4;
  context.stroke();

  context.beginPath();
  for (let index = 0; index < particles.count; index += renderStride) {
    context.rect(particles.x[index] - 4.5, particles.y[index] - 4.5, 9, 9);
  }
  context.fillStyle = 'rgba(105, 231, 244, .14)';
  context.fill();

  context.beginPath();
  for (let index = 0; index < particles.count; index += renderStride) {
    context.rect(particles.x[index] - 2, particles.y[index] - 2, 4, 4);
  }
  context.fillStyle = '#eaffff';
  context.fill();

  drawFlashes(context, flashes);

  const surge = Math.max(0, Math.min(1, (particles.count - 55) / 115));
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

function drawMagnifiedDynamics(
  context: CanvasRenderingContext2D,
  particles: ParticleBuffer,
  flashes: Flash[],
  centreX: number,
  centreY: number,
  radius: number,
) {
  const renderStride = Math.max(1, Math.ceil(particles.count / MAX_RENDERED_NEUTRONS));
  const radiusSquared = (radius + 4) ** 2;
  const isVisible = (x: number, y: number) => (x - centreX) ** 2 + (y - centreY) ** 2 <= radiusSquared;

  context.save();
  context.lineCap = 'round';
  context.beginPath();
  for (let index = 0; index < particles.count; index += renderStride) {
    if (!isVisible(particles.x[index], particles.y[index])) continue;
    context.moveTo(particles.x[index] - particles.trailX[index], particles.y[index] - particles.trailY[index]);
    context.lineTo(particles.x[index], particles.y[index]);
  }
  context.strokeStyle = 'rgba(127, 236, 249, .5)';
  context.lineWidth = 1.1;
  context.stroke();

  for (let index = 0; index < particles.count; index += renderStride) {
    if (!isVisible(particles.x[index], particles.y[index])) continue;
    context.beginPath();
    context.arc(particles.x[index], particles.y[index], 3.7, 0, Math.PI * 2);
    context.fillStyle = 'rgba(105, 231, 244, .16)';
    context.fill();
    context.beginPath();
    context.arc(particles.x[index], particles.y[index], 1.25, 0, Math.PI * 2);
    context.fillStyle = '#efffff';
    context.fill();
  }

  const nearbyFlashes = flashes.filter((flash) => isVisible(flash.x, flash.y));
  drawFlashes(context, nearbyFlashes);
  context.restore();
}

function drawNucleus(context: CanvasRenderingContext2D, nucleus: (typeof NUCLEI)[number], index: number) {
  context.save();
  context.translate(nucleus.x, nucleus.y);
  context.rotate(nucleus.rotation);
  context.beginPath();
  context.arc(0, 0, 4.8, 0, Math.PI * 2);
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

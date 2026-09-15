'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  CircleHelp,
  Coffee,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Zap,
} from 'lucide-react';
import { FUEL_ASSEMBLY_COUNT, ReactorSimulation, TOTAL_NUCLEI, type Telemetry } from '@/components/reactor-simulation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import './advanced-settings.css';
import './favicon-link.css';
import './layout-alignment.css';
import './reactor-status.css';
import './support-button.css';
import './zoom-button.css';

const DEFAULT_RODS = [55, 55, 55, 55, 55];
const DEFAULT_ROD_ABSORPTION = 90;
const DEFAULT_NUCLEUS_INTERACTION_RADIUS = 0.2;
const TEMPERATURE_WARNING = 350;
const SCRAM_TEMPERATURE = 380;
const EMPTY_TELEMETRY: Telemetry = {
  neutrons: 0,
  fissionsPerSecond: 0,
  totalFissions: 0,
  energyGJ: 0,
  activeNuclei: TOTAL_NUCLEI,
  spentNuclei: 0,
};

export default function Home() {
  const [rods, setRods] = useState(DEFAULT_RODS);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [scramming, setScramming] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [rodAbsorption, setRodAbsorption] = useState(DEFAULT_ROD_ABSORPTION);
  const [nucleusInteractionRadius, setNucleusInteractionRadius] = useState(DEFAULT_NUCLEUS_INTERACTION_RADIUS);
  const [pulseVersion, setPulseVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [selectedFuelRod, setSelectedFuelRod] = useState<number | null>(null);
  const [replacementFuelRod, setReplacementFuelRod] = useState<number | null>(null);
  const [replacementVersion, setReplacementVersion] = useState(0);
  const [telemetry, setTelemetry] = useState<Telemetry>(EMPTY_TELEMETRY);
  const [history, setHistory] = useState<number[]>(Array(34).fill(0));
  const scramStartRef = useRef(DEFAULT_RODS);

  const averageRod = useMemo(
    () => rods.reduce((sum, rod) => sum + rod, 0) / rods.length,
    [rods],
  );
  const densityFeedback = Math.max(0, telemetry.neutrons - 70) * 0.0012;
  const effectiveInsertion = averageRod * (rodAbsorption / 100);
  const kEffective = Math.max(0.48, 1.35 - effectiveInsertion * 0.0065 - densityFeedback);
  const power = telemetry.fissionsPerSecond * 105;
  const powerRef = useRef(power);
  const coreTemp = 286 + power * 0.052;
  const temperatureWarning = coreTemp >= TEMPERATURE_WARNING;
  const overheating = coreTemp >= SCRAM_TEMPERATURE;
  const state = getReactorState(kEffective, telemetry.neutrons, started);

  useEffect(() => {
    powerRef.current = power;
  }, [power]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHistory((values) => [...values.slice(1), powerRef.current]);
    }, 850);
    return () => window.clearInterval(timer);
  }, []);

  const startOrPulse = useCallback(() => {
    setStarted(true);
    setRunning(true);
    setPulseVersion((version) => version + 1);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setStarted(false);
    setScramming(false);
    setRodAbsorption(DEFAULT_ROD_ABSORPTION);
    setNucleusInteractionRadius(DEFAULT_NUCLEUS_INTERACTION_RADIUS);
    setSelectedFuelRod(null);
    setReplacementFuelRod(null);
    setRods(DEFAULT_RODS);
    setTelemetry(EMPTY_TELEMETRY);
    setHistory(Array(34).fill(0));
    setResetVersion((version) => version + 1);
  }, []);

  const scram = useCallback(() => {
    scramStartRef.current = rods;
    setRunning(true);
    setScramming(true);
  }, [rods]);

  useEffect(() => {
    if (!scramming) return;
    const startingRods = scramStartRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const lowerRods = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 760);
      const eased = 1 - (1 - progress) ** 3;
      setRods(startingRods.map((rod) => rod + (100 - rod) * eased));
      if (progress < 1) frame = requestAnimationFrame(lowerRods);
      else setScramming(false);
    };
    frame = requestAnimationFrame(lowerRods);
    return () => cancelAnimationFrame(frame);
  }, [scramming]);

  const changeRodBank = useCallback((value: number) => {
    setScramming(false);
    setRods((current) => current.map(() => value));
  }, []);

  const setRodBank = useCallback((value: number) => {
    changeRodBank(value);
  }, [changeRodBank]);

  const replaceSelectedFuelRod = useCallback(() => {
    if (selectedFuelRod === null) return;
    setReplacementFuelRod(selectedFuelRod);
    setReplacementVersion((version) => version + 1);
  }, [selectedFuelRod]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!started) startOrPulse();
        else setRunning((value) => !value);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        setScramming(false);
        setRods((current) => {
          const adjustment = event.key === 'ArrowUp' ? -2 : 2;
          const nextValue = Math.max(0, Math.min(100, current[0] + adjustment));
          return current.map(() => nextValue);
        });
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        setSelectedFuelRod((current) => {
          if (current === null) return event.key === 'ArrowRight' ? 0 : FUEL_ASSEMBLY_COUNT - 1;
          const adjustment = event.key === 'ArrowRight' ? 1 : -1;
          return (current + adjustment + FUEL_ASSEMBLY_COUNT) % FUEL_ASSEMBLY_COUNT;
        });
        return;
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        replaceSelectedFuelRod();
        return;
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setZoomEnabled((value) => !value);
        return;
      }
      if (event.key.toLowerCase() === 's') scram();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [replaceSelectedFuelRod, scram, startOrPulse, started]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a
          className="brand-mark"
          href="http://awm11.github.io/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the AWM Physics homepage in a new tab"
        >
          <span
            aria-hidden="true"
            style={{ width: '100%', height: '100%', display: 'block', borderRadius: '12px 7px 12px 7px', background: "center / cover url('favicon.svg')" }}
          />
        </a>
        <div className="brand-copy">
          <h1>Chain Reaction <span>Lab</span></h1>
        </div>
        <div className="lab-pill">U-235 · live sandbox</div>
        <div className="header-status">
          <span className={`status-dot ${running ? '' : 'idle'}`} />
          {running ? 'Simulation running' : 'Simulation paused'}
        </div>
      </header>

      <section className="workspace">
        <aside className="readout-column">
          <section className="panel metrics-panel">
            <p className="eyebrow">Numbers with consequences</p>
            <div className="metric-grid">
              <Metric icon={<Zap size={16} />} label="Thermal power" value={power.toFixed(0)} unit="MW" accent="amber" />
              <Metric icon={<Activity size={16} />} label="Free neutrons" value={String(telemetry.neutrons)} unit="n" accent="cyan" />
              <Metric icon={<Gauge size={16} />} label="Energy made" value={telemetry.energyGJ.toFixed(2)} unit="GJ" accent="green" />
              <ThermometerReadout temperature={coreTemp} warning={temperatureWarning} overheating={overheating} />
            </div>
            <div className="fuel-readout">
              <div><span>U-235 nuclei remaining</span><strong>{telemetry.activeNuclei} / {TOTAL_NUCLEI}</strong></div>
              <span className="fuel-track"><i style={{ width: `${(telemetry.activeNuclei / TOTAL_NUCLEI) * 100}%` }} /></span>
              <small>{telemetry.spentNuclei} transformed into daughter products</small>
            </div>
          </section>

          <section className="panel readout-panel">
            <div className="readout-header"><span>POWER HISTORY</span><strong>{Math.round((power / 1600) * 100)}%</strong></div>
            <PowerHistory values={history} />
            <div className="readout-scale"><span>30s ago</span><span>now</span></div>
          </section>
        </aside>

        <div className="reactor-panel panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">The tiny-particle big-energy machine</p>
              <h2>Make it critical.</h2>
            </div>
            <output className={`criticality-badge ${state.tone}`} aria-live="polite">
              <span /> {state.label} · k<sub>eff</sub> {kEffective.toFixed(2)}
            </output>
          </div>

          <div className={`core-stage ${temperatureWarning ? 'warning' : ''} ${overheating ? 'overheat' : ''}`}>
            <div className="chamber-label">
              <span>CORE 01 · {TOTAL_NUCLEI} NUCLEI</span>
              <span>{running ? 'LIVE PARTICLE VIEW' : 'PARTICLE VIEW PAUSED'}</span>
            </div>
            <div className="chain-ribbon"><span>neutron</span><b>→</b><span>fission</span><b>→</b><span>2–3 neutrons</span><b>↻</b></div>
            <ReactorSimulation
              rods={rods}
              running={running}
              speed={speed}
              zoomEnabled={zoomEnabled}
              rodAbsorption={rodAbsorption}
              nucleusInteractionRadius={nucleusInteractionRadius}
              selectedFuelAssembly={selectedFuelRod}
              replacementFuelAssembly={replacementFuelRod}
              replacementVersion={replacementVersion}
              pulseVersion={pulseVersion}
              resetVersion={resetVersion}
              onRodBankChange={changeRodBank}
              onFuelAssemblySelect={setSelectedFuelRod}
              onTelemetry={setTelemetry}
            />
            <div className="drag-hint">Double-click fuel · Z: 5× inspection loupe · arrows: rods / fuel · R: replace</div>
            <div className="stage-legend">
              <span><i className="legend-neutron" /> Neutron</span>
              <span><i className="legend-nucleus" /> U-235 nucleus</span>
              <span><i className="legend-product" /> Daughter products</span>
              <span><i className="legend-fission" /> Fission</span>
              <span><i className="legend-rod" /> Absorber rod</span>
            </div>
          </div>

        </div>

        <aside className="control-column">
          <section className="panel control-panel">
            <div className="panel-heading compact">
              <div><p className="eyebrow">Operator controls</p><h2>Your levers</h2></div>
              <span className="shortcut-help" title="Space: play/pause · Z: inspection loupe · ↑↓: rods · ←→: select fuel · R: replace · S: SCRAM"><CircleHelp size={16} /></span>
            </div>
            <RodThrottle value={averageRod} onChange={setRodBank}>
              <div className={`safety-status ${overheating ? 'danger' : temperatureWarning ? 'caution' : 'normal'}`} role="status" aria-live="polite">
                <span className="safety-lamp" aria-hidden="true" />
                <span className="safety-status-copy">
                  <small>Reactor status</small>
                  <strong>{overheating ? 'SCRAM required' : temperatureWarning ? 'Temperature caution' : 'Normal operation'}</strong>
                </span>
              </div>
              <button
                className={`scram-button ${overheating ? 'alarm' : ''} ${scramming ? 'engaged' : ''}`}
                onClick={scram}
                aria-label={scramming ? 'SCRAM active, control rods lowering' : overheating ? 'SCRAM now, core temperature critical' : 'SCRAM emergency shutdown'}
              >
                <span className="scram-cap"><ShieldAlert size={20} /></span>
                <span className="scram-copy">
                  <strong>SCRAM</strong>
                  <small>{scramming ? 'Rods lowering' : 'Emergency shutdown'}</small>
                </span>
              </button>
            </RodThrottle>
            {selectedFuelRod !== null && (
              <div className="fuel-replacement-control">
                <div>
                  <span>Fuel rod {selectedFuelRod + 1} selected</span>
                  <small>Double-click another rod to change selection</small>
                </div>
                <button onClick={replaceSelectedFuelRod}>
                  <RefreshCw size={14} /> Replace fuel rod
                </button>
              </div>
            )}
            <div className="control-buttons">
              <button className="primary-button" onClick={startOrPulse}>
                <Sparkles size={16} /> {started ? 'Add neutron pulse' : 'Start chain reaction'}
              </button>
              <button className="icon-button" onClick={() => setRunning((value) => !value)} aria-label={running ? 'Pause simulation' : 'Resume simulation'}>
                {running ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button className="icon-button" onClick={reset} aria-label="Reset simulation"><RotateCcw size={17} /></button>
              <button
                className={`icon-button zoom-button ${zoomEnabled ? 'active' : ''}`}
                onClick={() => setZoomEnabled((value) => !value)}
                aria-label={`${zoomEnabled ? 'Disable' : 'Enable'} 5 times reactor inspection loupe`}
                aria-pressed={zoomEnabled}
                title="Toggle 5× inspection loupe (Z)"
              >
                <Search size={18} />
              </button>
            </div>
          </section>

          <Collapsible className="panel advanced-settings">
            <CollapsibleTrigger className="advanced-settings-trigger">
              <span className="advanced-settings-title">
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span>
                  <strong>Advanced settings</strong>
                  <small>Simulation tuning</small>
                </span>
              </span>
              <ChevronDown className="advanced-settings-chevron" size={18} aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent className="advanced-settings-content">
              <label className="speed-control">
                <span>Animation speed</span><strong>{speed.toFixed(1)}×</strong>
                <input type="range" min="0.4" max="2" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
              </label>
              <label className="absorption-control">
                <div className="control-label"><span>Control-rod collision</span><strong>{rodAbsorption}% capture</strong></div>
                <input
                  aria-label="Probability that a neutron striking a control rod is absorbed"
                  type="range"
                  min="0"
                  max="100"
                  value={rodAbsorption}
                  onChange={(event) => setRodAbsorption(Number(event.target.value))}
                />
                <div className="probability-split">
                  <span><i className="capture-swatch" /> Absorbed {rodAbsorption}%</span>
                  <span><i className="pass-swatch" /> Passes behind {100 - rodAbsorption}%</span>
                </div>
              </label>
              <label className="absorption-control">
                <div className="control-label"><span>Nucleus absorption radius</span><strong>{nucleusInteractionRadius.toFixed(2)} units</strong></div>
                <input
                  aria-label="Nucleus absorption radius"
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={nucleusInteractionRadius}
                  onChange={(event) => setNucleusInteractionRadius(Number(event.target.value))}
                />
                <div className="range-labels"><span>Harder to hit</span><span>Larger cross-section</span></div>
              </label>
            </CollapsibleContent>
          </Collapsible>

        </aside>
      </section>

      <BuyMeACoffee />

      <footer>
        <span>Educational aggregate model · not for operational use</span>
        <span className="footer-ready"><Play size={12} fill="currentColor" /> Space: play/pause · Z: zoom · ↑↓: rods · ←→: fuel · R: replace · S: SCRAM</span>
      </footer>
    </main>
  );
}

function BuyMeACoffee() {
  return (
    <aside className="support-strip" aria-label="Support AWM Physics">
      <div>
        <p className="eyebrow">Keep the experiments running</p>
        <strong>Enjoyed the simulator? Support more interactive physics.</strong>
      </div>
      <a
        className="support-button"
        href="https://www.buymeacoffee.com/awmPhysics"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Coffee size={18} aria-hidden="true" />
        <span>Buy me a coffee</span>
      </a>
    </aside>
  );
}

function RodThrottle({ value, onChange, children }: { value: number; onChange: (value: number) => void; children: React.ReactNode }) {
  const pointerState = useRef<{ startY: number; grabOffsetY: number; moved: boolean } | null>(null);

  const pointerValue = (clientY: number, target: HTMLDivElement, offsetY = 0) => {
    const bounds = target.getBoundingClientRect();
    const handleY = clientY - offsetY;
    const nextValue = (((handleY - bounds.top) / bounds.height - 0.12) / 0.76) * 100;
    return Math.max(0, Math.min(100, nextValue));
  };

  return (
    <div className="rod-throttle">
      <div className="control-label"><span>Control rods</span><strong>{Math.round(value)}%</strong></div>
      <div className="throttle-console">
        <div className="throttle-scale" aria-hidden="true">
          <span>OUT</span><i /><i /><i /><i /><i /><span>IN</span>
        </div>
        <div
          className="throttle-travel"
          role="slider"
          tabIndex={0}
          aria-label="Control rod bank insertion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
          aria-valuetext={`${Math.round(value)} percent inserted`}
          onPointerDown={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const handleY = bounds.top + bounds.height * (0.12 + value * 0.0076);
            pointerState.current = {
              startY: event.clientY,
              grabOffsetY: event.clientY - handleY,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const state = pointerState.current;
            if (!state) return;
            if (!state.moved && Math.abs(event.clientY - state.startY) < 3) return;
            state.moved = true;
            onChange(pointerValue(event.clientY, event.currentTarget, state.grabOffsetY));
          }}
          onPointerUp={(event) => {
            const state = pointerState.current;
            if (state) {
              onChange(pointerValue(event.clientY, event.currentTarget, state.moved ? state.grabOffsetY : 0));
            }
            pointerState.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { pointerState.current = null; }}
        >
          <span className="throttle-slot" aria-hidden="true" />
          <span className="throttle-handle" style={{ top: `${12 + value * 0.76}%` }} aria-hidden="true">
            <i className="throttle-stem" />
            <b className="throttle-grip"><em /></b>
            <i className="throttle-pivot" />
          </span>
        </div>
        <span className="throttle-instruction" style={{ bottom: '7px', fontSize: '7px' }}>Drag handle</span>
      </div>
      {children}
    </div>
  );
}

function getReactorState(k: number, neutrons: number, started: boolean) {
  if (!started || neutrons === 0) return { label: 'Dormant', tone: 'dormant' };
  if (k < 0.97) return { label: 'Subcritical', tone: 'subcritical' };
  if (k <= 1.05) return { label: 'Critical', tone: 'critical' };
  return { label: 'Supercritical', tone: 'supercritical' };
}

function Metric({ icon, label, value, unit, accent }: { icon: React.ReactNode; label: string; value: string; unit: string; accent: string }) {
  return <div className={`metric-card ${accent}`}><div className="metric-label">{icon}<span>{label}</span></div><div className="metric-value">{value}<small>{unit}</small></div></div>;
}

function ThermometerReadout({ temperature, warning, overheating }: { temperature: number; warning: boolean; overheating: boolean }) {
  const fill = Math.max(8, Math.min(100, ((temperature - 280) / 120) * 100));
  return (
    <div className={`thermometer-card ${warning ? 'warning' : ''} ${overheating ? 'hot' : ''}`}>
      <div className="thermometer-visual" aria-hidden="true">
        <span className="thermometer-tube"><i style={{ height: `${fill}%` }} /></span>
        <span className="thermometer-bulb" />
        <span className="temperature-warning-line" />
      </div>
      <div className="thermometer-copy">
        <span><Thermometer size={17} /> Core temperature</span>
        <strong>{temperature.toFixed(0)}<small>°C</small></strong>
        <div className="thermometer-state">
          <em>{overheating ? 'SCRAM now' : warning ? 'Temperature warning' : 'Normal range'}</em>
          <small>SCRAM at 380°C</small>
        </div>
      </div>
    </div>
  );
}

function PowerHistory({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 280},${64 - (value / max) * 54}`).join(' ');
  const area = `0,68 ${points} 280,68`;
  return <div className="sparkline" aria-label="Recent thermal power trend"><svg viewBox="0 0 280 68" preserveAspectRatio="none"><polygon className="area" points={area} /><polyline className="line" points={points} /></svg></div>;
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Atom,
  CircleHelp,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Zap,
} from 'lucide-react';
import { ReactorSimulation, TOTAL_NUCLEI, type Telemetry } from '@/components/reactor-simulation';

const DEFAULT_RODS = [55, 55, 55, 55, 55];
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
  const [scramming, setScramming] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [rodAbsorption, setRodAbsorption] = useState(70);
  const [pulseVersion, setPulseVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
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
  const overheating = coreTemp >= 335;
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
    setRodAbsorption(70);
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

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!started) startOrPulse();
        else setRunning((value) => !value);
      }
      if (event.key.toLowerCase() === 'r') reset();
      if (event.key.toLowerCase() === 's') scram();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [reset, scram, startOrPulse, started]);

  const changeRodBank = useCallback((value: number) => {
    setScramming(false);
    setRods((current) => current.map(() => value));
  }, []);

  const setRodBank = (value: number) => {
    setScramming(false);
    setRods(rods.map(() => value));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><Atom size={21} /></div>
        <div className="brand-copy">
          <p className="eyebrow">Interactive science playground</p>
          <h1>Chain Reaction <span>Lab</span></h1>
        </div>
        <div className="lab-pill">U-235 · live sandbox</div>
        <div className="header-status">
          <span className={`status-dot ${running ? '' : 'idle'}`} />
          {running ? 'Simulation running' : 'Simulation paused'}
        </div>
      </header>

      <section className="workspace">
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

          <div className={`core-stage ${overheating ? 'overheat' : ''}`}>
            <div className="chamber-label">
              <span>CORE 01 · {TOTAL_NUCLEI} NUCLEI</span>
              <span>{running ? 'LIVE PARTICLE VIEW' : 'PARTICLE VIEW PAUSED'}</span>
            </div>
            <div className="chain-ribbon"><span>neutron</span><b>→</b><span>fission</span><b>→</b><span>2–3 neutrons</span><b>↻</b></div>
            <ReactorSimulation
              rods={rods}
              running={running}
              speed={speed}
              rodAbsorption={rodAbsorption}
              pulseVersion={pulseVersion}
              resetVersion={resetVersion}
              onRodBankChange={changeRodBank}
              onTelemetry={setTelemetry}
            />
            <div className="drag-hint">↕ Drag any cyan grip · rods move as one bank</div>
            <div className="stage-legend">
              <span><i className="legend-neutron" /> Neutron</span>
              <span><i className="legend-nucleus" /> U-235 nucleus</span>
              <span><i className="legend-product" /> Daughter products</span>
              <span><i className="legend-fission" /> Fission</span>
              <span><i className="legend-rod" /> Absorber rod</span>
            </div>
          </div>

          <div className="transport-strip">
            <div><span>Primary loop</span><strong>15.5 MPa</strong></div>
            <div className="pipe-flow"><span /><span /><span /><span /><span /></div>
            <div><span>Coolant flow</span><strong>17,420 kg/s</strong></div>
          </div>
        </div>

        <aside className="control-column">
          <section className="panel control-panel">
            <div className="panel-heading compact">
              <div><p className="eyebrow">Operator controls</p><h2>Your levers</h2></div>
              <span className="shortcut-help" title="Space: play/pause · R: reset · S: SCRAM"><CircleHelp size={16} /></span>
            </div>
            <div className="rod-control">
              <div className="control-label"><span>Rod bank average</span><strong>{Math.round(averageRod)}%</strong></div>
              <input
                aria-label="Move all control rods"
                type="range"
                min="0"
                max="100"
                value={averageRod}
                onChange={(event) => setRodBank(Number(event.target.value))}
              />
              <div className="range-labels"><span>Withdrawn</span><span>Inserted</span></div>
              <div className="rod-miniatures" aria-label="Coupled control rod insertion values">
                {rods.map((rod, index) => <span key={index} style={{ '--rod-fill': `${rod}%` } as React.CSSProperties}>{Math.round(rod)}</span>)}
              </div>
            </div>
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
            <div className="control-buttons">
              <button className="primary-button" onClick={startOrPulse}>
                <Sparkles size={16} /> {started ? 'Add neutron pulse' : 'Start chain reaction'}
              </button>
              <button className="icon-button" onClick={() => setRunning((value) => !value)} aria-label={running ? 'Pause simulation' : 'Resume simulation'}>
                {running ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button className="icon-button" onClick={reset} aria-label="Reset simulation"><RotateCcw size={17} /></button>
            </div>
            <button className={`scram-button ${overheating ? 'alarm' : ''} ${scramming ? 'engaged' : ''}`} onClick={scram} aria-live="polite">
              <ShieldAlert size={15} /> {scramming ? 'SCRAM IN PROGRESS · LOWERING RODS' : overheating ? 'SCRAM NOW · CORE OVERHEAT' : 'SCRAM · insert all rods'}
            </button>
            <label className="speed-control">
              <span>Animation speed</span><strong>{speed.toFixed(1)}×</strong>
              <input type="range" min="0.4" max="2" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
            </label>
          </section>

          <section className="panel metrics-panel">
            <p className="eyebrow">Numbers with consequences</p>
            <div className="metric-grid">
              <Metric icon={<Zap size={16} />} label="Thermal power" value={power.toFixed(0)} unit="MW" accent="amber" />
              <Metric icon={<Activity size={16} />} label="Free neutrons" value={String(telemetry.neutrons)} unit="n" accent="cyan" />
              <Metric icon={<Gauge size={16} />} label="Energy made" value={telemetry.energyGJ.toFixed(2)} unit="GJ" accent="green" />
              <ThermometerReadout temperature={coreTemp} overheating={overheating} />
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
            <div className="chain-note">
              <span className="chain-icon">3n</span>
              <p><strong>The chain is the engine.</strong> Each gold flash consumes one U-235 nucleus and releases exactly 2 or 3 neutrons. The purple and green fragments are different daughter elements, so they cannot fission again.</p>
            </div>
          </section>
        </aside>
      </section>

      <footer>
        <span>Educational aggregate model · not for operational use</span>
        <span className="footer-ready"><Play size={12} fill="currentColor" /> Space: play/pause · R: reset · S: SCRAM</span>
      </footer>
    </main>
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

function ThermometerReadout({ temperature, overheating }: { temperature: number; overheating: boolean }) {
  const fill = Math.max(8, Math.min(100, ((temperature - 280) / 75) * 100));
  return (
    <div className={`thermometer-card ${overheating ? 'hot' : ''}`}>
      <div className="thermometer-visual" aria-hidden="true">
        <span className="thermometer-tube"><i style={{ height: `${fill}%` }} /></span>
        <span className="thermometer-bulb" />
        <span className="temperature-warning-line">335</span>
      </div>
      <div className="thermometer-copy">
        <span><Thermometer size={17} /> Core temperature</span>
        <strong>{temperature.toFixed(0)}<small>°C</small></strong>
        <em>{overheating ? 'Overheating — SCRAM advised' : 'Normal operating range'}</em>
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

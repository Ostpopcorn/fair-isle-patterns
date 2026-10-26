import { useEffect, useState } from 'preact/hooks';
import { store, type AppState, type Panel, type Screen, type View } from '../state/store';
import { Badge, tabKeys } from './components/common';
import { Header } from './Header';
import { IssuesPanel } from './IssuesPanel';
import { usePhone } from './layout';
import { Dialogs } from './dialogs/Dialogs';
import { BandsPanel } from './panels/BandsPanel';
import { MotifsPanel, MotifsScreen } from './panels/MotifsPanel';
import { ProjectPanel } from './panels/ProjectPanel';
import { ChartView } from './views/ChartView';
import { GaugeView } from './views/GaugeView';
import { MotifEditor } from './views/MotifEditor';
import { RoundView } from './views/RoundView';
import { handleKey } from './shortcuts';

const PANELS: { id: Panel; label: string }[] = [
  { id: 'project', label: 'Project' },
  { id: 'bands', label: 'Bands' },
  { id: 'motifs', label: 'Motifs' },
];

const VIEWS: { id: View; label: string; short: string }[] = [
  { id: 'motif', label: 'Motif editor', short: 'Motif' },
  { id: 'chart', label: 'Chart', short: 'Chart' },
  { id: 'gauge', label: 'Gauge preview', short: 'Gauge' },
  { id: 'round', label: 'In the round', short: 'Round' },
];

/** On phones the motif editor is in the Motifs screen instead. */
const PHONE_VIEWS = VIEWS.filter((v) => v.id !== 'motif');

const SCREENS: { id: Screen; label: string; icon: string }[] = [
  { id: 'project', label: 'Project', icon: '▤' },
  { id: 'bands', label: 'Bands', icon: '≡' },
  { id: 'motifs', label: 'Motifs', icon: '✎' },
  { id: 'view', label: 'View', icon: '▦' },
  { id: 'issues', label: 'Issues', icon: '⚑' },
];

function useAppState() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setTick((t) => t + 1));
    // Catch up with changes made before this effect ran.
    setTick((t) => t + 1);
    return unsubscribe;
  }, []);
  return store.get();
}

export function App() {
  const s = useAppState();
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  useEffect(() => {
    if (!s.ui.toast) return;
    const t = setTimeout(() => store.ui({ toast: null }), 4000);
    return () => clearTimeout(t);
  }, [s.ui.toast]);
  useEffect(() => {
    document.title = `${s.doc.meta.name || 'Untitled pattern'}${store.isDirty() ? ' •' : ''} — Fair Isle Pattern Builder`;
  });

  const phone = usePhone();

  return (
    <div class="app">
      <Header s={s} />
      {s.readOnly ? (
        <div class="banner" role="status">
          This file was written by a newer version of the format (version {s.doc.version}). It is open read-only: you can look at it and export it, but
          not change or save it.
        </div>
      ) : (
        <div />
      )}
      {phone ? <PhoneScreen s={s} /> : <Workspace s={s} />}
      {phone && <MobileNav screen={s.ui.screen} />}
      <Dialogs s={s} />
      {s.ui.toast && (
        <div class="toast" role="status">
          {s.ui.toast}
          <button aria-label="Dismiss" onClick={() => store.ui({ toast: null })}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** Wider layouts: the work areas, the view and the issues side by side. */
function Workspace({ s }: { s: AppState }) {
  const panel = {
    project: <ProjectPanel s={s} />,
    bands: <BandsPanel s={s} />,
    motifs: <MotifsPanel s={s} />,
  }[s.ui.panel];

  return (
    <div class="workspace">
      <section class="sidebar" aria-label="Work areas">
        <div class="tabs" role="tablist" aria-label="Work areas" onKeyDown={(e) => tabKeys(e, PANELS.map((p) => p.id), s.ui.panel, (id) => store.ui({ panel: id as Panel }))}>
          {PANELS.map((p) => (
            <button
              key={p.id}
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={s.ui.panel === p.id}
              aria-controls="work-panel"
              tabIndex={s.ui.panel === p.id ? 0 : -1}
              onClick={() => store.ui({ panel: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div id="work-panel" role="tabpanel" aria-labelledby={`tab-${s.ui.panel}`} style={{ display: 'contents' }}>
          {panel}
        </div>
      </section>
      <ViewArea s={s} views={VIEWS} current={s.ui.view} />
      <IssuesPanel s={s} />
    </div>
  );
}

/** Phones: the screen picked in the bottom bar. */
function PhoneScreen({ s }: { s: AppState }) {
  const screen = {
    project: (
      <section class="sidebar" aria-label="Project">
        <ProjectPanel s={s} />
      </section>
    ),
    bands: (
      <section class="sidebar" aria-label="Bands">
        <BandsPanel s={s} />
      </section>
    ),
    motifs: <MotifsScreen s={s} />,
    view: <ViewArea s={s} views={PHONE_VIEWS} current={s.ui.view === 'motif' ? 'chart' : s.ui.view} />,
    issues: <IssuesPanel s={s} />,
  }[s.ui.screen];
  return <div class="workspace">{screen}</div>;
}

/** A view picked from `views`, with the switch above it. */
function ViewArea({ s, views, current }: { s: AppState; views: typeof VIEWS; current: View }) {
  const view = {
    motif: <MotifEditor s={s} />,
    chart: <ChartView s={s} />,
    gauge: <GaugeView s={s} />,
    round: <RoundView s={s} />,
  }[current];

  return (
    <main class="main">
      <div class="view-bar">
        <div class="seg" role="tablist" aria-label="Views" onKeyDown={(e) => tabKeys(e, views.map((v) => v.id), current, (id) => store.ui({ view: id as View }))}>
          {views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-label={v.label}
              aria-selected={current === v.id}
              tabIndex={current === v.id ? 0 : -1}
              title={`${v.label} (Alt+${VIEWS.indexOf(v) + 1})`}
              onClick={() => store.ui({ view: v.id })}
            >
              <span class="long" aria-hidden="true">
                {v.label}
              </span>
              <span class="short" aria-hidden="true">
                {v.short}
              </span>
            </button>
          ))}
        </div>
        <span class="spacer" />
        {s.ui.issue && (
          <button class="btn small" onClick={() => store.ui({ issue: null })}>
            Clear highlight
          </button>
        )}
        <span class="small muted">{s.ui.grayscale ? 'Grayscale' : ''}</span>
      </div>
      <div class="view-body" role="region" aria-label={VIEWS.find((v) => v.id === current)?.label}>
        {view}
      </div>
    </main>
  );
}

/** Phones show one screen at a time, switched from a bottom bar. */
function MobileNav({ screen }: { screen: Screen }) {
  const issues = store.analysis().issues;
  const count = (severity: string) => issues.filter((i) => i.severity === severity).length;
  return (
    <nav class="mobile-nav" aria-label="Screens">
      {SCREENS.map((sc) => (
        <button key={sc.id} aria-current={screen === sc.id ? 'page' : undefined} onClick={() => store.ui({ screen: sc.id })}>
          <span aria-hidden="true" class="icon">
            {sc.icon}
          </span>
          <span>{sc.label}</span>
          {sc.id === 'issues' && (
            <span class="row" style={{ gap: '2px' }}>
              <Badge severity="error" count={count('error')} />
              <Badge severity="warning" count={count('warning')} />
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

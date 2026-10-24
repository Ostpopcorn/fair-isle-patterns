import { useState } from 'preact/hooks';
import type { Issue, Severity } from '../core/types';
import { suggestCastOn } from '../core';
import { store, type AppState } from '../state/store';
import { Badge } from './components/common';

const GROUPS: { severity: Severity; title: string }[] = [
  { severity: 'error', title: 'Errors' },
  { severity: 'warning', title: 'Warnings' },
  { severity: 'notice', title: 'Notices' },
];

function where(issue: Issue): string {
  const l = issue.location;
  const parts: string[] = [];
  if (l.row !== undefined) parts.push(`row ${l.row}`);
  if (l.band !== undefined) parts.push(`band ${l.band + 1}`);
  if (l.motif && !issue.message.includes(`"${l.motif}"`)) parts.push(`motif ${l.motif}`);
  if (l.mapping && !issue.message.includes(`"${l.mapping}"`)) parts.push(`mapping ${l.mapping}`);
  return parts.join(' · ');
}

/** Where selecting an issue should take the user. */
function reveal(issue: Issue, s: AppState): void {
  const l = issue.location;
  const chartIssue = l.row !== undefined && issue.severity !== 'error';
  if (chartIssue || ((l.band !== undefined) && issue.severity !== 'error')) {
    // Highlights are drawn on the chart.
    store.ui({ issue, view: 'chart', bandIndex: l.band ?? s.ui.bandIndex, screen: 'view' });
  } else if (l.motif && l.mapping && l.band === undefined) {
    // A problem inside one of a motif's mappings.
    store.ui({ issue, panel: 'motifs', motifId: l.motif, mappingId: l.mapping, screen: 'edit' });
  } else if (l.motif && (issue.code === 'E004' || issue.code === 'E005' || issue.code === 'E008')) {
    store.ui({ issue, panel: 'motifs', motifId: l.motif, view: 'motif', screen: 'view' });
  } else if (l.band !== undefined) {
    store.ui({ issue, panel: 'bands', bandIndex: l.band, screen: 'edit' });
  } else if (l.color || l.path?.startsWith('palette')) {
    store.ui({ issue, panel: 'palette', screen: 'edit' });
  } else if (l.path?.startsWith('gauge') || l.path?.startsWith('cast_on') || l.path?.startsWith('settings')) {
    store.ui({ issue, panel: 'project', screen: 'edit' });
  } else if (l.motif) {
    store.ui({ issue, panel: 'motifs', motifId: l.motif, screen: 'edit' });
  } else {
    store.ui({ issue });
  }
}

export function IssuesPanel({ s }: { s: AppState }) {
  const { issues } = store.analysis();
  const [open, setOpen] = useState<Record<Severity, boolean>>({ error: true, warning: true, notice: false });
  const suggestions = issues.some((i) => i.code === 'W103') ? suggestCastOn(s.doc) : [];
  const selected = s.ui.issue;
  const same = (a: Issue, b: Issue | null) => !!b && a.code === b.code && a.message === b.message && JSON.stringify(a.location) === JSON.stringify(b.location);

  return (
    <aside class="issues" aria-label="Issues">
      <div class="view-bar">
        <h2>Issues</h2>
        <span class="spacer" />
        <Badge severity="error" count={issues.filter((i) => i.severity === 'error').length} />
        <Badge severity="warning" count={issues.filter((i) => i.severity === 'warning').length} />
        <Badge severity="notice" count={issues.filter((i) => i.severity === 'notice').length} />
      </div>
      <div class="panel" style={{ gap: '6px' }}>
        {issues.length === 0 && <div class="empty">No issues. The pattern follows every check.</div>}
        {suggestions.length > 0 && (
          <div class="card">
            <strong class="small">The cast-on does not fit every motif</strong>
            <div class="row wrap">
              {suggestions.map((n) => (
                <button key={n} class="btn small primary" disabled={s.readOnly} onClick={() => store.edit((d) => ({ ...d, cast_on: n }))}>
                  Set cast-on to {n}
                </button>
              ))}
            </div>
          </div>
        )}
        {GROUPS.map(({ severity, title }) => {
          const list = issues.filter((i) => i.severity === severity);
          if (!list.length) return null;
          return (
            <details
              key={severity}
              class="issue-group"
              open={open[severity]}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                if (isOpen !== open[severity]) setOpen({ ...open, [severity]: isOpen });
              }}
            >
              <summary>
                {title} <Badge severity={severity} count={list.length} />
              </summary>
              <div class="list">
                {list.map((issue, i) => (
                  <button key={i} class={`issue ${severity}`} aria-current={same(issue, selected)} onClick={() => (same(issue, selected) ? store.ui({ issue: null }) : reveal(issue, s))}>
                    <span>
                      <span class="code">{issue.code}</span>
                      {issue.message}
                    </span>
                    {where(issue) && <span class="small muted">{where(issue)}</span>}
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </aside>
  );
}

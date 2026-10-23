import { useEffect, useState } from 'preact/hooks';
import type { PatternDoc } from '../../core/types';
import type { RenameResult } from '../../model/doc';
import { store } from '../../state/store';

/** Edits an id; references follow on commit (Enter or leaving the field). */
export function IdField(props: {
  label: string;
  value: string;
  rename: (doc: PatternDoc, oldId: string, newId: string) => RenameResult;
  onRenamed?: (newId: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(props.value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(props.value);
    setError(null);
  }, [props.value]);

  const commit = () => {
    const next = text.trim();
    if (next === props.value) return setError(null);
    const result = props.rename(store.get().doc, props.value, next);
    if ('error' in result) return setError(result.error);
    setError(null);
    store.edit(() => result.doc);
    props.onRenamed?.(next);
  };

  return (
    <label class="field">
      <span>{props.label}</span>
      <input
        type="text"
        class="mono"
        value={text}
        disabled={props.disabled}
        aria-invalid={error ? 'true' : undefined}
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setText(props.value);
            setError(null);
          }
        }}
      />
      {error && (
        <span role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </span>
      )}
    </label>
  );
}

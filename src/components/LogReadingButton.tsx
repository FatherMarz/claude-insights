import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { postCreditLogEntry, postUsageLogEntry } from '../api.ts';

const dialogStyle: React.CSSProperties = {
  background: '#1a1714',
  border: '1px solid rgba(232, 226, 214, 0.22)',
  borderRadius: 4,
  color: '#e8e2d6',
  padding: 0,
  minWidth: 320,
};

const dialogContentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 20,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 4,
  padding: '6px 8px',
  background: '#14110f',
  border: '1px solid rgba(232, 226, 214, 0.22)',
  borderRadius: 3,
  color: '#e8e2d6',
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  fontSize: 12,
  boxSizing: 'border-box',
};

const cancelButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(232, 226, 214, 0.22)',
  borderRadius: 3,
  color: '#e8e2d6',
  padding: '6px 12px',
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  fontSize: 11,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  background: '#5dd66c',
  border: 'none',
  borderRadius: 3,
  color: '#14110f',
  padding: '6px 12px',
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

const triggerButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
};

interface LogReadingButtonProps {
  latestPercent: number | null;
}

export function LogReadingButton({ latestPercent }: LogReadingButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [percentInput, setPercentInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [dollarsInput, setDollarsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const showDollarField = (latestPercent ?? 0) >= 100;

  function open() {
    setError(null);
    setPercentInput('');
    setNoteInput('');
    setDollarsInput('');
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const hasPercent = percentInput.trim() !== '';
    const hasDollars = showDollarField && dollarsInput.trim() !== '';

    if (!hasPercent && !hasDollars) {
      setError(
        showDollarField ? 'Enter a percent or a dollar amount' : 'Enter a number between 0 and 100'
      );
      return;
    }

    let percent = NaN;
    if (hasPercent) {
      percent = Number(percentInput);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        setError('Percent must be between 0 and 100');
        return;
      }
    }

    let dollars = NaN;
    if (hasDollars) {
      dollars = Number(dollarsInput);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setError('Dollars must be a positive number');
        return;
      }
    }

    const note = noteInput.trim() || undefined;
    const results = await Promise.allSettled([
      hasPercent ? postUsageLogEntry({ percent, note }) : Promise.resolve(null),
      hasDollars ? postCreditLogEntry({ dollars, note }) : Promise.resolve(null),
    ]);
    const [percentResult, dollarsResult] = results;
    if (hasPercent && percentResult.status === 'fulfilled') {
      qc.invalidateQueries({ queryKey: ['usage-log-config'] });
    }
    if (hasDollars && dollarsResult.status === 'fulfilled') {
      qc.invalidateQueries({ queryKey: ['credit-log'] });
    }
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failures.length === 0) {
      close();
      return;
    }
    setError(
      failures
        .map((f) => (f.reason instanceof Error ? f.reason.message : 'failed to save'))
        .join('; ')
    );
  }

  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialog.current) dialog.current?.close();
  }

  return (
    <>
      <button type="button" onClick={open} style={triggerButtonStyle}>
        + Log reading
      </button>
      <dialog ref={dialog} style={dialogStyle} onClick={handleClick}>
        <form onSubmit={submit} style={dialogContentStyle}>
          <h3 className="card-title" style={{ margin: 0 }}>Log a reading</h3>
          <p className="card-sub" style={{ marginTop: 4 }}>
            Read the % from Claude Code's status display. Slash command:{' '}
            <code>/log-usage 47</code>.
          </p>
          {showDollarField && (
            <p className="card-sub" style={{ marginTop: 0, color: '#f4a627' }}>
              You're at or past 100% — percent is optional, just log credits below.
            </p>
          )}
          <label style={{ fontSize: 11, color: '#80796d' }}>
            Percent (0–100){showDollarField && <span style={{ opacity: 0.6 }}> · optional</span>}
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              required={!showDollarField}
              style={inputStyle}
              autoFocus={!showDollarField}
            />
          </label>
          {showDollarField && (
            <label style={{ fontSize: 11, color: '#80796d' }}>
              Credits purchased ($)
              <input
                type="number"
                min={0}
                step="0.01"
                value={dollarsInput}
                onChange={(e) => setDollarsInput(e.target.value)}
                placeholder="e.g. 25.00"
                style={inputStyle}
                autoFocus
              />
            </label>
          )}
          <label style={{ fontSize: 11, color: '#80796d' }}>
            Note (optional)
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="e.g. after long Cabreza session"
              style={inputStyle}
            />
          </label>
          {error && <div style={{ color: '#d94f4f', fontSize: 11 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={close} style={cancelButtonStyle}>
              Cancel
            </button>
            <button type="submit" style={primaryButtonStyle}>
              Log reading
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

import { CHIP_STYLES, type Denomination } from '../lib/chips';

interface ChipButtonProps {
  denom: Denomination;
  disabled: boolean;
  onClick: () => void;
}

export function ChipButton({ denom, disabled, onClick }: ChipButtonProps) {
  const style = CHIP_STYLES[denom];
  return (
    <button
      type="button"
      className="chip"
      disabled={disabled}
      onClick={onClick}
      /* A chip can be clicked or dragged onto the betting circle. The drag
         carries its denomination so the circle knows what landed on it; click
         stays as the quicker path and as the keyboard route. */
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(denom));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      aria-label={`Bet ${denom}`}
      style={{ background: style.face, borderColor: style.rim, color: style.label }}
    >
      {denom}
    </button>
  );
}

interface ChipStackProps {
  chips: Denomination[];
}

/** The wagered chips, stacked outside the betting circle. Last 14 only. */
export function ChipStack({ chips }: ChipStackProps) {
  const visible = chips.slice(-14);
  const offset = chips.length - visible.length;

  return (
    <div className="chip-stack" aria-hidden="true">
      {visible.map((denom, i) => (
        <div
          // keyed by position in the whole run, so existing chips never re-animate
          key={offset + i}
          className="chip-stack__chip"
          style={{ background: CHIP_STYLES[denom].face, borderColor: CHIP_STYLES[denom].rim }}
        />
      ))}
    </div>
  );
}

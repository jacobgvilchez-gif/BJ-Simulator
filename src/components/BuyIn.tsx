import { BUY_INS } from '../lib/chips';
import { money } from '../lib/format';

interface BuyInProps {
  amount: number;
  canRaise: boolean;
  canLower: boolean;
  onStep: (delta: number) => void;
  onBuyIn: () => void;
}

/**
 * Cashier buy-in wheel. The amount steps through the ladder by mouse wheel,
 * arrow keys, or the two rockers, so buying in is a decision the player makes
 * rather than a fixed top-up they can only repeat.
 */
export function BuyIn({ amount, canRaise, canLower, onStep, onBuyIn }: BuyInProps) {
  return (
    <div
      className="buyin"
      // Scrolling away from the reader raises the amount, the way a dial turns.
      onWheel={(e) => onStep(e.deltaY < 0 ? 1 : -1)}
    >
      <button
        type="button"
        className="buyin__rocker"
        disabled={!canLower}
        aria-label="Lower buy-in"
        onClick={() => onStep(-1)}
      >
        −
      </button>

      <div
        className="buyin__dial"
        role="spinbutton"
        tabIndex={0}
        aria-label="Buy-in amount"
        aria-valuenow={amount}
        aria-valuetext={money(amount)}
        aria-valuemin={BUY_INS[0]}
        aria-valuemax={BUY_INS[BUY_INS.length - 1]}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onStep(1);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onStep(-1);
          }
        }}
      >
        <span className="buyin__label">Buy in</span>
        <span className="buyin__amount">{money(amount)}</span>
      </div>

      <button
        type="button"
        className="buyin__rocker"
        disabled={!canRaise}
        aria-label="Raise buy-in"
        onClick={() => onStep(1)}
      >
        +
      </button>

      <button type="button" className="pill pill--buyin" onClick={onBuyIn}>
        Buy in
      </button>
    </div>
  );
}

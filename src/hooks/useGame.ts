import { useCallback, useReducer, useState } from 'react';
import { Game } from '../engine/engine';
import { DENOMINATIONS, type Denomination } from '../lib/chips';

const INITIAL_PENDING: Denomination[] = [25];
const CASHIER_AMOUNT = 500;

/**
 * Owns the single Game instance. Per the handoff the engine holds all game
 * state and the UI owns only the pending chip array; every action mutates the
 * engine in place and then forces a re-render.
 *
 * The instance lives in state rather than a ref: it is read during render, and
 * refs read during render are not safe under concurrent rendering. Lazy
 * initialisation keeps it to exactly one Game for the life of the component.
 */
export function useGame() {
  const [game] = useState(() => new Game());
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [pending, setPending] = useState<Denomination[]>(INITIAL_PENDING);

  /** Run an engine mutation, then re-render. */
  const act = useCallback(
    (fn: (g: Game) => unknown) => {
      fn(game);
      bump();
    },
    [game],
  );

  const pendingTotal = pending.reduce((sum, d) => sum + d, 0);
  /** The wager is the chip sum, clamped to what the player can actually cover. */
  const wager = Math.min(pendingTotal, game.balance);
  const isBettingPhase = game.phase === 'betting' || game.phase === 'settled';

  const addChip = useCallback((denom: Denomination) => {
    setPending((prev) => [...prev, denom]);
  }, []);

  const clearBet = useCallback(() => setPending([]), []);

  const canAddChip = useCallback(
    (denom: Denomination) => isBettingPhase && pendingTotal + denom <= game.balance,
    [isBettingPhase, pendingTotal, game.balance],
  );

  return {
    game,
    pending,
    wager,
    pendingTotal,
    isBettingPhase,
    canDeal: isBettingPhase && wager > 0 && wager <= game.balance,
    denominations: DENOMINATIONS,
    addChip,
    canAddChip,
    clearBet,
    deal: useCallback(() => act((g) => g.deal(wager)), [act, wager]),
    hit: useCallback(() => act((g) => g.hit()), [act]),
    stand: useCallback(() => act((g) => g.stand()), [act]),
    double: useCallback(() => act((g) => g.double()), [act]),
    split: useCallback(() => act((g) => g.split()), [act]),
    takeInsurance: useCallback((take: boolean) => act((g) => g.takeInsurance(take)), [act]),
    cashier: useCallback(() => act((g) => g.deposit(CASHIER_AMOUNT)), [act]),
    cashierAmount: CASHIER_AMOUNT,
  };
}

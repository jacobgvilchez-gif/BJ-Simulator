import { useCallback, useEffect, useReducer, useState } from 'react';
import { Game } from '../engine/engine';
import {
  BUY_INS,
  DEFAULT_BUY_IN,
  DENOMINATIONS,
  type BuyIn,
  type Denomination,
} from '../lib/chips';

const INITIAL_PENDING: Denomination[] = [25];

/** Cards in an opening deal: player, dealer up, player, dealer hole. */
const OPENING_CARDS = 4;

/**
 * Beat between the four opening cards. Quick — a dealer pitches these in a
 * steady rhythm — but slow enough that each card reads as its own.
 */
const DEAL_BEAT_MS = 250;

/**
 * Beat between the dealer's own draws. Longer than --motion-flip (0.3s) so the
 * hole card finishes turning over before the next card slides in.
 */
const DEALER_BEAT_MS = 450;

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
  const [game] = useState(() => new Game({ pacedDealer: true }));
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [pending, setPending] = useState<Denomination[]>(INITIAL_PENDING);
  const [buyIn, setBuyIn] = useState<BuyIn>(DEFAULT_BUY_IN);
  /**
   * How many opening cards are face up so far. The engine deals all four at
   * once; this only paces how they appear. Resting at OPENING_CARDS means the
   * deal is complete, so there is no separate "idle" value to reset to.
   */
  const [dealt, setDealt] = useState(OPENING_CARDS);

  /** Run an engine mutation, then re-render. */
  const act = useCallback(
    (fn: (g: Game) => unknown) => {
      fn(game);
      bump();
    },
    [game],
  );

  // Read as plain locals so the effects below depend on values, not on reaching
  // through the mutable engine instance.
  const phase = game.phase;
  const dealerCards = game.dealer.length;
  const isDealing = dealt < OPENING_CARDS;

  /**
   * Lay the opening cards out one at a time. The chain ends on its own once
   * dealt reaches OPENING_CARDS, so the effect never has to reset state.
   */
  useEffect(() => {
    if (dealt >= OPENING_CARDS) return;
    const id = window.setTimeout(() => setDealt((n) => n + 1), DEAL_BEAT_MS);
    return () => window.clearTimeout(id);
  }, [dealt]);

  /**
   * Deal the dealer's hand one card at a time. pacedDealer leaves the round at
   * phase 'dealer', so each beat draws a single card; the last step settles and
   * moves the phase on, which ends the chain. Drawing a card changes
   * dealerCards, which re-runs this and schedules the next beat.
   */
  useEffect(() => {
    if (phase !== 'dealer') return;
    const id = window.setTimeout(() => {
      game.dealerStep();
      bump();
    }, DEALER_BEAT_MS);
    return () => window.clearTimeout(id);
  }, [game, phase, dealerCards]);

  const pendingTotal = pending.reduce((sum, d) => sum + d, 0);
  /** The wager is the chip sum, clamped to what the player can actually cover. */
  const wager = Math.min(pendingTotal, game.balance);
  const isBettingPhase = phase === 'betting' || phase === 'settled';

  const addChip = useCallback((denom: Denomination) => {
    setPending((prev) => [...prev, denom]);
  }, []);

  const clearBet = useCallback(() => setPending([]), []);

  const canAddChip = useCallback(
    (denom: Denomination) => isBettingPhase && pendingTotal + denom <= game.balance,
    [isBettingPhase, pendingTotal, game.balance],
  );

  /** Move the buy-in wheel by whole rungs, stopping at either end. */
  const stepBuyIn = useCallback((delta: number) => {
    setBuyIn((prev) => {
      const i = BUY_INS.indexOf(prev);
      const next = Math.min(BUY_INS.length - 1, Math.max(0, i + delta));
      return BUY_INS[next];
    });
  }, []);

  const buyInIndex = BUY_INS.indexOf(buyIn);

  const deal = useCallback(() => {
    act((g) => g.deal(wager));
    setDealt(1); // first card is already on the felt; the rest follow on beats
  }, [act, wager]);

  return {
    game,
    pending,
    wager,
    pendingTotal,
    isBettingPhase,
    /** True while the four opening cards are still being laid out. */
    isDealing,
    /** True while the dealer is turning its own cards over and the round is unsettled. */
    isDealerDrawing: phase === 'dealer',
    /**
     * How many cards of each hand to render. Infinity once the opening deal is
     * complete, so slice() simply returns everything.
     */
    playerVisible: isDealing ? Math.ceil(dealt / 2) : Infinity,
    dealerVisible: isDealing ? Math.floor(dealt / 2) : Infinity,
    canDeal: isBettingPhase && !isDealing && wager > 0 && wager <= game.balance,
    denominations: DENOMINATIONS,
    addChip,
    canAddChip,
    clearBet,
    deal,
    hit: useCallback(() => act((g) => g.hit()), [act]),
    stand: useCallback(() => act((g) => g.stand()), [act]),
    double: useCallback(() => act((g) => g.double()), [act]),
    split: useCallback(() => act((g) => g.split()), [act]),
    takeInsurance: useCallback((take: boolean) => act((g) => g.takeInsurance(take)), [act]),
    // Cashier
    buyIn,
    buyIns: BUY_INS,
    stepBuyIn,
    canRaiseBuyIn: buyInIndex < BUY_INS.length - 1,
    canLowerBuyIn: buyInIndex > 0,
    cashier: useCallback(() => act((g) => g.deposit(buyIn)), [act, buyIn]),
  };
}

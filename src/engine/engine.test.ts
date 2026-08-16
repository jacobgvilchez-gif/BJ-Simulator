import { describe, it, expect } from 'vitest';
import {
  Game,
  buildDeck,
  shuffle,
  handValue,
  isNatural,
  basicStrategy,
  dealerShouldHit,
  seededRNG,
  simulate,
  rankOf,
  suitOf,
  cardLabel,
  RANK_VALUE,
  type Card,
  type RNG,
} from './engine';

/* --- deterministic scenario harness -----------------------------------
   shuffle() picks j = (rnd() * (i + 1)) | 0. An RNG pinned just below 1
   always yields j === i, making the Fisher-Yates pass a no-op. That lets a
   test stack the deck exactly and still exercise the real deal() path. */
const IDENTITY_RNG: RNG = () => 0.999999999;

/* Rank indices, named in full. RANKS is A,2,3,4,5,6,7,8,9,10,J,Q,K, so the
   index and the printed face differ — index 8 is a NINE. Always use these. */
const ACE = 0;
const TWO = 1;
const THREE = 2;
const FOUR = 3;
const FIVE = 4;
const SIX = 5;
const SEVEN = 6;
const EIGHT = 7;
const NINE = 8;
const TEN = 9;
const JACK = 10;
const QUEEN = 11;
const KING = 12;

const S = (rank: number): Card => rank; // spades
const H = (rank: number): Card => 13 + rank; // hearts
const D = (rank: number): Card => 26 + rank; // diamonds

/** A Game whose next deal comes off the top of `top`, in order. */
function stacked(top: Card[], opts: { balance?: number } = {}): Game {
  if (new Set(top).size !== top.length) {
    throw new Error('stacked() was given the same card twice — fix the scenario');
  }
  const g = new Game({ rng: IDENTITY_RNG, balance: opts.balance ?? 1000 });
  const rest = buildDeck().filter((c) => !top.includes(c));
  g.deck = [...top, ...rest];
  return g;
}

/** deal() draws player, dealer, player, dealer. */
function order(p1: Card, d1: Card, p2: Card, d2: Card): Card[] {
  return [p1, d1, p2, d2];
}

/** Drive a Game to settlement with basic strategy. */
function playBasicStrategy(g: Game): void {
  if (g.phase === 'insurance') g.takeInsurance(false);
  let guard = 0;
  while (g.phase === 'player' && guard++ < 50) {
    const h = g.current();
    if (!h) break;
    const legal = g.legal();
    const move = basicStrategy(h.cards, g.dealer[0], legal.double, legal.split);
    if (move === 'P' && legal.split) g.split();
    else if (move === 'D' && legal.double) g.double();
    else if (move === 'S') g.stand();
    else if (legal.hit) g.hit();
    else g.stand();
  }
}

describe('scenario harness', () => {
  it('leaves deck order untouched, so stacked scenarios are exact', () => {
    const d = buildDeck();
    const before = [...d];
    shuffle(d, IDENTITY_RNG);
    expect(d).toEqual(before);
  });

  it('refuses a scenario that stacks the same card twice', () => {
    expect(() => stacked([S(ACE), S(ACE)])).toThrow(/same card twice/);
  });
});

describe('deck', () => {
  it('enumerates 4 suits x 13 ranks with no duplicates', () => {
    const d = buildDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
    const ranks = new Array(13).fill(0);
    const suits = new Array(4).fill(0);
    for (const c of d) {
      ranks[rankOf(c)]++;
      suits[suitOf(c)]++;
    }
    expect(ranks).toEqual(new Array(13).fill(4));
    expect(suits).toEqual(new Array(4).fill(13));
  });

  it('shuffles by permutation, never by resampling', () => {
    const rnd = seededRNG(7);
    for (let i = 0; i < 200; i++) {
      expect(new Set(shuffle(buildDeck(), rnd)).size).toBe(52);
    }
  });
});

describe('handValue', () => {
  it('counts aces as 11 then demotes while over 21', () => {
    expect(handValue([S(ACE), S(KING)])).toEqual({ total: 21, soft: true });
    expect(handValue([S(ACE), H(ACE)])).toEqual({ total: 12, soft: true });
    expect(handValue([S(ACE), S(NINE), S(FIVE)])).toEqual({ total: 15, soft: false });
    expect(handValue([S(ACE), H(ACE), D(ACE)])).toEqual({ total: 13, soft: true });
  });

  it('tracks softness explicitly', () => {
    expect(handValue([S(ACE), S(SIX)]).soft).toBe(true);
    expect(handValue([S(TEN), S(SIX)]).soft).toBe(false);
  });

  it('treats a natural as exactly two cards totalling 21', () => {
    expect(isNatural([S(ACE), S(KING)])).toBe(true);
    expect(isNatural([S(ACE), S(SIX), S(FOUR)])).toBe(false);
  });
});

describe('dealer rules', () => {
  it('stands on all 17 including soft 17', () => {
    expect(dealerShouldHit([S(ACE), S(SIX)])).toBe(false);
    expect(dealerShouldHit([S(TEN), S(SEVEN)])).toBe(false);
    expect(dealerShouldHit([S(TEN), S(SIX)])).toBe(true);
  });

  it('stands on a dealt soft 17 rather than drawing', () => {
    // player 17, dealer A+6; dealer must not improve, so the round pushes
    const g = stacked(order(S(TEN), H(ACE), S(SEVEN), H(SIX)));
    g.deal(50);
    expect(g.phase).toBe('insurance');
    g.takeInsurance(false);
    g.stand();
    expect(g.dealer).toHaveLength(2);
    expect(handValue(g.dealer)).toEqual({ total: 17, soft: true });
    expect(g.roundResults[0].outcome).toBe('push');
  });

  it('does not draw when every player hand has busted', () => {
    const g = stacked([...order(S(TEN), H(TEN), S(SIX), H(SIX)), S(KING)]);
    g.deal(10);
    expect(g.phase).toBe('player');
    g.hit(); // 10 + 6 + K = 26
    expect(g.phase).toBe('settled');
    expect(g.dealer).toHaveLength(2);
    expect(g.roundResults[0].outcome).toBe('bust');
  });
});

describe('naturals', () => {
  it('pays 3:2 and settles with no player action reachable', () => {
    const g = stacked(order(S(ACE), H(SEVEN), S(KING), D(SEVEN)), { balance: 500 });
    expect(g.deal(100)).toBe(true);
    expect(g.phase).toBe('settled');
    expect(g.roundResults[0].outcome).toBe('blackjack');
    expect(g.roundResults[0].delta).toBe(150);
    expect(g.balance).toBe(650); // 500 - 100 + 250
  });

  it('pushes when both sides hold a natural', () => {
    // dealer upcard is the king, so this resolves without an insurance detour
    const g = stacked(order(S(ACE), H(KING), S(KING), H(ACE)), { balance: 500 });
    g.deal(100);
    expect(g.roundResults[0].outcome).toBe('push');
    expect(g.balance).toBe(500);
  });

  it('rejects every action once a natural has settled the round', () => {
    const g = stacked(order(S(ACE), H(SEVEN), S(KING), D(SEVEN)));
    g.deal(50);
    expect(g.hit()).toBe(false);
    expect(g.stand()).toBe(false);
    expect(g.double()).toBe(false);
    expect(g.split()).toBe(false);
  });
});

describe('insurance', () => {
  it('is offered only on a dealer ace', () => {
    const g = stacked(order(S(TEN), H(ACE), S(SEVEN), D(SEVEN)));
    g.deal(100);
    expect(g.phase).toBe('insurance');
  });

  it('cannot be taken when the dealer shows no ace', () => {
    const g = stacked(order(S(TEN), H(SEVEN), S(SEVEN), D(SEVEN)));
    g.deal(100);
    expect(g.phase).toBe('player');
    expect(g.takeInsurance(true)).toBe(false);
  });

  it('costs half the bet and pays 2:1 against a dealer natural', () => {
    const g = stacked(order(S(TEN), H(ACE), S(SEVEN), H(KING)), { balance: 500 });
    g.deal(100); // 400
    g.takeInsurance(true); // 350
    expect(g.insuranceResult).toBe('won');
    // main bet lost (-100), insurance returns 50 stake + 100 profit
    expect(g.balance).toBe(500);
    expect(g.roundNet).toBe(0);
  });

  it('loses the premium when the dealer has no natural', () => {
    const g = stacked(order(S(TEN), H(ACE), S(SEVEN), H(SEVEN)), { balance: 500 });
    g.deal(100);
    g.takeInsurance(true);
    expect(g.phase).toBe('player'); // not resolved yet
    g.stand();
    expect(g.insuranceResult).toBe('lost');
    expect(g.roundNet).toBe(-150); // -100 hand, -50 premium
  });
});

describe('double', () => {
  it('draws exactly one card and doubles the bet', () => {
    const g = stacked([...order(S(SIX), H(TEN), S(FIVE), H(SIX)), S(TEN)], { balance: 500 });
    g.deal(50);
    expect(g.legal().double).toBe(true);
    expect(g.double()).toBe(true);
    expect(g.hands[0].cards).toHaveLength(3);
    expect(g.hands[0].bet).toBe(100);
    expect(g.hands[0].doubled).toBe(true);
    expect(g.phase).toBe('settled');
  });

  it('is refused without balance to match, with a reason', () => {
    const g = stacked(order(S(SIX), H(TEN), S(FIVE), H(SIX)), { balance: 50 });
    g.deal(50); // balance now 0
    const legal = g.legal();
    expect(legal.double).toBe(false);
    expect(legal.why.double).toBe('Not enough balance to match the bet');
    expect(g.double()).toBe(false);
  });

  it('is refused after a hit, with a reason', () => {
    const g = stacked([...order(S(THREE), H(TEN), S(FOUR), H(SIX)), S(FIVE)], { balance: 500 });
    g.deal(50);
    g.hit();
    expect(g.legal().why.double).toBe('Double is first two cards only');
  });
});

describe('split', () => {
  it('requires two matching ranks — K+Q does not qualify', () => {
    const g = stacked(order(S(KING), H(SEVEN), S(QUEEN), H(SIX)));
    g.deal(50);
    const legal = g.legal();
    expect(legal.split).toBe(false);
    expect(legal.why.split).toBe('Split needs two matching ranks');
    expect(g.split()).toBe(false);
  });

  it('splits a matching pair into two independently bet hands', () => {
    const g = stacked([...order(S(EIGHT), H(TEN), H(EIGHT), D(SIX)), S(TWO), S(THREE)], {
      balance: 500,
    });
    g.deal(50);
    expect(g.legal().split).toBe(true);
    expect(g.split()).toBe(true);
    expect(g.hands).toHaveLength(2);
    expect(g.hands.map((h) => h.bet)).toEqual([50, 50]);
    expect(g.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(g.balance).toBe(400); // both bets now committed
  });

  it('is offered once only — no re-splitting', () => {
    // the active hand draws another eight, so the refusal is genuinely about re-splitting
    const g = stacked([...order(S(EIGHT), H(TEN), H(EIGHT), D(SIX)), D(EIGHT), S(TWO)], {
      balance: 500,
    });
    g.deal(50);
    g.split();
    expect(rankOf(g.hands[0].cards[0])).toBe(rankOf(g.hands[0].cards[1]));
    const legal = g.legal();
    expect(legal.split).toBe(false);
    expect(legal.why.split).toBe('Re-splitting is not offered');
  });

  it('gives split aces one card each and refuses further hits', () => {
    const g = stacked([...order(S(ACE), H(SEVEN), H(ACE), D(SEVEN)), S(FIVE), S(SIX)], {
      balance: 500,
    });
    g.deal(50);
    expect(g.legal().split).toBe(true);
    g.split();
    expect(g.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(g.hands.every((h) => h.splitAce)).toBe(true);
    expect(g.phase).toBe('settled'); // both hands auto-complete
    expect(g.hit()).toBe(false);
  });

  it('scores 21 on a split ace as a plain win, not a blackjack', () => {
    // A/A split, each drawing a ten; dealer 7+7 then busts on a king
    const g = stacked(
      [...order(S(ACE), H(SEVEN), H(ACE), D(SEVEN)), S(KING), D(KING), H(KING)],
      { balance: 500 },
    );
    g.deal(100);
    g.split();
    expect(handValue(g.hands[0].cards).total).toBe(21);
    expect(handValue(g.dealer).total).toBeGreaterThan(21);
    expect(g.roundResults[0].outcome).toBe('win');
    expect(g.roundResults[0].delta).toBe(100); // 1:1, not 150
  });
});

describe('adversarial input', () => {
  it('refuses a zero or negative bet', () => {
    const g = new Game({ rng: seededRNG(1) });
    expect(g.deal(0)).toBe(false);
    expect(g.deal(-25)).toBe(false);
    expect(g.phase).toBe('betting');
  });

  it('refuses a bet larger than the balance', () => {
    const g = new Game({ rng: seededRNG(1), balance: 100 });
    expect(g.deal(101)).toBe(false);
    expect(g.balance).toBe(100);
  });

  it('refuses every action before a deal', () => {
    const g = new Game({ rng: seededRNG(1) });
    expect(g.hit()).toBe(false);
    expect(g.stand()).toBe(false);
    expect(g.double()).toBe(false);
    expect(g.split()).toBe(false);
    expect(g.takeInsurance(true)).toBe(false);
    expect(g.legal()).toMatchObject({ hit: false, stand: false, double: false, split: false });
  });

  it('refuses a second deal mid-hand and leaves the balance alone', () => {
    const g = stacked(order(S(SIX), H(TEN), S(FIVE), H(SIX)));
    g.deal(50);
    expect(g.phase).toBe('player');
    const before = g.balance;
    expect(g.deal(50)).toBe(false);
    expect(g.balance).toBe(before);
  });

  it('never drives the balance negative across a long session', () => {
    const g = new Game({ rng: seededRNG(99), balance: 500 });
    let lowest = Infinity;
    for (let i = 0; i < 3000; i++) {
      if (g.balance < 10) g.deposit(500);
      g.deal(10);
      playBasicStrategy(g);
      if (g.balance < lowest) lowest = g.balance;
    }
    expect(lowest).toBeGreaterThanOrEqual(0);
  });
});

describe('bankroll invariant', () => {
  it('holds deposits + sum(log.net) === balance at every settled point', () => {
    const g = new Game({ rng: seededRNG(4242), balance: 500 });
    let breaks = 0;
    let unsettled = 0;
    for (let i = 0; i < 4000; i++) {
      if (g.balance < 25) g.deposit(500);
      g.deal(25);
      playBasicStrategy(g);
      if (g.phase !== 'settled') unsettled++;
      if (!g.stats().reconciles) breaks++;
    }
    expect(unsettled).toBe(0);
    expect(breaks).toBe(0);
    const stats = g.stats();
    expect(stats.hands).toBeGreaterThan(4000); // a split logs two rows
    expect(g.deposits + stats.net).toBeCloseTo(g.balance, 9);
  });

  it('survives deposits taken mid-session', () => {
    const g = new Game({ rng: seededRNG(31337), balance: 100 });
    let breaks = 0;
    for (let i = 0; i < 500; i++) {
      g.deposit(500);
      g.deal(50);
      playBasicStrategy(g);
      if (!g.stats().reconciles) breaks++;
    }
    expect(breaks).toBe(0);
  });

  it('is legitimately false mid-hand, before a log row exists', () => {
    const g = stacked(order(S(SIX), H(TEN), S(FIVE), H(SIX)), { balance: 500 });
    g.deal(50);
    expect(g.phase).toBe('player');
    expect(g.stats().reconciles).toBe(false); // wager already deducted
    g.stand();
    expect(g.stats().reconciles).toBe(true);
  });
});

describe('deck integrity across play', () => {
  it('deals no duplicate card within a hand over 20,000 hands', () => {
    const g = new Game({ rng: seededRNG(2024), balance: 1000 });
    let duplicates = 0;
    let outOfRange = 0;
    for (let i = 0; i < 20000; i++) {
      if (g.balance < 10) g.deposit(1000);
      g.deal(10);
      playBasicStrategy(g);
      const seen: Card[] = [...g.dealer];
      for (const h of g.hands) seen.push(...h.cards);
      if (new Set(seen).size !== seen.length) duplicates++;
      for (const c of seen) if (c < 0 || c > 51 || !Number.isInteger(c)) outOfRange++;
    }
    expect(duplicates).toBe(0);
    expect(outOfRange).toBe(0);
  });
});

describe('statistical properties (seeded, 200k rounds)', () => {
  // Tolerances are wider than the handoff's 2M-hand figures because this runs
  // 200k rounds to stay inside a sane CI budget. Seeded, so it cannot flake.
  const r = simulate(200_000, { rng: seededRNG(20260816) });

  it('deals every rank at close to 1/13', () => {
    for (const f of r.rankFreq) expect(Math.abs(f - 1 / 13)).toBeLessThan(0.005);
  });

  it('deals every suit at close to 1/4', () => {
    for (const f of r.suitFreq) expect(Math.abs(f - 0.25)).toBeLessThan(0.002);
  });

  it('produces player naturals near 4.8%', () => {
    expect(r.naturalRate).toBeGreaterThan(0.044);
    expect(r.naturalRate).toBeLessThan(0.053);
  });

  it('produces a push rate in the 8-9% band', () => {
    expect(r.pushRate).toBeGreaterThan(0.074);
    expect(r.pushRate).toBeLessThan(0.093);
  });

  it('has a per-hand standard deviation near 1.14 units', () => {
    expect(r.stdDev).toBeGreaterThan(1.09);
    expect(r.stdDev).toBeLessThan(1.19);
  });

  it('has a house edge near zero under these rules', () => {
    // Single deck reshuffled every hand, S17, BJ 3:2 gives up nearly all of the
    // usually-quoted ~0.5%. Near-zero here is correct, not a bug to fix.
    expect(Math.abs(r.houseEdge)).toBeLessThan(0.01);
  });
});

describe('basic strategy table', () => {
  it('always splits aces and eights', () => {
    expect(basicStrategy([S(ACE), H(ACE)], S(SEVEN), false, true)).toBe('P');
    expect(basicStrategy([S(EIGHT), H(EIGHT)], S(TEN), false, true)).toBe('P');
  });

  it('never splits tens or fives', () => {
    expect(basicStrategy([S(KING), H(QUEEN)], S(SIX), false, true)).toBe('S');
    expect(basicStrategy([S(TEN), H(TEN)], S(SIX), false, true)).toBe('S');
    expect(basicStrategy([S(FIVE), H(FIVE)], S(SEVEN), true, true)).not.toBe('P');
  });

  it('stands on hard 17 and above', () => {
    expect(basicStrategy([S(TEN), H(SEVEN)], S(ACE), false, false)).toBe('S');
  });

  it('doubles hard 11 when allowed and hits it otherwise', () => {
    expect(basicStrategy([S(SIX), H(FIVE)], S(SEVEN), true, false)).toBe('D');
    expect(basicStrategy([S(SIX), H(FIVE)], S(SEVEN), false, false)).toBe('H');
  });
});

describe('labelling helpers', () => {
  it('maps indices to rank and suit glyphs', () => {
    expect(cardLabel(S(ACE))).toBe('A♠');
    expect(cardLabel(H(KING))).toBe('K♥');
    expect(cardLabel(D(TEN))).toBe('10♦');
    expect(RANK_VALUE[rankOf(S(JACK))]).toBe(10);
  });
});

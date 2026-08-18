/* Blackjack engine — UI-free. Ported from the design handoff's reference/engine.js.
   Rules: 1 deck, reshuffled every hand. BJ 3:2. Dealer hits to 16, stands on
   soft 17. Hit/stand/double(first 2 cards)/split(matching ranks)/insurance(2:1).
   Split aces: one card each, no re-hit, 21 pays 1:1. No surrender, no DAS,
   no re-split, no side bets.

   The logic here is a near-verbatim port. Its statistical properties were
   measured over 2,000,000 headless hands and are asserted in engine.test.ts;
   do not "correct" the house edge or add any outcome tuning. */

/** A card is an integer 0..51. `card % 13` is the rank, `(card - rank) / 13` the suit. */
export type Card = number;

export type Phase = 'betting' | 'insurance' | 'player' | 'dealer' | 'settled';
export type Outcome = 'blackjack' | 'win' | 'loss' | 'push' | 'bust';
export type Action = 'hit' | 'stand' | 'double' | 'split';
export type StrategyMove = 'H' | 'S' | 'D' | 'P';
export type RNG = () => number;

export interface Hand {
  cards: Card[];
  bet: number;
  done: boolean;
  doubled: boolean;
  splitAce: boolean;
  fromSplit: boolean;
  actions: Action[];
}

export interface HandValue {
  total: number;
  soft: boolean;
}

export interface Legal {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
  why: { hit?: string; double?: string; split?: string };
}

export interface RoundResult {
  outcome: Outcome;
  delta: number;
  total: number;
  bet: number;
}

export interface LogEntry {
  n: number;
  bet: number;
  actions: Action[];
  cards: Card[];
  dealer: Card[];
  playerTotal: number;
  dealerTotal: number;
  outcome: Outcome;
  insurance: 'won' | 'lost' | null;
  net: number;
}

export interface Stats {
  hands: number;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
  wagered: number;
  winRate: number;
  /** Bankroll invariant: deposits + sum(log.net) === balance. */
  reconciles: boolean;
}

export interface GameOptions {
  rng?: RNG;
  balance?: number;
  bet?: number;
  /**
   * Hold the dealer at phase 'dealer' instead of drawing out the hand inside
   * advance(), so a caller can deal the remaining cards one at a time via
   * dealerStep(). Off by default: advance() resolves the dealer outright.
   */
  pacedDealer?: boolean;
}

export interface SimulateResult {
  rounds: number;
  cardsDealt: number;
  rankFreq: number[];
  suitFreq: number[];
  naturalRate: number;
  pushRate: number;
  houseEdge: number;
  houseEdgeOnAction: number;
  stdDev: number;
  winRate: number;
  net: number;
}

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'] as const;
export const RANK_VALUE = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10] as const;

export const rankOf = (c: Card): number => c % 13;
export const suitOf = (c: Card): number => (c - (c % 13)) / 13;
export const rankName = (c: Card): string => RANKS[rankOf(c)];
export const suitChar = (c: Card): string => SUITS[suitOf(c)];
export const isRed = (c: Card): boolean => suitOf(c) === 1 || suitOf(c) === 2;
export const cardLabel = (c: Card): string => RANKS[rankOf(c)] + SUITS[suitOf(c)];

/* --- randomness ------------------------------------------------------- */

export function cryptoRNG(): RNG {
  const seed = new Uint32Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(seed);
  else for (let i = 0; i < 4; i++) seed[i] = (Math.random() * 4294967296) >>> 0;
  return xoshiro(seed[0] || 1, seed[1] || 2, seed[2] || 3, seed[3] || 4);
}

/** Reproducible stream for tests. */
export function seededRNG(n: number): RNG {
  // splitmix32 expansion of a single integer seed -> xoshiro state
  let x = n >>> 0 || 1;
  const next = (): number => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  return xoshiro(next() || 1, next() || 2, next() || 3, next() || 4);
}

function xoshiro(a: number, b: number, c: number, d: number): RNG {
  return function (): number {
    const t = (b << 9) >>> 0;
    let r = Math.imul(b, 5);
    r = Math.imul(((r << 7) | (r >>> 25)) >>> 0, 9) >>> 0;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = ((d << 11) | (d >>> 21)) >>> 0;
    return r / 4294967296;
  };
}

/* --- deck ------------------------------------------------------------- */

/** Enumerated 4 suits x 13 ranks — never a literal list, never sampled with replacement. */
export function buildDeck(): Card[] {
  const d: Card[] = new Array(52);
  let i = 0;
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d[i++] = s * 13 + r;
  return d;
}

/** Fisher-Yates. */
export function shuffle(d: Card[], rnd: RNG): Card[] {
  for (let i = d.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  return d;
}

/* --- valuation -------------------------------------------------------- */

/** Aces count 11, demoted to 1 while the total exceeds 21; softness tracked explicitly. */
export function handValue(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (let i = 0; i < cards.length; i++) {
    const v = RANK_VALUE[cards[i] % 13];
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isNatural = (cards: Card[]): boolean =>
  cards.length === 2 && handValue(cards).total === 21;

/* --- basic strategy (single deck, S17, no DAS, no re-split) ----------- */

export function basicStrategy(
  cards: Card[],
  dealerUp: Card,
  canDouble: boolean,
  canSplit: boolean,
): StrategyMove {
  const up = RANK_VALUE[dealerUp % 13] === 11 ? 11 : RANK_VALUE[dealerUp % 13];
  const hv = handValue(cards);
  if (canSplit && cards.length === 2 && rankOf(cards[0]) === rankOf(cards[1])) {
    const pr = RANK_VALUE[cards[0] % 13];
    if (pr === 11) return 'P';
    if (pr === 10) return 'S';
    if (pr === 9) return up === 7 || up === 10 || up === 11 ? 'S' : 'P';
    if (pr === 8) return 'P';
    if (pr === 7) return up <= 7 ? 'P' : 'H';
    if (pr === 6) return up <= 6 ? 'P' : 'H';
    if (pr === 4) return up === 5 || up === 6 ? 'P' : 'H';
    if (pr === 3 || pr === 2) return up >= 4 && up <= 7 ? 'P' : 'H';
    // 5,5 falls through to hard 10
  }
  if (hv.soft) {
    const t = hv.total;
    if (t >= 20) return 'S';
    if (t === 19) return 'S';
    if (t === 18) {
      if (up >= 3 && up <= 6) return canDouble ? 'D' : 'S';
      if (up === 2 || up === 7 || up === 8) return 'S';
      return 'H';
    }
    if (t === 17) return up >= 3 && up <= 6 && canDouble ? 'D' : 'H';
    if (t === 16 || t === 15) return up >= 4 && up <= 6 && canDouble ? 'D' : 'H';
    if (t === 14 || t === 13) return up >= 5 && up <= 6 && canDouble ? 'D' : 'H';
    return 'H';
  }
  const t = hv.total;
  if (t >= 17) return 'S';
  if (t >= 13) return up <= 6 ? 'S' : 'H';
  if (t === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (t === 11) return canDouble ? 'D' : 'H';
  if (t === 10) return up <= 9 && canDouble ? 'D' : 'H';
  if (t === 9) return up >= 2 && up <= 6 && canDouble ? 'D' : 'H';
  return 'H';
}

/* --- dealer ----------------------------------------------------------- */

/** Stands on all 17, soft 17 included. */
export function dealerShouldHit(cards: Card[]): boolean {
  return handValue(cards).total < 17;
}

/* --- interactive game ------------------------------------------------- */

export class Game {
  rnd: RNG;
  deposits: number;
  balance: number;
  log: LogEntry[];
  deck: Card[];
  pos: number;
  lastBet: number;
  pacedDealer: boolean;

  phase!: Phase;
  dealer!: Card[];
  hands!: Hand[];
  active!: number;
  holeHidden!: boolean;
  insuranceBet!: number;
  insuranceResult!: 'won' | 'lost' | null;
  message!: string;
  roundNet!: number;
  roundResults!: RoundResult[];

  constructor(opts: GameOptions = {}) {
    this.rnd = opts.rng || cryptoRNG();
    this.deposits = opts.balance != null ? opts.balance : 500;
    this.balance = this.deposits;
    this.log = [];
    this.deck = buildDeck();
    this.pos = 52;
    this.lastBet = opts.bet != null ? opts.bet : 25;
    this.pacedDealer = opts.pacedDealer === true;
    this.resetRound();
  }

  deposit(amount: number): number {
    amount = Math.max(0, Math.round(amount));
    this.deposits += amount;
    this.balance += amount;
    return this.balance;
  }

  resetRound(): void {
    this.phase = 'betting';
    this.dealer = [];
    this.hands = [];
    this.active = 0;
    this.holeHidden = true;
    this.insuranceBet = 0;
    this.insuranceResult = null;
    this.message = '';
    this.roundNet = 0;
    this.roundResults = [];
  }

  draw(): Card {
    if (this.pos >= this.deck.length) {
      // safety: cannot occur in one hand, but never deal undefined
      shuffle(this.deck, this.rnd);
      this.pos = 0;
    }
    return this.deck[this.pos++];
  }

  canBet(bet: number): boolean {
    return bet > 0 && bet <= this.balance;
  }

  deal(bet: number): boolean {
    if (this.phase !== 'betting' && this.phase !== 'settled') return false;
    bet = Math.round(bet);
    if (!this.canBet(bet)) return false;
    this.resetRound();
    this.lastBet = bet;
    shuffle(this.deck, this.rnd); // fresh single deck every hand
    this.pos = 0;
    this.balance -= bet;
    const h: Hand = {
      cards: [this.draw()],
      bet,
      done: false,
      doubled: false,
      splitAce: false,
      fromSplit: false,
      actions: [],
    };
    this.dealer = [this.draw()];
    h.cards.push(this.draw());
    this.dealer.push(this.draw());
    this.hands = [h];
    this.active = 0;
    if (RANK_VALUE[rankOf(this.dealer[0])] === 11) {
      this.phase = 'insurance';
      this.message = 'Dealer shows an Ace — insurance?';
      return true;
    }
    this.afterDeal();
    return true;
  }

  afterDeal(): void {
    const h = this.hands[0];
    if (isNatural(h.cards) || isNatural(this.dealer)) {
      this.holeHidden = false;
      this.phase = 'dealer';
      this.settle();
    } else {
      this.phase = 'player';
      this.message = '';
    }
  }

  takeInsurance(take: boolean): boolean {
    if (this.phase !== 'insurance') return false;
    if (take) {
      const amt = Math.floor(this.hands[0].bet / 2);
      if (amt > this.balance) return false;
      this.insuranceBet = amt;
      this.balance -= amt;
    }
    this.afterDeal();
    return true;
  }

  current(): Hand | undefined {
    return this.hands[this.active];
  }

  legal(): Legal {
    const out: Legal = { hit: false, stand: false, double: false, split: false, why: {} };
    if (this.phase !== 'player') return out;
    const h = this.current();
    if (!h || h.done) return out;
    out.hit = !h.splitAce;
    out.stand = true;
    if (h.cards.length === 2 && !h.splitAce) {
      if (this.balance >= h.bet) out.double = true;
      else out.why.double = 'Not enough balance to match the bet';
    } else if (h.splitAce) {
      out.why.double = 'Split aces receive one card only';
    } else {
      out.why.double = 'Double is first two cards only';
    }
    if (
      h.cards.length === 2 &&
      !h.fromSplit &&
      this.hands.length === 1 &&
      rankOf(h.cards[0]) === rankOf(h.cards[1])
    ) {
      if (this.balance >= h.bet) out.split = true;
      else out.why.split = 'Not enough balance for a second bet';
    } else if (h.cards.length === 2 && rankOf(h.cards[0]) !== rankOf(h.cards[1])) {
      out.why.split = 'Split needs two matching ranks';
    } else if (this.hands.length > 1) {
      out.why.split = 'Re-splitting is not offered';
    } else {
      out.why.split = 'Split is first two cards only';
    }
    if (h.splitAce) out.why.hit = 'Split aces receive one card only';
    return out;
  }

  hit(): boolean {
    if (!this.legal().hit) return false;
    const h = this.current()!;
    h.cards.push(this.draw());
    h.actions.push('hit');
    if (handValue(h.cards).total > 21) {
      h.done = true;
      this.advance();
    } else if (handValue(h.cards).total === 21) {
      h.done = true;
      this.advance();
    }
    return true;
  }

  stand(): boolean {
    if (!this.legal().stand) return false;
    const h = this.current()!;
    h.actions.push('stand');
    h.done = true;
    this.advance();
    return true;
  }

  double(): boolean {
    if (!this.legal().double) return false;
    const h = this.current()!;
    this.balance -= h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.actions.push('double');
    h.cards.push(this.draw());
    h.done = true;
    this.advance();
    return true;
  }

  split(): boolean {
    if (!this.legal().split) return false;
    const h = this.current()!;
    this.balance -= h.bet;
    const ace = RANK_VALUE[rankOf(h.cards[0])] === 11;
    const moved = h.cards.pop()!;
    h.fromSplit = true;
    h.splitAce = ace;
    h.actions.push('split');
    const h2: Hand = {
      cards: [moved],
      bet: h.bet,
      done: false,
      doubled: false,
      splitAce: ace,
      fromSplit: true,
      actions: [],
    };
    h.cards.push(this.draw());
    h2.cards.push(this.draw());
    this.hands = [h, h2];
    if (ace) {
      h.done = true;
      h2.done = true;
    }
    if (h.done && h2.done) {
      this.active = 1;
      this.advance();
    }
    return true;
  }

  advance(): void {
    while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
    if (this.active < this.hands.length) return;
    this.active = this.hands.length - 1;
    this.phase = 'dealer';
    this.holeHidden = false;
    const live = this.hands.some((h) => handValue(h.cards).total <= 21);
    // Paced mode stops here with the hole card face up and the round unsettled,
    // leaving dealerStep() to deal the rest at whatever tempo the caller wants.
    if (live && this.pacedDealer) return;
    if (live) while (dealerShouldHit(this.dealer)) this.dealer.push(this.draw());
    this.settle();
  }

  /**
   * One beat of the dealer's hand: draw a card if the dealer must hit,
   * otherwise settle. Returns true while cards are still coming, so a caller
   * can keep stepping until it returns false. Only reachable under
   * pacedDealer — advance() otherwise finishes the dealer itself.
   */
  dealerStep(): boolean {
    if (this.phase !== 'dealer') return false;
    if (dealerShouldHit(this.dealer)) {
      this.dealer.push(this.draw());
      return true;
    }
    this.settle();
    return false;
  }

  /** Resolution order is fixed: naturals -> bust -> comparison. */
  settle(): number {
    const dealerBJ = isNatural(this.dealer);
    const dv = handValue(this.dealer).total;
    let net = 0;
    if (this.insuranceBet > 0) {
      if (dealerBJ) {
        this.balance += this.insuranceBet * 3;
        net += this.insuranceBet * 2;
        this.insuranceResult = 'won';
      } else {
        net -= this.insuranceBet;
        this.insuranceResult = 'lost';
      }
    }
    const results: RoundResult[] = [];
    for (const h of this.hands) {
      const pv = handValue(h.cards).total;
      const playerBJ = isNatural(h.cards) && !h.fromSplit;
      let outcome: Outcome;
      let delta: number;
      if (playerBJ && dealerBJ) {
        outcome = 'push';
        delta = 0;
        this.balance += h.bet;
      } else if (playerBJ) {
        outcome = 'blackjack';
        delta = h.bet * 1.5;
        this.balance += h.bet * 2.5;
      } else if (dealerBJ) {
        outcome = 'loss';
        delta = -h.bet;
      } else if (pv > 21) {
        outcome = 'bust';
        delta = -h.bet;
      } else if (dv > 21) {
        outcome = 'win';
        delta = h.bet;
        this.balance += h.bet * 2;
      } else if (pv > dv) {
        outcome = 'win';
        delta = h.bet;
        this.balance += h.bet * 2;
      } else if (pv < dv) {
        outcome = 'loss';
        delta = -h.bet;
      } else {
        outcome = 'push';
        delta = 0;
        this.balance += h.bet;
      }
      net += delta;
      results.push({ outcome, delta, total: pv, bet: h.bet });
      this.log.push({
        n: this.log.length + 1,
        bet: h.bet,
        actions: h.actions.slice(),
        cards: h.cards.slice(),
        dealer: this.dealer.slice(),
        playerTotal: pv,
        dealerTotal: dv,
        outcome,
        insurance: this.insuranceBet > 0 ? this.insuranceResult : null,
        net:
          delta +
          (this.insuranceBet > 0 && h === this.hands[0]
            ? this.insuranceResult === 'won'
              ? this.insuranceBet * 2
              : -this.insuranceBet
            : 0),
      });
    }
    this.roundResults = results;
    this.roundNet = net;
    this.phase = 'settled';
    this.message = this.summary();
    return net;
  }

  summary(): string {
    const r = this.roundResults;
    if (!r.length) return '';
    const label: Record<Outcome, string> = {
      blackjack: 'Blackjack! Pays 3:2',
      win: 'You win',
      loss: 'Dealer wins',
      push: 'Push',
      bust: 'Bust',
    };
    if (r.length === 1) return label[r[0].outcome];
    return r.map((x, i) => 'Hand ' + (i + 1) + ': ' + label[x.outcome]).join('  ·  ');
  }

  stats(): Stats {
    let w = 0;
    let l = 0;
    let p = 0;
    let net = 0;
    let wagered = 0;
    for (const e of this.log) {
      if (e.outcome === 'win' || e.outcome === 'blackjack') w++;
      else if (e.outcome === 'push') p++;
      else l++;
      net += e.net;
      wagered += e.bet;
    }
    const decided = w + l;
    return {
      hands: this.log.length,
      wins: w,
      losses: l,
      pushes: p,
      net,
      wagered,
      winRate: decided ? w / decided : 0,
      reconciles: Math.abs(this.deposits + net - this.balance) < 1e-9,
    };
  }
}

/* --- headless simulation ---------------------------------------------- */

export function simulate(rounds: number, opts: { rng?: RNG } = {}): SimulateResult {
  const rnd = opts.rng || cryptoRNG();
  const deck = buildDeck();
  const rankCount = new Array(13).fill(0);
  const suitCount = new Array(4).fill(0);
  let dealt = 0;
  let naturals = 0;
  let pushes = 0;
  let wins = 0;
  let losses = 0;
  let net = 0;
  let netSq = 0;
  let wagered = 0;
  let handUnits = 0;
  let pos = 0;
  const take = (): Card => {
    const c = deck[pos++];
    rankCount[c % 13]++;
    suitCount[(c - (c % 13)) / 13]++;
    dealt++;
    return c;
  };
  for (let r = 0; r < rounds; r++) {
    shuffle(deck, rnd);
    pos = 0;
    const player = [take()];
    const dealer = [take()];
    player.push(take());
    dealer.push(take());
    const up = dealer[0];
    let roundNet = 0;
    wagered += 1;
    const pBJ = isNatural(player);
    const dBJ = isNatural(dealer);
    if (pBJ) naturals++;
    if (pBJ || dBJ) {
      handUnits++;
      if (pBJ && dBJ) {
        pushes++;
      } else if (pBJ) {
        roundNet += 1.5;
        wins++;
      } else {
        roundNet -= 1;
        losses++;
      }
    } else {
      // player plays, possibly two hands after a split
      const hands = [{ cards: player, bet: 1, splitAce: false, fromSplit: false }];
      for (let i = 0; i < hands.length; i++) {
        const h = hands[i];
        if (h.splitAce) continue;
        for (;;) {
          const canDouble = h.cards.length === 2 && !h.fromSplit; // no DAS
          const canSplit = hands.length === 1 && h.cards.length === 2;
          const a = basicStrategy(h.cards, up, canDouble, canSplit);
          if (a === 'S') break;
          if (a === 'D') {
            h.bet = 2;
            h.cards.push(take());
            break;
          }
          if (a === 'P') {
            const ace = RANK_VALUE[h.cards[0] % 13] === 11;
            const moved = h.cards.pop()!;
            h.fromSplit = true;
            h.splitAce = ace;
            const h2 = { cards: [moved], bet: 1, splitAce: ace, fromSplit: true };
            h.cards.push(take());
            h2.cards.push(take());
            hands.push(h2);
            if (ace) break;
            continue;
          }
          h.cards.push(take());
          if (handValue(h.cards).total >= 21) break;
        }
      }
      for (const h of hands) if (h !== hands[0]) wagered += h.bet;
        else wagered += h.bet - 1;
      const live = hands.some((h) => handValue(h.cards).total <= 21);
      if (live) while (dealerShouldHit(dealer)) dealer.push(take());
      const dv = handValue(dealer).total;
      for (const h of hands) {
        handUnits++;
        const pv = handValue(h.cards).total;
        if (pv > 21) {
          roundNet -= h.bet;
          losses++;
        } else if (dv > 21 || pv > dv) {
          roundNet += h.bet;
          wins++;
        } else if (pv < dv) {
          roundNet -= h.bet;
          losses++;
        } else {
          pushes++;
        }
      }
    }
    net += roundNet;
    netSq += roundNet * roundNet;
    dealer.length = 0;
  }
  const mean = net / rounds;
  return {
    rounds,
    cardsDealt: dealt,
    rankFreq: rankCount.map((c) => c / dealt),
    suitFreq: suitCount.map((c) => c / dealt),
    naturalRate: naturals / rounds,
    pushRate: pushes / handUnits,
    houseEdge: -net / rounds,
    houseEdgeOnAction: -net / wagered,
    stdDev: Math.sqrt(netSq / rounds - mean * mean),
    winRate: wins / (wins + losses),
    net,
  };
}

import { useState } from 'react';
import {
  dealerShouldHit,
  handValue,
  rankOf,
  RANK_VALUE,
  type Outcome,
  type Card as CardIndex,
} from './engine/engine';
import { DENOMINATIONS, type Denomination } from './lib/chips';
import { useGame } from './hooks/useGame';
import { BuyIn } from './components/BuyIn';
import { ChipButton, ChipStack } from './components/Chip';
import { FaceDownCard, PlayingCard } from './components/PlayingCard';
import { money, signedMoney } from './lib/format';
import './styles/app.css';

const SIGNAGE = 'Blackjack pays 3 to 2 — Dealer must stand on soft 17';

/**
 * One face card per cabinet screen, all six different, so no two machines are
 * showing the same thing. Position is baked in rather than derived so the pairs
 * across the two walls never collide.
 */
const CABINET_CARDS = [
  { at: 'l1', rank: 'A', suit: '♠' },
  { at: 'l2', rank: 'K', suit: '♦' },
  { at: 'l3', rank: 'Q', suit: '♥' },
  { at: 'r1', rank: 'J', suit: '♥' },
  { at: 'r2', rank: 'Q', suit: '♦' },
  { at: 'r3', rank: 'K', suit: '♣' },
] as const;

/** Short outcome labels for the line under each hand. */
const OUTCOME_LABEL: Record<Outcome, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
  bust: 'Bust',
};

/** "10 +" while the hole card is down, then "Soft 17" / "17" / "Bust 23". */
function dealerTotalLabel(dealer: CardIndex[], holeHidden: boolean): string {
  if (dealer.length === 0) return '';
  if (holeHidden) return `${RANK_VALUE[rankOf(dealer[0])]} +`;
  const { total, soft } = handValue(dealer);
  if (total > 21) return `Bust ${total}`;
  return soft ? `Soft ${total}` : `${total}`;
}

export default function App() {
  const g = useGame();
  const { game } = g;
  /** Lights the betting circle while a chip is being dragged over it. */
  const [dropActive, setDropActive] = useState(false);
  const legal = game.legal();
  const stats = game.stats();
  const isPlayerPhase = game.phase === 'player';
  const isInsurance = game.phase === 'insurance';

  // The hole card stays face down until the whole opening deal is out, so a
  // natural still gets a proper reveal instead of landing pre-flipped.
  const holeHidden = game.holeHidden || g.isDealing;
  const visibleDealer = game.dealer.slice(0, g.dealerVisible);

  // The engine leaves message empty until it settles, so the dealer's turn gets
  // its own line rather than a blank one while the cards come out. Nothing is
  // announced until the deal has finished landing.
  let message = game.message;
  if (g.isDealing) {
    message = '';
  } else if (!message) {
    if (g.isBettingPhase) message = 'Place your bet';
    // Say what the dealer is actually about to do — it stands pat as often as
    // it draws, and claiming otherwise reads as a bug.
    else if (g.isDealerDrawing) {
      message = dealerShouldHit(game.dealer) ? 'Dealer draws' : 'Dealer stands';
    }
  }
  const insuranceCost = isInsurance ? Math.floor(game.hands[0].bet / 2) : 0;

  return (
    <div className="room">
      {/* Room dressing — the neon-lit arcade the table stands in. Decorative
          only, so all of it is hidden from assistive tech. */}
      {/* Neon battens sweeping back along each side wall. Four per side, each
          shorter and dimmer than the last, converging toward a vanishing point —
          that fan fills the wall above the machines and reads as depth. */}
      {(['left', 'right'] as const).flatMap((side) =>
        [1, 2, 3, 4].map((n) => (
          <span
            key={`${side}${n}`}
            className={`room__cove room__cove--${side} room__cove--n${n}`}
            aria-hidden="true"
          />
        )),
      )}

      {/* Three machines down each wall, filling the gutters either side of the
          table. Each is smaller, higher and dimmer than the one before it, which
          is what reads as a row receding down an arcade. */}
      {CABINET_CARDS.map(({ at, rank, suit }) => (
        <div key={at} className={`cab cab--${at}`} aria-hidden="true">
          <span className="cab__marquee" />
          <span className="cab__screen">
            <span className="cab__card">
              <span className="cab__card-rank">{rank}</span>
              <span className="cab__card-suit">{suit}</span>
            </span>
          </span>
          <span className="cab__panel" />
        </div>
      ))}

      <div className="room__reflect" aria-hidden="true" />


      <main className="stage">
        {/* Neon sign over the table. Doubles as the page's heading. */}
        <h1 className="marquee">Blackjack</h1>

        {/* The table itself, seen from above: rail, then the felt bed. */}
        <section className="table" aria-label="Blackjack table">
          <div className="table__felt">
            {/* Dealer's furniture: chip rack to their left, shoe to their right.
                These two objects are what identify the dealer's side of a
                blackjack table from above. */}
            <div className="rack" aria-hidden="true">
              <span className="rack__slot rack__slot--1" />
              <span className="rack__slot rack__slot--5" />
              <span className="rack__slot rack__slot--25" />
              <span className="rack__slot rack__slot--100" />
            </div>
            <div className="shoe" aria-hidden="true" />

            {/* Dealer, at the flat top edge */}
            <section className="seat seat--dealer">
              <div className="seat__label-row">
                <span className="seat__label">Dealer</span>
                <span className="seat__total">{dealerTotalLabel(visibleDealer, holeHidden)}</span>
              </div>
              <div className={`card-row${visibleDealer.length > 3 ? ' card-row--tight' : ''}`}>
                {visibleDealer.map((card, i) => {
                  // The hole card swaps identity on reveal, so it mounts fresh and flips.
                  if (holeHidden && i === 1) return <FaceDownCard key="hole" />;
                  return <PlayingCard key={card} card={card} flip={i === 1 && !holeHidden} />;
                })}
              </div>
            </section>

            {/* Printed signage arc */}
            <div className="signage">{SIGNAGE}</div>

            {/* The player's spot. Cards land above the bet, which is how a real
                table is laid out — and it frees the whole felt width for hands,
                so a split with hits has room. */}
            <div className="felt-row">
              <div className="hands">
                {game.hands.map((hand, i) => {
                  // Totals and outcomes follow what is actually face up, so nothing
                  // is given away before the card that justifies it has landed.
                  const cards = hand.cards.slice(0, g.playerVisible);
                  const value = handValue(cards);
                  const result = g.isDealing ? undefined : game.roundResults[i];
                  // The brass ring marks the hand being played, so it only appears
                  // during the player's turn and only once a split created a choice.
                  const active = isPlayerPhase && game.active === i && game.hands.length > 1;
                  return (
                    <div key={i} className={`hand${active ? ' hand--active' : ''}`}>
                      {/* Long hands fan over one another so a split that gets
                          hit still fits inside the felt. */}
                      <div className={`card-row${cards.length > 3 ? ' card-row--tight' : ''}`}>
                        {cards.map((card) => (
                          <PlayingCard key={card} card={card} />
                        ))}
                      </div>
                      <div className="hand__meta">
                        <span className="hand__total">
                          {value.total > 21 ? `Bust ${value.total}` : value.total}
                        </span>
                        <span className="hand__bet">{money(hand.bet)}</span>
                        {result && (
                          <span className="hand__outcome">{OUTCOME_LABEL[result.outcome]}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chips can be dropped straight onto the circle. dataTransfer is
                  unreadable during dragover for security, so the drop is accepted
                  optimistically and the denomination validated on release. */}
              <div
                className={`circle${dropActive ? ' circle--drop' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropActive(false);
                  const denom = Number(e.dataTransfer.getData('text/plain')) as Denomination;
                  if (DENOMINATIONS.includes(denom) && g.canAddChip(denom)) g.addChip(denom);
                }}
              >
                <span className="circle__label">Wager</span>
                <span className="circle__amount">{money(g.wager)}</span>
                <ChipStack chips={g.pending} />
              </div>
            </div>

            {/* Insurance prompt — dealer ace only, before the round resolves.
                Floated over the felt so the console keeps a constant height. */}
            {isInsurance && !g.isDealing && (
              <div className="insurance">
                <span className="insurance__text">Insurance pays 2 to 1</span>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => g.takeInsurance(true)}
                >
                  Take {money(insuranceCost)}
                </button>
                <button
                  type="button"
                  className="pill pill--insurance"
                  onClick={() => g.takeInsurance(false)}
                >
                  No
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Player console — controls and chips, off the felt and in front of
            the player, where a rail would be. */}
        <div className="console">
          {/* Round message. Off the felt now: on a plain panel it reads cleanly
              instead of competing with the table's own printing. */}
          <div className="message">{message}</div>

          {/* Action row */}
          <div className="actions">
            {g.isBettingPhase && !g.isDealing && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={!g.canDeal}
                title={g.canDeal ? undefined : 'Place a bet first'}
                onClick={g.deal}
              >
                Deal
              </button>
            )}

            {isPlayerPhase && !g.isDealing && (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!legal.hit}
                  title={legal.hit ? undefined : legal.why.hit}
                  onClick={g.hit}
                >
                  Hit
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={!legal.stand}
                  onClick={g.stand}
                >
                  Stand
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={!legal.double}
                  title={legal.double ? undefined : legal.why.double}
                  onClick={g.double}
                >
                  Double
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={!legal.split}
                  title={legal.split ? undefined : legal.why.split}
                  onClick={g.split}
                >
                  Split
                </button>
              </>
            )}
          </div>

          {/* Cashier row */}
          <div className="cashier">
            <div className="tray">
              {DENOMINATIONS.map((denom) => (
                <ChipButton
                  key={denom}
                  denom={denom}
                  disabled={!g.canAddChip(denom)}
                  onClick={() => g.addChip(denom)}
                />
              ))}
            </div>

            <div className="plaque">
              <span className="plaque__label">Balance</span>
              <span className="plaque__amount">{money(game.balance)}</span>
            </div>

            <button
              type="button"
              className="pill"
              disabled={!g.isBettingPhase || g.pending.length === 0}
              onClick={g.clearBet}
            >
              Clear bet
            </button>

            <BuyIn
              amount={g.buyIn}
              canRaise={g.canRaiseBuyIn}
              canLower={g.canLowerBuyIn}
              onStep={g.stepBuyIn}
              onBuyIn={g.cashier}
            />

            <div className="session">
              <span>Hands {stats.hands}</span>
              <span>Session {signedMoney(stats.net)}</span>
            </div>
          </div>
        </div>
      </main>

      <div className="room__crt" aria-hidden="true" />
    </div>
  );
}

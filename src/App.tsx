import {
  handValue,
  rankOf,
  RANK_VALUE,
  type Outcome,
  type Card as CardIndex,
} from './engine/engine';
import { DENOMINATIONS } from './lib/chips';
import { useGame } from './hooks/useGame';
import { ChipButton, ChipStack } from './components/Chip';
import { FaceDownCard, PlayingCard } from './components/PlayingCard';
import { money, signedMoney } from './lib/format';
import './styles/app.css';

const SIGNAGE = 'Blackjack pays 3 to 2 — Dealer must stand on soft 17';

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
  const legal = game.legal();
  const stats = game.stats();
  const isPlayerPhase = game.phase === 'player';
  const isInsurance = game.phase === 'insurance';

  const message = game.message || (g.isBettingPhase ? 'Place your bet' : '');
  const insuranceCost = isInsurance ? Math.floor(game.hands[0].bet / 2) : 0;

  return (
    <main className="table">
      <div className="table__column">
        {/* Band 1 — table rail */}
        <div className="rail">
          <span>Table 7 · Heads Up</span>
          <span>Single Deck · Shuffled Every Hand</span>
        </div>

        {/* Band 2 — dealer */}
        <section className="seat seat--dealer">
          <div className="seat__label-row">
            <span className="seat__label">Dealer</span>
            <span className="seat__total">{dealerTotalLabel(game.dealer, game.holeHidden)}</span>
          </div>
          <div className="card-row">
            {game.dealer.map((card, i) => {
              // The hole card swaps identity on reveal, so it mounts fresh and flips.
              if (game.holeHidden && i === 1) return <FaceDownCard key="hole" />;
              return <PlayingCard key={card} card={card} flip={i === 1 && !game.holeHidden} />;
            })}
          </div>
        </section>

        {/* Band 3 — signage arc */}
        <div className="signage">{SIGNAGE}</div>

        {/* Band 4 — betting circle + player hands */}
        <div className="felt-row">
          <div className="circle">
            <span className="circle__label">Wager</span>
            <span className="circle__amount">{money(g.wager)}</span>
            <ChipStack chips={g.pending} />
          </div>

          <section className="seat">
            <span className="seat__label">Player</span>
            <div className="hands">
              {game.hands.map((hand, i) => {
                const value = handValue(hand.cards);
                const result = game.roundResults[i];
                // The brass ring marks the hand being played, so it only appears
                // during the player's turn and only once a split created a choice.
                const active = isPlayerPhase && game.active === i && game.hands.length > 1;
                return (
                  <div key={i} className={`hand${active ? ' hand--active' : ''}`}>
                    <div className="card-row">
                      {hand.cards.map((card) => (
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
          </section>
        </div>

        {/* Band 5 — round message */}
        <div className="message">{message}</div>

        {/* Insurance prompt — dealer ace only, before the round resolves */}
        {isInsurance && (
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

        {/* Action row */}
        <div className="actions">
          {g.isBettingPhase && (
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

          {isPlayerPhase && (
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

          <button type="button" className="pill" onClick={g.cashier}>
            Cashier · buy in {money(g.cashierAmount)}
          </button>

          <div className="session">
            <span>Hands {stats.hands}</span>
            <span>Session {signedMoney(stats.net)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}

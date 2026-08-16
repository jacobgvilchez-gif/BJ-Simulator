import { isRed, rankName, suitChar, type Card } from '../engine/engine';

interface PlayingCardProps {
  card: Card;
  /** Set on the hole card the moment it is revealed, so it flips rather than slides. */
  flip?: boolean;
}

export function PlayingCard({ card, flip = false }: PlayingCardProps) {
  const rank = rankName(card);
  const suit = suitChar(card);
  const colour = isRed(card) ? 'card--red' : 'card--black';

  return (
    <div
      className={`card ${colour}${flip ? ' card--flip' : ''}`}
      aria-label={`${rank} of ${suit}`}
    >
      <div className="card__rank">{rank}</div>
      <div className="card__suit" aria-hidden="true">
        {suit}
      </div>
      <div className="card__rank card__rank--flipped" aria-hidden="true">
        {rank}
      </div>
    </div>
  );
}

export function FaceDownCard() {
  return <div className="card card--back" aria-label="Face-down hole card" />;
}

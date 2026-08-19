/** Money as shown on the table: $30,912.5 — decimals only when a 3:2 payout creates them. */
export function money(amount: number): string {
  return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Signed money for the session readout, using a true minus sign. */
export function signedMoney(amount: number): string {
  if (amount < 0) return '−' + money(-amount);
  return money(amount);
}

/**
 * Money for the result banner: always two decimals and never signed, because
 * the banner's own label already says whether it was won or lost. Returned split
 * so the cents can be set smaller than the dollars, the way a payout is shown on
 * a live table.
 */
export function payoutParts(amount: number): { dollars: string; cents: string } {
  const text = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dot = text.lastIndexOf('.');
  return { dollars: '$' + text.slice(0, dot), cents: text.slice(dot) };
}

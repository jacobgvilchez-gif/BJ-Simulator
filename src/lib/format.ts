/** Money as shown on the table: $30,912.5 — decimals only when a 3:2 payout creates them. */
export function money(amount: number): string {
  return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Signed money for the session readout, using a true minus sign. */
export function signedMoney(amount: number): string {
  if (amount < 0) return '−' + money(-amount);
  return money(amount);
}

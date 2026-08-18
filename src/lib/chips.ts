/** Chip denominations offered in the tray, and their table colours. */
export const DENOMINATIONS = [1, 5, 25, 100] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

export interface ChipStyle {
  face: string;
  rim: string;
  label: string;
}

export const CHIP_STYLES: Record<Denomination, ChipStyle> = {
  1: { face: 'linear-gradient(#fbfbf7,#dcd8cb)', rim: '#b9b2a1', label: '#2a1c06' },
  5: { face: 'linear-gradient(#c8302c,#9a1f1c)', rim: '#e8cf95', label: '#fff6e2' },
  25: { face: 'linear-gradient(#1f7a4d,#125634)', rim: '#e8cf95', label: '#fff6e2' },
  100: { face: 'linear-gradient(#2b2b2b,#101010)', rim: '#e8cf95', label: '#fff6e2' },
};

/** Buy-in ladder at the cashier; the wheel steps through these amounts. */
export const BUY_INS = [100, 250, 500, 1000, 2500, 5000] as const;
export type BuyIn = (typeof BUY_INS)[number];

/** Amount the wheel opens on. */
export const DEFAULT_BUY_IN: BuyIn = 500;

import { fmtUsd } from '@/domain/format';

/** What one top-up is worth; the backend decides the real amount (GET /faucet). */
export const FAUCET_USD = 1000;

/** The tokens the practice page hands out. Screens offer "practice money" only for these. */
export const PRACTICE_CHOICES: { token: string; title: string; subtitle: string }[] = [
  { token: 'USDC', title: `${fmtUsd(FAUCET_USD).replace('.00', '')} digital dollars`, subtitle: 'For Buy Low deals. Comes with a little test SOL.' },
  { token: 'TSLAon', title: `${fmtUsd(FAUCET_USD).replace('.00', '')} of Tesla`, subtitle: 'A stock token for Sell High deals' },
  { token: 'WBTC', title: `${fmtUsd(FAUCET_USD).replace('.00', '')} of Bitcoin`, subtitle: 'For Sell High deals' },
];

export function hasPracticeToken(symbol: string): boolean {
  return PRACTICE_CHOICES.some((c) => c.token === symbol);
}

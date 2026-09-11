/** Named night-office palette — six dyes, no extras. */
export const PALETTE = {
  soot: '#100C08',
  bakelite: '#1E1510',
  brass: '#C9A056',
  tungsten: '#F0B44A',
  oxblood: '#8C2A22',
  ivory: '#D8C9A8',
} as const

export type PaletteName = keyof typeof PALETTE

/** RAY sits between brass and oxblood — not a seventh brand color. */
export const RAY_COPPER = '#B56A3A'
/** Stake is brass dimmed into bakelite. */
export const STAKE_DIM = '#9A7A40'
/** Unknown is ivory mixed into bakelite. */
export const UNKNOWN_ASH = '#7A6A58'

export const FAMILY_TINT: Record<string, string> = {
  SYS: PALETTE.brass,
  JUP: PALETTE.tungsten,
  RAY: RAY_COPPER,
  TKN: PALETTE.ivory,
  STK: STAKE_DIM,
  '???': UNKNOWN_ASH,
}

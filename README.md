# slotswitch

Live Solana **mainnet** as a 1940s Western Electric telephone switchboard. Not an explorer. Not a dashboard. Not a newspaper. Distinct from slotwire (telegraph desk).

The office is dark. The board is the only light.
Bakelite and brass, tungsten answering lamps — not a product surface.
Cords plug on the slot; lamps answer. That is the only motion.
Fee pressure warms the shelf and thickens the busy buzz.
Pull the night key and the last sample holds.

Live: https://robertkodes.github.io/slotswitch/

## How to read the board

| Board | Chain |
| --- | --- |
| Supervisory lamps | Confirmed slot clock — one lamp answers as the slot advances |
| Patch cord | A recent transaction |
| Tip / sleeve band | Program family: system, JUP, RAY, token, stake, unknown |
| Cord-shelf glow + busy buzz | `getRecentPrioritizationFees` pressure, log-scaled |
| Dropped plug / lingering red lamp | Sampled signature with `err` |
| **NIGHT KEY** / Space | Freeze the current sample |
| RESTORE / Space again | Resume the live feed |

No wallet. No keys. Browser talks JSON-RPC. First click arms a quiet 58 Hz busy buzz (Web Audio, optional).

## Palette

Named hex, night-shift central office, six dyes:

| Token | Hex | Use |
| --- | --- | --- |
| **soot** | `#100C08` | Office void |
| **bakelite** | `#1E1510` | Panel face, cloth cord |
| **brass** | `#C9A056` | Jack sleeves, screws, system cords |
| **tungsten** | `#F0B44A` | Answering lamps, JUP, live digits |
| **oxblood** | `#8C2A22` | Fail lamps, dropped plugs |
| **ivory** | `#D8C9A8` | Stencil labels, token cords |

RAY copper (`#B56A3A`) is brass mixed toward oxblood. Stake dim (`#9A7A40`) is brass into bakelite. Unknown ash (`#7A6A58`) is ivory dimmed into bakelite. None is a seventh brand color.

## Type

- **Oswald** — condensed switchboard mast and column stamps. Industrial plate lettering, not Inter, not a SaaS geometric.
- **Azeret Mono** — jack tags, strip figures, the night-key plate. Reads as a stencil, not a terminal theme.

## Tinkerer notes

```bash
npm i
npm run dev
```

Vite serves at `/slotswitch/`. Open that path, not `/`.

```bash
npm run build
```

must pass. Static `dist/` is force-pushed to the `gh-pages` branch at root (`index.html`, `assets/`, `.nojekyll`). `gh-pages` already holds those files at branch root. Enabling Pages via API returned **403** (token cannot write Pages settings). One click: GitHub → Settings → Pages → source **`gh-pages` / root**.

Public RPC, rotating on failure (no API keys):

- `solana-rpc.publicnode.com`
- `solana.publicnode.com`
- `solana-mainnet.publicnode.com`
- `api.mainnet-beta.solana.com`
- `solana.drpc.org`

Override with `VITE_RPC_URL`. Methods: `getSlot`, `getRecentPerformanceSamples`, `getRecentPrioritizationFees`, rotating `getSignaturesForAddress` on a short program roster via `@solana/web3.js`. If RPC flakes, the board keeps the last cords and the strip marks **degraded**.

`prefers-reduced-motion`: static board + seated cords; lamps stay lit without blink; slot / TPS / RTT still update until you pull the night key. Buzz stays off.

Space or the night key freezes the sample.

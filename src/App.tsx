import { useCallback, useEffect, useRef, useState } from 'react'
import { Switchboard } from './engine/board.ts'
import { useChainPulse } from './hooks/useChainPulse.ts'
import { BusyBuzz } from './lib/buzz.ts'
import { FAMILIES, familyColor, familyLabel, type Family } from './lib/programs.ts'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<Switchboard | null>(null)
  if (!boardRef.current) boardRef.current = new Switchboard()
  const buzzRef = useRef<BusyBuzz | null>(null)
  if (!buzzRef.current) buzzRef.current = new BusyBuzz()

  const reduced = usePrefersReducedMotion()
  const [night, setNight] = useState(false)
  const nightRef = useRef(false)
  const reducedRef = useRef(reduced)
  nightRef.current = night
  reducedRef.current = reduced

  const { hud, pull } = useChainPulse(night)
  const pullRef = useRef(pull)
  pullRef.current = pull
  const hudRef = useRef(hud)
  hudRef.current = hud

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    const board = boardRef.current!
    let raf = 0
    let last = performance.now()

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      const cssW = Math.max(1, rect.width)
      const cssH = Math.max(1, rect.height)
      const w = Math.max(1, Math.floor(cssW * dpr))
      const h = Math.max(1, Math.floor(cssH * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas.parentElement ?? canvas)

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const pulse = hudRef.current
      board.frozen = nightRef.current
      board.reduced = reducedRef.current
      board.tps = pulse.tps
      board.fee = pulse.fee
      if (pulse.slot != null) board.setSlot(pulse.slot, now)
      board.step(dt, now, () => pullRef.current())
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      board.draw(ctx, rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2), now)
      buzzRef.current?.set(pulse.fee, pulse.live && !nightRef.current, reducedRef.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      buzzRef.current?.stop()
    }
  }, [])

  const toggleNight = useCallback(() => {
    buzzRef.current?.unlock()
    setNight((n) => !n)
  }, [])

  useEffect(() => {
    const arm = () => buzzRef.current?.unlock()
    window.addEventListener('pointerdown', arm, { once: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return
      }
      e.preventDefault()
      toggleNight()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', onKey)
    }
  }, [toggleNight])

  const slot = hud.slot != null ? hud.slot.toLocaleString('en-US') : '—'
  const tps = hud.tps != null ? Math.round(hud.tps).toLocaleString('en-US') : '—'
  const rtt = hud.rttMs != null ? `${Math.round(hud.rttMs)}` : '—'
  const live = hud.live && !night

  return (
    <div className={night ? 'office night' : 'office'}>
      <header className="mast">
        <p className="kicker">605A · night office · confirmed slot · mainnet</p>
        <h1>SLOTSWITCH</h1>
        <p className="lede">the chain, as a cord board</p>
      </header>

      <main className="bay">
        <div className="well">
          <canvas
            ref={canvasRef}
            className="board"
            role="img"
            aria-label="Western Electric switchboard of recent Solana transactions"
          />
        </div>

        <aside className="keyplate" aria-label="Night key and strip">
          <p className="plate-mark">RK · BOARD 01 · CO</p>
          <button
            type="button"
            className={night ? 'nightkey pulled' : 'nightkey'}
            onClick={toggleNight}
            aria-pressed={night}
            aria-label={night ? 'Restore day and resume live board' : 'Pull night key and freeze sample'}
          >
            <span className="lever" aria-hidden="true">
              <i />
            </span>
            <span className="nightkey-copy">
              <em>{night ? 'night' : 'day'}</em>
              {night ? 'RESTORE' : 'NIGHT KEY'}
            </span>
          </button>

          <dl className="strip">
            <Readout k="slot" v={slot} live={live} />
            <Readout k="tps" v={tps} live={live} />
            <Readout k="rtt" v={rtt} unit="ms" live={live} />
            <Readout k="rpc" v={hud.degraded ? 'degraded' : hud.host} live={live} />
          </dl>

          <div className="busy" aria-hidden="true">
            <span>idle</span>
            <i>
              <b style={{ width: `${Math.round(hud.fee * 100)}%` }} />
            </i>
            <span>busy</span>
          </div>

          <ol className="legend">
            {FAMILIES.map((f) => (
              <li key={f}>
                <i style={{ background: familyColor(f as Family) }} />
                {familyLabel(f as Family)}
              </li>
            ))}
            <li>
              <i className="fail" />
              drop / fail
            </li>
          </ol>
          <p className="hint">Space pulls the night key. Restore to resume the live board.</p>
        </aside>
      </main>
    </div>
  )
}

function Readout({
  k,
  v,
  unit,
  live,
}: {
  k: string
  v: string
  unit?: string
  live: boolean
}) {
  return (
    <div className={live ? 'read live' : 'read'}>
      <dt>{k}</dt>
      <dd>
        {v}
        {unit ? <em>{unit}</em> : null}
      </dd>
    </div>
  )
}

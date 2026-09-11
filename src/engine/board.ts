import { familyColor, type Family } from '../lib/programs.ts'
import { PALETTE } from '../lib/palette.ts'

export type CordSpec = {
  family: Family
  sig: string
  failed: boolean
}

type CordState = 'plugging' | 'seated' | 'dropping'

type Cord = {
  family: Family
  sig: string
  failed: boolean
  col: number
  row: number
  shelf: number
  progress: number
  state: CordState
  age: number
  hold: number
  wobble: number
}

type Dropped = {
  family: Family
  shelf: number
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  life: number
}

type Lamp = {
  heat: number
  fail: number
  answer: number
}

type Layout = {
  cols: number
  rows: number
  lamps: number
  frame: Rect
  panel: Rect
  lampBand: Rect
  jackField: Rect
  shelf: Rect
  jackR: number
  colW: number
  rowH: number
}

type Rect = { x: number; y: number; w: number; h: number }

const COL_MARK = '123456789ABC'

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a)
  const pb = hex(b)
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
  return `rgb(${r},${g},${bl})`
}

function hex(c: string): [number, number, number] {
  const n = c.replace('#', '')
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export class Switchboard {
  frozen = false
  reduced = false
  tps: number | null = null
  fee = 0.1
  slot: number | null = null

  private lastSlot = -1
  private slotFlash = 0
  private cords: Cord[] = []
  private dropped: Dropped[] = []
  private lamps: Lamp[] = []
  private colHeat: number[] = []
  private layout: Layout | null = null
  private plugBudget = 0

  setSlot(slot: number, _now: number) {
    if (slot === this.slot) return
    const jumped = this.slot != null && slot > this.slot
    this.slot = slot
    if (jumped || this.lastSlot < 0) {
      this.slotFlash = 1
      this.plugBudget += this.reduced ? 2 : 3
      if (this.tps != null && this.tps > 2500) this.plugBudget += 1
    }
    this.lastSlot = slot
  }

  step(dt: number, _now: number, pull: () => CordSpec | null) {
    if (this.frozen) return
    const lay = this.layout
    if (!lay) return

    this.slotFlash = Math.max(0, this.slotFlash - dt * 1.8)
    this.ensureBanks(lay)

    if (!this.reduced) {
      this.plugBudget += dt * (0.35 + this.fee * 0.8)
    }

    while (this.plugBudget >= 1) {
      const spec = pull()
      if (!spec) break
      this.plugBudget -= 1
      this.seat(spec, lay)
    }

    for (const lamp of this.lamps) {
      lamp.heat = Math.max(0, lamp.heat - dt * 0.55)
      lamp.fail = Math.max(0, lamp.fail - dt * 0.22)
      lamp.answer = Math.max(0, lamp.answer - dt * 1.4)
    }
    for (let i = 0; i < this.colHeat.length; i++) {
      this.colHeat[i] = Math.max(0, (this.colHeat[i] ?? 0) - dt * 0.35)
    }

    if (this.slot != null) {
      const idx = ((this.slot % lay.lamps) + lay.lamps) % lay.lamps
      const lamp = this.lamps[idx]
      if (lamp) {
        lamp.heat = Math.max(lamp.heat, 0.55 + this.slotFlash * 0.45)
        if (this.slotFlash > 0.4) lamp.answer = Math.max(lamp.answer, this.slotFlash)
      }
    }

    for (const c of this.cords) {
      c.age += dt
      if (c.state === 'plugging') {
        const speed = this.reduced ? 8 : 1.35 + this.fee * 0.4
        c.progress = Math.min(1, c.progress + dt * speed)
        if (c.progress >= 1) {
          c.state = 'seated'
          c.hold = c.failed ? 3.4 : 6.5 + hash(c.sig.length) * 4
          this.answer(c)
        }
      } else if (c.state === 'seated') {
        c.hold -= dt
        if (c.hold <= 0) c.state = 'dropping'
      } else if (c.state === 'dropping') {
        const speed = this.reduced ? 8 : 1.7
        c.progress = Math.max(0, c.progress - dt * speed)
        c.wobble += dt * 14
        if (c.progress <= 0) {
          if (c.failed) this.lingerFail(c, lay)
          this.dropPlug(c, lay)
          c.progress = -1
        }
      }
    }
    this.cords = this.cords.filter((c) => c.progress >= 0)

    for (const d of this.dropped) {
      d.life -= dt
      d.vy += 420 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.rot += d.vx * dt * 0.04
      const floor = lay.shelf.y + lay.shelf.h * 0.72
      if (d.y > floor) {
        d.y = floor
        d.vy *= -0.22
        d.vx *= 0.6
      }
    }
    this.dropped = this.dropped.filter((d) => d.life > 0)
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, _dpr: number, now: number) {
    const lay = this.measure(w, h)
    this.layout = lay
    this.ensureBanks(lay)
    this.clampCords(lay)

    ctx.clearRect(0, 0, w, h)
    this.drawOffice(ctx, w, h)
    this.drawFrame(ctx, lay)
    this.drawPanel(ctx, lay)
    this.drawLampField(ctx, lay, now)
    this.drawJackField(ctx, lay)
    this.drawCords(ctx, lay)
    this.drawDropped(ctx)
    this.drawShelf(ctx, lay)
    this.drawNameplate(ctx, lay)
    if (this.frozen) this.drawNightVeil(ctx, lay)
  }

  private clampCords(lay: Layout) {
    for (const c of this.cords) {
      c.col = c.col % lay.cols
      c.row = c.row % lay.rows
      c.shelf = c.shelf % Math.max(lay.cols, 8)
    }
  }

  private ensureBanks(lay: Layout) {
    while (this.lamps.length < lay.lamps) this.lamps.push({ heat: 0, fail: 0, answer: 0 })
    if (this.lamps.length > lay.lamps) this.lamps.length = lay.lamps
    while (this.colHeat.length < lay.cols) this.colHeat.push(0)
    if (this.colHeat.length > lay.cols) this.colHeat.length = lay.cols
  }

  private measure(w: number, h: number): Layout {
    const pad = Math.max(6, Math.min(w, h) * 0.018)
    const frame = { x: pad, y: pad * 0.5, w: w - pad * 2, h: h - pad * 1.15 }
    const ft = clamp(Math.min(w, h) * 0.042, 16, 28)
    const panel = { x: frame.x + ft, y: frame.y + ft * 0.85, w: frame.w - ft * 2, h: frame.h - ft * 1.85 }
    const lampH = clamp(panel.h * 0.15, 40, 78)
    const shelfH = clamp(panel.h * 0.24, 56, 110)
    const lampBand = { x: panel.x + 10, y: panel.y + 8, w: panel.w - 20, h: lampH }
    const jackField = {
      x: panel.x + 12,
      y: lampBand.y + lampBand.h + 6,
      w: panel.w - 24,
      h: panel.h - lampH - shelfH - 22,
    }
    const shelf = {
      x: panel.x + 6,
      y: panel.y + panel.h - shelfH - 4,
      w: panel.w - 12,
      h: shelfH,
    }
    const cols = w < 420 ? 6 : w < 640 ? 8 : w < 900 ? 10 : 12
    const rows = h < 460 ? 4 : h < 620 ? 5 : 6
    const colW = jackField.w / cols
    const rowH = jackField.h / (rows + 0.35)
    const jackR = clamp(Math.min(colW, rowH) * 0.32, 6.5, 13)
    const lamps = cols
    return { cols, rows, lamps, frame, panel, lampBand, jackField, shelf, jackR, colW, rowH }
  }

  private jackAt(lay: Layout, col: number, row: number): { x: number; y: number } {
    return {
      x: lay.jackField.x + (col + 0.5) * lay.colW,
      y: lay.jackField.y + 14 + (row + 0.45) * lay.rowH,
    }
  }

  private shelfX(lay: Layout, shelf: number): number {
    const n = Math.max(lay.cols, 8)
    const i = ((shelf % n) + n) % n
    return lay.shelf.x + 18 + ((i + 0.5) * (lay.shelf.w - 36)) / n
  }

  private seat(spec: CordSpec, lay: Layout) {
    if (this.cords.some((c) => c.sig === spec.sig)) return
    let h = 2166136261
    for (let i = 0; i < spec.sig.length; i++) h = Math.imul(h ^ spec.sig.charCodeAt(i), 16777619)
    const prefer = { col: Math.abs(h) % lay.cols, row: Math.abs(h >>> 8) % lay.rows }
    let col = prefer.col
    let row = prefer.row
    const occupied = new Set(this.cords.map((c) => `${c.col}:${c.row}`))
    if (occupied.has(`${col}:${row}`)) {
      let found = false
      for (let k = 0; k < lay.cols * lay.rows; k++) {
        const c = (prefer.col + k) % lay.cols
        const r = (prefer.row + Math.floor(k / lay.cols)) % lay.rows
        if (!occupied.has(`${c}:${r}`)) {
          col = c
          row = r
          found = true
          break
        }
      }
      if (!found) {
        const oldest = this.cords.find((c) => c.state === 'seated')
        if (oldest) oldest.state = 'dropping'
        else return
      }
    }
    if (this.cords.length > 22) {
      const oldest = this.cords.find((c) => c.state === 'seated')
      if (oldest) oldest.state = 'dropping'
    }
    this.cords.push({
      family: spec.family,
      sig: spec.sig,
      failed: spec.failed,
      col,
      row,
      shelf: Math.abs(h >>> 16) % Math.max(lay.cols, 8),
      progress: this.reduced ? 1 : 0,
      state: this.reduced ? 'seated' : 'plugging',
      age: 0,
      hold: spec.failed ? 3.4 : 7,
      wobble: 0,
    })
    if (this.reduced) this.answer(this.cords[this.cords.length - 1]!)
  }

  private answer(c: Cord) {
    const lamp = this.lamps[c.col]
    if (lamp) {
      lamp.answer = 1
      lamp.heat = Math.max(lamp.heat, 0.85)
      if (c.failed) lamp.fail = Math.max(lamp.fail, 1)
    }
    if (this.colHeat[c.col] != null) this.colHeat[c.col] = 1
  }

  private lingerFail(c: Cord, _lay: Layout) {
    const lamp = this.lamps[c.col]
    if (lamp) lamp.fail = Math.max(lamp.fail, 1.15)
  }

  private dropPlug(c: Cord, lay: Layout) {
    const jack = this.jackAt(lay, c.col, c.row)
    this.dropped.push({
      family: c.family,
      shelf: c.shelf,
      x: jack.x,
      y: jack.y,
      vx: (hash(c.sig.charCodeAt(0)) - 0.5) * 80,
      vy: 40,
      rot: 0,
      life: c.failed ? 2.8 : 1.4,
    })
  }

  private drawOffice(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const g = ctx.createRadialGradient(w * 0.45, h * 0.35, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.7)
    g.addColorStop(0, '#1A120C')
    g.addColorStop(1, PALETTE.soot)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  private drawFrame(ctx: CanvasRenderingContext2D, lay: Layout) {
    const { frame } = lay
    const wood = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.w, frame.y + frame.h)
    wood.addColorStop(0, '#4A2E1A')
    wood.addColorStop(0.45, '#322012')
    wood.addColorStop(1, '#1E120A')
    ctx.fillStyle = wood
    ctx.beginPath()
    ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 6)
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 6)
    ctx.clip()
    ctx.strokeStyle = 'rgba(80,50,24,0.35)'
    ctx.lineWidth = 1
    for (let i = 0; i < 28; i++) {
      const y = frame.y + hash(i + 2) * frame.h
      ctx.beginPath()
      ctx.moveTo(frame.x, y)
      ctx.bezierCurveTo(
        frame.x + frame.w * 0.33,
        y + (hash(i) - 0.5) * 10,
        frame.x + frame.w * 0.66,
        y + (hash(i + 9) - 0.5) * 10,
        frame.x + frame.w,
        y,
      )
      ctx.stroke()
    }
    ctx.restore()

    ctx.strokeStyle = mix(PALETTE.brass, PALETTE.bakelite, 0.55)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(frame.x + 3, frame.y + 3, frame.w - 6, frame.h - 6, 4)
    ctx.stroke()

    const screws: [number, number][] = [
      [frame.x + 10, frame.y + 10],
      [frame.x + frame.w - 10, frame.y + 10],
      [frame.x + 10, frame.y + frame.h - 10],
      [frame.x + frame.w - 10, frame.y + frame.h - 10],
    ]
    for (const [sx, sy] of screws) this.screw(ctx, sx, sy)
  }

  private drawPanel(ctx: CanvasRenderingContext2D, lay: Layout) {
    const { panel } = lay
    const g = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h)
    g.addColorStop(0, '#2A1C14')
    g.addColorStop(0.4, PALETTE.bakelite)
    g.addColorStop(1, '#140E0A')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 3)
    ctx.fill()

    ctx.save()
    ctx.globalAlpha = 0.08
    ctx.strokeStyle = PALETTE.ivory
    ctx.lineWidth = 1
    for (let i = 0; i < 16; i++) {
      const x = panel.x + 8 + (i / 16) * panel.w
      ctx.beginPath()
      ctx.moveTo(x, panel.y)
      ctx.lineTo(x + 4, panel.y + panel.h)
      ctx.stroke()
    }
    ctx.restore()

    ctx.strokeStyle = mix(PALETTE.brass, PALETTE.soot, 0.62)
    ctx.lineWidth = 1
    ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1)
  }

  private drawLampField(ctx: CanvasRenderingContext2D, lay: Layout, now: number) {
    const { lampBand, lamps } = lay
    ctx.fillStyle = '#120E0B'
    ctx.fillRect(lampBand.x, lampBand.y, lampBand.w, lampBand.h)

    ctx.strokeStyle = mix(PALETTE.brass, PALETTE.bakelite, 0.5)
    ctx.strokeRect(lampBand.x, lampBand.y, lampBand.w, lampBand.h)

    ctx.fillStyle = mix(PALETTE.ivory, PALETTE.bakelite, 0.45)
    ctx.font = `600 ${Math.max(8, lampBand.h * 0.16)}px Oswald, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('SUPERVISORY', lampBand.x + 8, lampBand.y + 12)

    const inner = { x: lampBand.x + 8, y: lampBand.y + 16, w: lampBand.w - 16, h: lampBand.h - 22 }
    const r = clamp(inner.h * 0.32, 6, 11)
    for (let i = 0; i < lamps; i++) {
      const x = inner.x + ((i + 0.5) * inner.w) / lamps
      const y = inner.y + inner.h * 0.58
      const lamp = this.lamps[i] ?? { heat: 0, fail: 0, answer: 0 }
      const pulse = this.reduced ? 0 : Math.sin(now / 140 + i) * 0.06
      this.lamp(ctx, x, y, r, lamp.heat + pulse, lamp.fail, lamp.answer)
    }
  }

  private lamp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    heat: number,
    fail: number,
    answer: number,
  ) {
    ctx.beginPath()
    ctx.arc(x, y, r + 2.2, 0, Math.PI * 2)
    ctx.fillStyle = mix(PALETTE.brass, PALETTE.soot, 0.35)
    ctx.fill()

    const on = clamp(heat + answer * 0.4, 0, 1)
    const failOn = clamp(fail, 0, 1)
    const color = failOn > on ? PALETTE.oxblood : PALETTE.tungsten
    const amount = Math.max(on, failOn)

    if (amount > 0.05 && !this.frozen) {
      const bloom = ctx.createRadialGradient(x, y, 0, x, y, r * (2.8 + answer * 1.4))
      bloom.addColorStop(0, color)
      bloom.addColorStop(0.35, mix(color, PALETTE.bakelite, 0.2))
      bloom.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.globalAlpha = 0.22 + amount * 0.45
      ctx.fillStyle = bloom
      ctx.beginPath()
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const glass = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0.5, x, y, r)
    glass.addColorStop(0, mix(PALETTE.ivory, color, 0.25 + amount * 0.5))
    glass.addColorStop(0.55, mix(color, PALETTE.bakelite, 1 - amount * 0.7))
    glass.addColorStop(1, mix(PALETTE.soot, color, 0.15))
    ctx.beginPath()
    ctx.arc(x, y, r - 0.6, 0, Math.PI * 2)
    ctx.fillStyle = glass
    ctx.fill()
  }

  private drawJackField(ctx: CanvasRenderingContext2D, lay: Layout) {
    const { jackField, cols, rows } = lay
    ctx.fillStyle = '#16100C'
    ctx.fillRect(jackField.x, jackField.y, jackField.w, jackField.h)
    ctx.strokeStyle = mix(PALETTE.brass, PALETTE.bakelite, 0.6)
    ctx.strokeRect(jackField.x, jackField.y, jackField.w, jackField.h)

    ctx.font = `600 ${Math.max(8, lay.jackR * 1.05)}px Oswald, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = mix(PALETTE.ivory, PALETTE.bakelite, 0.4)

    for (let c = 0; c < cols; c++) {
      const mark = COL_MARK[c] ?? String(c + 1)
      const x = jackField.x + (c + 0.5) * lay.colW
      ctx.fillText(mark, x, jackField.y + 11)
      const heat = this.colHeat[c] ?? 0
      if (heat > 0.04) {
        ctx.save()
        ctx.globalAlpha = heat * 0.18
        ctx.fillStyle = PALETTE.tungsten
        ctx.fillRect(x - lay.colW * 0.42, jackField.y + 13, lay.colW * 0.84, jackField.h - 16)
        ctx.restore()
      }
      for (let r = 0; r < rows; r++) {
        const p = this.jackAt(lay, c, r)
        this.jack(ctx, p.x, p.y, lay.jackR, heat)
      }
    }
  }

  private jack(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, heat: number) {
    ctx.beginPath()
    ctx.arc(x, y, r + 1.8, 0, Math.PI * 2)
    ctx.fillStyle = mix(PALETTE.brass, PALETTE.soot, 0.28)
    ctx.fill()

    const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
    ring.addColorStop(0, mix(PALETTE.ivory, PALETTE.brass, 0.35))
    ring.addColorStop(0.45, PALETTE.brass)
    ring.addColorStop(1, mix(PALETTE.brass, PALETTE.soot, 0.45))
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = ring
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, r * 0.58, 0, Math.PI * 2)
    ctx.fillStyle = mix(PALETTE.soot, PALETTE.tungsten, heat * 0.12)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x - r * 0.25, y - r * 0.28, r * 0.18, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,230,180,0.18)'
    ctx.fill()
  }

  private drawCords(ctx: CanvasRenderingContext2D, lay: Layout) {
    const ordered = [...this.cords].sort((a, b) => a.age - b.age)
    for (const c of ordered) this.cord(ctx, lay, c)
  }

  private cord(ctx: CanvasRenderingContext2D, lay: Layout, c: Cord) {
    const jack = this.jackAt(lay, c.col, c.row)
    const sx = this.shelfX(lay, c.shelf)
    const sy = lay.shelf.y + 16
    const t = c.progress
    const wob = c.state === 'dropping' ? Math.sin(c.wobble) * 10 * (1 - t) : 0
    const ex = jack.x + wob
    const ey = jack.y
    const hang = 22 + (1 - t) * 10
    const cx1 = sx
    const cy1 = sy + hang
    const cx2 = ex
    const cy2 = ey + (sy - ey) * 0.42

    const px = (u: number) => {
      const mt = 1 - u
      return mt * mt * mt * sx + 3 * mt * mt * u * cx1 + 3 * mt * u * u * cx2 + u * u * u * ex
    }
    const py = (u: number) => {
      const mt = 1 - u
      return mt * mt * mt * sy + 3 * mt * mt * u * cy1 + 3 * mt * u * u * cy2 + u * u * u * ey
    }

    const tint = c.failed ? PALETTE.oxblood : familyColor(c.family)
    const cloth = mix(PALETTE.bakelite, tint, 0.28)

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, px(t), py(t))
    ctx.strokeStyle = '#0A0705'
    ctx.lineWidth = 9.5
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = cloth
    ctx.lineWidth = 7.2
    ctx.stroke()
    ctx.strokeStyle = tint
    ctx.lineWidth = 3.1
    ctx.stroke()

    const tx = px(t)
    const ty = py(t)
    ctx.beginPath()
    ctx.arc(tx, ty, 5.4, 0, Math.PI * 2)
    ctx.fillStyle = mix(PALETTE.brass, tint, 0.2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(tx, ty, 3.1, 0, Math.PI * 2)
    ctx.fillStyle = tint
    ctx.fill()

    ctx.fillStyle = mix(PALETTE.brass, PALETTE.bakelite, 0.12)
    ctx.beginPath()
    ctx.roundRect(sx - 5.5, sy - 4, 11, 20, 2)
    ctx.fill()
    ctx.fillStyle = tint
    ctx.fillRect(sx - 5.5, sy + 10, 11, 4)
    ctx.restore()
  }

  private drawDropped(ctx: CanvasRenderingContext2D) {
    for (const d of this.dropped) {
      const tint = familyColor(d.family)
      ctx.save()
      ctx.translate(d.x, d.y)
      ctx.rotate(d.rot)
      ctx.globalAlpha = clamp(d.life / 1.2, 0, 1)
      ctx.fillStyle = mix(PALETTE.brass, PALETTE.bakelite, 0.15)
      ctx.fillRect(-4, -8, 8, 16)
      ctx.fillStyle = tint
      ctx.fillRect(-4, 4, 8, 3)
      ctx.restore()
    }
  }

  private drawShelf(ctx: CanvasRenderingContext2D, lay: Layout) {
    const { shelf } = lay
    const glow = this.frozen ? this.fee * 0.25 : this.fee
    const g = ctx.createLinearGradient(shelf.x, shelf.y, shelf.x, shelf.y + shelf.h)
    g.addColorStop(0, mix(PALETTE.tungsten, PALETTE.bakelite, 1 - glow * 0.45))
    g.addColorStop(0.35, '#2A1C12')
    g.addColorStop(1, '#120C08')
    ctx.fillStyle = g
    ctx.fillRect(shelf.x, shelf.y, shelf.w, shelf.h)

    if (glow > 0.08) {
      const bloom = ctx.createLinearGradient(shelf.x, shelf.y, shelf.x, shelf.y + shelf.h * 0.7)
      bloom.addColorStop(0, `rgba(240,180,74,${0.08 + glow * 0.28})`)
      bloom.addColorStop(1, 'rgba(240,180,74,0)')
      ctx.fillStyle = bloom
      ctx.fillRect(shelf.x, shelf.y, shelf.w, shelf.h)
    }

    ctx.strokeStyle = mix(PALETTE.brass, PALETTE.soot, 0.4)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(shelf.x, shelf.y + 1)
    ctx.lineTo(shelf.x + shelf.w, shelf.y + 1)
    ctx.stroke()

    ctx.fillStyle = mix(PALETTE.ivory, PALETTE.bakelite, 0.5)
    ctx.font = `600 ${Math.max(8, shelf.h * 0.16)}px Oswald, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('CORD SHELF', shelf.x + 8, shelf.y + shelf.h - 8)

    const n = Math.max(lay.cols, 8)
    for (let i = 0; i < n; i++) {
      const x = this.shelfX(lay, i)
      const used = this.cords.some((c) => c.shelf === i)
      ctx.strokeStyle = mix(PALETTE.soot, PALETTE.brass, 0.15)
      ctx.lineWidth = 4.5
      ctx.beginPath()
      ctx.moveTo(x, shelf.y + 6)
      ctx.lineTo(x, shelf.y + (used ? 16 : 34))
      ctx.stroke()
      ctx.fillStyle = mix(PALETTE.brass, PALETTE.soot, used ? 0.2 : 0.35)
      ctx.beginPath()
      ctx.roundRect(x - 5, shelf.y + 4, 10, used ? 12 : 28, 2)
      ctx.fill()
      if (!used) {
        ctx.fillStyle = mix(PALETTE.ivory, PALETTE.bakelite, 0.35)
        ctx.fillRect(x - 5, shelf.y + 24, 10, 4)
      }
    }
  }

  private drawNameplate(ctx: CanvasRenderingContext2D, lay: Layout) {
    const { panel } = lay
    ctx.save()
    ctx.fillStyle = mix(PALETTE.brass, PALETTE.bakelite, 0.25)
    ctx.font = `600 ${Math.max(9, panel.w * 0.014)}px Oswald, sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText('WESTERN ELECTRIC  ·  605A  ·  SLOT OFFICE', panel.x + panel.w - 12, panel.y + panel.h - 8)
    ctx.restore()
  }

  private drawNightVeil(ctx: CanvasRenderingContext2D, lay: Layout) {
    ctx.save()
    ctx.fillStyle = 'rgba(8,6,4,0.28)'
    ctx.fillRect(lay.panel.x, lay.panel.y, lay.panel.w, lay.panel.h)
    ctx.restore()
  }

  private screw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.beginPath()
    ctx.arc(x, y, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = mix(PALETTE.brass, PALETTE.soot, 0.2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - 2, y)
    ctx.lineTo(x + 2, y)
    ctx.strokeStyle = PALETTE.soot
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

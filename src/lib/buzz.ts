/** Quiet 58 Hz busy-tone. Unlock after a user gesture. */
export class BusyBuzz {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private armed = false

  unlock() {
    if (this.armed) return
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const hum = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 58
    hum.type = 'sine'
    hum.frequency.value = 116
    gain.gain.value = 0
    osc.connect(gain)
    hum.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    hum.start()
    void ctx.resume()
    this.ctx = ctx
    this.gain = gain
    this.armed = true
  }

  set(fee: number, live: boolean, reduced: boolean) {
    if (!this.gain || !this.ctx) return
    const target = !live || reduced ? 0 : 0.012 + fee * 0.028
    const g = this.gain.gain
    const t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    g.setTargetAtTime(target, t, 0.18)
  }

  stop() {
    this.set(0, false, true)
  }
}

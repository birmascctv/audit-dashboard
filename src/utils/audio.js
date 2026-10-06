/**
 * Web Audio API synthesizer for Barcode Scanner audio feedback.
 * Provides instant audio feedback during store inventory audits.
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Standard pleasant scanner beep for count tally
 */
export function playScanSuccessSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1550, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.07);
  } catch (err) {
    console.debug('Audio playback note:', err);
  }
}

/**
 * Pleasant success chime when physical count reaches 100% of ESB expected stock
 */
export function playScanMatchSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    [1046.5, 1318.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.16);
    });
  } catch (err) {
    console.debug('Audio playback note:', err);
  }
}

/**
 * Warning buzz if barcode is unknown or overcounted
 */
export function playScanErrorSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, ctx.currentTime);
    osc.frequency.setValueAtTime(180, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);
  } catch (err) {
    console.debug('Audio playback note:', err);
  }
}

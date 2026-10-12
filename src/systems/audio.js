const EFFECTS = Object.freeze({
  chop: Object.freeze({ frequency: 180, endFrequency: 110, duration: 0.055, type: 'square' }),
  crack: Object.freeze({ frequency: 420, endFrequency: 170, duration: 0.09, type: 'triangle' }),
  pour: Object.freeze({ frequency: 240, endFrequency: 90, duration: 0.16, type: 'sine' }),
  stir: Object.freeze({ frequency: 130, endFrequency: 95, duration: 0.08, type: 'sine' }),
  result: Object.freeze({ frequency: 440, endFrequency: 740, duration: 0.28, type: 'triangle' }),
});

function defaultContextFactory() {
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return typeof AudioContext === 'function' ? new AudioContext() : null;
}

export function createAudioSystem({ contextFactory = defaultContextFactory, muted = false } = {}) {
  let context = null;
  let unlocked = false;
  let disposed = false;
  let isMuted = Boolean(muted);

  return {
    async unlock() {
      if (disposed) return false;
      if (!context) {
        try {
          context = contextFactory?.() ?? null;
        } catch {
          context = null;
        }
      }
      if (!context) return false;
      try {
        if (context.state === 'suspended') await context.resume();
        unlocked = true;
        return true;
      } catch {
        return false;
      }
    },
    play(name) {
      const effect = EFFECTS[name];
      if (!effect || !context || !unlocked || isMuted || disposed) return false;
      try {
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = effect.type;
        oscillator.frequency.setValueAtTime(effect.frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(effect.endFrequency, now + effect.duration);
        gain.gain.setValueAtTime(0.075, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + effect.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + effect.duration);
        return true;
      } catch {
        return false;
      }
    },
    setMuted(nextMuted) {
      isMuted = Boolean(nextMuted);
      return isMuted;
    },
    isMuted: () => isMuted,
    isUnlocked: () => unlocked,
    async dispose() {
      if (disposed) return;
      disposed = true;
      unlocked = false;
      try {
        await context?.close?.();
      } catch {
        // Audio failure must never block play.
      }
      context = null;
    },
  };
}

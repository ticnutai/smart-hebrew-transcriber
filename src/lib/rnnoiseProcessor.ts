/**
 * AI-style Noise Suppression using Web Audio API
 * Uses spectral subtraction with noise estimation - runs entirely in browser
 */

export interface NoiseSuppressionState {
  enabled: boolean;
  strength: number; // 0-1
}

export function createNoiseSuppressionChain(
  ctx: AudioContext,
  input: AudioNode,
  output: AudioNode,
): {
  enable: () => void;
  disable: () => void;
  setStrength: (v: number) => void;
  isEnabled: () => boolean;
  destroy: () => void;
} {
  const FRAME_SIZE = 2048;
  let enabled = false;
  let strength = 0.7;

  // Noise floor estimation (running average of quiet frames)
  const noiseFloor = new Float32Array(FRAME_SIZE / 2 + 1);
  let noiseEstimated = false;
  let frameCount = 0;
  const NOISE_LEARN_FRAMES = 15;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  analyser.smoothingTimeConstant = 0.3;

  // Wet/dry gain nodes
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  dryGain.gain.value = 1;
  wetGain.gain.value = 0;

  // Processing chain for wet path
  // We use a series of narrow notch/bandpass filters to attenuate noise bands
  const NUM_BANDS = 8;
  const bandFilters: BiquadFilterNode[] = [];
  const bandFreqs = [125, 250, 500, 1000, 2000, 4000, 6000, 8000];

  let prevNode: AudioNode = input;
  for (let i = 0; i < NUM_BANDS; i++) {
    const f = ctx.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = bandFreqs[i];
    f.Q.value = 1.5;
    f.gain.value = 0;
    bandFilters.push(f);
    prevNode.connect(f);
    prevNode = f;
  }

  // Compressor for dynamic noise reduction
  const expander = ctx.createDynamicsCompressor();
  expander.threshold.value = -45;
  expander.ratio.value = 4;
  expander.knee.value = 10;
  expander.attack.value = 0.005;
  expander.release.value = 0.1;
  prevNode.connect(expander);
  expander.connect(wetGain);

  // Dry path
  input.connect(dryGain);

  // Both to output
  dryGain.connect(output);
  wetGain.connect(output);

  // Connect analyser to input for noise analysis
  input.connect(analyser);

  // ScriptProcessor for noise analysis (lightweight - only reads data)
  const freqData = new Float32Array(analyser.frequencyBinCount);

  let intervalId: ReturnType<typeof setInterval> | null = null;

  function startAnalysis() {
    if (intervalId) return;
    frameCount = 0;
    noiseEstimated = false;
    noiseFloor.fill(0);

    intervalId = setInterval(() => {
      if (!enabled) return;
      analyser.getFloatFrequencyData(freqData);

      // Learn noise floor from first N frames (assumed quiet start)
      if (!noiseEstimated && frameCount < NOISE_LEARN_FRAMES) {
        for (let i = 0; i < freqData.length; i++) {
          noiseFloor[i] += freqData[i] / NOISE_LEARN_FRAMES;
        }
        frameCount++;
        if (frameCount >= NOISE_LEARN_FRAMES) {
          noiseEstimated = true;
          applyNoiseReduction();
        }
        return;
      }

      // Adaptive: if current frame is quieter than noise floor, update
      if (noiseEstimated) {
        const avgLevel = freqData.reduce((s, v) => s + v, 0) / freqData.length;
        const avgNoise = noiseFloor.reduce((s, v) => s + v, 0) / noiseFloor.length;
        if (avgLevel < avgNoise + 3) {
          // Very quiet frame - update noise estimate slowly
          for (let i = 0; i < freqData.length; i++) {
            noiseFloor[i] = noiseFloor[i] * 0.95 + freqData[i] * 0.05;
          }
          applyNoiseReduction();
        }
      }
    }, 100);
  }

  function applyNoiseReduction() {
    // Map noise floor to band filter gains
    for (let i = 0; i < NUM_BANDS; i++) {
      const freq = bandFreqs[i];
      const binIndex = Math.round(freq / (ctx.sampleRate / FRAME_SIZE));
      const noiseLevelDb = noiseFloor[Math.min(binIndex, noiseFloor.length - 1)] || -80;
      
      // If noise is loud in this band, attenuate it
      // Scale by strength
      const attenuation = Math.min(0, Math.max(-18, (noiseLevelDb + 40) * strength * -0.5));
      bandFilters[i].gain.value = attenuation;
    }

    // Adjust expander threshold based on noise level
    const avgNoise = noiseFloor.reduce((s, v) => s + v, 0) / noiseFloor.length;
    expander.threshold.value = Math.max(-60, Math.min(-20, avgNoise + 15 * strength));
  }

  function stopAnalysis() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    enable() {
      enabled = true;
      dryGain.gain.value = 0;
      wetGain.gain.value = 1;
      startAnalysis();
    },
    disable() {
      enabled = false;
      dryGain.gain.value = 1;
      wetGain.gain.value = 0;
      stopAnalysis();
      // Reset filters
      bandFilters.forEach(f => { f.gain.value = 0; });
    },
    setStrength(v: number) {
      strength = Math.max(0, Math.min(1, v));
      if (noiseEstimated) applyNoiseReduction();
    },
    isEnabled() { return enabled; },
    destroy() {
      stopAnalysis();
      try {
        input.disconnect(analyser);
        input.disconnect(dryGain);
        bandFilters.forEach((f, i) => {
          try { f.disconnect(); } catch {}
        });
        expander.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
      } catch {}
    },
  };
}

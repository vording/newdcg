// 効果音（Web Audio で合成する。音声ファイルは使わない）。
// ブラウザの決まりで、最初のクリック／タップの後にだけ音が鳴る。

const SOUND_KEY = 'dcg-sound';
let audioCtx = null;
let masterGain = null;
let noiseBuf = null;
let soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch { /* 保存できない環境では既定のまま */ }

export function isSoundOn() { return soundOn; }
export function setSoundOn(on) {
  soundOn = on;
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* 無視 */ }
  if (on) unlockAudio();
}

/** ユーザー操作の中で呼ぶ。AudioContext を作り、止まっていれば再開する */
export function unlockAudio() {
  if (!soundOn) return;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(audioCtx.destination);
      noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    // iPhone：マナーモード（消音スイッチ）でも効果音が鳴るよう「再生」用の音声セッションにする（iOS 17+）
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 非対応 */ }
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    // iOS は操作の中で実際に音を1回出さないと解錠されないことがあるので、無音を一瞬鳴らす
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination);
    src.start(0);
  } catch { audioCtx = null; }
}

function ready() {
  if (!soundOn || !audioCtx) return false;
  // 画面を切り替えた後などで止まっていたら再開を試みる
  if (audioCtx.state !== 'running') { audioCtx.resume().catch(() => {}); return false; }
  return true;
}

/** 音程つきの短い音 */
function tone({ freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.005 }) {
  const t = audioCtx.currentTime + delay;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(masterGain);
  o.start(t); o.stop(t + dur + 0.02);
}

/** ノイズ（打撃・風切り音） */
function noise({ dur = 0.15, vol = 0.3, delay = 0, filter = 'lowpass', freq = 1200, to = null, q = 1 }) {
  const t = audioCtx.currentTime + delay;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  const f = audioCtx.createBiquadFilter();
  f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(masterGain);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

const SFX = {
  click: () => tone({ freq: 900, type: 'triangle', dur: 0.05, vol: 0.12 }),
  draw: () => noise({ dur: 0.12, vol: 0.18, filter: 'bandpass', freq: 3000, to: 1500, q: 0.8 }),
  play: () => { noise({ dur: 0.1, vol: 0.2, filter: 'bandpass', freq: 1800, q: 0.7 }); tone({ freq: 220, type: 'triangle', dur: 0.12, vol: 0.15 }); },
  summon: () => {
    noise({ dur: 0.25, vol: 0.25, freq: 400, to: 120 });
    tone({ freq: 196, type: 'triangle', dur: 0.35, vol: 0.22 });
    tone({ freq: 294, type: 'triangle', dur: 0.3, vol: 0.14, delay: 0.06 });
  },
  spell: () => {
    tone({ freq: 660, to: 1320, type: 'sine', dur: 0.3, vol: 0.14 });
    tone({ freq: 990, to: 1760, type: 'sine', dur: 0.25, vol: 0.08, delay: 0.05 });
    noise({ dur: 0.3, vol: 0.08, filter: 'highpass', freq: 4000 });
  },
  quick: () => {
    tone({ freq: 1200, to: 600, type: 'square', dur: 0.08, vol: 0.06 });
    tone({ freq: 880, to: 1760, type: 'sine', dur: 0.22, vol: 0.14, delay: 0.04 });
  },
  attack: () => {
    noise({ dur: 0.28, vol: 0.3, filter: 'bandpass', freq: 600, to: 3000, q: 1.2 });
    tone({ freq: 110, to: 70, type: 'sawtooth', dur: 0.3, vol: 0.1 });
  },
  block: () => { tone({ freq: 520, type: 'square', dur: 0.06, vol: 0.08 }); noise({ dur: 0.18, vol: 0.25, freq: 2500, to: 600 }); },
  hit: () => { noise({ dur: 0.14, vol: 0.4, freq: 900, to: 200 }); tone({ freq: 140, to: 60, type: 'sine', dur: 0.16, vol: 0.3 }); },
  playerHit: () => { noise({ dur: 0.3, vol: 0.45, freq: 500, to: 80 }); tone({ freq: 90, to: 40, type: 'sine', dur: 0.35, vol: 0.4 }); },
  destroy: () => {
    noise({ dur: 0.45, vol: 0.35, freq: 1800, to: 100 });
    tone({ freq: 300, to: 60, type: 'sawtooth', dur: 0.4, vol: 0.08 });
  },
  shield: () => { tone({ freq: 1568, type: 'triangle', dur: 0.4, vol: 0.14 }); tone({ freq: 2093, type: 'sine', dur: 0.35, vol: 0.08, delay: 0.03 }); },
  heal: () => [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.3, vol: 0.12, delay: i * 0.06 })),
  buff: () => [392, 523].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.12, delay: i * 0.07 })),
  mana: () => tone({ freq: 1046, to: 1568, type: 'sine', dur: 0.2, vol: 0.12 }),
  turn: () => { tone({ freq: 392, type: 'triangle', dur: 0.25, vol: 0.12 }); tone({ freq: 523, type: 'triangle', dur: 0.35, vol: 0.12, delay: 0.12 }); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.16, delay: i * 0.13 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.55, vol: 0.14, delay: i * 0.18 })),
};

/** 効果音を鳴らす。同じ音が短時間に重なりすぎないようにする */
const lastAt = {};
export function sfx(name, delayMs = 0) {
  if (!ready() || !SFX[name]) return;
  const run = () => {
    const now = performance.now();
    if (lastAt[name] && now - lastAt[name] < 45) return;
    lastAt[name] = now;
    try { SFX[name](); } catch { /* 音が鳴らなくてもゲームは続ける */ }
  };
  if (delayMs > 0) setTimeout(run, delayMs); else run();
}

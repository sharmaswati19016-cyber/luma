// The 90 words that have an icon in public/icons/<word>.png
export const ICON_WORDS: string[] = [
  "anchor","apple","banner","barrel","basket","bell","belt","bench","bicycle","blanket",
  "bottle","bowl","box","bracelet","bridge","broom","brush","bucket","button","candle",
  "carpet","chain","chair","clock","cloud","coat","comb","compass","crate","cup",
  "curtain","drawer","drum","feather","fence","flag","flute","fork","garden","glove",
  "guitar","hammer","hat","hook","horn","jar","kettle","key","kite","knife",
  "ladder","lamp","lantern","lock","melon","mirror","mop","nail","napkin","necklace",
  "peg","piano","pillow","plate","purse","ribbon","ring","river","rope","scarf",
  "screw","shelf","shoe","soap","sock","sofa","spoon","stool","table","towel",
  "tray","trumpet","umbrella","violin","wagon","wallet","watch","wheel","whistle","window",
];

export function getIconSrc(word: string): string {
  return `/icons/${word.trim().toLowerCase()}.png`;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Look-alike pairs that must never share a tile set
export const LOOKALIKES: Record<string, string[]> = {
  nail: ["screw"], screw: ["nail"],
  mop: ["broom", "brush"], broom: ["mop", "brush"], brush: ["broom", "mop", "comb"], comb: ["brush"],
  banner: ["flag"], flag: ["banner"],
  tray: ["plate"], plate: ["tray", "bowl"], bowl: ["plate"],
  blanket: ["carpet", "towel"], carpet: ["blanket", "towel"], towel: ["blanket", "carpet"],
  flute: ["trumpet", "whistle", "horn"], trumpet: ["flute", "horn"],
  horn: ["trumpet", "flute"], whistle: ["flute"],
  bench: ["chair", "stool"], chair: ["bench", "stool", "sofa"], stool: ["chair", "bench"], sofa: ["chair"],
  rope: ["chain"], chain: ["rope", "necklace", "ring"],
  clock: ["watch"], watch: ["clock"],
  lamp: ["lantern", "candle"], lantern: ["lamp", "candle"], candle: ["lamp", "lantern"],
  necklace: ["bracelet", "ring", "chain"], bracelet: ["necklace", "ring"], ring: ["necklace", "bracelet", "chain"],
  purse: ["wallet"], wallet: ["purse"],
  box: ["crate"], crate: ["box"],
  basket: ["bucket"], bucket: ["basket"],
  jar: ["bottle"], bottle: ["jar"],
  violin: ["guitar"], guitar: ["violin"],
  scarf: ["ribbon"], ribbon: ["scarf"],
};

export function scoreFreeRecall(transcript: string, targetWords: string[]): number {
  const normalizedTranscript = ` ${transcript
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
  return targetWords.reduce((score, word) => {
    const normalizedWord = word
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return score + (normalizedWord && normalizedTranscript.includes(` ${normalizedWord} `) ? 1 : 0);
  }, 0);
}

function conflicts(a: string, b: string): boolean {
  return (LOOKALIKES[a] ?? []).includes(b) || (LOOKALIKES[b] ?? []).includes(a);
}

/**
 * Tiles for the picture-tap task: the 3 words of the day plus distractors,
 * no look-alike pairs on screen together. Returns shuffled words.
 */
export function buildPictureOptions(targets: string[], total = 6): string[] {
  const targetSet = targets.map((t) => t.trim().toLowerCase());
  const chosen = [...targetSet];

  for (const candidate of shuffle(ICON_WORDS)) {
    if (chosen.length >= total) break;
    if (chosen.includes(candidate)) continue;
    if (chosen.some((c) => conflicts(c, candidate))) continue;
    chosen.push(candidate);
  }
  return shuffle(chosen);
}

export interface PictureOption {
  word: string;
  src: string;
  isTarget: boolean;
}

const distractorWords = [
  "Apple",
  "River",
  "Lamp",
  "Chair",
  "Cloud",
  "Table",
  "Shoe",
  "Clock",
  "Garden",
  "Bridge",
  "Candle",
  "Pillow",
  "Window",
  "Basket",
  "Mirror",
  "Ladder",
  "Blanket",
  "Kettle",
  "Spoon",
  "Fork",
  "Knife",
  "Plate",
  "Cup",
  "Bucket",
  "Broom",
  "Mop",
  "Sock",
  "Glove",
  "Scarf",
  "Hat",
  "Coat",
  "Belt",
  "Wallet",
  "Purse",
  "Umbrella",
  "Bicycle",
  "Wagon",
  "Wheel",
  "Rope",
  "Nail",
  "Screw",
  "Brush",
  "Comb",
  "Soap",
  "Towel",
  "Curtain",
  "Carpet",
  "Sofa",
  "Bench",
  "Stool",
  "Shelf",
  "Drawer",
  "Box",
  "Crate",
  "Jar",
  "Bottle",
  "Bowl",
  "Tray",
  "Napkin",
  "Ring",
  "Necklace",
  "Bracelet",
  "Watch",
  "Key",
  "Lock",
  "Chain",
  "Hook",
  "Peg",
  "Flag",
  "Banner",
  "Bell",
  "Whistle",
  "Horn",
  "Trumpet",
  "Violin",
  "Guitar",
  "Piano",
  "Flute",
];

export function getIconSrc(word: string): string {
  const filename = word
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `/icons/${filename}.png`;
}

export function buildPictureOptions(words: string[]): PictureOption[] {
  const targets = words.map((word) => ({
    word,
    src: getIconSrc(word),
    isTarget: true,
  }));
  const targetWords = new Set(words.map((word) => word.trim().toLowerCase()));
  const distractors = distractorWords
    .filter((word) => !targetWords.has(word.toLowerCase()))
    .sort(() => Math.random() - 0.5)
    .slice(0, 6 - targets.length)
    .map((word) => ({ word, src: getIconSrc(word), isTarget: false }));

  return [...targets, ...distractors].sort(() => Math.random() - 0.5);
}

// TODO: Add PNGs for the complete word pool in public/icons/ before release.

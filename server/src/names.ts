// ─── Server-assigned random names — no user input, no abuse vector ─────────

const ADJECTIVES = [
  'Swift', 'Clever', 'Brave', 'Calm', 'Merry', 'Quiet', 'Bold', 'Lucky',
  'Witty', 'Gentle', 'Eager', 'Jolly', 'Keen', 'Nimble', 'Proud', 'Sunny',
  'Zesty', 'Cosy', 'Daring', 'Bright', 'Cheery', 'Steady', 'Lively', 'Kind',
];

const ANIMALS = [
  'Otter', 'Fox', 'Badger', 'Heron', 'Panda', 'Falcon', 'Beaver', 'Lynx',
  'Robin', 'Moose', 'Wren', 'Bison', 'Newt', 'Quail', 'Raven', 'Seal',
  'Tiger', 'Viper', 'Wolf', 'Yak', 'Zebra', 'Crane', 'Dingo', 'Eagle',
];

/** Pick a random name that isn't taken; append a counter as fallback. */
export function randomName(taken: Set<string>, rand: () => number = Math.random): string {
  for (let i = 0; i < 50; i++) {
    const name = `${ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]} ${
      ANIMALS[Math.floor(rand() * ANIMALS.length)]
    }`;
    if (!taken.has(name)) return name;
  }
  let n = 2;
  const base = `${ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]} ${
    ANIMALS[Math.floor(rand() * ANIMALS.length)]
  }`;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

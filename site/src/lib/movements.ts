import house from "../data/house.json";

export interface Movement {
  key: string;
  name: string;
  numeral: string;
  gloss: string;
  statement: string;
}

export const MOVEMENTS: Movement[] = house.movements.map((m: any) => ({
  key: m.key,
  name: m.name,
  numeral: m.numeral,
  gloss: m.gloss,
  statement: m.statement,
}));

export const MOVEMENT_ORDER: string[] = house.movementOrder;

export const HOUSE = house.house as Record<string, string>;
export const FOREWORDS = house.forewords as { year: string; book: string }[];

export function movement(key: string): Movement | undefined {
  return MOVEMENTS.find((m) => m.key === key);
}

/** ordering index so shelves sort I → IV */
export function movementIndex(key: string): number {
  const i = MOVEMENT_ORDER.indexOf(key);
  return i === -1 ? 99 : i;
}

import { LIB1 } from './lib1';
import { LIB2 } from './lib2';
import { Entry } from './types';

export * from './types';
export * from './learn';

export const LIBRARY: Entry[] = [...LIB1, ...LIB2];
export const BY_ID: Record<string, Entry> = Object.fromEntries(LIBRARY.map((x) => [x.id, x]));

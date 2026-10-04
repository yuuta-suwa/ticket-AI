import type { Deal } from '@dealhunter/types';
/** In-memory handoff of an already-loaded deal between list → detail screens (avoids a refetch and works offline). */
const store = new Map<string, Deal>();
export const rememberDeals = (ds: Deal[]): void => { ds.forEach((d) => store.set(d.offer.id, d)); };
export const recallDeal = (id: string): Deal | undefined => store.get(id);

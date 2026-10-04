import type { MonitoringPriority, Plan } from '@dealhunter/types';
import { MONITORING_INTERVAL_MINUTES } from '@dealhunter/config';

export interface MonitorSignals {
  plan: Plan; watched: boolean; highDemandRoute: boolean; extremeCandidate: boolean; daysSinceActive: number;
}
const paid = (p: Plan) => p !== 'FREE';

/** Adaptive monitoring: never poll everything all the time. */
export function monitoringPriority(s: MonitorSignals): MonitoringPriority {
  if (s.daysSinceActive > 30 && !s.watched) return 'P4';
  if (s.watched && paid(s.plan) && s.extremeCandidate) return 'P0';
  if (s.watched && paid(s.plan)) return 'P1';
  if (s.highDemandRoute) return 'P2';
  if (s.watched) return 'P3';
  return 'P4';
}
export const pollIntervalMinutes = (p: MonitoringPriority): number => MONITORING_INTERVAL_MINUTES[p];
export const isDue = (p: MonitoringPriority, lastPolledAt: Date | null, now: Date): boolean => {
  const i = pollIntervalMinutes(p);
  return i > 0 && (!lastPolledAt || now.getTime() - lastPolledAt.getTime() >= i * 60_000);
};

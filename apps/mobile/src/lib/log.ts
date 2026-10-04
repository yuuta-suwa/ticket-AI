import { ConsoleErrorTracker, type ErrorTracker } from '@dealhunter/analytics';
import { ENV } from './env';

/** Error tracking port. Swap ConsoleErrorTracker for a Sentry/Crashlytics adapter without touching call sites. */
export const errors: ErrorTracker = new ConsoleErrorTracker();
/** Production logs are silent except errors; never log tokens, emails or payloads. */
export const debug = (...a: unknown[]): void => { if (!ENV.isProduction && __DEV__) console.log(...a); };

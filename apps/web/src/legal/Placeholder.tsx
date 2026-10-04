import { APP_IDENTITY } from '@dealhunter/config';

/** Placeholders are rendered visibly: no fictitious company details are ever invented. */
export const Operator = () => <span className="placeholder">{APP_IDENTITY.operator.legalName}</span>;
export const OperatorAddress = () => <span className="placeholder">{APP_IDENTITY.operator.address}</span>;
export const SupportEmail = () => <span className="placeholder">{APP_IDENTITY.supportEmail}</span>;

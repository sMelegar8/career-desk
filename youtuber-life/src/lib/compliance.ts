import { COMPLIANCE_ITEMS, type ComplianceKey, type Video } from './types';

const KEYS = Object.keys(COMPLIANCE_ITEMS) as ComplianceKey[];

export function missingCompliance(video: Video): ComplianceKey[] {
  return KEYS.filter((k) => !video.compliance[k]);
}

/** A published video with an incomplete checklist needs attention. */
export function needsComplianceAttention(video: Video): boolean {
  return video.stage === 'pubblicato' && missingCompliance(video).length > 0;
}

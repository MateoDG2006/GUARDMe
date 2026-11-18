import { DomainError } from '../../common/errors/domain-error';
import {
  INCIDENT_STATUSES,
  assertTransition,
  type IncidentStatus,
} from './incident-state';

const ALLOWED: Record<IncidentStatus, IncidentStatus[]> = {
  pending_contact: [
    'contacting',
    'caregiver_informed',
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  contacting: [
    'pending_contact',
    'caregiver_informed',
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  caregiver_informed: [
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  attention_postponed: ['escalation_required', 'closed_assisted'],
  escalation_required: ['attention_postponed', 'closed_assisted'],
  delayed_review: [
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  closed_assisted: [],
};

describe('assertTransition', () => {
  it('accepts every permitted pair and rejects the rest', () => {
    for (const from of INCIDENT_STATUSES) {
      for (const to of INCIDENT_STATUSES) {
        if (ALLOWED[from].includes(to)) {
          expect(() => assertTransition(from, to)).not.toThrow();
          continue;
        }
        expect(() => assertTransition(from, to)).toThrow(DomainError);
        try {
          assertTransition(from, to);
        } catch (error) {
          expect(error).toMatchObject({
            code: 'INCOMPATIBLE_STATE',
            details: { from, to },
          });
        }
      }
    }
  });
});

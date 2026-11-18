import {
  allowedResponses,
  canDelete,
  canEdit,
  canRespond,
} from './reminder-policy';

describe('reminder policy', () => {
  it('lets anyone delete except a user deleting a caregiver reminder', () => {
    expect(canDelete('user', 'user')).toBe(true);
    expect(canDelete('user', 'caregiver')).toBe(false);
    expect(canDelete('caregiver', 'user')).toBe(true);
    expect(canDelete('caregiver', 'caregiver')).toBe(true);
  });

  it('leaves caregiver-authored edits undefined for the user', () => {
    expect(canEdit('user', 'user', false)).toBe('allowed');
    expect(canEdit('user', 'caregiver', false)).toBe('not_defined');
    expect(canEdit('user', 'caregiver', true)).toBe('allowed');
    expect(canEdit('caregiver', 'user', false)).toBe('allowed');
    expect(canEdit('caregiver', 'caregiver', false)).toBe('allowed');
  });

  it('allows only the user to respond', () => {
    expect(canRespond('user')).toBe('allowed');
    expect(canRespond('caregiver')).toBe('not_defined');
  });

  it('uses separate responses for medication and appointments', () => {
    expect(allowedResponses('medication')).toEqual([
      'taken',
      'postponed',
      'skipped',
    ]);
    expect(allowedResponses('appointment')).toEqual([
      'acknowledged',
      'postponed',
    ]);
  });
});

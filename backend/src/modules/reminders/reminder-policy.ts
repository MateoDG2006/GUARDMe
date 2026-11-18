export type Relation = 'user' | 'caregiver';
export type ReminderKind = 'medication' | 'appointment';

export function canDelete(
  requester: Relation,
  authorRelation: Relation,
): boolean {
  return !(requester === 'user' && authorRelation === 'caregiver');
}

export function canEdit(
  requester: Relation,
  authorRelation: Relation,
  pd08UserCanEdit: boolean,
): 'allowed' | 'not_defined' {
  // PD-08 pendiente
  if (
    requester === 'user' &&
    authorRelation === 'caregiver' &&
    !pd08UserCanEdit
  ) {
    return 'not_defined';
  }
  return 'allowed';
}

export function canRespond(requester: Relation): 'allowed' | 'not_defined' {
  // PD-08 pendiente: registro asistido
  return requester === 'user' ? 'allowed' : 'not_defined';
}

export function allowedResponses(kind: ReminderKind): string[] {
  if (kind === 'medication') return ['taken', 'postponed', 'skipped'];
  return ['acknowledged', 'postponed'];
}

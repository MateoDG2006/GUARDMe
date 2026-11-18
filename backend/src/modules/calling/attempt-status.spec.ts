import { toAttemptStatus, providerRank } from './attempt-status';

describe('toAttemptStatus', () => {
  it('ranks provider events', () => {
    expect(providerRank('queued')).toBe(1);
    expect(providerRank('ringing')).toBe(2);
    expect(providerRank('answered')).toBe(3);
    expect(providerRank('human_confirmed')).toBe(4);
    expect(providerRank('completed')).toBe(5);
    expect(providerRank('no_answer')).toBe(5);
  });

  it('follows the monotonic table', () => {
    expect(toAttemptStatus('requesting', 'queued')).toBe('requesting');
    expect(toAttemptStatus('uncertain', 'queued')).toBe('requesting');
    expect(toAttemptStatus('requesting', 'ringing')).toBe('ringing');
    expect(toAttemptStatus('ringing', 'answered')).toBe('answered_transport');
    expect(toAttemptStatus('answered_transport', 'human_confirmed')).toBe(
      'human_confirmed',
    );
    expect(toAttemptStatus('answered_transport', 'completed')).toBe(
      'unchanged',
    );
    expect(toAttemptStatus('human_confirmed', 'completed')).toBe('unchanged');
    expect(toAttemptStatus('ringing', 'busy')).toBe('busy');
    expect(toAttemptStatus('ringing', 'no_answer')).toBe('no_answer');
    expect(toAttemptStatus('ringing', 'failed')).toBe('failed');
    expect(toAttemptStatus('ringing', 'canceled')).toBe('canceled');
    expect(toAttemptStatus('ringing', 'completed')).toBe('no_answer');
    expect(toAttemptStatus('no_answer', 'ringing')).toBe('unchanged');
    expect(toAttemptStatus('no_answer', 'answered')).toBe('unchanged');
    expect(toAttemptStatus('ringing', 'queued', 2)).toBe('unchanged');
  });
});

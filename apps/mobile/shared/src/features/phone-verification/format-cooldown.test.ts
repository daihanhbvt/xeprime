import { formatOtpCooldown } from './format-cooldown';

describe('formatOtpCooldown', () => {
  it('đồng hồ mm:ss như web', () => {
    expect(formatOtpCooldown(58)).toBe('00:58');
    expect(formatOtpCooldown(60)).toBe('01:00');
    expect(formatOtpCooldown(5)).toBe('00:05');
    expect(formatOtpCooldown(-3)).toBe('00:00');
  });
});

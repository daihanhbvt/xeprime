import { describe, expect, it } from 'vitest';
import { readServiceInUseDetails } from './service-in-use';

describe('readServiceInUseDetails', () => {
  it('đọc đơn vướng và đếm yêu cầu', () => {
    const out = readServiceInUseDetails({
      serviceTypes: ['with_driver'],
      bookings: [
        { id: 'b1', code: 'DH-1', serviceType: 'with_driver', status: 'reserved', pickupAt: 'x' },
        { bad: 1 },
      ],
      requests: [{ id: 'r1' }, { id: 'r2' }],
    });
    expect(out?.bookings.map((b) => b.code)).toEqual(['DH-1']);
    expect(out?.requestCount).toBe(2);
    expect(out?.serviceTypes).toEqual(['with_driver']);
  });

  it('trả null khi details không phải object', () => {
    expect(readServiceInUseDetails(undefined)).toBeNull();
    expect(readServiceInUseDetails('x')).toBeNull();
  });
});

import { isSafeAppPath, registrationTrackOfNext } from './auth-next';

/** `?next=` đến từ link của người lạ — chỉ nhận đường dẫn nội bộ của chính app. */
describe('isSafeAppPath', () => {
  it.each([
    '/manage/register',
    '/manage/onboarding?track=package',
    '/list-your-vehicle/register?from=marketplace',
    '/invites/abc',
  ])('nhận %s', (path) => {
    expect(isSafeAppPath(path)).toBe(true);
  });

  it.each([
    undefined,
    '',
    '/',
    'manage',
    '//evil.com/x',
    'https://evil.com',
    'javascript:alert(1)',
    '/\\evil.com',
    `/${'a'.repeat(600)}`,
  ])('từ chối %s', (path) => {
    expect(isSafeAppPath(path)).toBe(false);
  });
});

describe('registrationTrackOfNext', () => {
  it('suy tuyến từ bước đầu của tuyến', () => {
    expect(registrationTrackOfNext('/list-your-vehicle/register?from=marketplace')).toBe(
      'commission',
    );
    expect(registrationTrackOfNext('/manage/onboarding?track=package')).toBe('package');
    expect(registrationTrackOfNext('/manage/register')).toBeNull();
    expect(registrationTrackOfNext(null)).toBeNull();
  });
});

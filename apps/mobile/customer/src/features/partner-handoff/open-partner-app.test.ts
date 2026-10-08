import { Linking } from 'react-native';
import { REGISTRATION_TRACK } from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';
import { PARTNER_APP_TARGET, PARTNER_AUTH_ENTRY, openPartnerApp } from './open-partner-app';

/**
 * Màn handoff mở ĐÚNG chỗ ở app Partner — giữ lựa chọn tuyến của người dùng (web: hai nút đi thẳng
 * bước đầu của tuyến ở site partner) và đúng lời mời.
 */
describe('openPartnerApp', () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  beforeEach(() => openURL.mockClear());

  const nextOf = (url: string) => decodeURIComponent(url.split('next=')[1] ?? '');

  it('tuyến hoa hồng → màn ĐĂNG KÝ Partner, rồi wizard đăng xe nhanh', async () => {
    await openPartnerApp(PARTNER_APP_TARGET.REGISTER, { track: REGISTRATION_TRACK.COMMISSION });
    const url = openURL.mock.calls[0]![0];
    expect(url).toContain(':///register?next=');
    expect(nextOf(url)).toBe('/list-your-vehicle/register?from=marketplace');
  });

  it('tuyến gói → màn ĐĂNG KÝ, rồi onboarding kèm track=package', async () => {
    await openPartnerApp(PARTNER_APP_TARGET.REGISTER, { track: REGISTRATION_TRACK.PACKAGE });
    expect(nextOf(openURL.mock.calls[0]![0])).toBe('/manage/onboarding?track=package');
  });

  it('chưa chọn tuyến → đích là màn chọn cách cho thuê', async () => {
    await openPartnerApp(PARTNER_APP_TARGET.REGISTER);
    expect(nextOf(openURL.mock.calls[0]![0])).toBe('/manage/register');
  });

  it('người đã có tài khoản đối tác → màn ĐĂNG NHẬP, cùng đích', async () => {
    await openPartnerApp(PARTNER_APP_TARGET.REGISTER, {
      track: REGISTRATION_TRACK.PACKAGE,
      entry: PARTNER_AUTH_ENTRY.LOGIN,
    });
    const url = openURL.mock.calls[0]![0];
    expect(url).toContain(':///login?next=');
    expect(nextOf(url)).toBe('/manage/onboarding?track=package');
  });

  it('lời mời: token được mã hoá, không chèn được đường dẫn khác', async () => {
    await openPartnerApp(PARTNER_APP_TARGET.INVITE, { inviteToken: 'a/../b' });
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/:\/\/\/invites\/a%2F\.\.%2Fb$/));
  });

  it('không mở được (chưa cài) → false, không ném', async () => {
    openURL.mockRejectedValueOnce(new Error('no app'));
    await expect(openPartnerApp()).resolves.toBe(false);
  });
});

describe('ROUTES (app khách) — CTA chủ xe giữ tuyến', () => {
  it('wizard đăng xe → handoff tuyến hoa hồng; tạo gian hàng → handoff tuyến gói', () => {
    expect(ROUTES.listYourVehicle.register('marketplace' as never)).toEqual({
      pathname: '/partner',
      params: { intent: 'register', track: REGISTRATION_TRACK.COMMISSION },
    });
    expect(ROUTES.manage.onboarding(REGISTRATION_TRACK.PACKAGE)).toEqual({
      pathname: '/partner',
      params: { intent: 'register', track: REGISTRATION_TRACK.PACKAGE },
    });
    expect(ROUTES.manage.register()).toEqual({
      pathname: '/partner',
      params: { intent: 'register' },
    });
  });
});

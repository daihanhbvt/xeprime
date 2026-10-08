import { FEATURE_STATE, MOBILE_CLIENT_APP, PLAN_FEATURE } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { ROUTES } from '@/navigation/routes';
import { expiredFeatureForPath } from './ManageShellNotices';

jest.mock('expo-router', () => ({ usePathname: () => '/manage' }));

const receipts = String(ROUTES.manage.receipts());

/*
 * Chỉ app Partner có khu quản lý: ở app XePrime mọi `ROUTES.manage.*` đổ về handoff `/partner`, nên
 * phép tra theo đường dẫn không có nghĩa ở đó (và `ManageHeader` không bao giờ được dựng).
 */
const describeManage = APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER ? describe : describe.skip;

describeManage('expiredFeatureForPath — bản native của expiredFeature trong AppShell web', () => {
  it('trang thuộc tính năng read_only → trả tính năng đó', () => {
    expect(
      expiredFeatureForPath(receipts, { [PLAN_FEATURE.FINANCE]: FEATURE_STATE.READ_ONLY }),
    ).toBe(PLAN_FEATURE.FINANCE);
  });

  it('trang con không có mục menu riêng vẫn tra theo mục cha gần nhất', () => {
    expect(
      expiredFeatureForPath(`${receipts}/abc`, { [PLAN_FEATURE.FINANCE]: FEATURE_STATE.READ_ONLY }),
    ).toBe(PLAN_FEATURE.FINANCE);
  });

  it('tính năng còn bật → không hiện dải', () => {
    expect(
      expiredFeatureForPath(receipts, { [PLAN_FEATURE.FINANCE]: FEATURE_STATE.ENABLED }),
    ).toBeNull();
  });

  it('trang không gác bằng tính năng (Tổng quan) → không hiện dải', () => {
    expect(
      expiredFeatureForPath(String(ROUTES.manage.home()), {
        [PLAN_FEATURE.FINANCE]: FEATURE_STATE.READ_ONLY,
      }),
    ).toBeNull();
  });
});

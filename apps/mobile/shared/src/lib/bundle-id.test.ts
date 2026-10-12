import { MOBILE_APP_BUNDLE_ID, MOBILE_CLIENT_APP } from '@xeprime/types';
import customerAppJson from '../../../customer/app.json';
import partnerAppJson from '../../../manage/app.json';

/**
 * `app.json` (JSON, không import được hằng) khai lại bundle ID của từng app. Server dùng
 * `MOBILE_APP_BUNDLE_ID` làm `aud` khi kiểm token "Sign in with Apple" — lệch một ký tự là đăng
 * nhập Apple hỏng âm thầm (401) mà build vẫn xanh. Test này giữ hai nơi khớp nhau.
 */
describe('bundle ID của hai app khớp MOBILE_APP_BUNDLE_ID', () => {
  it.each([
    [MOBILE_CLIENT_APP.CUSTOMER, customerAppJson],
    [MOBILE_CLIENT_APP.PARTNER, partnerAppJson],
  ] as const)('%s: ios.bundleIdentifier và android.package', (clientApp, appJson) => {
    expect(appJson.expo.ios.bundleIdentifier).toBe(MOBILE_APP_BUNDLE_ID[clientApp]);
    expect(appJson.expo.android.package).toBe(MOBILE_APP_BUNDLE_ID[clientApp]);
  });
});

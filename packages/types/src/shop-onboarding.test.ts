import { describe, expect, it } from 'vitest';
import {
  REGISTRATION_TRACK,
  SHOP_ONBOARDING_STATE,
  canUpgradeToPackageTrack,
  isEstablishedPackageShop,
  isPackageOnboardingPending,
  isPackageShopTrack,
  isRegistrationTrack,
  registrationTrackOf,
  shopOnboardingStateForTrack,
} from './shop-onboarding';
import { TENANT_ROLE } from './rbac';
import { BILLING_MODE } from './status/billing';

/**
 * HAI TUYẾN ĐĂNG KÝ — luật THUẦN dùng chung giữa api, web và app native (ADR 0040).
 *
 * Bất biến quan trọng nhất của cả file: `billingMode` MỘT MÌNH không phân biệt được ba tình
 * huống mà sản phẩm phải rẽ ba đường. Hai trong ba có `billingMode` GIỐNG HỆT nhau:
 *
 * | | `onboardingState` | `billingMode` | Nghĩa |
 * | --- | --- | --- | --- |
 * | gian hàng chờ tiền | `package_pending` | `null` | màn thanh toán |
 * | danh mục gói hỏng | `commission` | `null` | LỖI CẤU HÌNH, về Owner Lite |
 * | gian hàng hết gói | `package_active` | `commission` | khách cũ cần gia hạn |
 *
 * Đó là toàn bộ lý do trục này phải tồn tại như một cột, không phải một phép suy.
 */
describe('registrationTrackOf', () => {
  it('nhận đúng hai cửa vào', () => {
    expect(registrationTrackOf('commission')).toBe(REGISTRATION_TRACK.COMMISSION);
    expect(registrationTrackOf('package')).toBe(REGISTRATION_TRACK.PACKAGE);
  });

  /*
   * `?track=` đến từ URL, tức là chuỗi người dùng gõ được. Rơi về cửa MẶC ĐỊNH (hoa hồng) thay
   * vì ném: một bookmark cũ hay một ký tự gõ sai vẫn phải mở được màn đăng ký, và cửa hoa hồng
   * là cửa không đòi tiền — mức an toàn khi không hiểu tham số.
   */
  it.each([[null], [undefined], [''], ['vip'], ['PACKAGE'], ['package_pending']])(
    'giá trị lạ (%s) rơi về tuyến hoa hồng',
    (value) => {
      expect(registrationTrackOf(value as string | null | undefined)).toBe(
        REGISTRATION_TRACK.COMMISSION,
      );
    },
  );

  it('isRegistrationTrack thu hẹp đúng, không nhận giá trị của trục kia', () => {
    expect(isRegistrationTrack('package')).toBe(true);
    expect(isRegistrationTrack(SHOP_ONBOARDING_STATE.PACKAGE_PENDING)).toBe(false);
    expect(isRegistrationTrack(undefined)).toBe(false);
  });
});

describe('shopOnboardingStateForTrack', () => {
  it('cửa gói mở ra ở trạng thái CHỜ; cửa hoa hồng không nợ bước nào', () => {
    expect(shopOnboardingStateForTrack(REGISTRATION_TRACK.PACKAGE)).toBe(
      SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
    );
    expect(shopOnboardingStateForTrack(REGISTRATION_TRACK.COMMISSION)).toBe(
      SHOP_ONBOARDING_STATE.COMMISSION,
    );
  });
});

describe('isPackageOnboardingPending', () => {
  it('đúng khi CHƯA thanh toán', () => {
    expect(
      isPackageOnboardingPending({
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
        billingMode: null,
      }),
    ).toBe(true);
  });

  /**
   * Hai tình huống CÙNG `billingMode: null` phải cho hai câu trả lời khác nhau. Nếu phép suy chỉ
   * đọc `billingMode` thì test này không thể xanh — và đó là chính cái bug mà ADR 0040 sửa.
   */
  it('danh mục gói hỏng (`commission` + null) KHÔNG phải đang onboarding', () => {
    expect(
      isPackageOnboardingPending({
        onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
        billingMode: null,
      }),
    ).toBe(false);
  });

  /**
   * `package_pending` cạnh một gói ĐANG hiệu lực: tiền ĐÃ về (admin gán tay, hay một dòng dữ
   * liệu cũ), nên phải trả `false`. Một màn "hãy chuyển khoản" đứng trước một gian hàng đã trả
   * tiền là lỗi tệ hơn hẳn so với việc bỏ sót một lần cập nhật cột.
   */
  it('đã có gói hiệu lực ⇒ false, kể cả khi cột chưa kịp cập nhật', () => {
    expect(
      isPackageOnboardingPending({
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
        billingMode: BILLING_MODE.PACKAGE,
      }),
    ).toBe(false);
  });

  it('không có tenant / giá trị lạ ⇒ false', () => {
    expect(isPackageOnboardingPending(null)).toBe(false);
    expect(isPackageOnboardingPending(undefined)).toBe(false);
    expect(isPackageOnboardingPending({ onboardingState: 'pending', billingMode: null })).toBe(
      false,
    );
  });
});

describe('isEstablishedPackageShop', () => {
  /*
   * `package_active` là VĨNH VIỄN: gói hết hạn là chuyện của `billingMode`, còn cửa vào thì không
   * đổi. Đây là thứ giữ cho một gian hàng 10 xe vừa hết gói không bị mời vào wizard "đăng ký chủ
   * xe lần đầu".
   */
  it('đúng khi đã từng trả tiền, kể cả lúc gói đã hết hạn', () => {
    expect(
      isEstablishedPackageShop({
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
        billingMode: BILLING_MODE.COMMISSION,
      }),
    ).toBe(true);
  });

  it('chủ xe hoa hồng vừa mua gói vẫn KHÔNG phải "đã qua cửa gian hàng"', () => {
    expect(
      isEstablishedPackageShop({
        onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
        billingMode: BILLING_MODE.PACKAGE,
      }),
    ).toBe(false);
  });

  it('đang chờ thanh toán thì chưa "đã qua"', () => {
    expect(
      isEstablishedPackageShop({
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
        billingMode: null,
      }),
    ).toBe(false);
  });
});

describe('isPackageShopTrack', () => {
  /*
   * Cổng logo trước khi gửi xe duyệt đọc hàm này, nên nó phải nhận cả ba đường vào tuyến gói —
   * và phải KHÔNG BAO GIỜ nhận chủ xe tuyến hoa hồng. Vế thứ hai là vế quan trọng: bắt một người
   * có một chiếc xe phải có logo gian hàng là dựng lại đúng rào cản mà ADR 0036 vừa gỡ.
   */
  it.each([
    ['chờ thanh toán', SHOP_ONBOARDING_STATE.PACKAGE_PENDING, null],
    ['đã trả tiền', SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE, BILLING_MODE.PACKAGE],
    ['hết gói nhưng từng trả', SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE, BILLING_MODE.COMMISSION],
    ['hoa hồng vừa mua gói', SHOP_ONBOARDING_STATE.COMMISSION, BILLING_MODE.PACKAGE],
  ])('%s ⇒ là gian hàng tuyến gói', (_label, onboardingState, billingMode) => {
    expect(isPackageShopTrack({ onboardingState, billingMode })).toBe(true);
  });

  it.each([
    ['chủ xe hoa hồng', SHOP_ONBOARDING_STATE.COMMISSION, BILLING_MODE.COMMISSION],
    ['danh mục gói hỏng', SHOP_ONBOARDING_STATE.COMMISSION, null],
  ])('%s ⇒ KHÔNG bị cổng của gian hàng chạm tới', (_label, onboardingState, billingMode) => {
    expect(isPackageShopTrack({ onboardingState, billingMode })).toBe(false);
  });

  it('không có tenant ⇒ false', () => {
    expect(isPackageShopTrack(null)).toBe(false);
    expect(isPackageShopTrack(undefined)).toBe(false);
  });
});

describe('canUpgradeToPackageTrack', () => {
  const commissionOwner = {
    roleKey: TENANT_ROLE.SHOP_OWNER,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    billingMode: BILLING_MODE.COMMISSION,
  };

  it('chủ xe tuyến hoa hồng ⇒ mời nâng cấp', () => {
    expect(canUpgradeToPackageTrack(commissionOwner)).toBe(true);
  });

  /*
   * Quản lý/nhân viên KHÔNG mua gói được (`subscription.purchase` mặc định chỉ chủ có), nên một
   * lời mời nâng cấp trên màn của họ dẫn tới đúng một lần 403 ở bước cuối.
   */
  it.each([TENANT_ROLE.SHOP_MANAGER, TENANT_ROLE.SHOP_STAFF, TENANT_ROLE.SHOP_VIEWER])(
    '%s của gian hàng hoa hồng ⇒ không mời',
    (roleKey) => {
      expect(canUpgradeToPackageTrack({ ...commissionOwner, roleKey })).toBe(false);
    },
  );

  /*
   * `unconfigured` KHÔNG phải một tuyến (ADR 0038 điều 1). Hỏi `!== package` sẽ gom cả tenant
   * thiếu gói hiện hành vào lời mời — tức là đoán hộ một trạng thái hỏng.
   */
  it('tenant thiếu gói hiện hành (billingMode null) ⇒ không mời', () => {
    expect(canUpgradeToPackageTrack({ ...commissionOwner, billingMode: null })).toBe(false);
  });

  it('đã ở tuyến gói ⇒ không mời', () => {
    expect(canUpgradeToPackageTrack({ ...commissionOwner, billingMode: BILLING_MODE.PACKAGE })).toBe(
      false,
    );
  });

  /*
   * Gian hàng đã trả tiền rồi hết gói rơi về `commission`, nhưng họ cần GIA HẠN chứ không phải
   * một câu chuyện "nâng cấp lên gian hàng" mà họ đã đi qua (ADR 0040 điều 4).
   */
  it('gian hàng hết gói (đã từng trả tiền) ⇒ không mời nâng cấp', () => {
    expect(
      canUpgradeToPackageTrack({
        ...commissionOwner,
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      }),
    ).toBe(false);
  });

  it('không có tenant ⇒ false', () => {
    expect(canUpgradeToPackageTrack(null)).toBe(false);
    expect(canUpgradeToPackageTrack(undefined)).toBe(false);
  });
});

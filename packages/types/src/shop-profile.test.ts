import { describe, expect, it } from 'vitest';
import {
  PACKAGE_SHOP_LISTING_REQUIREMENT,
  SHOP_PROFILE_REQUIREMENT,
  SHOP_PROFILE_SUGGESTION,
  isShopProfileSubmittable,
  missingPackageShopListingRequirements,
  missingPackageShopRegistrationFields,
  missingShopProfileRequirements,
  missingShopProfileSuggestions,
  type PackageShopListingInput,
  type ShopProfileCompletenessInput,
} from './shop-profile';

/**
 * Quy tắc này là cổng gửi duyệt của CẢ HAI phía, nên nó phải trả lời y hệt nhau ở mọi dạng
 * "chưa có" mà hai phía sinh ra: backend ghi `NULL`, form phía web cầm chuỗi rỗng, và người
 * dùng thì gõ dấu cách.
 */
const COMPLETE: ShopProfileCompletenessInput = {
  displayName: 'Cho thuê xe Bình Minh',
  provinceCode: '48',
  ownerFullName: 'Nguyễn Văn A',
  ownerPhone: '84901234567',
};

describe('missingShopProfileRequirements', () => {
  it('đủ bốn mục bắt buộc → không thiếu gì, gửi duyệt được', () => {
    expect(missingShopProfileRequirements(COMPLETE)).toEqual([]);
    expect(isShopProfileSubmittable(COMPLETE)).toBe(true);
  });

  it('hồ sơ trắng trơn → thiếu đủ bốn mục, theo đúng thứ tự đọc trên màn hình', () => {
    expect(missingShopProfileRequirements({})).toEqual([
      SHOP_PROFILE_REQUIREMENT.DISPLAY_NAME,
      SHOP_PROFILE_REQUIREMENT.PROVINCE,
      SHOP_PROFILE_REQUIREMENT.OWNER_NAME,
      SHOP_PROFILE_REQUIREMENT.OWNER_PHONE,
    ]);
    expect(isShopProfileSubmittable({})).toBe(false);
  });

  it.each([
    ['null (dạng backend ghi)', null],
    ['chuỗi rỗng (dạng form web cầm)', ''],
    ['toàn dấu cách', '   '],
  ])('%s đều tính là chưa có', (_label, value) => {
    expect(missingShopProfileRequirements({ ...COMPLETE, ownerPhone: value })).toEqual([
      SHOP_PROFILE_REQUIREMENT.OWNER_PHONE,
    ]);
  });
});

describe('missingShopProfileSuggestions', () => {
  it('mục nên có KHÔNG chặn gửi duyệt', () => {
    expect(missingShopProfileSuggestions(COMPLETE).length).toBeGreaterThan(0);
    expect(isShopProfileSubmittable(COMPLETE)).toBe(true);
  });

  it('bốn mục nên có đều là thứ HIỂN THỊ trên chợ, theo đúng thứ tự đọc', () => {
    expect(missingShopProfileSuggestions(COMPLETE)).toEqual([
      SHOP_PROFILE_SUGGESTION.LOGO,
      SHOP_PROFILE_SUGGESTION.BIO,
      SHOP_PROFILE_SUGGESTION.ADDRESS,
      SHOP_PROFILE_SUGGESTION.COVER,
    ]);
  });

  /*
   * 16/09/2026 — tài khoản nhận tiền KHÔNG còn là một mục của checklist hồ sơ.
   *
   * Nó sống ở `bank_accounts` (ADR 0023/0033) với sổ riêng, cờ mặc định và lưu trữ; hàm này
   * thì thuần và không đọc bảng nào. Chấm nó ở đây nghĩa là hoặc hàm phải biết một bảng khác,
   * hoặc checklist nói "chưa khai" với gian hàng vừa thêm xong tài khoản ở ngay màn bên cạnh.
   */
  it('KHÔNG còn mục tài khoản nhận tiền — nó không sống trên hồ sơ gian hàng nữa', () => {
    expect(Object.values(SHOP_PROFILE_SUGGESTION)).not.toContain('bank');
    expect(missingShopProfileSuggestions({})).not.toContain('bank');
  });

  it('điền đủ bốn mục nên có → không còn gợi ý nào', () => {
    const polished: ShopProfileCompletenessInput = {
      ...COMPLETE,
      logoUrl: 'https://cdn.xeprime.vn/logo.png',
      bio: 'Cho thuê xe tự lái tại Hà Nội.',
      address: '12 Nguyễn Thái Học',
      coverUrl: 'https://cdn.xeprime.vn/cover.png',
    };

    expect(missingShopProfileSuggestions(polished)).toEqual([]);
  });
});

/**
 * ── CỔNG ĐĂNG XE CỦA GIAN HÀNG TUYẾN GÓI (ADR 0040) ──────────────────────────────────────────
 *
 * Bộ quy tắc THỨ HAI, và điều quan trọng nhất được khoá ở đây là nó KHÔNG phải bộ ở trên đổi
 * tên: hai bộ đòi những mục khác nhau, cho những người khác nhau, với hệ quả khác nhau. Gộp
 * chúng lại là hỏng theo cả hai chiều — bộ trên coi `logo` là gợi ý (nên cổng này sẽ không gác
 * được thứ duy nhất nó sinh ra để gác), còn thêm `logo` vào bộ trên là chặn luôn chủ xe tuyến
 * hoa hồng.
 */
const PACKAGE_SHOP_COMPLETE: PackageShopListingInput = {
  displayName: 'Cho thuê xe Bình Minh',
  contactPhone: '0901234567',
  provinceCode: '79',
  wardCode: '26734',
  addressLine: '12 Nguyễn Huệ',
  logoUrl: 'https://cdn.xeprime.vn/logo.png',
};

describe('missingPackageShopListingRequirements', () => {
  it('đủ năm mục → qua cổng', () => {
    expect(missingPackageShopListingRequirements(PACKAGE_SHOP_COMPLETE)).toEqual([]);
  });

  it('hồ sơ trắng trơn → thiếu đủ năm mục, theo đúng thứ tự đọc trên màn hình', () => {
    expect(missingPackageShopListingRequirements({})).toEqual([
      PACKAGE_SHOP_LISTING_REQUIREMENT.DISPLAY_NAME,
      PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE,
      PACKAGE_SHOP_LISTING_REQUIREMENT.PROVINCE,
      PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS,
      PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO,
    ]);
  });

  /**
   * Ca THƯỜNG GẶP NHẤT trong luồng thật: bước 1 của onboarding đã đòi đủ bốn mục còn lại, nên
   * sau khi thanh toán mục duy nhất còn thiếu là logo. Giao diện dựa vào đúng mệnh đề này để nói
   * một câu riêng ("Gian hàng cần có logo…") thay vì một danh sách một dòng.
   */
  it('chỉ thiếu logo → đúng MỘT mục', () => {
    expect(
      missingPackageShopListingRequirements({ ...PACKAGE_SHOP_COMPLETE, logoUrl: null }),
    ).toEqual([PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO]);
  });

  it.each([
    ['null (dạng backend ghi)', null],
    ['chuỗi rỗng (dạng form web cầm)', ''],
    ['toàn dấu cách', '   '],
  ])('%s đều tính là chưa có', (_label, value) => {
    expect(
      missingPackageShopListingRequirements({ ...PACKAGE_SHOP_COMPLETE, contactPhone: value }),
    ).toEqual([PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE]);
  });

  /*
   * HAI BỘ KHÔNG PHẢI MỘT. `ownerName`/`ownerPhone` của bộ xác minh không có ở đây (không cần để
   * một chiếc xe xuất hiện đúng trên chợ), và `logo` — gợi ý ở bộ kia — là mục BẮT BUỘC ở đây.
   */
  it('hai bộ đòi những mục KHÁC nhau', () => {
    const keys = Object.values(PACKAGE_SHOP_LISTING_REQUIREMENT) as string[];
    expect(keys).not.toContain(SHOP_PROFILE_REQUIREMENT.OWNER_NAME);
    expect(keys).not.toContain(SHOP_PROFILE_REQUIREMENT.OWNER_PHONE);
    expect(keys).toContain(SHOP_PROFILE_SUGGESTION.LOGO);
  });
});

describe('missingPackageShopRegistrationFields', () => {
  /**
   * BƯỚC 1 của onboarding = bộ trên TRỪ logo, và đó là một phép trừ THẬT (cùng hàm), không phải
   * một danh sách chép tay.
   *
   * Logo không bị đòi lúc mở gian hàng vì nó chưa cần thiết để nhận tiền gói, và đòi một tấm ảnh
   * trước khi người ta kịp xem giá là ma sát đặt sai chỗ.
   */
  it('KHÔNG bao giờ đòi logo, kể cả khi hồ sơ trắng trơn', () => {
    expect(missingPackageShopRegistrationFields({})).toEqual([
      PACKAGE_SHOP_LISTING_REQUIREMENT.DISPLAY_NAME,
      PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE,
      PACKAGE_SHOP_LISTING_REQUIREMENT.PROVINCE,
      PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS,
    ]);
    expect(missingPackageShopRegistrationFields(PACKAGE_SHOP_COMPLETE)).toEqual([]);
  });

  /**
   * Chữ ký KHÔNG nhận logo, và đó là điểm chính.
   *
   * Bản trước ép một giá trị giả vào bên trong để mục logo "đã có": hàm nhận một trường rồi âm
   * thầm ghi đè, nên nơi gọi không có cách nào biết giá trị mình truyền đã bị bỏ. `Omit` nói
   * thẳng điều đó ra, và với một object literal thì TypeScript chặn hẳn.
   *
   * (Với một BIẾN rộng hơn thì TypeScript vẫn cho qua — excess property check chỉ áp cho literal.
   * Đó là giới hạn của ngôn ngữ, không phải của quy tắc: quan trọng là hàm không còn đọc trường
   * đó nữa, nên không còn gì để âm thầm ghi đè.)
   */
  it('chữ ký không nhận logo — không còn sentinel nào để đoán', () => {
    // @ts-expect-error — mục logo không thuộc đầu vào của bộ ĐĂNG KÝ.
    missingPackageShopRegistrationFields({ ...PACKAGE_SHOP_COMPLETE, logoUrl: null });

    const { logoUrl: _ignored, ...registrationFields } = PACKAGE_SHOP_COMPLETE;
    expect(missingPackageShopRegistrationFields(registrationFields)).toEqual([]);
  });
});

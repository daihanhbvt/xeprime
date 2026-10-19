/**
 * DANH TÍNH mà seed sở hữu: tài khoản đội ngũ nền tảng, tài khoản khách, và — suy ra từ bản
 * khai gian hàng — email chủ shop/nhân viên cùng slug gian hàng.
 *
 * Tách riêng vì có HAI bên cần cùng một sự thật này và chúng không được phép lệch nhau:
 *   • `accounts.ts` tạo ra chúng;
 *   • `cleanup-test-data.ts` phải LOẠI TRỪ chúng khi dọn dấu vết test — một danh sách loại trừ
 *     chép tay sẽ lỗi thời ngay lần đầu ai đó thêm gian hàng, và hậu quả là script dọn xoá
 *     nhầm dữ liệu demo.
 *
 * Module này THUẦN DỮ LIỆU: không tạo PrismaClient, không đọc env, nên `cleanup-test-data.ts`
 * import được mà không kéo theo tác dụng phụ nào.
 */
import { ACCOUNT_REALM, PLATFORM_ROLE, type AccountRealm } from '@xeprime/types';
import { SHOP_SPECS } from './shops';

/**
 * Tài khoản nền tảng của dữ liệu DEMO, ngoài `platform_admin`: hai vai trò có quyền HẸP hơn hẳn
 * admin và có luồng việc riêng — `reviewer` duyệt hồ sơ/xe, `finance_admin` đối soát tiền và
 * duyệt rút tiền. Cách duy nhất để biết màn nào thiếu quyền là đăng nhập bằng đúng vai trò đó.
 *
 * `platform_admin` không nằm ở đây: email đến từ env (`PLATFORM_ADMIN_EMAIL`) và nó được tạo ở CẢ
 * chế độ `system` — môi trường mới deploy cần một người đăng nhập được site quản trị.
 */
export const PLATFORM_ACCOUNTS = [
  {
    roleKey: PLATFORM_ROLE.REVIEWER,
    email: 'reviewer@xeprime.test',
    displayName: 'Chuyên viên duyệt hồ sơ',
    phone: '0900000003',
  },
  {
    roleKey: PLATFORM_ROLE.FINANCE_ADMIN,
    email: 'finance@xeprime.test',
    displayName: 'Kế toán nền tảng',
    phone: '0900000005',
  },
] as const;

/**
 * Ba tài khoản khách, mỗi tài khoản một hoàn cảnh khác nhau — dữ liệu demo chỉ có ích khi các
 * màn "lịch sử thuê", "đánh giá của tôi", "chưa có chuyến nào" đều có người để mở ra xem.
 *
 * `phone` ở đây là SĐT của TÀI KHOẢN. Hồ sơ khách trong sổ của từng gian hàng
 * (`tenant_customers`) tra theo chính SĐT này, nên hai bên khớp nhau như dữ liệu thật.
 */
export const CUSTOMER_ACCOUNTS = [
  {
    key: 'an',
    email: 'khach.an@xeprime.test',
    displayName: 'Nguyễn Văn An',
    phone: '0901000001',
    note: 'Khách quen: nhiều chuyến đã hoàn tất ở gian hàng lớn, có đánh giá.',
  },
  {
    key: 'binh',
    email: 'khach.binh@xeprime.test',
    displayName: 'Trần Thị Bình',
    phone: '0901000002',
    note: 'Đang thuê dài hạn theo gói tháng.',
  },
  {
    key: 'cuong',
    email: 'khach.cuong@xeprime.test',
    displayName: 'Lê Hoàng Cường',
    phone: '0901000003',
    note: 'Thuê xe có tài xế đi liên tỉnh; bị gian hàng lớn đưa vào danh sách chặn (chỉ ở gian hàng đó).',
  },
] as const;

export type CustomerKey = (typeof CUSTOMER_ACCOUNTS)[number]['key'];

/**
 * Tài xế là TÀI KHOẢN KHÁCH được bên thuê mời liên kết (ADR 0063). Bốn tài khoản riêng — không
 * dùng lại khách thuê ở trên, để một tài xế không bao giờ là khách của chính chuyến mình lái.
 * Mỗi bên thuê có tài xế lấy một đoạn KHÔNG chồng nhau của danh sách này
 * (`ShopSpec.driverPoolOffset`): chống trùng lịch theo NGƯỜI xuyên mọi bên thuê.
 */
export const DRIVER_ACCOUNTS = [
  {
    key: 'dung',
    email: 'taixe.dung@xeprime.test',
    displayName: 'Nguyễn Văn Dũng',
    phone: '0921000001',
  },
  {
    key: 'phuoc',
    email: 'taixe.phuoc@xeprime.test',
    displayName: 'Trần Hữu Phước',
    phone: '0921000002',
  },
  { key: 'tri', email: 'taixe.tri@xeprime.test', displayName: 'Lê Minh Trí', phone: '0921000003' },
  { key: 'loc', email: 'taixe.loc@xeprime.test', displayName: 'Phạm Văn Lộc', phone: '0921000004' },
] as const;

/** Gian hàng / khách có tài khoản SONG SINH ở realm thứ hai — xem `CROSS_REALM_TWINS`. */
const TWIN_SHOP_OWNER_EMAILS = ['owner.saigon@xeprime.test', 'chuxe.son@xeprime.test'] as const;
const TWIN_CUSTOMER_KEYS: readonly CustomerKey[] = ['an'];

export interface CrossRealmTwin {
  realm: AccountRealm;
  email: string;
  displayName: string;
  phone: string;
}

/**
 * Tài khoản SONG SINH xuyên realm (ADR 0053): cùng người, cùng SĐT + email, nhưng là tài khoản KHÁC
 * ở realm thứ hai — mật khẩu riêng, phiên riêng, ví riêng.
 *
 *   • chủ gian hàng tuyến gói `owner.saigon@` và chủ xe tuyến hoa hồng `chuxe.son@` có thêm một tài
 *     khoản KHÁCH (chủ xe đi thuê xe bằng tài khoản khách — và bị chặn đặt xe của chính mình);
 *   • khách `khach.an@` có thêm một tài khoản PARTNER chưa mở gian hàng nào (ca "chưa có gian hàng
 *     ⇒ /register" của site partner).
 *
 * Suy từ bản khai gian hàng/khách, không chép tay số điện thoại: hai bản chép là hai chỗ lệch nhau.
 */
export const CROSS_REALM_TWINS: readonly CrossRealmTwin[] = [
  ...TWIN_SHOP_OWNER_EMAILS.map((email) => {
    const owner = SHOP_SPECS.find((spec) => spec.owner.email === email)?.owner;
    if (!owner) throw new Error(`Seed: không tìm thấy chủ gian hàng ${email} để dựng song sinh`);
    return {
      realm: ACCOUNT_REALM.CUSTOMER,
      email: owner.email,
      displayName: owner.displayName,
      phone: owner.phone,
    };
  }),
  ...TWIN_CUSTOMER_KEYS.map((key) => {
    const customer = CUSTOMER_ACCOUNTS.find((c) => c.key === key);
    if (!customer) throw new Error(`Seed: không tìm thấy khách ${key} để dựng song sinh`);
    return {
      realm: ACCOUNT_REALM.PARTNER,
      email: customer.email,
      displayName: customer.displayName,
      phone: customer.phone,
    };
  }),
];

/**
 * Mọi email đăng nhập do seed tạo ra. `cleanup-test-data.ts` dùng làm danh sách loại trừ:
 * chúng cũng ở tên miền `@xeprime.test` như tài khoản do test sinh, nên phải nêu đích danh.
 */
export const SEED_OWNED_EMAILS: readonly string[] = [
  ...PLATFORM_ACCOUNTS.map((a) => a.email),
  ...CUSTOMER_ACCOUNTS.map((a) => a.email),
  ...DRIVER_ACCOUNTS.map((a) => a.email),
  ...SHOP_SPECS.flatMap((s) => [s.owner.email, ...s.staff.map((st) => st.email)]),
];

/** Slug của mọi gian hàng do seed tạo ra — cùng vai trò loại trừ như trên. */
export const SEED_OWNED_TENANT_SLUGS: readonly string[] = SHOP_SPECS.map((s) => s.slug);

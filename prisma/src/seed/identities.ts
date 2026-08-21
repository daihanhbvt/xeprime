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
import { PLATFORM_ROLE } from '@xeprime/types';
import { SHOP_SPECS } from './shops';

/**
 * Năm vai trò nền tảng đều có tài khoản riêng, không gộp vào một "admin" duy nhất: quyền của
 * `reviewer`, `support`, `finance_admin` hẹp hơn hẳn `platform_admin`, và cách duy nhất để biết
 * màn nào thiếu quyền là đăng nhập bằng đúng vai trò đó mà bấm thử.
 *
 * Email của `platform_admin` đến từ env (`PLATFORM_ADMIN_EMAIL`) nên không nằm trong danh sách
 * này — `accounts.ts` chèn nó vào.
 */
export const PLATFORM_ACCOUNTS = [
  {
    roleKey: PLATFORM_ROLE.PLATFORM_STAFF,
    email: 'staff@xeprime.test',
    displayName: 'Nhân viên nền tảng',
    phone: '0900000002',
  },
  {
    roleKey: PLATFORM_ROLE.REVIEWER,
    email: 'reviewer@xeprime.test',
    displayName: 'Chuyên viên duyệt hồ sơ',
    phone: '0900000003',
  },
  {
    roleKey: PLATFORM_ROLE.SUPPORT,
    email: 'support@xeprime.test',
    displayName: 'Hỗ trợ khách hàng',
    phone: '0900000004',
  },
  {
    roleKey: PLATFORM_ROLE.FINANCE_ADMIN,
    email: 'finance@xeprime.test',
    displayName: 'Kế toán nền tảng',
    phone: '0900000005',
  },
] as const;

/**
 * Năm tài khoản khách, mỗi tài khoản một hoàn cảnh khác nhau — dữ liệu demo chỉ có ích khi các
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
    note: 'Thuê xe có tài xế đi liên tỉnh; còn nợ một phần tiền.',
  },
  {
    key: 'dung',
    email: 'khach.dung@xeprime.test',
    displayName: 'Phạm Thu Dung',
    phone: '0901000004',
    note: 'Tài khoản mới — chưa có chuyến nào, để thử màn trạng thái rỗng.',
  },
  {
    key: 'duc',
    email: 'khach.duc@xeprime.test',
    displayName: 'Võ Minh Đức',
    phone: '0901000005',
    note: 'Bị một gian hàng đưa vào danh sách chặn (chỉ ở gian hàng đó).',
  },
] as const;

export type CustomerKey = (typeof CUSTOMER_ACCOUNTS)[number]['key'];

/**
 * Mọi email đăng nhập do seed tạo ra. `cleanup-test-data.ts` dùng làm danh sách loại trừ:
 * chúng cũng ở tên miền `@xeprime.test` như tài khoản do test sinh, nên phải nêu đích danh.
 */
export const SEED_OWNED_EMAILS: readonly string[] = [
  ...PLATFORM_ACCOUNTS.map((a) => a.email),
  ...CUSTOMER_ACCOUNTS.map((a) => a.email),
  ...SHOP_SPECS.flatMap((s) => [s.owner.email, ...s.staff.map((st) => st.email)]),
];

/** Slug của mọi gian hàng do seed tạo ra — cùng vai trò loại trừ như trên. */
export const SEED_OWNED_TENANT_SLUGS: readonly string[] = SHOP_SPECS.map((s) => s.slug);

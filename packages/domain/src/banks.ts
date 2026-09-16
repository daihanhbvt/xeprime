/**
 * Ngân hàng Việt Nam — danh mục để CHỌN, không phải để gõ.
 *
 * Trước đợt này, mã ngân hàng là một ô chữ tự do ở cả `BankAccountForm` lẫn hồ sơ người bán,
 * với gợi ý "VCB, ACB, TCB…". Đó là ô nguy hiểm nhất trên đường tiền đi ra: mã sai thì lệnh
 * chuyển hoặc bị ngân hàng trả về sau vài ngày, hoặc — tệ hơn — trỏ về một nhà băng khác và
 * không ai biết cho tới lúc chủ tài khoản hỏi tiền đâu.
 *
 * `code` dùng ĐÚNG mã VietQR (`buildVietQrUrl` ghép thẳng vào URL ảnh QR), nên hai đường tiền
 * — quét QR trả cọc và chuyển khoản rút điểm — nói cùng một thứ tiếng.
 *
 * `shortName` là tên người Việt gọi hằng ngày; `fullName` để phân biệt hai nhà băng dễ nhầm
 * (VIB ↔ VietinBank, SCB ↔ Sacombank). Cả hai KHÔNG dịch — đó là tên riêng.
 *
 * Framework-free có chủ đích: web dựng `<Select>`, app native dựng picker của nó, và cả hai đọc
 * cùng một danh sách. Hai bản sao là hai lúc một nhà băng mới chỉ được thêm vào một nơi.
 */
export interface VietnamBank {
  /** Mã VietQR — cũng là giá trị lưu ở `bank_accounts.bank_code`. */
  readonly code: string;
  /** Tên gọi hằng ngày: "Vietcombank". */
  readonly shortName: string;
  /** Tên đầy đủ, để phân biệt những cái tên gần giống nhau. */
  readonly fullName: string;
}

/**
 * Sắp theo mức phổ biến với chủ xe cho thuê, không theo bảng chữ cái: bốn nhà băng đầu chiếm
 * phần lớn tài khoản nhận tiền, và bắt người dùng cuộn qua hai chục cái tên để tới Vietcombank
 * là bắt họ trả giá cho một trật tự mà máy thấy gọn chứ người thì không.
 */
export const VIETNAM_BANKS: readonly VietnamBank[] = [
  { code: 'VCB', shortName: 'Vietcombank', fullName: 'NH TMCP Ngoại thương Việt Nam' },
  { code: 'TCB', shortName: 'Techcombank', fullName: 'NH TMCP Kỹ thương Việt Nam' },
  { code: 'MB', shortName: 'MB Bank', fullName: 'NH TMCP Quân đội' },
  { code: 'VPB', shortName: 'VPBank', fullName: 'NH TMCP Việt Nam Thịnh Vượng' },
  { code: 'ACB', shortName: 'ACB', fullName: 'NH TMCP Á Châu' },
  { code: 'BIDV', shortName: 'BIDV', fullName: 'NH TMCP Đầu tư và Phát triển Việt Nam' },
  { code: 'ICB', shortName: 'VietinBank', fullName: 'NH TMCP Công thương Việt Nam' },
  { code: 'VBA', shortName: 'Agribank', fullName: 'NH Nông nghiệp và Phát triển Nông thôn' },
  { code: 'TPB', shortName: 'TPBank', fullName: 'NH TMCP Tiên Phong' },
  { code: 'STB', shortName: 'Sacombank', fullName: 'NH TMCP Sài Gòn Thương Tín' },
  { code: 'HDB', shortName: 'HDBank', fullName: 'NH TMCP Phát triển TP.HCM' },
  { code: 'VIB', shortName: 'VIB', fullName: 'NH TMCP Quốc tế Việt Nam' },
  { code: 'SHB', shortName: 'SHB', fullName: 'NH TMCP Sài Gòn – Hà Nội' },
  { code: 'MSB', shortName: 'MSB', fullName: 'NH TMCP Hàng hải Việt Nam' },
  { code: 'OCB', shortName: 'OCB', fullName: 'NH TMCP Phương Đông' },
  { code: 'SEAB', shortName: 'SeABank', fullName: 'NH TMCP Đông Nam Á' },
  { code: 'EIB', shortName: 'Eximbank', fullName: 'NH TMCP Xuất Nhập khẩu Việt Nam' },
  { code: 'LPB', shortName: 'LPBank', fullName: 'NH TMCP Lộc Phát Việt Nam' },
  { code: 'NAB', shortName: 'Nam A Bank', fullName: 'NH TMCP Nam Á' },
  { code: 'ABB', shortName: 'ABBANK', fullName: 'NH TMCP An Bình' },
  { code: 'BAB', shortName: 'BacABank', fullName: 'NH TMCP Bắc Á' },
  { code: 'PVCB', shortName: 'PVcomBank', fullName: 'NH TMCP Đại Chúng Việt Nam' },
  { code: 'SCB', shortName: 'SCB', fullName: 'NH TMCP Sài Gòn' },
  { code: 'VAB', shortName: 'VietABank', fullName: 'NH TMCP Việt Á' },
  { code: 'VCCB', shortName: 'BVBank', fullName: 'NH TMCP Bản Việt' },
  { code: 'KLB', shortName: 'KienlongBank', fullName: 'NH TMCP Kiên Long' },
  { code: 'NCB', shortName: 'NCB', fullName: 'NH TMCP Quốc Dân' },
  { code: 'PBVN', shortName: 'PublicBank', fullName: 'NH TNHH MTV Public Việt Nam' },
  { code: 'SGICB', shortName: 'SaigonBank', fullName: 'NH TMCP Sài Gòn Công Thương' },
  { code: 'VRB', shortName: 'VRB', fullName: 'NH Liên doanh Việt – Nga' },
  { code: 'WVN', shortName: 'Woori', fullName: 'NH TNHH MTV Woori Việt Nam' },
  { code: 'SVB', shortName: 'ShinhanBank', fullName: 'NH TNHH MTV Shinhan Việt Nam' },
  { code: 'CAKE', shortName: 'CAKE', fullName: 'CAKE by VPBank' },
  { code: 'UBANK', shortName: 'Ubank', fullName: 'Ubank by VPBank' },
  { code: 'TIMO', shortName: 'Timo', fullName: 'Timo by Ban Viet Bank' },
];

const BY_CODE = new Map(VIETNAM_BANKS.map((bank) => [bank.code, bank]));

/**
 * Tra một mã về nhà băng. `null` khi mã không nằm trong danh mục.
 *
 * Mã lạ là chuyện có thật và phải hiển thị được: tài khoản khai TRƯỚC khi có danh mục này vẫn
 * đang nhận tiền, và một ngân hàng mới sáp nhập sẽ mang mã chưa kịp thêm. Nơi gọi hiện lại
 * chính mã thô thay vì ô trống — xem {@link bankDisplayName}.
 */
export function findBank(code: string | null | undefined): VietnamBank | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** Tên hiển thị của một mã: tên gọi hằng ngày nếu biết, còn lại là chính mã thô. */
export function bankDisplayName(code: string | null | undefined): string {
  return findBank(code)?.shortName ?? (code ?? '').trim().toUpperCase();
}

/**
 * Viết tắt 2–4 ký tự cho ô biểu trưng tròn trước tên ngân hàng.
 *
 * Dùng chính MÃ chứ không lấy chữ cái đầu của tên: mã đã ngắn, đã viết hoa, và là thứ người
 * dùng nhìn thấy trên sao kê của chính mình. "VCB" đọc ra ngay; "V" thì không.
 */
export function bankInitials(code: string | null | undefined): string {
  return ((code ?? '').trim().toUpperCase() || '?').slice(0, 4);
}

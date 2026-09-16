import styles from './StaticMap.module.css';

/**
 * Nguồn dữ liệu bản đồ — bắt buộc hiện theo giấy phép ODbL của OpenStreetMap và điều khoản gói
 * miễn phí của Geoapify (ADR 0037).
 *
 * Không đi qua `t()`: đây là tên riêng của nhà cung cấp và của dự án dữ liệu, thuộc nhóm "không
 * bao giờ dịch" — dòng này phải giống hệt nhau ở cả hai ngôn ngữ.
 */
const ATTRIBUTION = '© OpenStreetMap · Geoapify';

/**
 * Bản đồ xem-được, là một tấm ẢNH tĩnh (Geoapify Static Maps — ADR 0037).
 *
 * KHÔNG phải client component: chỉ là HTML tĩnh, nên nó chạy được cả trong Server Component của
 * trang xe lẫn bên trong client island của luồng đặt xe — không kéo thêm một byte JavaScript
 * nào vào bundle.
 *
 * `src` do `lib/map-static.ts` dựng và đã trả `null` khi thiếu key hoặc toạ độ hỏng. Ở đây nhận
 * `null` là hợp lệ và render ra không gì cả: một khung bản đồ vỡ tệ hơn hẳn việc không có khung
 * nào — phần thông tin thật (địa chỉ, quãng đường) vẫn nằm ở khối bao ngoài.
 */
export function StaticMap({
  src,
  title,
  height = 220,
}: {
  src: string | null;
  /** Bắt buộc: đây là nội dung duy nhất trình đọc màn hình có được về tấm bản đồ. */
  title: string;
  height?: number;
}) {
  if (!src) return null;
  return (
    <figure className={styles.figure}>
      {/*
        `<img>` trần chứ KHÔNG phải `next/image`, và đây là một lựa chọn chứ không phải bỏ sót.
        Qua `/_next/image` thì request tới Geoapify xuất phát từ MÁY CHỦ của mình, nên khoá theo
        HTTP referrer — lớp bảo vệ duy nhất của một key nằm lộ thiên trong HTML — mất tác dụng.
        Ảnh cũng đã đúng kích thước cần, không có gì để tối ưu lại.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.image}
        // Chiều cao là giá trị chỉ biết ở nơi gọi — đúng ngoại lệ CSS custom property của ADR 0003.
        style={{ '--xp-map-height': `${height}px` } as React.CSSProperties}
        src={src}
        alt={title}
        // `lazy`: bản đồ hầu như luôn nằm dưới màn hình đầu, không đáng chặn tải trang.
        loading="lazy"
        // Khoá tỉ lệ nội tại của ảnh Geoapify yêu cầu (`lib/map-static.ts`) để trình duyệt chừa
        // sẵn chỗ và trang không nhảy khi ảnh về.
        width={1000}
        height={500}
        // Ảnh tĩnh KHÔNG cần referrer đầy đủ ở đây, nhưng Geoapify khoá key theo referrer nên
        // phải gửi ít nhất phần gốc — mặc định của trình duyệt đã đúng, chỉ ghi rõ để người sau
        // không "dọn" nó thành `no-referrer` rồi tự chặn chính mình.
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <figcaption className={styles.attribution}>{ATTRIBUTION}</figcaption>
    </figure>
  );
}

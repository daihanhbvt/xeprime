import { mapExternalUrl, type GeoPoint } from '@xeprime/domain';
import styles from './MapLink.module.css';

/**
 * Liên kết "mở vị trí này trong ứng dụng bản đồ" — để DẪN ĐƯỜNG (ADR 0061 điều 1). Bản đồ trên web
 * chỉ là ảnh tĩnh (`StaticMapImage`), không kéo không phóng; ai cần chỉ đường thì mở ứng dụng bản đồ
 * của chính họ — miễn phí cho cả hai bên.
 *
 * KHÔNG phải client component, không icon AntD (cần context React): chỉ một thẻ `<a>`, nên chạy
 * được cả trong Server Component của trang xe lẫn trong các khu client.
 *
 * Không có toạ độ thì không render gì: một liên kết tới một điểm đoán mò tệ hơn hẳn không có liên
 * kết nào — địa chỉ chữ ở khối bao ngoài vẫn là thông tin chính.
 */
export function MapLink({ point, label }: { point: GeoPoint | null; label: string }) {
  if (!point) return null;
  return (
    <a
      className={styles.link}
      href={mapExternalUrl(point)}
      target="_blank"
      // Trang bản đồ bên ngoài không được nắm `window.opener` của trang mình.
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}

'use client';

import { useId } from 'react';
import {
  VERIFIED_MARK_CHECK_COLOR,
  VERIFIED_MARK_CHECK_PATH,
  VERIFIED_MARK_SEAL_COLOR,
  VERIFIED_MARK_SEAL_PATH,
  VERIFIED_MARK_VIEWBOX,
} from '@xeprime/ui';

/**
 * DẤU XÁC THỰC của XePrime — con dấu răng cưa vàng kèm dấu tích trắng.
 *
 * Hình học (viewBox + hai path) sống ở `@xeprime/ui` — app native vẽ lại ĐÚNG hai chuỗi đó bằng
 * `react-native-svg`. Giữ path ở đây thì hai client là hai bản sao, và bản sao nào cũng sẽ trôi.
 *
 * ## Vì sao là một component ở `common/` chứ không phải một `<img>` hay một icon AntD
 *
 * Nó là TÀI SẢN THƯƠNG HIỆU: hình do thiết kế vẽ, không có trong bộ `@ant-design/icons`, và sẽ
 * còn xuất hiện ở nhiều chỗ nữa (thẻ tài khoản, trang gian hàng công khai, thẻ xe). Một `<img>`
 * trỏ tới file SVG thì không đổi được kích thước theo chữ và tốn thêm một request; chép inline
 * ở từng nơi thì mỗi bản sao là một cơ hội để màu hoặc tỉ lệ trôi khỏi bản gốc.
 *
 * ## `useId` cho bộ lọc đổ bóng — không phải chuyện thẩm mỹ
 *
 * SVG gốc mang `id="filter0_d_517_1549"` cố định. Hai dấu cùng trên một trang (menu tài khoản
 * đang mở + thẻ tài khoản phía dưới) sẽ sinh hai phần tử TRÙNG id, và trình duyệt chỉ giữ cái
 * đầu — cái thứ hai mất bóng, hoặc tệ hơn là tham chiếu nhầm sang bộ lọc của phần tử kia. Id
 * phải duy nhất theo từng lần dựng; `useId` cho đúng điều đó mà không cần biến toàn cục đếm.
 *
 * ## Nó MANG NGHĨA, nên nó phải nói được
 *
 * Từ 16/09/2026 dấu này thay hẳn nhãn chữ "Chủ gian hàng · Gói …" trong menu tài khoản. Khi một
 * hình là nơi DUY NHẤT chứa một thông tin, nó không còn là trang trí: thiếu `aria-label` thì
 * người dùng trình đọc màn hình mất luôn thông tin đó. `<title>` cho tooltip khi rê chuột.
 */
export function VerifiedMark({
  label,
  size = 16,
  className,
}: {
  /** Nghĩa của dấu, đọc lên cho trình đọc màn hình và hiện khi rê chuột. */
  label: string;
  size?: number;
  className?: string;
}) {
  // `useId` sinh chuỗi có ký tự lạ (`:r3:`, `«r3»` tuỳ bản React) — `url(#…)` không nhận chúng.
  const filterId = `xp-verified-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={VERIFIED_MARK_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      className={className}
    >
      <title>{label}</title>
      <g filter={`url(#${filterId})`}>
        <path d={VERIFIED_MARK_SEAL_PATH} fill={VERIFIED_MARK_SEAL_COLOR} />
      </g>
      <path d={VERIFIED_MARK_CHECK_PATH} fill={VERIFIED_MARK_CHECK_COLOR} />
      <defs>
        <filter
          id={filterId}
          x="0"
          y="0"
          width="32"
          height="32"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1" />
          <feGaussianBlur stdDeviation="2" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.85098 0 0 0 0 0.466667 0 0 0 0 0.0235294 0 0 0 0.3 0"
          />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
      </defs>
    </svg>
  );
}

'use client';

import { useId } from 'react';

/**
 * DẤU XÁC THỰC của XePrime — con dấu răng cưa vàng kèm dấu tích trắng.
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
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      className={className}
    >
      <title>{label}</title>
      <g filter={`url(#${filterId})`}>
        <path
          d="M16 3L18.5468 5.49529L22 4.6077L22.9579 8.04207L26.3923 9L25.5047 12.4532L28 15L25.5047 17.5468L26.3923 21L22.9579 21.9579L22 25.3923L18.5468 24.5047L16 27L13.4532 24.5047L10 25.3923L9.04207 21.9579L5.6077 21L6.49529 17.5468L4 15L6.49529 12.4532L5.6077 9L9.04207 8.04207L10 4.6077L13.4532 5.49529L16 3Z"
          fill="#D97706"
        />
      </g>
      <path
        d="M12.6223 19.616C12.6223 19.4947 12.599 19.434 12.5523 19.434L12.2303 19.588C12.2303 19.5227 12.193 19.476 12.1183 19.448L12.0063 19.434C11.9316 19.434 11.8383 19.4667 11.7263 19.532C11.7076 19.4853 11.6843 19.4387 11.6563 19.392C11.6283 19.3453 11.605 19.3033 11.5863 19.266C11.465 19.0327 11.3436 18.776 11.2223 18.496C11.1103 18.2067 11.003 17.9313 10.9003 17.67C10.807 17.4087 10.7323 17.2033 10.6763 17.054C10.639 16.9327 10.597 16.7507 10.5503 16.508C10.5036 16.2653 10.457 15.9573 10.4103 15.584C10.513 15.6493 10.5923 15.682 10.6483 15.682C10.7136 15.682 10.7743 15.584 10.8303 15.388C10.8583 15.4253 10.9096 15.444 10.9843 15.444C11.0403 15.444 11.0823 15.4253 11.1103 15.388L11.3343 15.052L11.5863 15.136H11.6003C11.619 15.136 11.6376 15.1267 11.6563 15.108C11.675 15.0893 11.703 15.0707 11.7403 15.052C11.815 15.0053 11.871 14.982 11.9083 14.982L11.9503 14.996C12.1836 15.108 12.333 15.3133 12.3983 15.612C12.5663 16.3213 12.7343 16.676 12.9023 16.676C13.0703 16.676 13.2663 16.4987 13.4903 16.144C13.6023 15.9667 13.7143 15.7613 13.8263 15.528C13.9476 15.2947 14.069 15.0333 14.1903 14.744C14.209 14.856 14.2276 14.912 14.2463 14.912C14.293 14.912 14.3723 14.7953 14.4843 14.562C14.6056 14.3287 14.797 14.0067 15.0583 13.596C15.2076 13.344 15.3943 13.0593 15.6183 12.742C15.8516 12.4247 16.099 12.098 16.3603 11.762C16.6216 11.426 16.8736 11.1087 17.1163 10.81C17.3683 10.5113 17.5923 10.2547 17.7883 10.04C17.9843 9.82533 18.129 9.68533 18.2223 9.62C18.577 9.37733 18.857 9.144 19.0623 8.92C19.053 8.98533 19.039 9.046 19.0203 9.102C19.011 9.14867 19.0063 9.18133 19.0063 9.2C19.0063 9.23733 19.025 9.256 19.0623 9.256L19.4543 9.06V9.116C19.4543 9.19067 19.473 9.228 19.5103 9.228C19.5383 9.228 19.5943 9.186 19.6783 9.102C19.7623 9.018 19.809 8.95733 19.8183 8.92L19.7903 9.116L20.2663 8.836L20.1543 9.088C20.3036 8.98533 20.411 8.934 20.4763 8.934C20.5136 8.934 20.5416 8.95733 20.5603 9.004C20.579 9.04133 20.5883 9.07867 20.5883 9.116C20.5883 9.172 20.565 9.23733 20.5183 9.312C20.4716 9.38667 20.411 9.47533 20.3363 9.578C20.2803 9.65267 20.187 9.76467 20.0563 9.914C19.935 10.054 19.7483 10.264 19.4963 10.544C19.2443 10.8147 18.9083 11.1927 18.4883 11.678C18.3763 11.7993 18.2036 12.014 17.9703 12.322C17.737 12.6207 17.471 12.9707 17.1723 13.372C16.883 13.764 16.5936 14.1607 16.3043 14.562C16.015 14.9633 15.7583 15.3273 15.5343 15.654C15.3103 15.9713 15.1516 16.2093 15.0583 16.368L14.1903 17.838C14.0036 18.1553 13.8496 18.4167 13.7283 18.622C13.607 18.818 13.5136 18.9533 13.4483 19.028C13.3083 19.196 13.1543 19.3453 12.9863 19.476L12.8603 19.406L12.7483 19.476L12.6223 19.616Z"
        fill="white"
      />
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

import type { HandoverPhotoSlot } from '@xeprime/types';

/**
 * Hình ô ảnh CÒN TRỐNG - Figma Partner-XePrime "Vehicle Image / Empty State" `23845:50053`
 * (người dùng chốt 20/11/2026, web + app): khung ảnh + dấu "+" chung cho MỌI góc chụp, thay bộ
 * nét vẽ riêng từng góc (đầu xe · đuôi xe · hông · Odo) - tên góc đã nằm ở nhãn dưới ô.
 *
 * Màu đọc token theme (`var(--xp-…)`) nên tự đổi sáng/tối; không tải ảnh nào.
 */
export function HandoverSlotSample({ className }: { slot: HandoverPhotoSlot; className?: string }) {
  return (
    <svg viewBox="0 0 132 132" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="xpSlotBadge" x1="66.14" y1="80.66" x2="66.14" y2="93.47" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--xp-color-border-strong)" />
          <stop offset="1" stopColor="var(--xp-color-text-placeholder)" />
        </linearGradient>
        <filter id="xpSlotShadow" x="26" y="31" width="80" height="78" filterUnits="userSpaceOnUse">
          <feDropShadow dy="4" stdDeviation="4.5" floodColor="#7d7d7d" floodOpacity="0.15" />
        </filter>
      </defs>
      {/* Vòng nền xám rất nhạt sau tấm ảnh (Figma "Group 822"). */}
      <circle cx="66" cy="66" r="42" fill="var(--xp-color-bg-muted)" />
      <path
        d="M91.5828 95.3685L40.8557 95.7324C37.9277 95.7455 35.5401 93.3851 35.5009 90.4762L35.1077 41.9429C35.0914 39.0144 37.4487 36.6291 40.3571 36.5931L91.0841 36.2292C94.0122 36.2161 96.3998 38.5765 96.439 41.4854L96.8321 90.0186C96.8485 92.9472 94.4911 95.3325 91.5828 95.3685Z"
        fill="var(--xp-color-bg-container)"
        filter="url(#xpSlotShadow)"
      />
      <path
        d="M88.7264 88.1222L44.1332 88.4597C42.8718 88.4709 41.8565 87.4751 41.8439 86.2135L41.5056 46.1031C41.493 44.8415 42.4874 43.8272 43.7488 43.8159L88.342 43.4785C89.6034 43.4672 90.6187 44.463 90.6313 45.7246L90.9696 85.835C90.9823 87.0966 89.9878 88.111 88.7264 88.1222Z"
        fill="var(--xp-color-border-subtle)"
      />
      <path d="M67.1605 73.0686L50.8931 73.1816L58.9571 63.8999L67.1605 73.0686Z" fill="var(--xp-color-text-placeholder)" />
      <path d="M80.6504 72.9587L57.2002 73.1254L68.8139 59.7967L80.6504 72.9587Z" fill="var(--xp-color-border-strong)" />
      <path
        d="M58.9415 59.8179C60.2276 58.7118 60.3725 56.7712 59.2651 55.4836C58.1577 54.196 56.2173 54.0489 54.9311 55.155C53.6449 56.2612 53.5 58.2018 54.6075 59.4894C55.7149 60.777 57.6553 60.9241 58.9415 59.8179Z"
        fill="var(--xp-color-text-placeholder)"
      />
      <path
        d="M77.2643 93.6094C77.0317 94.5978 76.6829 95.6443 76.2759 96.5164C75.1712 98.6676 73.427 100.354 71.2758 101.458C69.0665 102.563 66.4502 103.028 63.8339 102.447C57.6711 101.168 53.7175 95.1211 54.9966 88.9582C56.2757 82.7954 62.2641 78.7837 68.427 80.1209C70.6363 80.586 72.5549 81.6907 74.1828 83.2023C76.9154 85.9349 78.0782 89.8884 77.2643 93.6094Z"
        fill="url(#xpSlotBadge)"
      />
      <path
        d="M69.7642 90.2954H67.1479V87.6791C67.1479 87.1558 66.7409 86.6907 66.1595 86.6907C65.6362 86.6907 65.1711 87.0977 65.1711 87.6791V90.2954H62.5548C62.0315 90.2954 61.5664 90.7024 61.5664 91.2838C61.5664 91.8652 61.9734 92.2721 62.5548 92.2721H65.1711V94.8884C65.1711 95.4117 65.5781 95.8768 66.1595 95.8768C66.6827 95.8768 67.1479 95.4698 67.1479 94.8884V92.2721H69.7642C70.2874 92.2721 70.7525 91.8652 70.7525 91.2838C70.7525 90.7024 70.2874 90.2954 69.7642 90.2954Z"
        fill="var(--xp-color-bg-container)"
      />
    </svg>
  );
}

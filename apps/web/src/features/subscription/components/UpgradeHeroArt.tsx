'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { useTranslations } from 'next-intl';

import styles from './UpgradeHeroArt.module.css';

/**
 * Minh hoạ đầu trang "Gói & hoá đơn" — một GIAN HÀNG có biển hiệu và mái hiên, chiếc xe đậu
 * trước cửa, khu phố mờ phía sau và cột doanh thu đi lên; bên cạnh là bong bóng ba lời hứa.
 *
 * ## Vì sao vẽ bằng SVG nội tuyến thay vì một tấm ảnh
 *
 * Nó đi theo bộ màu thương hiệu: mọi mảng đều lấy màu từ token, nên đổi `--xp-color-primary` là
 * hình đổi theo, không ai phải xuất lại file. Nó cũng không tốn một lượt tải ảnh, không mờ trên
 * màn hình retina, và không phải một asset nữa để ai đó quên tối ưu.
 *
 * ## Bong bóng nằm CẠNH hình, không đè lên
 *
 * Bản trước đặt nó tuyệt đối ở góc phải và nó che mất mái hiên với biển hiệu — phần duy nhất của
 * hình nói ra "gian hàng". Nay hai thứ nằm cạnh nhau: hình co lại, bong bóng có đuôi chỉ về phía
 * gian hàng, và cả cụm vẫn thấp hơn bản cũ vì không còn chồng lớp.
 *
 * ## Vì sao `aria-hidden` mà vẫn có chữ
 *
 * Phần hình câm hoàn toàn với trình đọc màn hình — nó không nói thêm gì ngoài tiêu đề trang. Ba
 * lời hứa và biển hiệu thì là CHỮ THẬT: đọc được, dịch được, phóng to theo cỡ chữ người dùng.
 */
export function UpgradeHeroArt() {
  const t = useTranslations('Subscription');

  return (
    <div className={styles.hero}>
      <svg
        className={styles.art}
        viewBox="0 0 220 120"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        {/* Khu phố mờ phía sau — khối đặc rất nhạt, chỉ để tạo chiều sâu. */}
        <g fill="var(--xp-color-primary)" opacity="0.13">
          <rect x="6" y="46" width="22" height="58" rx="2" />
          <rect x="32" y="60" width="16" height="44" rx="2" />
          <rect x="150" y="52" width="18" height="52" rx="2" />
          <rect x="172" y="66" width="14" height="38" rx="2" />
        </g>

        {/* Cột doanh thu đi lên. */}
        <g fill="var(--xp-color-primary)" opacity="0.45">
          <rect x="174" y="84" width="10" height="20" rx="2" />
          <rect x="188" y="72" width="10" height="32" rx="2" />
          <rect x="202" y="58" width="10" height="46" rx="2" />
        </g>

        {/* Thân gian hàng: tường sáng, mái và bệ màu thương hiệu. */}
        <rect x="88" y="52" width="66" height="52" rx="3" fill="var(--xp-color-bg-container)" />
        <rect x="88" y="52" width="66" height="52" rx="3" fill="var(--xp-color-primary)" opacity="0.08" />
        <rect x="84" y="46" width="74" height="8" rx="3" fill="var(--xp-color-primary)" />

        {/* Mái hiên kẻ sọc trên cửa. */}
        <path d="M86 60h70v10a10 10 0 0 1-10 10H96a10 10 0 0 1-10-10z" fill="var(--xp-color-primary-light)" />
        <g fill="var(--xp-color-primary)" opacity="0.55">
          <path d="M96 60h10v20H96z" />
          <path d="M116 60h10v20h-10z" />
          <path d="M136 60h10v20h-10z" />
        </g>

        {/* Cửa, ô kính và chậu cây. */}
        <rect x="96" y="82" width="16" height="22" rx="2" fill="var(--xp-color-primary)" opacity="0.5" />
        <rect x="124" y="84" width="22" height="14" rx="2" fill="var(--xp-color-primary)" opacity="0.28" />
        <path d="M150 104v-6a5 5 0 0 1 10 0v6z" fill="var(--xp-color-primary)" opacity="0.35" />

        {/* Biển hiệu — chữ THẬT, dịch theo ngôn ngữ đang dùng. */}
        <rect x="88" y="26" width="66" height="18" rx="4" fill="var(--xp-color-primary)" />
        <text
          x="121"
          y="38"
          textAnchor="middle"
          className={styles.signText}
          fill="var(--xp-color-primary-contrast)"
        >
          {t('page.heroBadge')}
        </text>

        {/* Chiếc xe đậu trước cửa — mảng TRẮNG, thứ duy nhất sáng hơn nền. */}
        <g>
          <path
            d="M18 104V92l10-12h30l12 12h6v12z"
            fill="var(--xp-color-bg-container)"
            stroke="var(--xp-color-primary-active)"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M30 80h24l8 10H30z" fill="var(--xp-color-primary)" opacity="0.2" />
          <circle cx="32" cy="104" r="6" fill="var(--xp-color-primary-active)" opacity="0.75" />
          <circle cx="62" cy="104" r="6" fill="var(--xp-color-primary-active)" opacity="0.75" />
        </g>

        {/* Mặt đất. */}
        <rect x="0" y="104" width="220" height="2" rx="1" fill="var(--xp-color-primary)" opacity="0.3" />

        {/* Ngôi sao — chi tiết duy nhất đặt cao, ở chỗ mắt dừng lại sau biển hiệu. */}
        <g fill="var(--xp-color-primary)">
          <path d="M166 16l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
          <path d="M72 30l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" opacity="0.55" />
        </g>
      </svg>

      <ul className={styles.benefits}>
        {[t('page.heroBenefit1'), t('page.heroBenefit2'), t('page.heroBenefit3')].map((line) => (
          <li key={line}>
            <CheckCircleFilled aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { STOREFRONT_KIND } from '@xeprime/types';
import { VerifiedMark } from '@/components/common/VerifiedMark';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';
import { ShopContactActions } from './ShopContactActions';
import type { PublicShop } from '../types';
import styles from './ShopHeader.module.css';

/**
 * Đầu trang gian hàng công khai — Server Component (không state, không `antd`) để nội dung nhận
 * dạng của gian hàng nằm sẵn trong HTML cho công cụ tìm kiếm. Phần duy nhất phải là client là
 * hai nút liên hệ, và nó được tách ra thành một island riêng (`ShopContactActions`).
 *
 * ## Hai mặt tiền, một component
 *
 * `shop.storefrontKind` (backend chấm từ tuyến thu tiền hiệu lực) chọn giữa:
 *
 *   `personal` — chủ xe cá nhân: KHÔNG ảnh bìa, avatar tròn, hồ sơ đọc như hồ sơ một CON NGƯỜI.
 *   `shop`     — gian hàng tuyến gói: ảnh bìa lớn, vành vàng quanh logo, dấu xác thực, các năng
 *                lực doanh nghiệp đếm được.
 *
 * Tách thành hai component sẽ nhân đôi phần giống nhau (tên, đánh giá, liên hệ, thiếu-ảnh) và
 * đó chính là phần dễ trôi khỏi nhau nhất. Nhánh nằm ở đúng ba chỗ mà hai mặt tiền THẬT SỰ khác
 * nhau, mỗi chỗ đều đọc được ngay tại đây.
 *
 * ## Ảnh bìa chỉ thuộc về gian hàng
 *
 * Chủ xe cá nhân có thể đã tải lên một `coverUrl` từ trước (cùng form hồ sơ), nhưng một dải bìa
 * rộng phía trên một người có một chiếc xe là mượn ngôn ngữ thị giác của doanh nghiệp để nói một
 * điều chưa được xác minh. Dữ liệu vẫn còn nguyên trong hồ sơ họ; trang công khai chỉ không vẽ.
 */
export async function ShopHeader({ shop }: { shop: PublicShop }) {
  const [t, fmt] = await Promise.all([getTranslations('Shops'), getAppFormat()]);
  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;
  const rating = Number(shop.ratingAvg);
  const hasRating = shop.ratingCount > 0 && Number.isFinite(rating);

  /*
   * Các tỉnh gian hàng ĐANG có xe, không phải tỉnh ghi trong hồ sơ: khách đọc dòng này để biết
   * "thuê được ở đâu", và một salon bốn chi nhánh mà chỉ hiện tỉnh đăng ký là nói thiếu.
   * Chưa có xe công khai nào ⇒ rơi về tỉnh trong hồ sơ, vẫn hơn là một dòng trống.
   */
  const provinces =
    shop.serviceProvinceNames.length > 0
      ? shop.serviceProvinceNames
      : shop.provinceName
        ? [shop.provinceName]
        : [];

  const joinedLabel = t(isShop ? 'header.joinedShop' : 'header.joinedPersonal', {
    date: fmt.monthYear(new Date(shop.joinedAt)),
  });

  return (
    <header className={styles.header}>
      {isShop ? (
        <ShopCover
          imageUrl={shop.coverUrl}
          alt={t('header.coverAlt', { name: shop.name })}
          highlights={[
            shop.verified ? t('highlights.verified') : null,
            shop.branchCount > 1 ? t('highlights.branches', { count: shop.branchCount }) : null,
            shop.deliveryAvailable ? t('highlights.delivery') : null,
          ].filter((chip): chip is string => chip !== null)}
        />
      ) : null}

      <div className={styles.inner}>
        <div className={cx(styles.identity, isShop && styles.identityShop)}>
          <div className={cx(styles.avatar, isShop && styles.avatarShop)}>
            {shop.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh từ storage ngoài (R2)
              <img
                src={shop.logoUrl}
                alt={t('header.logoAlt', { name: shop.name })}
                className={styles.avatarImg}
              />
            ) : (
              <span className={styles.avatarFallback} aria-hidden="true">
                {initialOf(shop.name)}
              </span>
            )}
          </div>

          <div className={styles.info}>
            <div className={styles.nameRow}>
              <h1 className={styles.name}>{shop.name}</h1>
              {shop.verified ? (
                <VerifiedMark label={t('header.verified')} size={22} className={styles.verified} />
              ) : null}
              <span className={cx(styles.badge, isShop && styles.badgeShop)}>
                {t(isShop ? 'badge.shop' : 'badge.personal')}
              </span>
            </div>

            <div className={styles.meta}>
              {provinces.length > 0 ? (
                <span className={styles.metaItem}>
                  <PinIcon />
                  {provinces.join(' · ')}
                </span>
              ) : null}
              <span className={styles.metaItem}>
                {hasRating ? (
                  <>
                    {/*
                      MỘT ngôi sao, không phải năm. Ở đây điểm số đứng ngay cạnh nó ("4,9 (156
                      đánh giá)"), nên năm ngôi sao chỉ lặp lại cùng một thông tin bằng một khối
                      hình nặng hơn tên gian hàng ngay phía trên. Năm sao giữ nguyên ở chỗ nó
                      thật sự làm việc: thẻ đánh giá, nơi KHÔNG có con số đi kèm.
                    */}
                    <span className={styles.star} aria-hidden="true">
                      ★
                    </span>
                    <span className={styles.ratingText}>
                      {t('header.rating', { avg: fmt.rating(rating), count: shop.ratingCount })}
                    </span>
                  </>
                ) : (
                  <span className={styles.ratingText}>{t('header.noRating')}</span>
                )}
              </span>
              <span className={styles.metaDivider} aria-hidden="true" />
              <span className={styles.metaItem}>{joinedLabel}</span>
            </div>
          </div>

          <ShopContactActions
            slug={shop.slug}
            chatOpen={shop.chatOpen}
            className={styles.actions}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * Dải bìa của gian hàng + các năng lực ĐẾM ĐƯỢC.
 *
 * Ba chip đều truy ngược được về dữ liệu: đã qua xác minh pháp nhân (tuyến gói), số chi nhánh
 * đang hoạt động, có xe giao tận nơi. Cố ý KHÔNG có "Bảo hiểm toàn diện" hay "Hỗ trợ 24/7" —
 * chưa có partner + policy + chứng nhận thật thì in chúng lên là hứa hộ người khác (ADR 0028),
 * và một chip sai làm cả ba chip còn lại mất giá trị.
 *
 * Không có ảnh bìa thì vẫn giữ dải: chip là phần mang thông tin, ảnh chỉ là nền — bỏ cả khối đi
 * sẽ làm hai gian hàng cùng hạng trông khác hẳn nhau chỉ vì một người chưa tải ảnh lên.
 *
 * Nhận chữ ĐÃ DỊCH thay vì tự gọi `getTranslations`, nên nó là một component ĐỒNG BỘ: một
 * Server Component async lồng trong một Server Component async chỉ giải được bằng bộ render RSC
 * của Next, tức là không bài test nào chạm tới nó được — và một dải bìa không có test là chỗ
 * duy nhất trên trang này mà một chip sai sẽ sống sót.
 */
function ShopCover({
  imageUrl,
  alt,
  highlights,
}: {
  imageUrl: string | null | undefined;
  alt: string;
  highlights: string[];
}) {
  return (
    <div className={styles.cover}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ storage ngoài (R2)
        <img src={imageUrl} alt={alt} className={styles.coverImg} />
      ) : (
        <div className={styles.coverFallback} aria-hidden="true" />
      )}
      <div className={styles.coverScrim} aria-hidden="true" />
      {highlights.length > 0 ? (
        <ul className={styles.highlights}>
          {highlights.map((chip) => (
            <li key={chip} className={styles.highlight}>
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Ghim địa bàn trước danh sách tỉnh.
 *
 * SVG inline thay vì `EnvironmentOutlined`: `@ant-design/icons` kéo cả đầu trang qua ranh giới
 * client chỉ vì một hình 14px, mà đầu trang gian hàng tồn tại chính là để render sẵn ở server
 * cho công cụ tìm kiếm. Trang trí thuần nên `aria-hidden` — tên tỉnh ngay bên cạnh đã là chữ.
 */
function PinIcon() {
  return (
    <svg
      className={styles.pin}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 3.2 3.86 7.9 4.03 8.1a.6.6 0 0 0 .94 0C8.64 13.9 12.5 9.2 12.5 6A4.5 4.5 0 0 0 8 1.5Zm0 6.25A1.75 1.75 0 1 1 8 4.25a1.75 1.75 0 0 1 0 3.5Z" />
    </svg>
  );
}

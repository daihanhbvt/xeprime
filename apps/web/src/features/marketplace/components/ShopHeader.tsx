import Image from 'next/image';
import {
  HOST_METRIC_STATE,
  HOST_METRIC_WINDOW_DAYS,
  STOREFRONT_KIND,
  hostMetricState,
} from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';
import { ShopContactActions } from './ShopContactActions';
import type { PublicShop } from '../types';
import styles from './ShopHeader.module.css';

/**
 * Đầu trang gian hàng công khai — Server Component (không state, không `antd`) để danh tính, giới
 * thiệu và số liệu của gian hàng nằm sẵn trong HTML cho công cụ tìm kiếm. Phần client duy nhất là
 * nút nhắn tin (`ShopContactActions`) và dấu "i" của ô "Nhận & giữ chuyến".
 *
 * Figma: chủ xe cá nhân `20058:71218`, gian hàng `20063:59332`. MỘT thẻ gom ba thứ trước đây là
 * ba khối: ai (tên, nơi có xe, điểm, số chuyến, điểm nổi bật) → họ tự giới thiệu gì → hệ thống
 * đếm được gì về họ. Đặt cạnh nhau để người đọc đối chiếu ngay: một đoạn giới thiệu hùng hồn bên
 * cạnh "00 chuyến đã hoàn thành" tự nói điều cần nói.
 *
 * ## Hai mặt tiền, một component
 *
 * `shop.storefrontKind` (backend chấm từ tuyến thu tiền hiệu lực) chọn giữa:
 *
 *   `personal` — chủ xe cá nhân: KHÔNG ảnh bìa, thẻ viền xám, hồ sơ đọc như hồ sơ một CON NGƯỜI.
 *   `shop`     — gian hàng tuyến gói: ảnh bìa, thẻ viền vàng đè lên bìa, dấu xác thực, ô "Chi
 *                nhánh".
 *
 * Chủ xe cá nhân có thể đã tải lên một `coverUrl` (cùng form hồ sơ), nhưng một dải bìa rộng phía
 * trên một người có một chiếc xe là mượn ngôn ngữ thị giác của doanh nghiệp để nói một điều chưa
 * được xác minh — trang công khai không vẽ nó.
 *
 * ## Mọi chip và mọi ô đều ĐẾM ĐƯỢC
 *
 * Bản vẽ còn có số điện thoại, chip "Hỗ trợ phí đặt xe" và các khối cam kết (pháp nhân, bảo dưỡng,
 * hỗ trợ 24/7) — chúng cố ý KHÔNG có ở đây: số điện thoại không công khai (`PublicShopDto`), và
 * một lời hứa chưa có dữ liệu đứng sau là nói dối khách (ADR 0028). Ô thiếu dữ liệu thì BIẾN MẤT,
 * không hiện 0: điểm khi chưa ai chấm không phải "0 sao", và chỉ số uy tín dưới ngưỡng mẫu là
 * "chưa đủ dữ liệu", không phải 0% (ADR 0045 điều 3).
 */
export async function ShopHeader({ shop }: { shop: PublicShop }) {
  const [t, fmt] = await Promise.all([getTranslations('Shops'), getAppFormat()]);
  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;
  const rating = Number(shop.ratingAvg);
  const hasRating = shop.ratingCount > 0 && Number.isFinite(rating);

  /*
   * Các tỉnh gian hàng ĐANG có xe, không phải tỉnh ghi trong hồ sơ: khách đọc dòng này để biết
   * "thuê được ở đâu", và một salon bốn chi nhánh mà chỉ hiện tỉnh đăng ký là nói thiếu. Chưa có
   * xe công khai nào ⇒ rơi về tỉnh trong hồ sơ, vẫn hơn là một dòng trống.
   */
  const provinces =
    shop.serviceProvinceNames.length > 0
      ? shop.serviceProvinceNames
      : shop.provinceName
        ? [shop.provinceName]
        : [];

  /*
   * "Đã xác minh" đọc PHIẾU DUYỆT gian hàng (`trust.shopVerified`), không đọc `verified` (= đang ở
   * tuyến gói): trả tiền gói không đồng nghĩa nền tảng đã xem xét hồ sơ (ADR 0040 điều 5). Dấu
   * xanh trên logo thì vẫn đọc `verified` — nó là dấu GIAN HÀNG, cùng dấu ở logo trên thẻ xe.
   */
  const highlights = [
    shop.trust.shopVerified ? t('profile.verified') : null,
    shop.branchCount > 1 ? t('profile.branches', { count: shop.branchCount }) : null,
    shop.deliveryAvailable ? t('profile.delivery') : null,
  ].filter((chip): chip is string => chip !== null);

  // Chỉ số uy tín chỉ có tiếng nói khi đủ mẫu; dưới ngưỡng thì ô biến mất thay vì hiện 0%.
  const metricsReady = hostMetricState(shop.metrics.sampleCount) === HOST_METRIC_STATE.READY;
  const responseRate = metricsReady ? shop.metrics.responseRatePercent : null;
  const acceptKeepRate = metricsReady ? shop.metrics.acceptKeepRatePercent : null;

  // "02", "07" như bản vẽ — số đếm nhỏ đứng thẳng hàng với "100%" của ô bên cạnh.
  const countValue = (value: number) => (value < 10 ? `0${value}` : fmt.count(value));

  const statCandidates: (ShopStat | null)[] = [
    isShop
      ? { key: 'branches', value: countValue(shop.branchCount), label: t('profile.stats.branches') }
      : null,
    { key: 'vehicles', value: countValue(shop.vehicleCount), label: t('profile.stats.vehicles') },
    {
      key: 'completedTrips',
      value: countValue(shop.completedTripCount),
      label: t('profile.stats.completedTrips'),
    },
    hasRating
      ? {
          key: 'rating',
          value: fmt.rating(rating),
          label: t('profile.stats.rating'),
          star: true,
        }
      : null,
    responseRate !== null
      ? {
          key: 'responseRate',
          value: t('metrics.responseRateValue', { percent: responseRate }),
          label: t('profile.stats.responseRate'),
        }
      : null,
    acceptKeepRate !== null
      ? {
          key: 'acceptKeep',
          value: t('metrics.acceptKeepValue', { percent: acceptKeepRate }),
          label: t('profile.stats.acceptKeep'),
          hint: {
            label: t('metrics.acceptKeepHintLabel'),
            content: t('metrics.acceptKeepHint', { days: HOST_METRIC_WINDOW_DAYS }),
          },
        }
      : null,
  ];
  const stats = statCandidates.filter((stat): stat is ShopStat => stat !== null);

  return (
    <header className={cx(styles.header, isShop && styles.headerShop)}>
      {isShop ? (
        <ShopCover imageUrl={shop.coverUrl} alt={t('header.coverAlt', { name: shop.name })} />
      ) : null}

      <div className={styles.inner}>
        <div className={cx(styles.card, isShop && styles.cardShop)}>
          {isShop ? (
            <Image
              src="/shops/crown.webp"
              alt=""
              width={84}
              height={84}
              className={styles.crown}
              aria-hidden="true"
              unoptimized
            />
          ) : null}

          <div className={styles.summary}>
            <div className={styles.identity}>
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
                {/*
                  Huy hiệu XANH của bản vẽ (Figma "_Avatar company icon") — cùng file với dấu ở
                  logo gian hàng trên thẻ xe, để khách thấy một dấu ở cả hai nơi. Không dùng
                  `VerifiedMark` (con dấu vàng của menu tài khoản): ở đây nó là dấu của GIAN HÀNG.
                */}
                {shop.verified ? (
                  <span
                    className={styles.avatarMark}
                    role="img"
                    aria-label={t('header.verified')}
                    title={t('header.verified')}
                  >
                    <Image src="/home/card-verified.svg" alt="" width={17} height={16} unoptimized />
                  </span>
                ) : null}
              </div>

              <div className={styles.info}>
                <div className={styles.nameRow}>
                  <h1 className={styles.name}>{shop.name}</h1>
                  <span className={styles.badge}>
                    {t(isShop ? 'profile.badgeShop' : 'profile.badgePersonal')}
                  </span>
                </div>

                <ul className={styles.meta}>
                  {provinces.length > 0 ? (
                    <li className={styles.metaItem}>
                      <MetaIcon src="/shops/location.svg" width={15} height={19} />
                      <span>{provinces.join(' · ')}</span>
                    </li>
                  ) : null}
                  <li className={styles.metaItem}>
                    {hasRating ? (
                      <>
                        <MetaIcon src="/shops/star.svg" width={20} height={20} />
                        <span>
                          {fmt.rating(rating)}{' '}
                          <span className={styles.metaMuted}>
                            {t('profile.ratingCount', { count: shop.ratingCount })}
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className={styles.metaMuted}>{t('header.noRating')}</span>
                    )}
                  </li>
                  <li className={cx(styles.metaItem, styles.metaStrong)}>
                    <MetaIcon src="/shops/chart.svg" width={16} height={16} />
                    <span>{t('profile.trips', { count: shop.completedTripCount })}</span>
                  </li>
                </ul>
              </div>

              <ShopContactActions
                slug={shop.slug}
                chatOpen={shop.chatOpen}
                className={styles.chat}
              />
            </div>

            {highlights.length > 0 ? (
              <ul className={styles.highlights} aria-label={t('profile.highlightsLabel')}>
                {highlights.map((chip) => (
                  <li key={chip} className={styles.highlight}>
                    <Image src="/shops/check.svg" alt="" width={12} height={12} unoptimized />
                    {chip}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {shop.bio || shop.address ? (
            <section className={styles.about}>
              <h2 className={styles.aboutTitle}>{t('profile.aboutTitle')}</h2>
              {shop.bio ? <p className={styles.bio}>{shop.bio}</p> : null}
              {shop.address ? (
                <p className={styles.address}>
                  {t('profile.address', { address: shop.address })}
                </p>
              ) : null}
            </section>
          ) : null}

          <ul className={styles.stats} aria-label={t('profile.stats.label')}>
            {stats.map((stat) => (
              <li key={stat.key} className={styles.stat}>
                <span className={styles.statValue}>
                  {stat.value}
                  {stat.star ? (
                    <Image src="/shops/star-16.svg" alt="" width={16} height={16} unoptimized />
                  ) : null}
                </span>
                <span className={styles.statLabel}>
                  {stat.label}
                  {stat.hint ? (
                    <InfoHint
                      className={styles.statHint}
                      label={stat.hint.label}
                      content={stat.hint.content}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          <p className={styles.joined}>
            <Image src="/shops/info.svg" alt="" width={20} height={20} unoptimized />
            {t('profile.joined', { date: fmt.monthYear(new Date(shop.joinedAt)) })}
          </p>
        </div>
      </div>
    </header>
  );
}

interface ShopStat {
  key: string;
  value: string;
  label: string;
  star?: boolean;
  hint?: { label: string; content: string };
}

/**
 * Ô icon 20×20 đứng trước một dòng meta — trang trí thuần, chữ bên cạnh đã mang nghĩa. Kích thước
 * hình là kích thước GỐC của từng SVG trong bản vẽ (ghim 15×19, biểu đồ 16×16, sao 20×20).
 */
function MetaIcon({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <span className={styles.metaIcon} aria-hidden="true">
      <Image src={src} alt="" width={width} height={height} unoptimized />
    </span>
  );
}

/**
 * Dải bìa của gian hàng. Không có ảnh bìa thì vẫn giữ dải bằng nền thương hiệu: thẻ hồ sơ đè lên
 * mép dưới của nó, bỏ dải đi thì hai gian hàng cùng hạng trông khác hẳn nhau chỉ vì một người chưa
 * tải ảnh lên.
 */
function ShopCover({ imageUrl, alt }: { imageUrl: string | null | undefined; alt: string }) {
  return (
    <div className={styles.cover}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ storage ngoài (R2)
        <img src={imageUrl} alt={alt} className={styles.coverImg} />
      ) : (
        <div className={styles.coverFallback} aria-hidden="true" />
      )}
    </div>
  );
}

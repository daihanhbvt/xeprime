import Image from 'next/image';
import { SELLER_ENTITY_TYPE } from '@xeprime/types';
import { getTranslations } from 'next-intl/server';
import type { PublicShop } from '../types';
import styles from './ShopTrust.module.css';

/**
 * Khối UY TÍN của trang gian hàng — Figma `21621:69873` (thẻ "Xác thực XePrime") và `20063:59213`
 * (hàng ô cam kết). Server Component, chỉ vẽ cho mặt tiền GIAN HÀNG.
 *
 * ## Mỗi dòng là một sự thật có người chịu trách nhiệm
 *
 * Dữ liệu là `shop.trust` (backend `shopTrust`): hồ sơ người bán + giấy phép đã được nền tảng
 * duyệt, phiếu duyệt gian hàng, OTP của chủ, cam kết VAT có audit, sổ bảo dưỡng. Dòng nào chưa có
 * nguồn thì KHÔNG vẽ — kể cả khi bản vẽ có nó:
 *
 *   - "Đã ký hợp đồng cam kết chất lượng với XePrime": chưa có văn bản thoả thuận nào được ký;
 *   - "Chủ xe siêu cấp": cần ADR (ADR 0045 điều 3 hiện cấm huy hiệu uy tín);
 *   - "Đội xe dự phòng & cứu hộ 24/7": không có dữ liệu, và XePrime không hứa thay chủ xe (ADR 0028).
 *
 * Ô "Chính sách cọc & Hoàn tiền" nói luật của SÀN (tiền giữ chỗ qua XePrime, hoàn khi huỷ trong
 * thời gian huỷ miễn phí) — "nếu chuyến có" vì chuyến nhận xe quá sát giờ không có cửa sổ đó.
 *
 * Nhận chữ qua `getTranslations` ở chính tầng này và không có component async lồng nhau — cùng lý
 * do `ShopHeader` (test dựng được bằng cách gọi như một hàm).
 */
export async function ShopTrust({
  trust,
  vehicleCount,
  noCollateralCount,
}: {
  trust: PublicShop['trust'];
  vehicleCount: number;
  noCollateralCount: number;
}) {
  const t = await getTranslations('Shops.trust');

  const legalEntityKey =
    trust.legalEntityType === SELLER_ENTITY_TYPE.COMPANY
      ? 'company'
      : trust.legalEntityType === SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS
        ? 'household_business'
        : null;

  const checks = [
    legalEntityKey ? t(`legalEntity.${legalEntityKey}`) : null,
    trust.shopVerified ? t('shopVerified') : null,
    trust.contactVerified ? t('contactVerified') : null,
  ].filter((line): line is string => line !== null);

  const tiles: TrustTile[] = [];
  if (trust.vatInvoiceSupported) {
    tiles.push({
      key: 'legal',
      image: '/shops/tile-legal.webp',
      title: t('tiles.legal.title'),
      body: [t('tiles.legal.vat'), legalEntityKey ? t('tiles.legal.verified') : null],
    });
  }
  if (trust.maintenanceOnScheduleCount > 0 && vehicleCount > 0) {
    tiles.push({
      key: 'maintenance',
      image: '/shops/tile-maintenance.webp',
      title: t('tiles.maintenance.title'),
      body: [
        t('tiles.maintenance.body', {
          onSchedule: trust.maintenanceOnScheduleCount,
          total: vehicleCount,
        }),
      ],
    });
  }
  tiles.push({
    key: 'deposit',
    image: '/shops/tile-wallet.webp',
    title: t('tiles.deposit.title'),
    body: [
      t('tiles.deposit.body'),
      noCollateralCount > 0
        ? t('tiles.deposit.noCollateral', { count: noCollateralCount, total: vehicleCount })
        : null,
    ],
  });

  return (
    <section className={styles.section} aria-label={t('sectionLabel')}>
      {checks.length > 0 ? (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{t('title')}</h2>
            {trust.shopVerified ? (
              <span className={styles.badge}>
                <Image src="/shops/tick-blue.svg" alt="" width={9} height={6} unoptimized />
                {t('badge')}
              </span>
            ) : null}
          </div>
          <ul className={styles.checks}>
            {checks.map((line) => (
              <li key={line} className={styles.check}>
                <span className={styles.checkIcon} aria-hidden="true">
                  <Image src="/shops/check-gold.svg" alt="" width={12} height={12} unoptimized />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className={styles.tiles}>
        {tiles.map((tile) => (
          <li key={tile.key} className={styles.tile}>
            <Image
              src={tile.image}
              alt=""
              width={80}
              height={80}
              className={styles.tileImage}
              unoptimized
            />
            <div className={styles.tileText}>
              <h3 className={styles.tileTitle}>{tile.title}</h3>
              {tile.body
                .filter((line): line is string => line !== null)
                .map((line) => (
                  <p key={line} className={styles.tileBody}>
                    {line}
                  </p>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface TrustTile {
  key: string;
  image: string;
  title: string;
  body: (string | null)[];
}

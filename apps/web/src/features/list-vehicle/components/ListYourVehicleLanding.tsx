'use client';

import {
  ArrowRightOutlined,
  BankOutlined,
  CarOutlined,
  SettingOutlined,
  TagOutlined,
} from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';

import { PageBreadcrumb, type PageCrumb } from '@/components/navigation/PageBreadcrumb';
import { ROUTES } from '@/constants/routes';
import { usePartnerOffer } from '@/features/account/hooks/use-partner-offer';
import { useCurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';

import styles from './ListYourVehicleLanding.module.css';

/**
 * Số xe tối đa của chủ xe tuyến hoa hồng (Owner Lite — ADR 0041 điều 4).
 *
 * Để ở ĐÂY, không rải vào câu dịch: con số xuất hiện ở cả `vi` lẫn `en`, và một ngày nào đó nó đổi
 * theo gói — lúc đó phải chỉ có MỘT chỗ để sửa. Trang giới thiệu tĩnh nên không gọi API để lấy số.
 *
 * Mức hoa hồng KHÔNG in thành con số: nó là bậc thang theo ngày thuê nằm trong `fee_policies`
 * (ADR 0064 điều 3), một con số cứng ở đây sẽ sai ngay lần admin chỉnh nấc.
 */
const BASIC_OWNER_VEHICLE_CAP = 3;

export interface ListYourVehicleLandingProps {
  /** Đích của "Đăng xe đầu tiên" (tuyến hoa hồng). */
  personalHref: string;
  /** Đích của "Tìm hiểu và tạo gian hàng" (tuyến gói). */
  shopHref: string;
  /**
   * Đầu trang "Trở thành chủ xe" — nút quay lại tròn + đường dẫn + tiêu đề trang (Figma "Account /
   * Upgrade", `20037:6383`). Site khách bật — người ta tới đây từ menu tài khoản hoặc từ chợ xe.
   * Site partner tắt: ngay sau khi tạo tài khoản đối tác, trang trước là chính form đăng ký.
   */
  showBack?: boolean;
  /**
   * Mở hai nút ở TAB MỚI — site khách bật: form đăng ký nằm ở site partner (tài khoản khác), người
   * dùng giữ nguyên tab chợ xe đang xem.
   */
  openInNewTab?: boolean;
}

/**
 * "Chọn mô hình hợp tác cùng XePrime" — HAI tuyến song song, một nội dung cho hai nơi:
 *
 *  - **site khách** (`/list-your-vehicle`, công khai, cần SEO; cũng là đích của mục "Trở thành chủ
 *    xe" trong menu tài khoản): hai nút dẫn sang `/register?track=…` của site partner;
 *  - **site partner** (`/register`, ngay SAU khi tạo tài khoản đối tác — ADR 0053): hai nút dẫn vào
 *    bước tiếp theo của tuyến — wizard đăng xe nhanh (hoa hồng) · onboarding gói.
 *
 * Bố cục theo Figma "Account / Upgrade" `20037:6621`: PC và máy tính bảng hai thẻ CẠNH NHAU, hình
 * minh hoạ ở góc phải mỗi thẻ; điện thoại một cột. Hình minh hoạ, nền thẻ gian hàng và ruy băng là ẢNH xuất từ
 * Figma (`public/list-your-vehicle/`), cắt đúng khung của bản vẽ.
 *
 * Trang chỉ TRÌNH BÀY hai lựa chọn độc lập của ADR 0028 và không tự chuyển lựa chọn này thành lựa
 * chọn kia; nơi dùng quyết định đích. Không tự tạo tenant cho ai.
 */
export function ListYourVehicleLanding({
  personalHref,
  shopHref,
  showBack = true,
  openInNewTab = false,
}: ListYourVehicleLandingProps) {
  const linkTarget = openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  const t = useTranslations('ListYourVehicle.landing');
  // Khoảng % hoa hồng đọc từ chính sách phí hiện hành; chưa có thì giữ câu chung, không đoán số.
  const offer = usePartnerOffer().data;
  const commissionRange =
    offer?.minOwnerCommissionPercent != null && offer.maxOwnerCommissionPercent != null
      ? { min: offer.minOwnerCommissionPercent, max: offer.maxOwnerCommissionPercent }
      : null;
  // Có đầu trang thì `h1` là "Trở thành chủ xe" của đầu trang — mỗi trang đúng một `h1`.
  const heroLevel = showBack ? 'h2' : 'h1';
  const cardLevel = showBack ? 'h3' : 'h2';

  return (
    <div className={styles.page}>
      {showBack ? <LandingPageHeader /> : null}

      <div className={styles.body}>
        <header className={styles.intro}>
          <Heading as={heroLevel} className={styles.title}>
            {t.rich('heroTitle', {
              brand: (chunks) => <span className={styles.brand}>{chunks}</span>,
            })}
          </Heading>
          <p className={styles.subtitle}>{t.rich('subtitle', { br: () => <br /> })}</p>
        </header>

        <div className={styles.tracks}>
          <TrackCard
            variant="personal"
            headingLevel={cardLevel}
            badge={t('personal.badge')}
            title={t('personal.title')}
            tagline={t('personal.tagline')}
            body={t('personal.body', { maxVehicles: BASIC_OWNER_VEHICLE_CAP })}
            features={[
              { key: 'noFee', icon: <TagOutlined />, label: t('personal.features.noFee') },
              {
                key: 'vehicleCap',
                icon: <CarOutlined />,
                label: t('personal.features.vehicleCap', { maxVehicles: BASIC_OWNER_VEHICLE_CAP }),
              },
              { key: 'simple', icon: <SettingOutlined />, label: t('personal.features.simple') },
            ]}
            art={{ src: '/list-your-vehicle/owner-personal.webp', width: 884, height: 729 }}
            offerTitle={t('personal.offerTitle')}
            offerBody={
              commissionRange
                ? t.rich('personal.offerBodyRange', {
                    ...commissionRange,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })
                : t.rich('personal.offerBody', {
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })
            }
            cta={
              <Link
                href={personalHref}
                {...linkTarget}
                className={cx(styles.cta, styles.ctaOutline)}
              >
                {t('personal.cta')}
                <ArrowRightOutlined aria-hidden="true" />
              </Link>
            }
          />

          <TrackCard
            variant="shop"
            headingLevel={cardLevel}
            ribbon={t('shop.recommended')}
            badge={t('shop.badge')}
            title={t('shop.title')}
            tagline={t('shop.tagline')}
            body={t.rich('shop.body', { strong: (chunks) => <strong>{chunks}</strong> })}
            features={[
              { key: 'fleet', icon: <BankOutlined />, label: t('shop.features.fleet') },
              { key: 'operations', icon: <CarOutlined />, label: t('shop.features.operations') },
              { key: 'reports', icon: <SettingOutlined />, label: t('shop.features.reports') },
            ]}
            art={{ src: '/list-your-vehicle/owner-shop.webp', width: 829, height: 734 }}
            offerTitle={t.rich('shop.offerHighlight', {
              big: (chunks) => <span className={styles.offerBig}>{chunks}</span>,
            })}
            offerBody={t('shop.offerBody')}
            cta={
              <Link href={shopHref} {...linkTarget} className={cx(styles.cta, styles.ctaPrimary)}>
                {t('shop.cta')}
                <ArrowRightOutlined aria-hidden="true" />
              </Link>
            }
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Đầu trang "Trở thành chủ xe" (Figma `20037:6383`): dải trắng hết bề ngang dưới header chợ — nút
 * quay lại tròn + đường dẫn, rồi tiêu đề trang.
 *
 * Trang KHÔNG nằm trong vỏ `/account`: nó là landing công khai (SEO) cho cả người chưa đăng nhập.
 * Vì vậy mắt đầu của đường dẫn đi theo phiên — khách đã đăng nhập (tới từ menu tài khoản) thấy
 * "Tài khoản của tôi", người chưa đăng nhập thấy "Trang chủ" — và nút tròn lùi về đúng mắt đó (một
 * đường dẫn thật, không phải `router.back()`: mở tab mới hay F5 vẫn về đúng chỗ).
 */
function LandingPageHeader() {
  const t = useTranslations('ListYourVehicle.landing');
  const { data: user } = useCurrentUser();

  const parent: PageCrumb = user
    ? { key: 'account', label: t('breadcrumb.account'), href: ROUTES.ACCOUNT.ROOT }
    : { key: 'home', label: t('breadcrumb.home'), href: ROUTES.HOME };

  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderInner}>
        <PageBreadcrumb
          ariaLabel={t('breadcrumb.label')}
          crumbs={[parent, { key: 'current', label: t('pageTitle') }]}
          back={{ href: parent.href ?? ROUTES.HOME, label: t('back') }}
        />
        <h1 className={styles.pageTitle}>{t('pageTitle')}</h1>
      </div>
    </div>
  );
}

function Heading({
  as: Tag,
  className,
  children,
}: {
  as: 'h1' | 'h2' | 'h3';
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={className}>{children}</Tag>;
}

interface TrackFeature {
  key: string;
  icon: ReactNode;
  label: string;
}

interface TrackCardProps {
  /**
   * `personal`: nền trắng, viền vàng nhạt, nút viền.
   * `shop`: nền ảnh kem, viền vàng đậm, nhãn "Gói đề xuất", nút chính gradient.
   */
  variant: 'personal' | 'shop';
  headingLevel: 'h2' | 'h3';
  /** Nhãn nổi ở góc trên phải (Figma "Gói đề xuất"). */
  ribbon?: string;
  badge: string;
  title: string;
  tagline: string;
  body: ReactNode;
  features: TrackFeature[];
  art: { src: string; width: number; height: number };
  offerTitle: ReactNode;
  offerBody: ReactNode;
  cta: ReactNode;
}

/**
 * Một tuyến doanh thu = một thẻ. Hai thẻ dùng CHUNG cấu trúc và chỉ khác nhau ở `variant` — tách ra
 * để hai bên không trôi khỏi nhau khi sửa một bên.
 *
 * Bốn vùng là bốn con TRỰC TIẾP của lưới (`head`, `art`, `features`, `offer`) để mỗi khổ màn tự
 * xếp lại bằng `grid-template-areas`: ≥768px hình ở góc phải cạnh phần mở đầu, điện thoại xếp dọc.
 */
function TrackCard({
  variant,
  headingLevel,
  ribbon,
  badge,
  title,
  tagline,
  body,
  features,
  art,
  offerTitle,
  offerBody,
  cta,
}: TrackCardProps) {
  return (
    <section className={cx(styles.card, variant === 'shop' && styles.cardShop)}>
      {/*
        Ruy băng "Gói đề xuất" — ảnh của bản vẽ (Figma `20043:54654`, đã có dấu like), chữ ĐÈ lên
        bằng HTML để vẫn dịch được và đọc được bằng trình đọc màn hình.
      */}
      {ribbon ? (
        <span className={styles.ribbon}>
          <span className={styles.ribbonText}>{ribbon}</span>
        </span>
      ) : null}

      <div className={styles.cardHead}>
        <span className={styles.badge}>{badge}</span>
        <div className={styles.cardHeading}>
          <Heading as={headingLevel} className={styles.cardTitle}>
            {title}
          </Heading>
          <p className={styles.tagline}>{tagline}</p>
        </div>
        <p className={styles.cardBody}>{body}</p>
      </div>

      <div className={styles.cardArt}>
        <Image
          src={art.src}
          alt=""
          width={art.width}
          height={art.height}
          className={styles.artImage}
          priority={variant === 'personal'}
        />
      </div>

      <ul className={styles.features}>
        {features.map((feature, index) => (
          <Fragment key={feature.key}>
            {index > 0 ? <li className={styles.featureDivider} aria-hidden="true" /> : null}
            <li className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                {feature.icon}
              </span>
              <span className={styles.featureLabel}>{feature.label}</span>
            </li>
          </Fragment>
        ))}
      </ul>

      <div className={styles.offer}>
        <div className={styles.offerText}>
          <p className={styles.offerTitle}>{offerTitle}</p>
          <p className={styles.offerBody}>{offerBody}</p>
        </div>
        {cta}
      </div>
    </section>
  );
}

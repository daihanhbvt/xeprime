'use client';

import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CarOutlined,
  CrownOutlined,
  FileTextOutlined,
  PercentageOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { MouseEvent, ReactNode } from 'react';

import { LEGAL_DOC, legalPath } from '@/constants/legal';
import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  listYourVehicleRegisterPath,
} from '@/constants/routes';
import { useAuthModal } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';

import styles from './ListYourVehicleLanding.module.css';

/**
 * Số xe tối đa của chủ xe tuyến hoa hồng và mức phí dịch vụ thí điểm (ADR 0028).
 *
 * Để ở ĐÂY, không rải vào câu dịch: hai con số này xuất hiện ở cả `vi` lẫn `en`, và một
 * ngày nào đó chúng đổi theo `fee_policies`/gói — lúc đó phải chỉ có MỘT chỗ để sửa, không
 * phải đi dò bốn chuỗi. Đây là trang giới thiệu tĩnh nên không gọi API để lấy số: khi mức
 * phí thật được công bố qua endpoint công khai, thay hằng số này bằng giá trị đọc từ đó.
 */
const BASIC_OWNER_VEHICLE_CAP = 3;
const PLATFORM_SERVICE_FEE_PILOT_PERCENT = 10;

/**
 * Landing "Đăng xe cho thuê" — cửa vào CÔNG KHAI của chủ xe mới, hai tuyến song song.
 *
 * Đọc được khi chưa đăng nhập: người ta cần biết mình sẽ được gì trước khi giao email.
 * Trang trình bày HAI lựa chọn ĐỘC LẬP của ADR 0028 và không tự chuyển lựa chọn này thành
 * lựa chọn kia:
 *
 *  - "Đăng xe cá nhân" → wizard `/list-your-vehicle/register` (tuyến hoa hồng);
 *  - "Mở gian hàng cho thuê" → `/manage/onboarding` (tuyến gói).
 *
 * Chưa đăng nhập thì mở auth modal ngay tại trang, mang theo `next` là ĐÚNG đích vừa chọn —
 * không đẩy người chọn tuyến cá nhân sang form tạo gian hàng. `next` là đường dẫn NỘI BỘ
 * dựng từ hằng số, không nhận URL từ query, nên không có bề mặt open-redirect.
 *
 * Không tự tạo tenant cho ai: chỉ người bấm đúng nút gian hàng mới thể hiện ý định đó.
 */
export function ListYourVehicleLanding() {
  const t = useTranslations('ListYourVehicle.landing');
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const { open } = useAuthModal();

  const personalHref = listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.MARKETPLACE);
  const shopHref = ROUTES.MANAGE.ONBOARDING;

  /**
   * Chặn điều hướng khi chưa đăng nhập để mở auth modal tại chỗ; đăng nhập xong modal tự đẩy
   * về `next`. `href` vẫn là đích THẬT nên bot đọc được, chuột giữa/mở tab mới vẫn đúng, và
   * lúc đang tải `/auth/me` thì cứ để link chạy — trang đích tự có guard của nó.
   */
  function guard(destination: string) {
    return (event: MouseEvent<HTMLElement>) => {
      if (isLoading || user) return;
      event.preventDefault();
      open({ mode: AUTH_MODE.LOGIN, next: destination });
    };
  }

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.back()}
          className={styles.back}
        >
          {t('back')}
        </Button>
      </div>

      <header className={styles.intro}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>

      <TrackCard
        featured
        badge={t('personal.badge')}
        title={t('personal.title')}
        tagline={t('personal.tagline')}
        body={t('personal.body', { maxVehicles: BASIC_OWNER_VEHICLE_CAP })}
        features={[
          { key: 'noFee', icon: <FileTextOutlined />, label: t('personal.features.noFee') },
          {
            key: 'vehicleCap',
            icon: <CarOutlined />,
            label: t('personal.features.vehicleCap', { maxVehicles: BASIC_OWNER_VEHICLE_CAP }),
          },
          { key: 'simple', icon: <SettingOutlined />, label: t('personal.features.simple') },
        ]}
        art={{ src: '/illustrations/owner-personal-car.svg', width: 640, height: 420 }}
        artNote={t('personal.art')}
        offerIcon={<PercentageOutlined />}
        offerTitle={t('personal.offerTitle')}
        offerBody={t.rich('personal.offerBody', {
          percent: PLATFORM_SERVICE_FEE_PILOT_PERCENT,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
        cta={
          <Link href={personalHref} onClick={guard(personalHref)} className={styles.ctaLink}>
            <Button
              type="primary"
              size="large"
              block
              loading={isLoading}
              icon={<ArrowRightOutlined />}
              iconPosition="end"
            >
              {t('personal.cta')}
            </Button>
          </Link>
        }
      />

      <TrackCard
        badge={t('shop.badge')}
        title={t('shop.title')}
        tagline={t('shop.tagline')}
        body={t.rich('shop.body', { strong: (chunks) => <strong>{chunks}</strong> })}
        features={[
          { key: 'fleet', icon: <ApartmentOutlined />, label: t('shop.features.fleet') },
          {
            key: 'operations',
            icon: <CalendarOutlined />,
            label: t('shop.features.operations'),
          },
          { key: 'reports', icon: <BarChartOutlined />, label: t('shop.features.reports') },
        ]}
        art={{ src: '/illustrations/owner-shop-showroom.svg', width: 720, height: 420 }}
        offerIcon={<CrownOutlined />}
        offerTitle={t('shop.offerTitle')}
        offerBody={t('shop.offerBody')}
        cta={
          <Link href={shopHref} onClick={guard(shopHref)} className={styles.ctaLink}>
            <Button size="large" block icon={<ArrowRightOutlined />} iconPosition="end">
              {t('shop.cta')}
            </Button>
          </Link>
        }
      />

      <section className={styles.upgrade}>
        <span className={styles.upgradeIcon} aria-hidden="true">
          <SyncOutlined />
        </span>
        <div>
          <h2 className={styles.upgradeTitle}>{t('upgrade.title')}</h2>
          <p className={styles.upgradeBody}>{t('upgrade.body')}</p>
        </div>
      </section>

      {/*
        Link chính sách trỏ tới TÀI LIỆU CÓ THẬT (quy định sử dụng chợ). Nền tảng chưa có văn
        bản "hỗ trợ phạt nguội", nên ở đây không hứa điều đó — một link chết hoặc một cam kết
        pháp lý tự viết còn tệ hơn không có link.
      */}
      <Link href={legalPath.doc(LEGAL_DOC.MARKETPLACE_RULES)} className={styles.policyLink}>
        <SafetyCertificateOutlined aria-hidden="true" /> {t('policyLink')}
      </Link>
    </div>
  );
}

interface TrackFeature {
  key: string;
  icon: ReactNode;
  label: string;
}

interface TrackCardProps {
  /** Tuyến được nền tảng gợi ý trước: viền gold, nền kem, nút chính. */
  featured?: boolean;
  badge: string;
  title: string;
  tagline: string;
  body: ReactNode;
  features: TrackFeature[];
  art: { src: string; width: number; height: number };
  /** Chú thích nổi trên hình — chỉ tuyến cá nhân dùng. */
  artNote?: string;
  offerIcon: ReactNode;
  offerTitle: string;
  offerBody: ReactNode;
  cta: ReactNode;
}

/**
 * Một tuyến doanh thu = một thẻ. Hai thẻ dùng CHUNG cấu trúc và chỉ khác nhau ở mức nhấn
 * (`featured`) — tách ra để hai bên không trôi khỏi nhau khi sửa một bên.
 */
function TrackCard({
  featured = false,
  badge,
  title,
  tagline,
  body,
  features,
  art,
  artNote,
  offerIcon,
  offerTitle,
  offerBody,
  cta,
}: TrackCardProps) {
  return (
    <section className={cx(styles.card, featured && styles.cardFeatured)}>
      <div className={styles.cardMain}>
        <span className={styles.badge}>{badge}</span>
        <h2 className={styles.cardTitle}>{title}</h2>
        <p className={styles.tagline}>{tagline}</p>
        <p className={styles.cardBody}>{body}</p>
        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature.key} className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                {feature.icon}
              </span>
              <span className={styles.featureLabel}>{feature.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.cardArt}>
        <Image
          src={art.src}
          alt=""
          width={art.width}
          height={art.height}
          className={styles.artImage}
          priority={featured}
        />
        {artNote ? <span className={styles.artNote}>{artNote}</span> : null}
      </div>

      <aside className={styles.offer}>
        <div className={styles.offerHead}>
          <span className={styles.offerIcon} aria-hidden="true">
            {offerIcon}
          </span>
          <h3 className={styles.offerTitle}>{offerTitle}</h3>
        </div>
        <p className={styles.offerBody}>{offerBody}</p>
        {cta}
      </aside>
    </section>
  );
}

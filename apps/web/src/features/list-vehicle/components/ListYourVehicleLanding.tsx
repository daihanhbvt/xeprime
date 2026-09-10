'use client';

import { ArrowLeftOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LEGAL_DOC, legalPath } from '@/constants/legal';
import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  listYourVehicleRegisterPath,
} from '@/constants/routes';
import { AUTH_INTENT } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';

import styles from './ListYourVehicleLanding.module.css';

/** Bốn bước của quy trình — mã cố định, chữ lấy từ bó message. */
const STEPS = ['info', 'images', 'review', 'rent'] as const;

/**
 * Landing "Đăng ký xe" — cửa vào CÔNG KHAI của chủ xe mới.
 *
 * Xem được khi chưa đăng nhập: người ta cần biết mình sẽ được gì trước khi giao email. Bấm CTA
 * mới rẽ theo trạng thái thật:
 *
 *  - chưa đăng nhập → đăng nhập cổng quản lý kèm `intent=owner`, `next` trỏ về đúng wizard này
 *    (đường dẫn NỘI BỘ cố định, không nhận URL từ query — không mở cửa cho open redirect);
 *  - đã đăng nhập, chưa có gian hàng → onboarding tạo hồ sơ chủ xe, xong quay lại wizard;
 *  - đã có gian hàng → vào thẳng wizard.
 *
 * Không tự tạo tenant cho ai: chỉ người bấm đúng nút này mới thể hiện ý định làm chủ xe.
 */
export function ListYourVehicleLanding() {
  const t = useTranslations('ListYourVehicle.landing');
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();

  const wizardPath = listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.MARKETPLACE);
  const ctaHref = !user
    ? `${ROUTES.MANAGE.LOGIN}?intent=${AUTH_INTENT.OWNER}&next=${encodeURIComponent(wizardPath)}`
    : user.tenant
      ? wizardPath
      : `${ROUTES.MANAGE.ONBOARDING}?next=${encodeURIComponent(wizardPath)}`;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.back()}
          className={styles.back}
        >
          {t('back')}
        </Button>
        <h1 className={styles.title}>{t('title')}</h1>
        {/* Ô rỗng giữ tiêu đề đứng CHÍNH GIỮA trên desktop mà không cần định vị tuyệt đối. */}
        <span className={styles.spacer} aria-hidden="true" />
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          {/*
            Dùng lại illustration onboarding gian hàng đang có trong `public/illustrations` —
            không thêm ảnh mới từ internet, không placeholder.
          */}
          <Image
            src="/illustrations/shop-onboarding.svg"
            alt=""
            width={480}
            height={280}
            className={styles.heroArt}
            priority
          />
        </div>

        <Link href={ctaHref} className={styles.ctaLink}>
          <Button type="primary" size="large" loading={isLoading} className={styles.cta}>
            {t('cta')}
          </Button>
        </Link>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        <section className={styles.stepsCard} aria-labelledby="list-vehicle-steps">
          <h2 id="list-vehicle-steps" className={styles.stepsTitle}>
            {t('steps.title')}
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step} className={styles.step}>
                <span className={styles.stepIndex} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.stepBody}>
                  <span className={styles.stepTitle}>{t(`steps.${step}.title`)}</span>
                  <span className={styles.stepDesc}>{t(`steps.${step}.desc`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/*
          Link chính sách trỏ tới TÀI LIỆU CÓ THẬT (quy định sử dụng chợ). Nền tảng chưa có văn
          bản "hỗ trợ phạt nguội", nên ở đây không hứa điều đó — một link chết hoặc một cam kết
          pháp lý tự viết còn tệ hơn không có link.
        */}
        <Link href={legalPath.doc(LEGAL_DOC.MARKETPLACE_RULES)} className={styles.policyLink}>
          <SafetyCertificateOutlined aria-hidden="true" /> {t('policyLink')}
        </Link>
      </main>
    </div>
  );
}

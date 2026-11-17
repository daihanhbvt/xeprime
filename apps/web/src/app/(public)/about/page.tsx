import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { REGISTRATION_TRACK, SERVICE_TYPE } from '@xeprime/types';
import { Reveal } from '@/components/motion/Reveal';
import { SplitText } from '@/components/motion/SplitText';
import { enterClass, kenBurnsSlowClass } from '@/components/motion/motion-classes';
import { PageBreadcrumb } from '@/components/navigation/PageBreadcrumb';
import { ROUTES, partnerRegisterHref } from '@/constants/routes';
import { PartnerTrackCards } from '@/features/list-vehicle/components/ListYourVehicleLanding';
import { RentalSteps } from '@/features/marketplace/components/RentalSteps';
import { marketplaceSearchHref } from '@/features/marketplace/filter-params';
import { isCustomerAppWebView } from '@/lib/in-app-webview';
import { cx } from '@/lib/cx';
import { openGraphFor } from '@/lib/seo';
import styles from './page.module.css';

/**
 * "Về chúng tôi" — Figma `22306:64727` (Xe-Prime, desktop 1440), sáu khối theo đúng thứ tự bản vẽ:
 * giới thiệu + số liệu · mô hình dịch vụ · các bước thuê xe · cấu trúc dòng tiền · hợp tác · hạ
 * tầng bảo vệ.
 *
 * Dùng lại khối "Các bước thuê xe" của trang chủ (`RentalSteps`, cùng component trong bản vẽ) và
 * hai thẻ tuyến hợp tác của trang "Trở thành chủ xe" (`PartnerTrackCards`) — hai nơi không trôi
 * khỏi nhau. Hai neo `#about-how` / `#about-money` giữ nguyên: trung tâm hỗ trợ (web + app) dẫn vào.
 *
 * App khách mở trang này trong WebView (`ContentWebScreen`) từ mục "Về chúng tôi" của tab Tài
 * khoản — app có thanh tiêu đề riêng nên bỏ đường dẫn.
 *
 * Server Component thuần: nội dung tĩnh, cần được index.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('About');
  const title = t('meta.title');
  const description = t('meta.description');
  return {
    title,
    description,
    alternates: { canonical: ROUTES.ABOUT },
    openGraph: openGraphFor({ title, description, path: ROUTES.ABOUT }),
  };
}

const SERVICES = [
  {
    key: 'selfDrive',
    icon: '/about/service-self-drive.svg',
    tone: 'gold',
    href: marketplaceSearchHref({ serviceType: SERVICE_TYPE.SELF_DRIVE }),
  },
  {
    key: 'withDriver',
    icon: '/about/service-driver.svg',
    tone: 'blue',
    href: marketplaceSearchHref({ serviceType: SERVICE_TYPE.WITH_DRIVER }),
  },
  {
    key: 'longTerm',
    icon: '/about/service-long-term.svg',
    tone: 'purple',
    href: marketplaceSearchHref({ serviceType: SERVICE_TYPE.LONG_TERM }),
  },
] as const;

const SERVICE_POINTS = ['p1', 'p2', 'p3'] as const;

const MONEY = [
  { key: 'online', icon: '/about/info-circle.svg' },
  { key: 'pickup', icon: '/about/minus-circle.svg' },
  { key: 'lines', icon: '/about/info-circle.svg' },
] as const;

const TRUST = ['listing', 'calendar', 'metrics'] as const;

const TONE_CLASS = {
  gold: styles.toneGold,
  blue: styles.toneBlue,
  purple: styles.tonePurple,
} as const;

/** Tiêu đề khối của bản vẽ: dòng nhỏ vàng in hoa · tiêu đề 30 · (mô tả 16) · gạch vàng 68×2. */
function BlockHeading({
  id,
  kicker,
  title,
  lead,
  align = 'center',
  as: Tag = 'h2',
}: {
  id: string;
  kicker: string;
  title: ReactNode;
  lead?: string;
  align?: 'start' | 'center';
  as?: 'h1' | 'h2';
}) {
  return (
    <Reveal className={cx(styles.heading, align === 'center' && styles.headingCenter)}>
      <p className={styles.kicker}>{kicker}</p>
      <div className={styles.headingTitles}>
        <Tag id={id} className={styles.title}>
          {title}
        </Tag>
        {lead ? <p className={styles.headingLead}>{lead}</p> : null}
      </div>
      <span className={styles.divider} aria-hidden="true" />
    </Reveal>
  );
}

export default async function AboutPage() {
  const t = await getTranslations('About');
  const inApp = await isCustomerAppWebView();
  const accent = (chunks: ReactNode) => <span className={styles.accent}>{chunks}</span>;

  return (
    <div className={styles.page}>
      {inApp ? null : (
        <div className={styles.crumbBar}>
          <PageBreadcrumb
            ariaLabel={t('breadcrumb.label')}
            className={styles.crumbs}
            crumbs={[
              { key: 'home', label: t('breadcrumb.home'), href: ROUTES.HOME },
              { key: 'current', label: t('breadcrumb.current') },
            ]}
            // Cùng đầu trang với "Trở thành chủ xe" (`ListYourVehicleLanding`): nút tròn quay lại.
            back={{ href: ROUTES.HOME, label: t('breadcrumb.back') }}
          />
        </div>
      )}

      {/*
        ── Đầu trang (Figma "About Us - Update" `22386:60137`) ──
        Tiêu đề lớn canh giữa · lời dẫn · hai nút · thẻ ảnh giữa kẹp giữa hai thẻ số nghiêng. Nền
        loang hai mảng màu. Chữ vào so le như hero trang chủ (tách ký tự → dòng nhấn → lời dẫn →
        nút); thẻ ảnh nổi lên, hai thẻ số bay vào từ hai bên rồi trôi nhẹ.
      */}
      <section className={styles.hero} aria-labelledby="about-intro">
        <span className={cx(styles.mesh, styles.meshPink)} aria-hidden="true" />
        <span className={cx(styles.mesh, styles.meshLavender)} aria-hidden="true" />
        <div className={styles.heroInner}>
          <h1 id="about-intro" className={styles.heroTitle}>
            <SplitText text={t('hero.titleLine1')} className={styles.heroLine} />
            <span className={cx(styles.heroLine, enterClass(600))}>
              {t.rich('hero.titleLine2', { accent })}
            </span>
          </h1>
          <p className={cx(styles.heroLead, enterClass(900))}>
            {t.rich('hero.lead', { br: () => <br /> })}
          </p>
          <div className={cx(styles.heroActions, enterClass(1200))}>
            {/* App khách (WebView) không mời làm đối tác - né chính sách mua hàng trong app. */}
            {inApp ? null : (
              <Link href={ROUTES.LIST_YOUR_VEHICLE.ROOT} className={styles.heroGhost}>
                <Image src="/about/award.svg" alt="" width={20} height={20} aria-hidden="true" />
                {t('hero.partnerCta')}
              </Link>
            )}
            <Link href={ROUTES.SEARCH} className={styles.heroPrimary}>
              {t('hero.exploreCta')}
              <Image
                src="/about/arrow-right.svg"
                alt=""
                width={15}
                height={10}
                aria-hidden="true"
              />
            </Link>
          </div>

          <div className={styles.showcase}>
            <article className={cx(styles.floatCard, styles.floatLeft)}>
              <p className={styles.floatKicker}>{t('stats.legal.kicker')}</p>
              <p className={styles.floatValueXl}>{t('stats.legal.value')}</p>
              <p className={styles.floatTitle}>{t('stats.legal.title')}</p>
              <p className={styles.floatDesc}>{t('stats.legal.desc')}</p>
            </article>
            <figure className={styles.photoCard}>
              <div className={styles.photoFrame}>
                <Image
                  src="/about/hero-fleet.png"
                  alt=""
                  fill
                  sizes="(max-width: 720px) 100vw, 668px"
                  className={styles.photoImg}
                />
              </div>
              <figcaption className={styles.photoCaption}>
                <span className={styles.photoTitle}>{t('hero.photoTitle')}</span>
                <span className={styles.photoSub}>{t('hero.photoCaption')}</span>
              </figcaption>
            </figure>
            <article className={cx(styles.floatCard, styles.floatRight)}>
              <p className={styles.floatKicker}>{t('stats.cost.kicker')}</p>
              <p className={styles.floatValue}>{t('stats.cost.value')}</p>
              <p className={styles.floatTitle}>{t('stats.cost.title')}</p>
              <p className={styles.floatDesc}>{t('stats.cost.desc')}</p>
            </article>
          </div>
        </div>
      </section>

      {/* ── Mô hình dịch vụ (`22306:64771`) ── */}
      <section
        id="about-services"
        className={cx(styles.band, styles.bandMuted)}
        aria-labelledby="about-services-title"
      >
        <BlockHeading
          id="about-services-title"
          kicker={t('services.kicker')}
          title={t('services.title')}
          lead={t('services.lead')}
        />
        <Reveal effect="stagger" className={styles.grid3}>
          {SERVICES.map((service) => (
            <article key={service.key} className={cx(styles.serviceCard, TONE_CLASS[service.tone])}>
              <span className={styles.serviceGlow} aria-hidden="true" />
              <div className={styles.serviceBody}>
                <div className={styles.serviceTop}>
                  <span className={styles.serviceIcon} aria-hidden="true">
                    <Image src={service.icon} alt="" width={24} height={24} />
                  </span>
                  <span className={styles.serviceBadge}>{t(`services.${service.key}.badge`)}</span>
                </div>
                <div className={styles.serviceCopy}>
                  <h3 className={styles.serviceTitle}>{t(`services.${service.key}.title`)}</h3>
                  <p className={styles.serviceDesc}>{t(`services.${service.key}.desc`)}</p>
                </div>
                <ul className={styles.points}>
                  {SERVICE_POINTS.map((point) => (
                    <li key={point} className={styles.point}>
                      <span className={styles.check} aria-hidden="true">
                        <Image src="/about/check.svg" alt="" width={12} height={12} />
                      </span>
                      {t(`services.${service.key}.${point}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <Link href={service.href} className={styles.outlineButton}>
                {t(`services.${service.key}.cta`)}
                <span className={styles.buttonIcon} aria-hidden="true">
                  <Image src="/about/arrow-right.svg" alt="" width={15} height={10} />
                </span>
              </Link>
            </article>
          ))}
        </Reveal>
      </section>

      {/* ── Các bước thuê xe (`22306:64858` — cùng khối của trang chủ) ── */}
      <div id="about-how" className={cx(styles.band, styles.bandSteps)}>
        <RentalSteps />
      </div>

      {/* ── Cấu trúc dòng tiền (`22306:64859`) ── */}
      <section
        id="about-money"
        className={cx(styles.band, styles.bandMuted)}
        aria-labelledby="about-money-title"
      >
        <BlockHeading
          id="about-money-title"
          kicker={t('money.kicker')}
          title={t('money.title')}
          lead={t('money.lead')}
        />
        <Reveal as="ol" effect="stagger" className={styles.grid3}>
          {MONEY.map((item, index) => (
            <li key={item.key} className={styles.moneyCard}>
              <div className={styles.moneyCopy}>
                <div className={styles.moneyHead}>
                  <h3 className={styles.moneyTitle}>{t(`money.${item.key}.title`)}</h3>
                  <span className={styles.moneyIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <p className={styles.serviceDesc}>{t(`money.${item.key}.desc`)}</p>
              </div>
              <div className={styles.note}>
                <p className={styles.noteTitle}>
                  <span className={styles.noteIcon} aria-hidden="true">
                    <Image src={item.icon} alt="" width={18} height={18} />
                  </span>
                  {t(`money.${item.key}.noteTitle`)}
                </p>
                <p className={styles.noteBody}>{t(`money.${item.key}.note`)}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </section>

      {/*
        ── Hợp tác cùng XePrime (`22306:64910`) ──
        App khách (WebView) KHÔNG hiện khối này: nó mời mua gói gian hàng — né chính sách mua hàng
        trong app của store (người dùng chốt 17/11/2026, cùng lý do các câu `descInApp` cũ).
      */}
      {inApp ? null : (
        <section
          id="about-owners"
          className={cx(styles.band, styles.bandPartners)}
          aria-labelledby="about-owners-title"
        >
          <BlockHeading
            id="about-owners-title"
            kicker={t('partners.kicker')}
            title={t('partners.title')}
            lead={t('partners.lead')}
          />
          <Reveal>
            <PartnerTrackCards
              personalHref={partnerRegisterHref(REGISTRATION_TRACK.COMMISSION, {
                fromMarket: true,
              })}
              shopHref={partnerRegisterHref(REGISTRATION_TRACK.PACKAGE, { fromMarket: true })}
              headingLevel="h3"
              openInNewTab
              className={styles.tracks}
            />
          </Reveal>
        </section>
      )}

      {/* ── Hạ tầng bảo vệ (`22306:65008`) ── */}
      <section
        id="about-trust"
        className={cx(styles.band, styles.bandMuted)}
        aria-labelledby="about-trust-title"
      >
        <div className={styles.trustGrid}>
          <Reveal className={styles.trustArt}>
            <Image
              src="/about/protection-v2.png"
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 451px"
              className={cx(styles.trustImage, kenBurnsSlowClass)}
            />
          </Reveal>
          <div className={styles.trustMain}>
            <div className={styles.introText}>
              <BlockHeading
                id="about-trust-title"
                kicker={t('trust.kicker')}
                title={t.rich('trust.title', { accent })}
                align="start"
              />
              <p className={styles.trustLead}>{t('trust.lead')}</p>
            </div>
            <Reveal effect="stagger" className={styles.trustCards}>
              {TRUST.map((key) => (
                <div key={key} className={cx(styles.trustCard, styles[`trust_${key}`])}>
                  <p className={styles.trustValue}>{t(`trust.${key}.value`)}</p>
                  <h3 className={styles.trustTitle}>{t(`trust.${key}.title`)}</h3>
                  <p className={styles.trustDesc}>{t(`trust.${key}.desc`)}</p>
                  <p className={styles.trustTag}>{t(`trust.${key}.tag`)}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}

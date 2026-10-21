'use client';

import { BankOutlined, CheckCircleFilled, CustomerServiceOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BILLING_PHASE } from '@xeprime/types';

import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import type { PlanTier } from '../plan-purchase';
import type { CurrentPlan } from '../types';
import { CONTACT_SALES_HREF } from './PlanPricingTable';
import styles from './EnterprisePlanCard.module.css';

/** Số dòng năng lực in trên thẻ — cùng mức cắt với thẻ bậc tự mua để các thẻ cao gần bằng nhau. */
const FEATURE_LINES = 2;

/**
 * BẬC DOANH NGHIỆP — `enterprise_contact`, phạm vi `all`, bán bằng TƯ VẤN (ADR 0065 điều 1 ·
 * ADR 0041 điều 5).
 *
 * Hai hình dạng, cùng một thẻ:
 *  - **chưa dùng** (`tier`): lời mời "Liên hệ tư vấn" — không có giá, không có nút mua. Gian hàng
 *    không tự mua được bậc này (`PLAN_NOT_SELF_SERVE`); admin gán tay với giá đàm phán.
 *  - **đang dùng** (`active`): kỳ doanh nghiệp đang chạy phủ CẢ xe máy lẫn ô tô, nên hai làn tự mua
 *    đóng lại — mua một gói xe máy lúc này sẽ nối sau kỳ doanh nghiệp (chồng phạm vi), không phải
 *    điều người dùng muốn. Đổi gói là một cuộc nói chuyện với XePrime, và thẻ nói đúng như vậy.
 *
 * Lối liên hệ là một LIÊN KẾT tới trung tâm hỗ trợ — kênh liên hệ thật của nền tảng sống ở một chỗ
 * có tên, không phải một biểu mẫu thứ hai mà chưa ai nhận.
 */
export function EnterprisePlanCard({
  tier,
  active = null,
}: {
  tier?: PlanTier;
  active?: CurrentPlan | null;
}) {
  const t = useTranslations('Subscription.enterprise');
  const tTerm = useTranslations('Subscription.term');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const name = active?.planName ?? tier?.plan.name ?? t('defaultName');
  const features = tier?.limits.features.slice(0, FEATURE_LINES) ?? [];

  return (
    <section className={styles.card} data-active={active ? 'true' : undefined}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <BankOutlined />
        </span>
        <div className={styles.headText}>
          <h3 className={styles.title}>
            {name}
            <Tag className={styles.tag}>{t('tag')}</Tag>
            {active ? <Tag color="gold">{t('activeTag')}</Tag> : null}
          </h3>
          <p className={styles.subtitle}>
            {active ? t('activeSummary') : (tier?.plan.description ?? t('contactSummary'))}
          </p>
        </div>
      </div>

      <ul className={styles.benefits}>
        <li>
          <CheckCircleFilled aria-hidden="true" />
          {t('coversBoth')}
        </li>
        {features.map((feature) => (
          <li key={feature}>
            <CheckCircleFilled aria-hidden="true" />
            {domainLabel('planFeature', feature)}
          </li>
        ))}
      </ul>

      {active ? (
        <p className={styles.term}>
          {active.phase === BILLING_PHASE.GRACE
            ? tTerm('grace')
            : t('activeUntil', { date: fmt.date(active.endsAt) })}
        </p>
      ) : null}

      <div className={styles.actions}>
        <span className={styles.hint}>{active ? t('changeHint') : t('contactHint')}</span>
        <Link href={CONTACT_SALES_HREF}>
          <Button icon={<CustomerServiceOutlined aria-hidden />}>{t('contactCta')}</Button>
        </Link>
      </div>
    </section>
  );
}

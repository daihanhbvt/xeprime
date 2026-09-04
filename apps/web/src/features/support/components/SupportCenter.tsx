'use client';

import {
  CalendarOutlined,
  CarOutlined,
  InboxOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  UsergroupAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Card, Collapse } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createElement, type ComponentType } from 'react';
import { PERMISSION, type Permission } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { LegalDocLinks } from '@/features/legal/components/LegalDocLinks';
import { usePermissions } from '@/hooks/use-permissions';
import styles from './SupportCenter.module.css';

/** Khoá message trong `ManageCommon.support.quickStart` / `.faq`. */
type QuickStartKey =
  | 'vehicles'
  | 'policies'
  | 'requests'
  | 'calendar'
  | 'finance'
  | 'members';

interface QuickStartLink {
  readonly key: QuickStartKey;
  readonly href: string;
  readonly permission: Permission;
  readonly icon: ComponentType<{ className?: string }>;
}

/**
 * Sáu việc đầu tiên của một gian hàng mới, theo đúng thứ tự người ta phải làm chúng.
 *
 * Mỗi thẻ trỏ tới một trang CÓ THẬT và mang quyền của chính trang đó: hướng dẫn dẫn tới một
 * màn hình 403 còn tệ hơn là không hướng dẫn gì.
 */
const QUICK_START: readonly QuickStartLink[] = [
  {
    key: 'vehicles',
    href: ROUTES.MANAGE.VEHICLE_NEW,
    permission: PERMISSION.VEHICLE_CREATE,
    icon: CarOutlined,
  },
  {
    key: 'policies',
    href: ROUTES.MANAGE.SHOP_POLICIES,
    permission: PERMISSION.TENANT_VIEW,
    icon: SafetyCertificateOutlined,
  },
  {
    key: 'requests',
    href: ROUTES.MANAGE.BOOKING_REQUESTS,
    permission: PERMISSION.BOOKING_REQUEST_VIEW,
    icon: InboxOutlined,
  },
  {
    key: 'calendar',
    href: ROUTES.MANAGE.CALENDAR,
    permission: PERMISSION.CALENDAR_VIEW,
    icon: CalendarOutlined,
  },
  {
    key: 'finance',
    href: ROUTES.MANAGE.RECEIPTS,
    permission: PERMISSION.FINANCE_VIEW,
    icon: WalletOutlined,
  },
  {
    key: 'members',
    href: ROUTES.MANAGE.MEMBERS,
    permission: PERMISSION.MEMBER_VIEW,
    icon: UsergroupAddOutlined,
  },
];

/** Sáu câu hỏi hay gặp nhất — chính là những chỗ mô hình nghiệp vụ khác với trực giác. */
const FAQ_KEYS = [
  'publish',
  'requestVsBooking',
  'conflict',
  'longTerm',
  'maintenance',
  'missingMenu',
] as const;

/**
 * Trung tâm hỗ trợ của cổng quản lý.
 *
 * Đây là điểm đến của khối HỖ TRỢ ở cuối sidebar: chỗ trả lời "bắt đầu từ đâu" và những câu
 * hỏi mà cấu trúc menu không tự nói ra được (yêu cầu đặt xe khác đơn thuê chỗ nào, vì sao xe
 * chưa lên marketplace, bảo dưỡng nằm ở đâu).
 *
 * Trang CỐ Ý không có form gửi ticket hay số hotline: hệ thống chưa có kênh hỗ trợ nào ở
 * backend, và một biểu mẫu không gửi đi đâu còn tệ hơn không có gì.
 */
export function SupportCenter() {
  const t = useTranslations('ManageCommon');
  const { has } = usePermissions();

  const links = QUICK_START.filter((item) => has(item.permission));

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('support.title')} subtitle={t('support.subtitle')} />

      {links.length > 0 ? (
        <section className={styles.section} aria-labelledby="xp-support-quickstart">
          <h2 id="xp-support-quickstart" className={styles.sectionTitle}>
            {t('support.quickStart.title')}
          </h2>
          <div className={styles.grid}>
            {links.map((item) => (
              <Link key={item.key} href={item.href} className={styles.cardLink}>
                <Card className={styles.card} size="small">
                  <span className={styles.cardIcon}>
                    {createElement(item.icon, { className: styles.icon })}
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardTitle}>
                      {t(`support.quickStart.${item.key}.title`)}
                    </span>
                    <span className={styles.cardText}>
                      {t(`support.quickStart.${item.key}.body`)}
                    </span>
                  </span>
                  <RightOutlined className={styles.cardArrow} aria-hidden />
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="xp-support-faq">
        <h2 id="xp-support-faq" className={styles.sectionTitle}>
          {t('support.faq.title')}
        </h2>
        <Collapse
          className={styles.faq}
          bordered={false}
          items={FAQ_KEYS.map((key) => ({
            key,
            label: t(`support.faq.${key}.q`),
            children: <p className={styles.answer}>{t(`support.faq.${key}.a`)}</p>,
          }))}
        />
      </section>

      {/*
        Cổng quản lý KHÔNG có chân trang marketplace, nên trước đây một chủ gian hàng đang đăng
        nhập không có đường nào tới quy chế sàn — thứ ràng buộc chính họ. Khối này là đường đó;
        liên kết mở tab mới để không cắt ngang việc đang làm trong portal.
      */}
      <section className={styles.section} aria-labelledby="xp-support-legal">
        <h2 id="xp-support-legal" className={styles.sectionTitle}>
          {t('support.legal.title')}
        </h2>
        <p className={styles.legalBody}>{t('support.legal.body')}</p>
        <LegalDocLinks layout="inline" newTab className={styles.legalLinks} />
      </section>

      <Card className={styles.contact} size="small">
        <h2 className={styles.contactTitle}>{t('support.contact.title')}</h2>
        <p className={styles.cardText}>{t('support.contact.body')}</p>
      </Card>
    </div>
  );
}

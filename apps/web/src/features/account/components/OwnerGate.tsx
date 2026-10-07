'use client';

import { ShopOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { OWNER_STAGE } from '@xeprime/types';

import { LoadingState } from '@/components/feedback/LoadingState';
import { ROUTES } from '@/constants/routes';

import { useOwnerAccess } from '../hooks/use-owner-access';
import styles from './OwnerGate.module.css';

/**
 * Cổng của các màn CHỦ XE (Owner Lite) ở site partner.
 *
 * Hai mức, đúng hai bậc của `resolveOwnerStage`:
 *
 * - `minStage="registering"` — chỉ cần đã mở hồ sơ chủ xe. Dùng cho màn tiến trình đăng ký, danh
 *   sách xe và trang gói: cả ba đều có việc thật để làm khi xe còn đang chờ duyệt.
 * - `minStage="owner"` (mặc định) — phải có ít nhất một xe đang bán trên chợ. Lịch, khai thuế,
 *   hợp đồng, hộp thư đều rỗng trước mốc đó, và một màn rỗng không giải thích được vì sao nó
 *   rỗng là cách nhanh nhất để người dùng tin mình đã làm sai bước nào.
 *
 * Không đạt thì `children` KHÔNG được render — tức là không hook nào bên trong chạy, không
 * request tenant nào bay đi để rồi nhận 403 hoặc một danh sách rỗng.
 *
 * Đây là lớp trải nghiệm; lớp chặn thật vẫn là guard backend (CLAUDE.md §3).
 */
export function OwnerGate({
  children,
  minStage = OWNER_STAGE.OWNER,
}: {
  children: ReactNode;
  minStage?: typeof OWNER_STAGE.REGISTERING | typeof OWNER_STAGE.OWNER;
}) {
  const t = useTranslations('Account.ownerGate');
  const { user, stage, isLoading } = useOwnerAccess();

  if (isLoading) return <LoadingState variant="page" />;

  const passed =
    minStage === OWNER_STAGE.REGISTERING ? stage !== OWNER_STAGE.NONE : stage === OWNER_STAGE.OWNER;
  if (passed) return <>{children}</>;

  /*
   * Người ĐANG đăng ký đứng trước một màn của bậc `owner` là một tình huống khác hẳn với người
   * chưa từng mở hồ sơ: họ đã làm đúng mọi thứ và chỉ đang chờ. Nói đúng điều đó và dẫn về màn
   * tiến trình, thay vì mời họ "trở thành chủ xe" lần thứ hai.
   */
  const registering = stage === OWNER_STAGE.REGISTERING;
  const shopName = user?.tenant?.name;
  /*
   * THÀNH VIÊN (không phải chủ) của một gian hàng tuyến hoa hồng — bộ công cụ chủ xe là của chủ.
   * Site partner không có "cổng quản lý" nào khác để dẫn họ sang (cùng site, cùng URL), nên không
   * có nút chính: nói đúng tình trạng và để họ về hồ sơ của mình.
   */
  const member = !registering && Boolean(shopName);

  return (
    <section className={styles.root} role="status">
      <span className={styles.icon} aria-hidden="true">
        <ShopOutlined />
      </span>
      <h1 className={styles.title}>{registering ? t('registeringTitle') : t('title')}</h1>
      <p className={styles.body}>
        {registering
          ? t('registeringBody')
          : member
            ? t('bodyMemberPartner', { shop: shopName ?? '' })
            : t('body')}
      </p>
      <div className={styles.actions}>
        {member ? null : (
          <Link href={registering ? ROUTES.MANAGE.ROOT : ROUTES.MANAGE.REGISTER}>
            <Button type="primary">{registering ? t('openRegistration') : t('becomeOwner')}</Button>
          </Link>
        )}
        <Link href={ROUTES.MANAGE.ACCOUNT}>
          <Button>{t('backToAccount')}</Button>
        </Link>
      </div>
    </section>
  );
}

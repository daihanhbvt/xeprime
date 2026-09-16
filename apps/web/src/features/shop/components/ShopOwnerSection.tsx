'use client';

import { CheckOutlined, ExclamationCircleFilled, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TENANT_ROLE, STATUS_COLOR, toLocalVnPhone } from '@xeprime/types';

import { ROUTES, SHOP_SECTION, shopSectionDomId } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';

import type { MyShop } from '../types';
import { ShopSectionCard } from './ShopSectionCard';
import styles from './ShopOwnerSection.module.css';

/**
 * CHỦ GIAN HÀNG — tài khoản sở hữu, chỉ ĐỌC.
 *
 * ## Vì sao không có ô nhập nào ở đây
 *
 * Tới 16/09/2026 màn này là ba ô chữ ghi vào `tenant_profiles.owner_*`: một bản khai thứ hai,
 * không ai xác minh, đứng ngay cạnh một tài khoản đã qua OTP nói khác đi. Ba cột đó đã drop.
 *
 * Nguồn duy nhất giờ là `tenants.owner_user_id → users`, và nó đổi qua đúng luồng của nó:
 * tên ở hồ sơ cá nhân, email/SĐT qua xác minh OTP ở `/manage/security`. Đặt một ô "Họ tên chủ
 * gian hàng" ở đây nghĩa là cho bất kỳ ai có `tenant.update` — gồm cả `shop_manager` — viết lại
 * danh tính của người CHỦ, đúng lằn ranh mà ADR 0038 điều 3 tách ra.
 *
 * ## Vì sao hiện cờ "đã xác minh"
 *
 * Vì nó là thứ duy nhất ở đây mà một ô chữ không nói được, và là lý do khối này đáng tin hơn
 * bản cũ. Chưa xác minh thì nói thẳng chưa xác minh — không thấy khoảng cách đó thì chủ shop
 * tưởng mình đã xong.
 *
 * ## Không gọi chủ tài khoản là "người đại diện pháp luật"
 *
 * XePrime không kiểm tra điều đó ở đâu cả. Người đại diện pháp luật (nếu có) được khai ở hồ sơ
 * pháp lý và do nền tảng xác minh; ở đây chỉ là tài khoản sở hữu gian hàng.
 */
export function ShopOwnerSection({ shop }: { shop: MyShop }) {
  const t = useTranslations('Shop.owner');
  const { data: user } = useCurrentUser();
  const owner = shop.ownerAccount;

  /*
   * Chỉ CHÍNH CHỦ mới thấy lối vào màn bảo mật. Quản lý/nhân viên có màn bảo mật của riêng họ,
   * nhưng nút ở đây nằm dưới thông tin của NGƯỜI KHÁC — bấm vào nó sẽ mở tài khoản của chính
   * mình, tức là một nút nói dối về việc nó làm gì.
   */
  const isOwner =
    user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER && user.id === owner.userId;

  return (
    <ShopSectionCard
      id={shopSectionDomId(SHOP_SECTION.OWNER)}
      title={t('title')}
      hint={t('hint')}
    >
      <div className={styles.identity}>
        <p className={styles.name}>{owner.displayName}</p>
      </div>

      <dl className={styles.rows}>
        <ContactRow
          icon={<MailOutlined aria-hidden />}
          label={t('email')}
          value={owner.email ?? null}
          emptyLabel={t('noEmail')}
          verified={owner.emailVerified}
        />
        <ContactRow
          icon={<PhoneOutlined aria-hidden />}
          label={t('phone')}
          // SĐT lưu dạng `84…`; đọc lên thì về dạng `09…` như người Việt vẫn đọc số của mình.
          value={owner.phone ? toLocalVnPhone(owner.phone) : null}
          emptyLabel={t('noPhone')}
          verified={owner.phoneVerified}
        />
      </dl>

      {isOwner ? (
        <div className={styles.actions}>
          <Link href={ROUTES.MANAGE.SECURITY}>
            <Button>{t('manageLogin')}</Button>
          </Link>
        </div>
      ) : null}
    </ShopSectionCard>
  );
}

function ContactRow({
  icon,
  label,
  value,
  emptyLabel,
  verified,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
}) {
  const t = useTranslations('Shop.owner');

  return (
    <div className={styles.row}>
      <dt className={styles.rowLabel}>
        {icon}
        {label}
      </dt>
      <dd className={styles.rowValue}>
        <span className={value ? styles.value : styles.empty}>{value ?? emptyLabel}</span>
        {value && verified ? (
          <Tooltip title={t('verified')}>
            {/* Màu nằm ở `background`, không ở `color` — `color` kế thừa và bị nuốt mất. */}
            <span className={styles.verifiedMark} role="img" aria-label={t('verified')}>
              <CheckOutlined aria-hidden />
            </span>
          </Tooltip>
        ) : null}
        {value && !verified ? (
          <Tag color={STATUS_COLOR.WARNING} icon={<ExclamationCircleFilled />}>
            {t('unverified')}
          </Tag>
        ) : null}
      </dd>
    </div>
  );
}

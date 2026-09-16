'use client';

import { LockOutlined, SafetyOutlined, WalletOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Switch, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DEPOSIT_POLICY_REASON } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import type { PaymentSettings } from '../types';
import styles from './DepositToggleCard.module.css';

const { Paragraph, Text } = Typography;

interface Props {
  settings: PaymentSettings;
  canEdit: boolean;
  saving: boolean;
  onChange: (enabled: boolean) => void;
}

/**
 * Công tắc thu cọc — Phase 6 (ADR 0032 điều 2 · ADR 0027 điều 4).
 *
 * Ba trạng thái, và cả ba đều HIỆN công tắc:
 *
 *  - **Tuyến hoa hồng**: bật + khoá. Ẩn nó đi thì chủ xe cơ bản không có chỗ nào đọc được vì sao
 *    khách của họ phải chuyển tiền trước — và ADR 0027 điều 4 nói thẳng ẩn nút chỉ là trang trí.
 *  - **Gói thiếu `escrow_hold`**: khoá + lời mời nâng gói, kèm câu trấn an rằng họ vẫn nhận đơn
 *    bình thường. Một tính năng bị khoá phải nói được cái giá của việc không có nó.
 *  - **Gói có cờ**: bật/tắt tự do.
 *
 * Chặn THẬT nằm ở server (`DepositPolicyService.updateSettings` ném 403); `canEdit` ở đây chỉ để
 * không mời người dùng bấm một thứ chắc chắn hỏng.
 */
export function DepositToggleCard({ settings, canEdit, saving, onChange }: Props) {
  const t = useTranslations('Shop.paymentSettings');
  const locked = lockReason(settings);
  const editable = settings.editable && canEdit;

  return (
    <Card
      className={styles.card}
      title={
        <span className={styles.cardTitle}>
          <WalletOutlined aria-hidden="true" />
          {t('toggle.label')}
        </span>
      }
      extra={
        <span className={styles.switchWrap}>
          <Tag color={settings.depositRequired ? 'green' : 'default'}>
            {settings.depositRequired ? t('toggle.on') : t('toggle.off')}
          </Tag>
          <Switch
            checked={settings.depositRequired}
            disabled={!editable || saving}
            loading={saving}
            aria-label={t('toggle.label')}
            // AntD gọi `onChange(checked, event)`; chỉ chuyền tiếp giá trị để prop giữ đúng
            // chữ ký nó khai, thay vì âm thầm đẩy một MouseEvent lên chỗ gọi.
            onChange={(checked) => onChange(checked)}
          />
        </span>
      }
    >
      {locked ? (
        <Alert
          className={styles.lock}
          type="info"
          showIcon
          icon={<LockOutlined aria-hidden="true" />}
          title={t(`locked.${locked}.title`)}
          description={
            <>
              <Paragraph className={styles.lockBody}>{t(`locked.${locked}.body`)}</Paragraph>
              <Link href={ROUTES.MANAGE.SUBSCRIPTION}>
                <Button size="small">{t(`locked.${locked}.cta`)}</Button>
              </Link>
            </>
          }
        />
      ) : null}

      {/*
       * Hệ quả của trạng thái ĐANG ÁP DỤNG, không phải của vị trí công tắc: gian hàng tắt công
       * tắc nhưng ở tuyến hoa hồng vẫn đang thu, và họ cần đọc đúng cái đang xảy ra với khách.
       */}
      <section className={styles.mode}>
        <h3 className={styles.modeTitle}>
          <SafetyOutlined aria-hidden="true" />
          {settings.depositRequired ? t('mode.onTitle') : t('mode.offTitle')}
        </h3>
        <Paragraph className={styles.modeBody}>
          {settings.depositRequired ? t('mode.onBody') : t('mode.offBody')}
        </Paragraph>
      </section>

      <Text type="secondary" className={styles.frozen}>
        {t('frozen')}
      </Text>
    </Card>
  );
}

/** `null` = công tắc dùng được. Chuỗi trả về là khoá i18n dưới `locked.*`. */
function lockReason(
  settings: PaymentSettings,
): 'commission' | 'featureMissing' | 'notConfigured' | null {
  if (settings.reason === DEPOSIT_POLICY_REASON.COMMISSION_MANDATORY) return 'commission';
  if (settings.reason === DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING) return 'featureMissing';
  /*
   * Chưa xác định được tuyến — LỖI CẤU HÌNH, không phải một lựa chọn kinh doanh.
   *
   * Phải có câu riêng: hai câu trên đều nói "gói của bạn quy định thế", còn ở đây gian hàng
   * không làm gì sai và cũng không tự sửa được. Gộp vào `featureMissing` sẽ đẩy họ đi mua một
   * gói mà họ đã có.
   */
  if (settings.reason === DEPOSIT_POLICY_REASON.BILLING_NOT_CONFIGURED) return 'notConfigured';
  return null;
}

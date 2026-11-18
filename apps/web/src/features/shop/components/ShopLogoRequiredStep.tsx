'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Alert, Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useErrorMessage } from '@/i18n/use-error-message';
import { presignShopMedia, uploadImage } from '@/services/upload';

import { useUpdateShopProfile } from '../hooks/use-shop';
import { ShopLogoPicker, type PickedLogo } from './ShopLogoPicker';
import styles from './ShopLogoRequiredStep.module.css';

const LOGO_TRIGGER_ID = 'onboarding-shop-logo';

/**
 * Bước "Thêm logo gian hàng" của onboarding tuyến gói (ADR 0103) - hiện thay cho bước chọn gói khi
 * gian hàng chưa có logo. Đây là lưới an toàn của ô logo bắt buộc ở form đăng ký: gian hàng đăng ký
 * từ app (chưa có ô logo), đăng ký trước ADR 0103, hay tải logo hỏng rồi rời trang đều rơi vào đây.
 *
 * Lưu xong thì cache `shop.current` có logo ⇒ trang tự sang bước chọn gói, không có nút "tiếp tục"
 * nào tự khai.
 */
export function ShopLogoRequiredStep() {
  const t = useTranslations('ShopOnboarding.logoStep');
  const errorMessage = useErrorMessage();
  const update = useUpdateShopProfile();
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    if (!logo) {
      setMissing(true);
      document.getElementById(LOGO_TRIGGER_ID)?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const logoUrl = await uploadImage(logo.file, presignShopMedia);
      await update.mutateAsync({ logoUrl });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.step}>
      <header className={styles.head}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.body}>{t('body')}</p>
      </header>
      {error ? <Alert type="error" showIcon title={error} /> : null}
      <Form component={false} layout="vertical">
        <ShopLogoPicker
          id={LOGO_TRIGGER_ID}
          value={logo}
          onChange={(next) => {
            setLogo(next);
            if (next) setMissing(false);
          }}
          error={missing && !logo ? t('required') : null}
          disabled={saving}
        />
      </Form>
      <div className={styles.actions}>
        <Button
          type="primary"
          size="large"
          icon={<ArrowRightOutlined />}
          iconPlacement="end"
          loading={saving}
          onClick={() => void save()}
        >
          {t('save')}
        </Button>
      </div>
    </div>
  );
}

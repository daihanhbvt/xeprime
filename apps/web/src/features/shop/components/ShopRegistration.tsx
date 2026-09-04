'use client';

import {
  CheckOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { TENANT_TYPE, TENANT_TYPE_VALUES } from '@xeprime/types';
import { registerShopSchema, type RegisterShopValues } from '@xeprime/validators';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useRegisterShop } from '../hooks/use-shop';
import styles from './ShopRegistration.module.css';

/**
 * Màn tạo gian hàng cho user chưa thuộc gian hàng nào. Đăng ký xong AppShell tự vào portal.
 *
 * Bố cục hai khoang theo mẫu UI: khoang trái GIỚI THIỆU (đang làm gì, lưu ý gì), khoang phải là
 * form. Trên mobile hai khoang xếp dọc — phần giới thiệu đọc trước rồi mới tới ô nhập.
 */
export function ShopRegistration() {
  const t = useTranslations('ShopOnboarding');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const register = useRegisterShop();

  const provinces = useProvinceOptions();

  const typeOptions = useMemo(
    () => TENANT_TYPE_VALUES.map((value) => ({ value, label: domainLabel('tenantType', value) })),
    [domainLabel],
  );

  const { control, handleSubmit } = useForm<RegisterShopValues>({
    resolver: yupResolver(registerShopSchema),
    defaultValues: {
      name: '',
      tenantType: TENANT_TYPE.INDIVIDUAL,
      provinceCode: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  // `handleSubmit` giữ nguyên giá trị đã nhập khi mutation lỗi — RHF không reset form, nên người
  // dùng không phải gõ lại từ đầu (chỉ cần đọc thông báo lỗi rồi bấm lại).
  const onSubmit = handleSubmit((values) => {
    register.mutate({
      name: values.name,
      tenantType: values.tenantType,
      provinceCode: values.provinceCode,
      address: values.address || undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
    });
  });

  return (
    <section className={styles.card}>
      <aside className={styles.intro}>
        <span className={styles.introIcon} aria-hidden="true">
          <ShopOutlined />
        </span>
        <h2 className={styles.introTitle}>{t('form.title')}</h2>
        <p className={styles.introText}>{t('form.intro')}</p>

        <div className={styles.tips}>
          <p className={styles.tipsTitle}>
            <InfoCircleOutlined aria-hidden="true" />
            {t('tips.title')}
          </p>
          <ul className={styles.tipsList}>
            <li>
              <CheckOutlined aria-hidden="true" />
              <span>{t('tips.accuracy')}</span>
            </li>
            <li>
              <CheckOutlined aria-hidden="true" />
              <span>{t('tips.editable')}</span>
            </li>
          </ul>
        </div>
      </aside>

      {/*
        `<Form component={false}>` chỉ CẤP NGỮ CẢNH bố cục cho `Form.Item` (nhãn nằm TRÊN ô nhập,
        dấu bắt buộc đặt SAU nhãn) — form thật vẫn là thẻ `<form>` của React Hook Form bên dưới.
        Thiếu ngữ cảnh này, `Form.Item` rơi về layout ngang mặc định: nhãn nằm bên trái kèm dấu
        hai chấm, sai hẳn mẫu.

        `size="large"` đi qua context của AntD nên MỌI ô nhập/ô chọn trong form cao 40px
        (`--xp-control-height-lg`) — đúng mẫu mà không phải ghi đè chiều cao bằng CSS.
      */}
      <Form
        component={false}
        layout="vertical"
        size="large"
        colon={false}
        requiredMark={trailingRequiredMark}
      >
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {register.isError ? (
            <Alert
              type="error"
              showIcon
              message={getErrorMessage(register.error)}
              className={styles.alert}
            />
          ) : null}

          {provinces.isError ? (
            <Alert
              type="warning"
              showIcon
              className={styles.alert}
              message={t('form.fields.province.loadError')}
              description={getErrorMessage(provinces.error)}
              action={
                <Button size="small" onClick={provinces.refetch}>
                  {tCommon('actions.retry')}
                </Button>
              }
            />
          ) : null}

          <div className={styles.grid}>
            <TextField
              control={control}
              name="name"
              label={t('form.fields.name.label')}
              placeholder={t('form.fields.name.placeholder')}
              prefix={<ShopOutlined />}
              required
              autoFocus
            />
            <SelectField
              control={control}
              name="tenantType"
              label={t('form.fields.tenantType.label')}
              options={typeOptions}
              required
            />
            {/*
              Tỉnh/thành BẮT BUỘC: đăng ký tạo luôn chi nhánh mặc định, và đó là nơi xe của gian
              hàng hiển thị trên marketplace. Danh sách lấy từ API (`GET /provinces`), không hardcode.
            */}
            <SelectField
              control={control}
              name="provinceCode"
              label={t('form.fields.province.label')}
              required
              showSearch
              options={provinces.options}
              loading={provinces.isLoading}
              // Danh mục rỗng cũng khoá ô: một dropdown mở ra không có gì để chọn là điều khiển chết.
              disabled={provinces.isLoading || provinces.isError || provinces.options.length === 0}
              placeholder={t('form.fields.province.placeholder')}
              help={
                provinces.isLoading
                  ? t('form.fields.province.loading')
                  : provinces.options.length === 0 && !provinces.isError
                    ? t('form.fields.province.empty')
                    : t('form.fields.province.help')
              }
            />
            <TextField
              control={control}
              name="address"
              label={t('form.fields.address.label')}
              placeholder={t('form.fields.address.placeholder')}
              prefix={<EnvironmentOutlined />}
            />
            <TextField
              control={control}
              name="phone"
              label={t('form.fields.phone.label')}
              type="tel"
              placeholder={t('form.fields.phone.placeholder')}
              prefix={<PhoneOutlined />}
            />
            <TextField
              control={control}
              name="email"
              label={t('form.fields.email.label')}
              type="email"
              placeholder={t('form.fields.email.placeholder')}
              prefix={<MailOutlined />}
            />
          </div>

          <p className={styles.privacy}>
            <SafetyOutlined className={styles.privacyIcon} aria-hidden="true" />
            <strong className={styles.privacyTitle}>{t('privacy.title')}</strong>
            <span>{t('privacy.body')}</span>
          </p>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            icon={<ShopOutlined />}
            className={styles.submit}
            loading={register.isPending}
          >
            {t('form.submit')}
          </Button>

          {/*
            Quy chế sàn ràng buộc NGƯỜI BÁN kể từ khoảnh khắc này (Luật TMĐT 122/2025 và Nghị
            định 248/2026 — ADR 0028 điều 9), nên nó phải hiện ở đây chứ không chỉ ở chân trang
            của khu công khai mà cổng quản lý không có.
          */}
          <LegalConsentNote place="shop" className={styles.consent} />
        </form>
      </Form>
    </section>
  );
}

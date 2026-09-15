'use client';

import {
  CheckOutlined,
  InfoCircleOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { TENANT_TYPE, TENANT_TYPE_VALUES } from '@xeprime/types';
import { registerShopSchema, type RegisterShopValues } from '@xeprime/validators';
import { AddressField } from '@/components/form/AddressField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useRegisterShop } from '../hooks/use-shop';
import styles from './ShopRegistration.module.css';

/** Tên bảy trường địa chỉ trong `registerShopSchema` — hằng số ngoài component để định danh ổn định. */
const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;

/** Bốn trường GHIM — tách riêng vì không phải form nào cũng lưu toạ độ (xem `AddressPinNames`). */
const ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

/**
 * Màn tạo gian hàng cho user chưa thuộc gian hàng nào. Đăng ký xong AppShell tự vào portal.
 *
 * Bố cục hai khoang theo mẫu UI: khoang trái GIỚI THIỆU (đang làm gì, lưu ý gì), khoang phải là
 * form. Trên mobile hai khoang xếp dọc — phần giới thiệu đọc trước rồi mới tới ô nhập.
 */
interface ShopRegistrationProps {
  /**
   * Đích sau khi tạo hồ sơ thành công — đường dẫn NỘI BỘ do nơi gọi quyết định (trang onboarding
   * đã lọc `?next=` qua `safeNextPath`). Không truyền: giữ hành vi cũ (điều hướng do trang lo).
   */
  onCreated?: () => void;
  /**
   * `shop` (mặc định) — chữ dành cho gian hàng cho thuê xe.
   * `owner` — chữ dành cho CHỦ XE cá nhân đăng chiếc xe đầu tiên: cùng một API, cùng một form,
   * chỉ khác cách nói. Người có một chiếc xe không tự nhận mình đang "mở gian hàng".
   */
  variant?: 'shop' | 'owner';
  /**
   * Giá trị điền sẵn từ tài khoản đang đăng nhập — nơi gọi truyền vào. Form KHÔNG tự gọi API
   * lấy user: nó là một form, không phải một màn hình.
   */
  prefill?: { name?: string | null; phone?: string | null; email?: string | null };
}

export function ShopRegistration({
  onCreated,
  variant = 'shop',
  prefill,
}: ShopRegistrationProps = {}) {
  const t = useTranslations('ShopOnboarding');
  const domainLabel = useDomainLabel();
  const register = useRegisterShop();
  const isOwnerVariant = variant === 'owner';

  const typeOptions = useMemo(
    () => TENANT_TYPE_VALUES.map((value) => ({ value, label: domainLabel('tenantType', value) })),
    [domainLabel],
  );

  const resolver = useValidationResolver<RegisterShopValues>(
    registerShopSchema,
    'ShopOnboarding.validation',
  );
  const { control, handleSubmit } = useForm<RegisterShopValues>({
    resolver,
    defaultValues: {
      name: '',
      tenantType: TENANT_TYPE.INDIVIDUAL,
      provinceCode: '',
      wardCode: '',
      addressLine: '',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      phone: '',
      email: '',
    },
    values: prefill
      ? {
          name: prefill.name ?? '',
          tenantType: TENANT_TYPE.INDIVIDUAL,
          provinceCode: '',
          wardCode: '',
          addressLine: '',
          placeId: null,
          latitude: null,
          longitude: null,
          locationSource: null,
          phone: prefill.phone ?? '',
          email: prefill.email ?? '',
        }
      : undefined,
  });

  // `handleSubmit` giữ nguyên giá trị đã nhập khi mutation lỗi — RHF không reset form, nên người
  // dùng không phải gõ lại từ đầu (chỉ cần đọc thông báo lỗi rồi bấm lại).
  const onSubmit = handleSubmit((values) => {
    register.mutate(
      {
        name: values.name,
        tenantType: values.tenantType,
        provinceCode: values.provinceCode,
        wardCode: values.wardCode || undefined,
        addressLine: values.addressLine || undefined,
        placeId: values.placeId ?? undefined,
        latitude: values.latitude ?? undefined,
        longitude: values.longitude ?? undefined,
        locationSource: values.locationSource ?? undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
      },
      // Quay lại đúng chỗ người dùng đang làm dở (wizard đăng xe) thay vì thả họ ở hồ sơ shop.
      { onSuccess: () => onCreated?.() },
    );
  });

  return (
    <section className={styles.card}>
      <aside className={styles.intro}>
        <span className={styles.introIcon} aria-hidden="true">
          <ShopOutlined />
        </span>
        <h2 className={styles.introTitle}>
          {isOwnerVariant ? t('ownerVariant.title') : t('form.title')}
        </h2>
        <p className={styles.introText}>
          {isOwnerVariant ? t('ownerVariant.intro') : t('form.intro')}
        </p>

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
              title={getErrorMessage(register.error)}
              className={styles.alert}
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
              Địa chỉ BẮT BUỘC có tỉnh/thành: đăng ký tạo luôn chi nhánh mặc định, và đó là nơi
              xe của gian hàng hiển thị trên marketplace. Xã/phường thì KHÔNG bắt buộc ở bước này
              — người mở gian hàng thường chưa có địa chỉ chính xác, và chặn ở đây là chặn luôn
              việc họ bắt đầu; chi nhánh sinh ra mang cờ chờ bổ sung.
            */}
            <AddressField control={control} names={ADDRESS_FIELD_NAMES} pin={ADDRESS_PIN_NAMES} />
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

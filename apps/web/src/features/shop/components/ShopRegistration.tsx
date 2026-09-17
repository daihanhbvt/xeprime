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
import {
  REGISTRATION_TRACK,
  TENANT_TYPE,
  TENANT_TYPE_VALUES,
  type RegistrationTrack,
} from '@xeprime/types';
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

/** Tên ba trường địa chỉ trong hai schema đăng ký — hằng ngoài component để định danh ổn định. */
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

interface ShopRegistrationProps {
  /**
   * Đích sau khi tạo hồ sơ thành công — đường dẫn NỘI BỘ do nơi gọi quyết định (trang onboarding
   * đã lọc `?next=` qua `safeNextPath`). Không truyền: giữ hành vi cũ (điều hướng do trang lo).
   */
  onCreated?: () => void;
  /**
   * CỬA VÀO, và nó quyết định cả HỢP ĐỒNG lẫn bộ trường bắt buộc (ADR 0040) — không chỉ câu chữ.
   *
   * | | `commission` (mặc định) | `package` |
   * | --- | --- | --- |
   * | `registrationTrack` gửi lên | `commission` | `package` |
   * | Xã/phường · địa chỉ chi tiết · SĐT | tuỳ chọn | **bắt buộc** |
   * | Ô "loại hình" | có | không (mặc định `individual`) |
   * | Server gán gói | gói hoa hồng mặc định | không gán gì, chờ thanh toán |
   *
   * Đây là thay thế cho prop `variant` cũ. `variant` chỉ đổi chữ, nên hai cửa vào gửi lên cùng
   * một request và người bấm "Đăng ký gian hàng" thành chủ xe tuyến hoa hồng — chính lỗi mà
   * ADR 0040 sửa. Nếu một prop điều khiển câu chữ thì nó phải điều khiển cả hợp đồng.
   */
  track?: RegistrationTrack;
  /**
   * Câu chữ cho CHỦ XE cá nhân đăng chiếc xe đầu tiên, thay vì chữ "mở gian hàng".
   *
   * Chỉ có nghĩa ở tuyến hoa hồng: người có một chiếc xe không tự nhận mình đang mở gian hàng.
   * Tuyến gói luôn dùng chữ gian hàng — họ đang trả tiền cho đúng thứ đó.
   */
  personalWording?: boolean;
  /**
   * Giá trị điền sẵn từ tài khoản đang đăng nhập — nơi gọi truyền vào. Form KHÔNG tự gọi API
   * lấy user: nó là một form, không phải một màn hình.
   */
  prefill?: { name?: string | null; phone?: string | null; email?: string | null };
}

/**
 * Màn tạo hồ sơ người cho thuê xe — MỘT form, HAI cửa vào (ADR 0040).
 *
 * Bố cục hai khoang theo mẫu UI: khoang trái GIỚI THIỆU (đang làm gì, lưu ý gì), khoang phải là
 * form. Trên mobile hai khoang xếp dọc — phần giới thiệu đọc trước rồi mới tới ô nhập.
 *
 * ## Vì sao một form chứ không hai
 *
 * Bộ trường trùng nhau gần hết (tên · địa chỉ · liên hệ) và cả hai ghi vào cùng `POST /tenants`.
 * Hai component nghĩa là hai bản của cùng khối `AddressField` + cùng cách dựng thân request, và
 * khối đó là chỗ lỗi `wardInvalid` từng sống. Khác biệt thật — bộ trường bắt buộc và
 * `registrationTrack` — nằm ở `track`, tường minh và kiểm được bằng test.
 */
export function ShopRegistration({
  onCreated,
  track = REGISTRATION_TRACK.COMMISSION,
  personalWording = false,
  prefill,
}: ShopRegistrationProps = {}) {
  const t = useTranslations('ShopOnboarding');
  const domainLabel = useDomainLabel();
  const register = useRegisterShop();
  const isPackageTrack = track === REGISTRATION_TRACK.PACKAGE;

  const typeOptions = useMemo(
    () => TENANT_TYPE_VALUES.map((value) => ({ value, label: domainLabel('tenantType', value) })),
    [domainLabel],
  );

  /*
   * MỘT schema cho cả hai tuyến — nó đọc `registrationTrack` trong chính giá trị form để biết
   * ba trường địa chỉ/SĐT là bắt buộc hay không (xem `registerShopSchema`). Nhờ vậy resolver ổn
   * định qua các lần render: React Hook Form giữ resolver của lần dựng đầu, nên một biểu thức
   * `isPackageTrack ? A : B` sẽ đổi luật mà RHF không biết.
   *
   * Message của schema là MÃ, tra trong `ShopOnboarding.validation` — một mã thiếu bản dịch sẽ
   * lọt ra giao diện ở dạng chữ trần (đúng thứ đã xảy ra với `wardInvalid`), nên mọi mã của
   * schema phải có mặt trong namespace đó.
   */
  const resolver = useValidationResolver<RegisterShopValues>(
    registerShopSchema,
    'ShopOnboarding.validation',
  );

  const emptyValues: RegisterShopValues = {
    name: prefill?.name ?? '',
    tenantType: TENANT_TYPE.INDIVIDUAL,
    // Cửa vào đi VÀO giá trị form, vì schema đọc nó để chấm ba trường bắt buộc.
    registrationTrack: track,
    provinceCode: '',
    wardCode: '',
    addressLine: '',
    placeId: null,
    latitude: null,
    longitude: null,
    locationSource: null,
    phone: prefill?.phone ?? '',
    email: prefill?.email ?? '',
  };

  const { control, handleSubmit } = useForm<RegisterShopValues>({
    resolver,
    defaultValues: emptyValues,
    // `values` (không `defaultValues` một lần): `prefill` đến từ `/auth/me`, nên nó có thể về
    // SAU lần render đầu — form phải nhận nó khi đó thay vì đứng trống.
    values: prefill ? emptyValues : undefined,
  });

  // `handleSubmit` giữ nguyên giá trị đã nhập khi mutation lỗi — RHF không reset form, nên người
  // dùng không phải gõ lại từ đầu (chỉ cần đọc thông báo lỗi rồi bấm lại).
  const onSubmit = handleSubmit((values) => {
    register.mutate(
      {
        name: values.name,
        /*
         * CỬA VÀO đi trên dây. Đây là điểm mấu chốt của ADR 0040: không có trường này thì server
         * không phân biệt được hai luồng, và mọi cách phân biệt ở client đều chết sau một lần F5.
         */
        registrationTrack: track,
        // Tuyến gói không hỏi loại hình — gửi mặc định, và server cũng mặc định đúng giá trị đó.
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
          {personalWording ? t('ownerVariant.title') : t('form.title')}
        </h2>
        <p className={styles.introText}>
          {personalWording ? t('ownerVariant.intro') : t('form.intro')}
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
            {/*
              Loại hình CHỈ ở tuyến hoa hồng. Tuyến gói không dùng nó để quyết định gì — nguồn duy
              nhất của chế độ thu phí là GÓI (ADR 0014 điều 2) — nên một ô chọn ở bước đang đếm
              từng giây trước khi người ta xem giá là ma sát không đổi lấy được gì.
            */}
            {isPackageTrack ? null : (
              <SelectField
                control={control}
                name="tenantType"
                label={t('form.fields.tenantType.label')}
                options={typeOptions}
                required
              />
            )}
            {/*
              Địa chỉ BẮT BUỘC có tỉnh/thành ở cả hai tuyến: đăng ký tạo luôn chi nhánh mặc định,
              và đó là nơi xe hiển thị trên marketplace.

              Xã/phường và số nhà thì theo TUYẾN. Tuyến hoa hồng để trống được — người mở hồ sơ
              chủ xe thường chưa có địa chỉ chính xác, và chặn ở đây là chặn luôn việc họ bắt đầu;
              chi nhánh sinh ra mang cờ chờ bổ sung. Tuyến gói thì bắt buộc: đó là một mặt tiền có
              người trả tiền để khách tìm thấy, và cổng đăng xe sẽ đòi nó ngay sau khi thanh toán
              — hỏi ở đây rẻ hơn hẳn so với để họ trả tiền rồi mới bị từ chối.
            */}
            <AddressField
              control={control}
              names={ADDRESS_FIELD_NAMES}
              pin={ADDRESS_PIN_NAMES}
              /*
               * `required` gác xã + số nhà (theo tuyến); tỉnh có prop RIÊNG và luôn bật, vì
               * `registerShopSchema` đòi nó ở cả hai tuyến. Dùng một cờ cho cả ba nghĩa là ô tỉnh
               * của tuyến hoa hồng mất dấu sao mà vẫn báo lỗi khi bấm Lưu.
               */
              required={isPackageTrack}
              provinceRequired
              /*
               * Form TẠO MỚI: điền sẵn tỉnh người dùng vừa chọn ở nơi khác (thanh tìm xe) để bớt
               * một thao tác. Họ vẫn đổi được, và chỉ điền khi ô đang trống.
               */
              prefillRememberedProvince
            />
            <TextField
              control={control}
              name="phone"
              label={t('form.fields.phone.label')}
              type="tel"
              placeholder={t('form.fields.phone.placeholder')}
              prefix={<PhoneOutlined />}
              required={isPackageTrack}
              /*
               * Số ĐIỀN SẴN từ tài khoản, và dòng chú thích nói rõ nó là số LIÊN HỆ CỦA GIAN HÀNG
               * — không phải một số "đã xác thực" thứ hai. Số đã qua OTP của người chủ sống ở
               * `users.phone` và hiện ở khối "Chủ gian hàng"; gọi ô này là số đã xác thực sẽ là
               * một lời hứa không ai đứng sau, vì người dùng sửa được nó tự do ngay tại đây.
               */
              help={isPackageTrack ? t('form.fields.phone.shopHelp') : undefined}
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
            {isPackageTrack ? t('form.submitPackage') : t('form.submit')}
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

'use client';

import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CustomerServiceOutlined,
  ExclamationCircleFilled,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { TENANT_TYPE } from '@xeprime/types';
import { ownerProfileSchema, type OwnerProfileValues } from '@xeprime/validators';

import { AddressField } from '@/components/form/AddressField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ROUTES, vehicleListPathFor, type VehicleRegistrationSource } from '@/constants/routes';
import { ContactVerifyModal } from '@/features/account/components/ContactVerifyModal';
import { CONTACT_CHANNEL } from '@/features/account/types';
import { useRegisterShop, useUpdateShopProfile } from '@/features/shop/hooks/use-shop';
import { VehicleWizard, type WizardStep } from '@/features/vehicles/components/VehicleWizard';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import styles from './QuickVehicleOwnerStep.module.css';

/** Giới thiệu ngắn — khớp `max(200)` của schema, hiện thành bộ đếm ký tự. */
const BIO_MAX = 200;

interface QuickVehicleOwnerStepProps {
  /** Thanh bước của CẢ wizard — truyền vào để đánh số không nhảy khi sang bước sau. */
  steps: readonly WizardStep[];
  source: VehicleRegistrationSource;
  /** Hồ sơ đã tạo xong — nơi gọi chuyển sang bước "Thông tin xe". */
  onCreated: () => void;
}

/**
 * Bước 1 của luồng đăng xe cho người CHƯA có hồ sơ chủ xe — tuyến hoa hồng (ADR 0028).
 *
 * Trước đây chỗ này là một màn trống đẩy người dùng sang `/manage/onboarding`: rời trang, mất
 * nháp, và gặp một form "đăng ký gian hàng" hỏi loại hình doanh nghiệp cho người chỉ có một
 * chiếc xe. Bước này thay thế nó và hỏi đúng thứ một chuyến thuê không thể thiếu — họ tên, số
 * điện thoại đã xác thực, và một địa chỉ nhận xe đầy đủ.
 *
 * **Địa chỉ dùng `AddressField` DÙNG CHUNG**, không tự dựng bộ chọn tỉnh/xã tại đây. Đó là ô
 * địa chỉ chuẩn của sản phẩm (mô hình hành chính hai cấp từ 01/07/2025: tỉnh → xã/phường, không
 * có quận/huyện; kèm gợi ý địa điểm và ghim toạ độ). Một màn tự ghép hai `SelectField` sẽ trôi
 * khỏi nó ngay lần danh mục hành chính đổi tiếp theo — và thứ tự/nhãn tỉnh cũng sẽ lệch với
 * các form còn lại.
 *
 * Số điện thoại KHÔNG phải một ô chữ trong form: nó lấy từ chính tài khoản và phải qua OTP.
 * Một ô gõ tự do ở đây tạo ra số thứ hai không ai kiểm chứng, ngay cạnh số đã xác thực của
 * cùng người đó — và khách sẽ gọi vào đúng cái số không ai kiểm chứng.
 *
 * API vẫn là `POST /tenants` như gian hàng: theo ADR 0014/0024, cái phân biệt hai tuyến là GÓI
 * đang có hiệu lực, không phải một loại tenant riêng. Chủ xe cá nhân = tenant chưa có gói.
 */
export function QuickVehicleOwnerStep({ steps, source, onCreated }: QuickVehicleOwnerStepProps) {
  const t = useTranslations('ListYourVehicle.ownerProfile');
  const tCommon = useTranslations('Common.actions');
  const { data: user } = useCurrentUser();
  const register = useRegisterShop();
  const updateProfile = useUpdateShopProfile();
  const errorMessage = useErrorMessage();
  const [verifyOpen, setVerifyOpen] = useState(false);

  const phone = user?.phone ?? null;
  const phoneVerified = Boolean(phone && user?.phoneVerified);

  const resolver = useValidationResolver<OwnerProfileValues>(
    ownerProfileSchema,
    'ListYourVehicle.ownerProfile.validation',
  );
  const { control, handleSubmit } = useForm<OwnerProfileValues>({
    resolver,
    defaultValues: {
      name: user?.displayName ?? '',
      provinceCode: '',
      wardCode: '',
      addressLine: '',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      email: user?.email ?? '',
      bio: '',
    },
  });

  const submit = handleSubmit(async (values) => {
    // Nút đã bị khoá khi chưa xác thực; chặn lần hai ở đây vì Enter trong ô nhập cũng submit.
    if (!phoneVerified || !phone) return;

    try {
      await register.mutateAsync({
        name: values.name,
        tenantType: TENANT_TYPE.INDIVIDUAL,
        provinceCode: values.provinceCode,
        wardCode: values.wardCode,
        addressLine: values.addressLine,
        // Ghim toạ độ đi kèm địa chỉ: nó quyết định phí giao xe và chỗ tài xế lái tới.
        placeId: values.placeId ?? undefined,
        latitude: values.latitude ?? undefined,
        longitude: values.longitude ?? undefined,
        locationSource: values.locationSource ?? undefined,
        phone,
        email: values.email || undefined,
      });
    } catch {
      // Lỗi đã hiện bằng `register.isError` ngay trên form — không đi tiếp, không nuốt im lặng.
      return;
    }

    /*
     * Giới thiệu ngắn KHÔNG nằm trong `POST /tenants`: DTO đăng ký chỉ nhận những thứ bắt buộc
     * để mở được hồ sơ. Nó đi bằng một lần `PATCH /tenants/current/profile` ngay sau đó.
     *
     * Hỏng ở bước này cố ý KHÔNG chặn luồng: hồ sơ đã tồn tại, chiếc xe vẫn đăng được, và đoạn
     * giới thiệu là tuỳ chọn sửa lại lúc nào cũng được. Bắt người dùng làm lại từ đầu vì một
     * đoạn văn không bắt buộc là đánh đổi sai.
     */
    if (values.bio) {
      try {
        await updateProfile.mutateAsync({ bio: values.bio });
      } catch {
        // Bỏ qua có chủ đích — xem docblock ngay trên.
      }
    }

    onCreated();
  });

  const footer = (
    <>
      <Link href={vehicleListPathFor(source)}>
        <Button icon={<ArrowLeftOutlined />}>{tCommon('cancel')}</Button>
      </Link>
      <Button
        type="primary"
        htmlType="submit"
        loading={register.isPending || updateProfile.isPending}
        disabled={!phoneVerified}
      >
        {tCommon('next')}
      </Button>
    </>
  );

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Link href={vehicleListPathFor(source)} className={styles.back}>
          <ArrowLeftOutlined aria-hidden="true" /> {t('back')}
        </Link>
      </div>

      <header className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>{t('pageTitle')}</h1>
          <p className={styles.heroSubtitle}>{t('pageSubtitle')}</p>
        </div>
        <div className={styles.heroArt}>
          <p className={styles.heroTagline}>{t('tagline')}</p>
          <Image
            src="/illustrations/owner-personal-car.svg"
            alt=""
            width={640}
            height={420}
            className={styles.heroImage}
            priority
          />
        </div>
      </header>

      <Form
        component={false}
        layout="vertical"
        size="large"
        colon={false}
        requiredMark={trailingRequiredMark}
      >
        <form noValidate onSubmit={submit}>
          <VehicleWizard
            steps={steps}
            current={0}
            heading={t('heading')}
            description={t('intro')}
            footer={footer}
            aside={<OwnerAside />}
          >
            <p className={styles.publicNote}>
              <CheckCircleFilled aria-hidden="true" /> {t('publicNote')}
            </p>

            {register.isError ? (
              <Alert
                type="error"
                showIcon
                role="alert"
                className={styles.alert}
                title={errorMessage(register.error)}
              />
            ) : null}

            <div className={styles.grid}>
              <div className={styles.column}>
                <TextField
                  control={control}
                  name="name"
                  label={t('fields.name.label')}
                  placeholder={t('fields.name.placeholder')}
                  prefix={<UserOutlined />}
                  help={t('fields.name.help')}
                  required
                  autoFocus
                />

                {/*
                  Khối SĐT thay cho một ô nhập: giá trị đến từ tài khoản, và thứ duy nhất người
                  dùng làm được ở đây là xác thực hoặc đổi nó — cả hai đều đi qua OTP.
                */}
                {phoneVerified ? (
                  <div className={styles.phoneBox}>
                    <span className={styles.phoneLabel}>{t('fields.phone.label')}</span>
                    <span className={styles.phoneValue}>
                      <CheckCircleFilled className={styles.phoneOk} aria-hidden="true" />
                      {phone}
                      <span className={styles.phoneBadge}>{t('fields.phone.verified')}</span>
                    </span>
                    <Button
                      type="link"
                      className={styles.phoneAction}
                      onClick={() => setVerifyOpen(true)}
                    >
                      {t('fields.phone.change')}
                    </Button>
                  </div>
                ) : (
                  /*
                   * Tự dựng thay vì dùng `Alert action={...}`: prop `action` của AntD đặt nút
                   * CÙNG HÀNG với chữ và không cho nó xuống dòng, nên trong một cột hẹp cả
                   * khối tràn ngang — chữ bị bóp còn một ký tự mỗi dòng và trang sinh thanh
                   * cuộn ngang. Ở đây nút luôn nằm ở HÀNG RIÊNG bên dưới.
                   */
                  <div className={styles.phoneAlert}>
                    <span className={styles.phoneAlertIcon} aria-hidden="true">
                      <ExclamationCircleFilled />
                    </span>
                    <div className={styles.phoneAlertBody}>
                      <p className={styles.phoneAlertTitle}>
                        {phone ? t('fields.phone.unverifiedTitle') : t('fields.phone.missingTitle')}
                      </p>
                      <p className={styles.phoneAlertDesc}>
                        {phone ? t('fields.phone.unverifiedBody') : t('fields.phone.missingBody')}
                      </p>
                      <Button
                        type="primary"
                        icon={<PhoneOutlined />}
                        onClick={() => setVerifyOpen(true)}
                      >
                        {phone ? t('fields.phone.verifyCta') : t('fields.phone.addCta')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.column}>
                <TextField
                  control={control}
                  name="email"
                  type="email"
                  label={t('fields.email.label')}
                  placeholder={t('fields.email.placeholder')}
                  prefix={<MailOutlined />}
                  help={t('fields.email.help')}
                />

                {/*
                  Bọc một lớp để chừa chỗ cho bộ đếm ký tự: AntD đặt "0 / 200" ở NGOÀI ô nhập,
                  định vị tuyệt đối ngay dưới góc phải — đúng chỗ `Form.Item` vẽ dòng gợi ý,
                  nên hai thứ đè lên nhau nếu không lùi dòng gợi ý ra.
                */}
                <div className={styles.bioField}>
                  <TextAreaField
                    control={control}
                    name="bio"
                    label={t('fields.bio.label')}
                    placeholder={t('fields.bio.placeholder')}
                    rows={4}
                    // `maxLength` tự bật bộ đếm của AntD — không tự vẽ bộ đếm thứ hai.
                    maxLength={BIO_MAX}
                    help={t('fields.bio.help')}
                  />
                </div>
              </div>
            </div>

            {/*
              Ô địa chỉ trải NGANG cả hai cột: nó gồm ba ô xếp dọc cộng một khối bản đồ, nhét
              vào nửa bề ngang thì bản đồ nhỏ tới mức không ghim nổi.
            */}
            <div className={styles.addressBlock}>
              <AddressField
                control={control}
                title={t('fields.address.title')}
                required
                names={{
                  provinceCode: 'provinceCode',
                  wardCode: 'wardCode',
                  addressLine: 'addressLine',
                }}
                /*
                 * CÓ ghim toạ độ: địa chỉ này trở thành chi nhánh mặc định của chủ xe, tức là
                 * điểm xuất phát để tính phí giao xe và là chỗ tài xế lái tới. Đúng nhóm địa
                 * chỉ mà `AddressField` nói là "toạ độ có hệ quả".
                 */
                pin={{
                  placeId: 'placeId',
                  latitude: 'latitude',
                  longitude: 'longitude',
                  locationSource: 'locationSource',
                }}
              />
            </div>

            <p className={styles.note}>{t('editableLater')}</p>
          </VehicleWizard>
        </form>
      </Form>

      {/*
        Dùng lại ĐÚNG hộp xác thực của trang tài khoản — nó đã có gửi mã, đếm ngược gửi lại, và
        ghi `users.phone` sau khi xác thực xong. Viết bản thứ hai ở đây là hai luồng OTP khác
        nhau cho cùng một việc. Hộp render qua portal nên nằm ngoài `<form>` là đúng chỗ.
      */}
      {verifyOpen ? (
        <ContactVerifyModal
          channel={CONTACT_CHANNEL.PHONE}
          open
          onClose={() => setVerifyOpen(false)}
          current={phone}
        />
      ) : null}
    </div>
  );
}

/**
 * Cột phụ bên phải: ba lý do nên khai đủ + lối ra hỗ trợ.
 *
 * Đây là chỗ TRẤN AN, không phải chỗ nhập liệu — người lần đầu giao tên, số điện thoại và địa
 * chỉ nhà mình cho một nền tảng cần biết vì sao. Nội dung nói đúng việc nền tảng làm được hôm
 * nay, không hứa thu nhập.
 */
function OwnerAside() {
  const t = useTranslations('ListYourVehicle.ownerProfile.aside');

  // Khoá viết THẲNG, không ghép chuỗi: next-intl chỉ kiểm được key khi nó là literal.
  const points: ReadonlyArray<{ key: string; icon: ReactNode; title: string; desc: string }> = [
    {
      key: 'trust',
      icon: <SafetyCertificateOutlined />,
      title: t('trust.title'),
      desc: t('trust.desc'),
    },
    { key: 'reach', icon: <TeamOutlined />, title: t('reach.title'), desc: t('reach.desc') },
    { key: 'manage', icon: <SettingOutlined />, title: t('manage.title'), desc: t('manage.desc') },
  ];

  return (
    <>
      <section className={styles.asideCard}>
        <h2 className={styles.asideTitle}>{t('title')}</h2>
        <ul className={styles.asideList}>
          {points.map((point) => (
            <li key={point.key} className={styles.asideItem}>
              <span className={styles.asideIcon} aria-hidden="true">
                {point.icon}
              </span>
              <span className={styles.asideBody}>
                <span className={styles.asideItemTitle}>{point.title}</span>
                <span className={styles.asideItemDesc}>{point.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.asideCard}>
        <div className={styles.asideItem}>
          <span className={styles.asideIcon} aria-hidden="true">
            <CustomerServiceOutlined />
          </span>
          <span className={styles.asideBody}>
            <span className={styles.asideItemTitle}>{t('support.title')}</span>
            <span className={styles.asideItemDesc}>{t('support.desc')}</span>
          </span>
        </div>
        <Link href={ROUTES.ACCOUNT.SUPPORT} className={styles.asideCta}>
          <Button block>{t('support.cta')}</Button>
        </Link>
      </section>
    </>
  );
}

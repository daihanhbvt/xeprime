'use client';

import { Alert, Button, Card, Col, Row } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { shopProfileSchema, type ShopProfileValues } from '@xeprime/validators';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import type { MyShop, UpdateProfileInput } from '../types';
import styles from './ShopProfileForm.module.css';

interface ShopProfileFormProps {
  shop: MyShop;
  disabled: boolean;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (body: UpdateProfileInput) => void;
}

function toValues(shop: MyShop): ShopProfileValues {
  const p = shop.profile;
  return {
    displayName: p.displayName ?? '',
    bio: p.bio ?? '',
    address: p.address ?? '',
    provinceName: p.provinceName ?? '',
    taxCode: p.taxCode ?? '',
    businessLicenseNo: p.businessLicenseNo ?? '',
    bankName: p.bankName ?? '',
    bankAccountNo: p.bankAccountNo ?? '',
    bankAccountName: p.bankAccountName ?? '',
    logoUrl: p.logoUrl ?? null,
  };
}

export function ShopProfileForm({
  shop,
  disabled,
  submitting,
  errorMessage,
  onSubmit,
}: ShopProfileFormProps) {
  const { control, handleSubmit } = useForm<ShopProfileValues>({
    resolver: yupResolver(shopProfileSchema),
    defaultValues: toValues(shop),
  });

  const submit = handleSubmit((v) => {
    onSubmit({
      displayName: v.displayName,
      bio: v.bio,
      address: v.address,
      provinceName: v.provinceName,
      taxCode: v.taxCode,
      businessLicenseNo: v.businessLicenseNo,
      bankName: v.bankName,
      bankAccountNo: v.bankAccountNo,
      bankAccountName: v.bankAccountName,
      logoUrl: v.logoUrl ?? '',
    });
  });

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      {errorMessage ? (
        <Alert type="error" showIcon message={errorMessage} className={styles.alert} />
      ) : null}
      {disabled ? (
        <Alert
          type="info"
          showIcon
          className={styles.alert}
          message="Hồ sơ đang chờ duyệt nên tạm khoá chỉnh sửa."
        />
      ) : null}

      <fieldset disabled={disabled} className={styles.fieldset}>
        <Card title="Thông tin hiển thị" className={styles.section}>
          <TextField
            control={control}
            name="displayName"
            label="Tên hiển thị"
            placeholder="Tên hiện trên marketplace"
          />
          <TextAreaField
            control={control}
            name="bio"
            label="Giới thiệu"
            placeholder="Mô tả ngắn về gian hàng…"
            maxLength={2000}
          />
          <TextField control={control} name="logoUrl" label="Logo (URL)" placeholder="https://..." />
        </Card>

        <Card title="Địa chỉ & pháp lý" className={styles.section}>
          <Row gutter={16}>
            <Col xs={24} sm={16}>
              <TextField control={control} name="address" label="Địa chỉ" placeholder="Số nhà, đường…" />
            </Col>
            <Col xs={24} sm={8}>
              <TextField control={control} name="provinceName" label="Tỉnh/Thành" placeholder="VD: TP HCM" />
            </Col>
            <Col xs={24} sm={12}>
              <TextField control={control} name="taxCode" label="Mã số thuế" placeholder="Nếu có" />
            </Col>
            <Col xs={24} sm={12}>
              <TextField
                control={control}
                name="businessLicenseNo"
                label="Số giấy phép KD"
                placeholder="Nếu có"
              />
            </Col>
          </Row>
        </Card>

        <Card title="Tài khoản nhận tiền" className={styles.section}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <TextField control={control} name="bankName" label="Ngân hàng" placeholder="VD: Vietcombank" />
            </Col>
            <Col xs={24} sm={12}>
              <TextField control={control} name="bankAccountNo" label="Số tài khoản" placeholder="Số TK" />
            </Col>
            <Col xs={24} sm={24}>
              <TextField
                control={control}
                name="bankAccountName"
                label="Chủ tài khoản"
                placeholder="Tên chủ tài khoản"
              />
            </Col>
          </Row>
        </Card>

        <div className={styles.actions}>
          <Button type="primary" size="large" htmlType="submit" loading={submitting}>
            Lưu hồ sơ
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

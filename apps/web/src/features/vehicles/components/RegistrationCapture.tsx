'use client';

import { CameraOutlined, CheckCircleFilled, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Col, Form, Image, Input, Row, Spin, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { IMAGE_UPLOAD_MIME_TYPES, assessRegistrationReading } from '@xeprime/types';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import {
  PrepareImageError,
  prepareLicenceImage,
} from '@/features/driver-licence/prepare-licence-image';
import { useErrorMessage } from '@/i18n/use-error-message';
import { uploadVehicleRegistration } from '../api';
import {
  EMPTY_REGISTRATION,
  checkRegistration,
  fieldsFromReading,
  registrationAutoFilled,
  type RegistrationCaptureState,
  type RegistrationFields,
} from '../registration-capture';
import styles from './RegistrationCapture.module.css';

interface RegistrationCaptureProps {
  state: RegistrationCaptureState;
  onChange: (update: (prev: RegistrationCaptureState) => RegistrationCaptureState) => void;
  /** Biển số đã nhập ở bước Cơ bản — so với biển in trên cà vẹt. */
  vehiclePlate: string | null | undefined;
  /** Đã bấm "Tiếp tục"/"Lưu" — mới hiện lỗi, không mắng người dùng khi họ vừa mở bước. */
  showErrors: boolean;
}

const FIELD_ORDER: readonly (keyof RegistrationFields)[] = [
  'holderName',
  'chassisNumber',
  'engineNumber',
  'holderAddress',
];

/**
 * Ô "Cà vẹt xe" ở bước Hình ảnh của wizard tạo ô tô (ADR 0089).
 *
 * Chọn ảnh ⇒ nén trong trình duyệt (bỏ EXIF) ⇒ tải lên kho riêng tư ⇒ server đọc. Đọc đủ tên chủ
 * xe, số khung, số máy và biển khớp ⇒ chỉ hiện bản tóm tắt (đã lưu kèm xe, vẫn sửa được). Thiếu
 * hoặc lệch ⇒ các ô bắt buộc nhập tay, điền sẵn phần đã đọc được.
 */
export function RegistrationCapture({
  state,
  onChange,
  vehiclePlate,
  showErrors,
}: RegistrationCaptureProps) {
  const t = useTranslations('Vehicles.form.registration');
  const errorMessage = useErrorMessage();
  /** Lượt chọn ảnh mới nhất — kết quả của lượt cũ về muộn thì bỏ. */
  const attempt = useRef(0);

  const check = checkRegistration(state, vehiclePlate);
  const autoFilled = registrationAutoFilled(state, vehiclePlate);
  const assessment = assessRegistrationReading(state.reading, vehiclePlate);

  async function select(file: File) {
    const token = ++attempt.current;
    let prepared: File;
    try {
      prepared = await prepareLicenceImage(file);
    } catch (error) {
      const failure = error instanceof PrepareImageError ? error.reason : 'unsupported';
      onChange((prev) => ({ ...prev, phase: 'failed', failure, failureError: null }));
      return;
    }
    const previewUrl = URL.createObjectURL(prepared);
    onChange((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { ...EMPTY_REGISTRATION, phase: 'working', previewUrl };
    });
    try {
      const result = await uploadVehicleRegistration(prepared);
      if (token !== attempt.current) return;
      onChange((prev) => ({
        ...prev,
        phase: 'ready',
        uploadId: result.uploadId,
        reading: result.reading,
        readerAvailable: result.readerAvailable,
        fields: fieldsFromReading(result.reading),
        editing: false,
      }));
    } catch (error) {
      if (token !== attempt.current) return;
      onChange((prev) => ({ ...prev, phase: 'failed', failure: 'upload', failureError: error }));
    }
  }

  const setField = (field: keyof RegistrationFields, value: string) =>
    onChange((prev) => ({ ...prev, fields: { ...prev.fields, [field]: value } }));

  const photoError = showErrors ? check.errors.photo : undefined;

  return (
    <section className={styles.block} aria-labelledby="vehicle-registration-title">
      <h3 id="vehicle-registration-title" className={styles.title}>
        <span className={styles.required}>{t('title')}</span>
        <PolicyInfoTip label={t('tipLabel')}>{t('tip')}</PolicyInfoTip>
      </h3>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={9}>
          <Upload
            accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
            showUploadList={false}
            disabled={state.phase === 'working'}
            beforeUpload={(file) => {
              void select(file);
              return false;
            }}
          >
            {state.previewUrl ? (
              <div className={styles.preview}>
                <Image
                  src={state.previewUrl}
                  alt={t('previewAlt')}
                  preview={false}
                  className={styles.previewImage}
                />
                <Button
                  size="small"
                  icon={<ReloadOutlined aria-hidden="true" />}
                  className={styles.replace}
                  disabled={state.phase === 'working'}
                >
                  {t('replace')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className={photoError ? `${styles.addTile} ${styles.addTileError}` : styles.addTile}
              >
                <CameraOutlined aria-hidden="true" className={styles.addIcon} />
                <span>{t('choose')}</span>
                <span className={styles.addHint}>{t('chooseHint')}</span>
              </button>
            )}
          </Upload>
          {photoError ? <p className={styles.error}>{t(`errors.${photoError}`)}</p> : null}
        </Col>

        <Col xs={24} md={15}>
          {state.phase === 'working' ? (
            <div className={styles.status} role="status">
              <Spin size="small" />
              <span>{t('reading')}</span>
            </div>
          ) : null}

          {state.phase === 'failed' ? (
            <Alert
              type="error"
              showIcon
              title={
                state.failure === 'upload'
                  ? errorMessage(state.failureError)
                  : t(`failure.${state.failure ?? 'unsupported'}`)
              }
            />
          ) : null}

          {state.phase === 'ready' && autoFilled ? (
            <div className={styles.summary}>
              <div className={styles.summaryHead}>
                <span className={styles.done}>
                  <CheckCircleFilled aria-hidden="true" /> {t('autoFilled')}
                </span>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined aria-hidden="true" />}
                  onClick={() => onChange((prev) => ({ ...prev, editing: true }))}
                >
                  {t('edit')}
                </Button>
              </div>
              <dl className={styles.facts}>
                {(['holderName', 'chassisNumber', 'engineNumber'] as const).map((field) => (
                  <div key={field} className={styles.fact}>
                    <dt>{t(`fields.${field}`)}</dt>
                    <dd>{state.fields[field]}</dd>
                  </div>
                ))}
                {state.reading?.plateNumber ? (
                  <div className={styles.fact}>
                    <dt>{t('fields.plateNumber')}</dt>
                    <dd>{state.reading.plateNumber}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {state.phase === 'ready' && !autoFilled ? (
            <>
              {state.editing ? null : (
                <Alert
                  type="warning"
                  showIcon
                  className={styles.notice}
                  title={
                    assessment.plateMismatch
                      ? t('plateMismatch', {
                          read: state.reading?.plateNumber ?? '',
                          typed: vehiclePlate ?? '',
                        })
                      : state.readerAvailable
                        ? t('needsManual')
                        : t('readerUnavailable')
                  }
                />
              )}
              <Row gutter={[16, 0]}>
                {FIELD_ORDER.map((field) => {
                  const code = showErrors ? check.errors[field] : undefined;
                  return (
                    <Col key={field} xs={24} sm={field === 'holderAddress' ? 24 : 12}>
                      <Form.Item
                        label={t(`fields.${field}`)}
                        required={field !== 'holderAddress'}
                        validateStatus={code ? 'error' : undefined}
                        help={code ? t(`errors.${code}`) : undefined}
                        htmlFor={`vehicle-registration-${field}`}
                      >
                        <Input
                          id={`vehicle-registration-${field}`}
                          value={state.fields[field]}
                          onChange={(event) => setField(field, event.target.value)}
                          placeholder={t(`placeholders.${field}`)}
                          autoComplete="off"
                        />
                      </Form.Item>
                    </Col>
                  );
                })}
              </Row>
            </>
          ) : null}
        </Col>
      </Row>
    </section>
  );
}

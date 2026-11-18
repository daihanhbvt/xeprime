'use client';

import { CheckCircleFilled, EyeOutlined } from '@ant-design/icons';
import {
  ImageViewer,
  UploadPlaceholderArt,
} from '@/features/vehicle-manage/components/VehicleImageBoard';
import { Col, Form, Input, Row, Spin, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useRef, useState, type ReactNode } from 'react';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  VEHICLE_REGISTRATION_LIMITS,
  IMAGE_UPLOAD_MIME_TYPES,
  assessRegistrationReading,
} from '@xeprime/types';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import {
  PrepareImageError,
  prepareLicenceImage,
} from '@/features/driver-licence/prepare-licence-image';
import { useErrorMessage } from '@/i18n/use-error-message';
import imageStyles from '@/features/vehicle-manage/components/sections/ImagesSection.module.css';
import { uploadVehicleRegistration } from '../api';
import {
  EMPTY_REGISTRATION,
  checkRegistration,
  fieldsFromReading,
  mergeTypedFields,
  type RegistrationCaptureState,
  type RegistrationFields,
} from '../registration-capture';
import styles from './RegistrationCapture.module.css';

export interface RegistrationCaptureProps {
  state: RegistrationCaptureState;
  onChange: (update: (prev: RegistrationCaptureState) => RegistrationCaptureState) => void;
  /** Biển số đã nhập ở bước Cơ bản — so với biển in trên cà vẹt. */
  vehiclePlate: string | null | undefined;
  /** Đã bấm "Tiếp tục"/"Lưu" — mới hiện lỗi, không mắng người dùng khi họ vừa mở bước. */
  showErrors: boolean;
  /**
   * Việc phải xong TRƯỚC khi tải ảnh — luồng đăng nhanh mở gian hàng ở đây (presign cà vẹt là
   * tenant-scoped), y như tấm ảnh xe đầu tiên. Lỗi của nó hiện như lỗi tải.
   */
  beforeUpload?: () => Promise<void>;
}

/** Ba trường cà vẹt máy quét báo kết quả. */
const SCAN_FIELDS = ['holderName', 'chassisNumber', 'engineNumber'] as const;

const LIMITS = VEHICLE_REGISTRATION_LIMITS;
const CODE_MAX = Math.max(LIMITS.chassisNumberMax, LIMITS.engineNumberMax);

/**
 * Số khung / số máy lọc NGAY khi gõ (18/11/2026): viết hoa, chỉ chữ và số - không khoảng trắng,
 * không ký tự đặc biệt - thay vì cho gõ rồi âm thầm bỏ lúc lưu. Độ dài 6-25 / 4-25 vẫn do
 * `checkRegistration` báo, server kiểm lại cùng luật.
 */
function sanitizeField(field: keyof RegistrationFields, value: string): string {
  if (field === 'chassisNumber' || field === 'engineNumber') {
    return value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, CODE_MAX);
  }
  return value;
}

const VISIBLE_FIELDS: readonly (keyof RegistrationFields)[] = [
  'holderName',
  'chassisNumber',
  'engineNumber',
];


/**
 * Chọn ảnh cà vẹt ⇒ nén trong trình duyệt (bỏ EXIF) ⇒ tải lên kho riêng tư ⇒ server đọc (ADR 0089 ·
 * 0099). Chữ chủ xe đã gõ giữ nguyên; máy đọc xong chỉ lấp ô còn trống.
 */
function useRegistrationSelect({
  onChange,
  beforeUpload,
}: Pick<RegistrationCaptureProps, 'onChange' | 'beforeUpload'>) {
  /** Lượt chọn ảnh mới nhất — kết quả của lượt cũ về muộn thì bỏ. */
  const attempt = useRef(0);
  return async function select(file: File) {
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
      // Ảnh MỚI = cà vẹt mới: xoá các ô cà vẹt để ảnh mới điền lại, không giữ số của ảnh cũ
      // (18/11/2026). Chữ gõ TRONG LÚC ảnh mới đang đọc vẫn giữ (`mergeTypedFields`, ADR 0099).
      const fields = { ...prev.fields, holderName: '', chassisNumber: '', engineNumber: '', holderAddress: '' };
      return {
        ...EMPTY_REGISTRATION,
        phase: 'working',
        previewUrl,
        editing: prev.editing,
        fields,
      };
    });
    try {
      if (beforeUpload) await beforeUpload();
      const result = await uploadVehicleRegistration(prepared);
      if (token !== attempt.current) return;
      onChange((prev) => ({
        ...prev,
        phase: 'ready',
        uploadId: result.uploadId,
        reading: result.reading,
        readerAvailable: result.readerAvailable,
        fields: mergeTypedFields(prev.fields, fieldsFromReading(result.reading)),
      }));
    } catch (error) {
      if (token !== attempt.current) return;
      onChange((prev) => ({ ...prev, phase: 'failed', failure: 'upload', failureError: error }));
    }
  };
}

/**
 * Ô "Cà vẹt xe" trong LƯỚI ẢNH của wizard thêm xe (Figma `24352:79234`) - cùng hình ô ảnh xe; các
 * trường đọc được nằm ở thẻ "Thông tin xe" (`RegistrationFieldsBlock`).
 */
export function RegistrationPhotoTile({
  state,
  onChange,
  vehiclePlate,
  showErrors,
  beforeUpload,
}: RegistrationCaptureProps) {
  const t = useTranslations('Vehicles.form.registration');
  const tImages = useTranslations('VehicleManage.images');
  const select = useRegistrationSelect({ onChange, ...(beforeUpload ? { beforeUpload } : {}) });
  const check = checkRegistration(state, vehiclePlate);
  const photoError = showErrors ? check.errors.photo : undefined;
  const maxMb = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));
  const [viewing, setViewing] = useState(false);

  const picker = (child: ReactNode) => (
    <Upload
      accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
      showUploadList={false}
      disabled={state.phase === 'working'}
      beforeUpload={(file) => {
        void select(file);
        return false;
      }}
    >
      {child}
    </Upload>
  );

  return (
    <section className={imageStyles.compactSlot} aria-label={t('title')}>
      {state.previewUrl ? (
        <div className={styles.tilePreview}>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob URL cục bộ, không qua next/image */}
          <img src={state.previewUrl} alt={t('previewAlt')} className={imageStyles.compactPhoto} />
          {state.phase !== 'working' ? (
            <button
              type="button"
              className={imageStyles.compactEyeBtn}
              aria-label={t('view')}
              onClick={() => setViewing(true)}
            >
              <EyeOutlined />
            </button>
          ) : null}
          {state.phase === 'working' ? (
            <div className={styles.tileBusy} role="status">
              <Spin size="small" />
              <span>{t('reading')}</span>
            </div>
          ) : null}
        </div>
      ) : (
        picker(
          <button
            type="button"
            className={
              photoError
                ? `${imageStyles.compactEmpty} ${styles.tileError}`
                : imageStyles.compactEmpty
            }
          >
            <UploadPlaceholderArt />
            <span>{tImages('clickToUpload')}</span>
            <span className={imageStyles.compactEmptyHint}>
              {tImages('fileHint', { max: maxMb })}
            </span>
          </button>,
        )
      )}
      <div className={imageStyles.compactFoot}>
        <span className={imageStyles.compactLabel}>
          {t('title')}
        </span>
        <PolicyInfoTip label={t('tipLabel')}>{t('tip')}</PolicyInfoTip>
        {state.previewUrl && state.phase !== 'working' ? (
          <span className={imageStyles.compactActions}>
            {picker(
              <button type="button" aria-label={t('replace')}>
                {/* eslint-disable-next-line @next/next/no-img-element -- icon tĩnh của Figma */}
                <img src="/images/vehicle-upload/edit.svg" alt="" width={20} height={20} />
              </button>,
            )}
          </span>
        ) : null}
      </div>
      {photoError ? <p className={styles.error}>{t(`errors.${photoError}`)}</p> : null}
      <ScanStatus state={state} vehiclePlate={vehiclePlate} />
      <ImageViewer url={viewing ? state.previewUrl : null} onClose={() => setViewing(false)} />
    </section>
  );
}

/**
 * Kết quả quét OCR ngầm, ngay dưới ô cà vẹt: đọc được số khung + số máy ⇒ dòng xanh lá (các ô bên
 * dưới đã tự điền); không đọc được ⇒ dòng lỗi mời kiểm tra lại. Ảnh vẫn được NHẬN trong cả hai
 * trường hợp - chủ xe tự nhập số còn thiếu.
 */
function ScanStatus({
  state,
  vehiclePlate,
}: Pick<RegistrationCaptureProps, 'state' | 'vehiclePlate'>) {
  const t = useTranslations('Vehicles.form.registration');
  const errorMessage = useErrorMessage();
  if (state.phase === 'failed') {
    return (
      <p className={styles.error} role="alert">
        {state.failure === 'upload'
          ? errorMessage(state.failureError)
          : t(`failure.${state.failure ?? 'unsupported'}`)}
      </p>
    );
  }
  if (state.phase !== 'ready') return null;
  const read = fieldsFromReading(state.reading);
  const assessment = assessRegistrationReading(state.reading, vehiclePlate);
  // Báo đúng TỪNG trường: đọc được thì xanh (đã tự điền), thiếu thì đỏ - không gộp "thiếu một là
  // báo hỏng cả hai" (18/11/2026).
  const scanned = SCAN_FIELDS.filter((field) => read[field]);
  const missing = SCAN_FIELDS.filter((field) => !read[field]);
  return (
    <>
      {scanned.length > 0 ? (
        <p className={styles.scanOk} role="status">
          <CheckCircleFilled aria-hidden="true" />{' '}
          {t('scanFound', {
            items: scanned.map((f) => `${t(`fields.${f}`)} ${read[f]}`).join(LIST_SEPARATOR),
          })}
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p className={styles.scanMissing} role="status">
          {t('scanMissingItems', {
            items: missing.map((f) => t(`fields.${f}`).toLowerCase()).join(', '),
          })}
        </p>
      ) : null}
      {assessment.plateMismatch ? (
        <p className={styles.error}>
          {t('plateMismatch', { read: state.reading?.plateNumber ?? '', typed: vehiclePlate ?? '' })}
        </p>
      ) : null}
    </>
  );
}

/**
 * Các trường cà vẹt trong thẻ "Thông tin xe" (Figma: Số khung · Số máy). Luôn nhập được - ảnh đọc
 * xong thì tự điền ô còn trống; ảnh vẫn bắt buộc (`checkRegistration`).
 */
export function RegistrationFieldsBlock({
  state,
  onChange,
  vehiclePlate,
  showErrors,
}: Omit<RegistrationCaptureProps, 'beforeUpload'>) {
  const t = useTranslations('Vehicles.form.registration');
  const check = checkRegistration(state, vehiclePlate);
  const setField = (field: keyof RegistrationFields, value: string) =>
    onChange((prev) => ({ ...prev, editing: true, fields: { ...prev.fields, [field]: value } }));
  // Ô máy ĐÃ đọc được từ ảnh thì khoá lại (tránh lỡ tay sửa sai số khung/số máy), bút chì mở khoá
  // để sửa khi máy đọc nhầm. Ảnh mới = lượt đọc mới ⇒ khoá lại từ đầu (18/11/2026).
  const read = state.phase === 'ready' ? fieldsFromReading(state.reading) : {};
  const [unlocked, setUnlocked] = useState<{ reading: unknown; fields: ReadonlySet<string> }>({
    reading: undefined,
    fields: new Set(),
  });
  const unlockedFields = unlocked.reading === state.reading ? unlocked.fields : new Set<string>();
  const unlock = (field: string) =>
    setUnlocked({ reading: state.reading, fields: new Set([...unlockedFields, field]) });

  return (
    <>
      <Row gutter={24}>
        {/* Figma: Tên chủ xe · Số khung · Số máy. Địa chỉ không hỏi - máy đọc được thì lưu ngầm. */}
        {VISIBLE_FIELDS.map((field) => {
          const code = showErrors ? check.errors[field] : undefined;
          const scannedValue = (read as Partial<Record<string, string | undefined>>)[field];
          const locked =
            Boolean(scannedValue) && !unlockedFields.has(field) && state.fields[field] === scannedValue;
          return (
            <Col key={field} xs={24} sm={12} lg={8}>
              <Form.Item
                label={t(`fields.${field}`)}
                required
                validateStatus={code ? 'error' : undefined}
                help={code ? t(`errors.${code}`) : undefined}
                htmlFor={`vehicle-registration-${field}`}
              >
                <Input
                  id={`vehicle-registration-${field}`}
                  value={state.fields[field]}
                  onChange={(event) => setField(field, sanitizeField(field, event.target.value))}
                  maxLength={field === 'holderName' ? LIMITS.holderNameMax : CODE_MAX}
                  placeholder={t('scanPlaceholder')}
                  autoComplete="off"
                  readOnly={locked}
                  className={locked ? styles.lockedInput : undefined}
                  suffix={
                    locked ? (
                      <button
                        type="button"
                        className={styles.editField}
                        onClick={() => unlock(field)}
                        aria-label={t('editField', { field: t(`fields.${field}`) })}
                      >
                        <span className={styles.editGlyph} aria-hidden="true" />
                      </button>
                    ) : undefined
                  }
                />
              </Form.Item>
            </Col>
          );
        })}
      </Row>
    </>
  );
}

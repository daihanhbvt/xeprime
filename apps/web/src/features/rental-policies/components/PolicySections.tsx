'use client';

import {
  CheckCircleOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Alert, Button } from 'antd';
import type { ReactNode } from 'react';
import {
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type FieldErrors,
} from 'react-hook-form';
import {
  COLLATERAL_ASSET_TYPE_LABEL,
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_MODE,
  COLLATERAL_MODE_META,
  LONG_TERM_PACKAGE_MONTHS,
  longTermPackageLabel,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { deliverySummaryText } from '../form';
import type { PolicyFormValues } from '../schema';
import { PolicyInfoTip } from './PolicyInfoTip';

import styles from './PolicySections.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

type LegacyTierView = { minDays: number; percent: number };

interface PolicySectionsProps {
  control: Control<PolicyFormValues>;
  legacyDiscountTiers?: readonly LegacyTierView[];
  depositHint?: ReactNode;
  numbered?: boolean;
  disabled?: boolean;
}

/** Bốn khối dùng chung cho policy gian hàng và policy ghi đè theo xe. */
export function PolicySections({
  control,
  depositHint,
  legacyDiscountTiers,
  numbered = true,
  disabled = false,
}: PolicySectionsProps) {
  const n = (index: number, title: string) => (numbered ? `${index}. ${title}` : title);

  return (
    <div className={styles.stack}>
      <DepositSection
        control={control}
        title={n(1, 'Yêu cầu bảo đảm (thế chấp)')}
        hint={depositHint}
        disabled={disabled}
      />
      <DeliverySection
        control={control}
        title={n(2, 'Dịch vụ giao nhận xe tận nơi')}
        disabled={disabled}
      />
      <OvertimeSection
        control={control}
        title={n(3, 'Phí trả xe quá giờ thỏa thuận')}
        disabled={disabled}
      />
      <DiscountSection
        control={control}
        title={n(4, 'Ưu đãi cam kết thời hạn (thuê dài hạn)')}
        legacyTiers={legacyDiscountTiers}
        disabled={disabled}
      />
    </div>
  );
}

function SectionTitle({
  title,
  infoLabel,
  children,
}: {
  title: string;
  infoLabel: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.titleRow}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <PolicyInfoTip label={infoLabel}>{children}</PolicyInfoTip>
    </div>
  );
}

function HeadLabel({
  children,
  infoLabel,
  info,
}: {
  children: ReactNode;
  infoLabel?: string;
  info?: ReactNode;
}) {
  return (
    <span className={styles.headLabel}>
      <span>{children}</span>
      {infoLabel && info ? <PolicyInfoTip label={infoLabel}>{info}</PolicyInfoTip> : null}
    </span>
  );
}

/** Ba chế độ bảo đảm, nhãn lấy từ META của `@xeprime/types` — component không tự biết mã nào. */
const COLLATERAL_MODE_OPTIONS = [
  {
    value: COLLATERAL_MODE.CASH,
    label: COLLATERAL_MODE_META[COLLATERAL_MODE.CASH].label,
    description: 'Khách đặt một khoản tiền, hoàn lại khi bàn giao xe xong.',
  },
  {
    value: COLLATERAL_MODE.ASSET,
    label: COLLATERAL_MODE_META[COLLATERAL_MODE.ASSET].label,
    description: 'Khách để lại giấy tờ hoặc tài sản thay cho tiền — gian hàng không giữ tiền.',
  },
  {
    value: COLLATERAL_MODE.NONE,
    label: COLLATERAL_MODE_META[COLLATERAL_MODE.NONE].label,
    description: 'Không yêu cầu bảo đảm. Xe sẽ mang nhãn "Miễn thế chấp" trên sàn.',
  },
] as const;

const COLLATERAL_ASSET_OPTIONS = COLLATERAL_ASSET_TYPE_VALUES.map((value) => ({
  value,
  label: COLLATERAL_ASSET_TYPE_LABEL[value],
}));

/**
 * Khối BẢO ĐẢM — ba chế độ loại trừ nhau (gap C-04). Chỉ phần thuộc chế độ đang chọn hiện ra:
 * ô tiền cọc ở `cash`, danh mục tài sản ở `asset`, `none` không có gì để nhập.
 *
 * Giấu phần không liên quan thay vì disable nó: một ô tiền cọc mờ đi bên cạnh "Miễn thế chấp"
 * vẫn khiến người dùng tưởng số cũ còn hiệu lực, trong khi `formToSaveInput` đã ép nó về 0.
 */
function DepositSection({
  control,
  title,
  hint,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  hint?: ReactNode;
  disabled: boolean;
}) {
  const mode = useWatch({ control, name: 'collateralMode' });

  return (
    <section className={styles.card} aria-label={title}>
      <SectionTitle title={title} infoLabel="Giải thích yêu cầu bảo đảm">
        Bảo đảm là thứ gian hàng giữ để phòng rủi ro: tiền cọc, tài sản/giấy tờ, hoặc không yêu
        cầu gì. Đây là việc RIÊNG với đối chiếu giấy tờ tuỳ thân — đối chiếu thì lượt thuê nào
        cũng cần.
      </SectionTitle>

      <RadioGroupField
        control={control}
        name="collateralMode"
        label="Hình thức bảo đảm"
        options={COLLATERAL_MODE_OPTIONS}
        disabled={disabled}
        required
      />

      {mode === COLLATERAL_MODE.CASH ? (
        <div className={styles.depositRow}>
          <div className={styles.depositField}>
            <NumberField
              control={control}
              name="depositAmount"
              label="Số tiền cọc mặc định"
              labelAccessory={
                <PolicyInfoTip label="Giải thích số tiền cọc mặc định">
                  Mức tiền cố định bằng VND, thu riêng với giá thuê, không chịu chiết khấu và chỉ
                  áp dụng cho lượt đặt mới. Booking đã chốt giữ nguyên mức cọc cũ.
                </PolicyInfoTip>
              }
              money
              required
              min={0}
              disabled={disabled}
            />
          </div>
          {hint ? <div className={styles.depositHint}>{hint}</div> : null}
        </div>
      ) : null}

      {mode === COLLATERAL_MODE.ASSET ? (
        <CheckboxGroupField
          control={control}
          name="collateralAssetTypes"
          label="Loại tài sản nhận thế chấp"
          options={COLLATERAL_ASSET_OPTIONS}
          disabled={disabled}
          required
          help="Khách chỉ cần đáp ứng MỘT trong các hình thức đã chọn."
        />
      ) : null}

      {mode === COLLATERAL_MODE.NONE ? (
        <Alert
          type="info"
          showIcon
          message="Không thu cọc và không giữ tài sản"
          description='Xe áp dụng chính sách này sẽ hiện nhãn "Miễn thế chấp" và lọc được theo tiêu chí đó trên sàn.'
        />
      ) : null}
    </section>
  );
}

function DeliverySection({
  control,
  title,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  disabled: boolean;
}) {
  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const radius = useWatch({ control, name: 'deliveryMaxRadiusKm' });
  const { errors } = useFormState({ control, name: ['deliveryTiers', 'deliveryMaxRadiusKm'] });
  const { fields, append, remove } = useFieldArray({ control, name: 'deliveryTiers' });

  const tierErrors = errors.deliveryTiers as
    | (FieldErrors<PolicyFormValues>['deliveryTiers'] & {
        root?: { message?: string };
        message?: string;
      })
    | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;
  const tiersComplete =
    tiers.length > 0 && tiers.every((tier) => tier?.toKm != null) && radius != null;

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.cardHeader}>
        <SectionTitle title={title} infoLabel="Giải thích phí giao nhận">
          Phí được tính theo khoảng cách một chiều từ vị trí gian hàng đến điểm khách nhận xe.
        </SectionTitle>
        <SwitchField
          control={control}
          name="deliveryEnabled"
          label={enabled ? 'Đang bật' : 'Đang tắt'}
          disabled={disabled}
        />
      </div>
      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label="Bậc phí giao nhận">
            <div className={styles.tierHead}>
              <HeadLabel
                infoLabel="Giải thích khoảng cách bắt đầu"
                info="Mốc bắt đầu tự động lấy từ điểm kết thúc của bậc trước để không tạo khoảng trống."
              >
                Khoảng cách từ (km)
              </HeadLabel>
              <HeadLabel
                infoLabel="Giải thích khoảng cách kết thúc"
                info="Nhập giới hạn trên của bậc phí này. Các mốc phải tăng dần."
              >
                Khoảng cách đến (km)
              </HeadLabel>
              <HeadLabel
                infoLabel="Giải thích phí giao nhận áp dụng"
                info="Nhập 0 nếu gian hàng miễn phí giao nhận trong khoảng cách này."
              >
                Phí áp dụng (VND)
              </HeadLabel>
              <span className={styles.tierActionHead}>Thao tác</span>
            </div>
            <div className={styles.tierMobileHead} aria-hidden="true">
              <span>Khoảng cách</span>
              <span>Phí áp dụng</span>
              <span>Thao tác</span>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className={styles.tierRow}>
                <div className={styles.distanceCell}>
                  <span className={styles.tierFrom}>
                    {index === 0 ? '0' : `> ${tiers[index - 1]?.toKm ?? '—'}`}
                  </span>
                  <span className={styles.distanceSeparator} aria-hidden="true">
                    –
                  </span>
                  <div className={styles.tierTo}>
                    <NumberField
                      control={control}
                      name={`deliveryTiers.${index}.toKm`}
                      label={`Mốc đến của bậc ${index + 1} (km)`}
                      addonAfter="km"
                      min={0}
                      disabled={disabled}
                    />
                  </div>
                </div>
                <NumberField
                  control={control}
                  name={`deliveryTiers.${index}.fee`}
                  label={`Phí của bậc ${index + 1}`}
                  money
                  help={
                    tiers[index]?.fee === 0 || tiers[index]?.fee == null ? 'Miễn phí' : undefined
                  }
                  disabled={disabled}
                />
                <Button
                  className={styles.deleteButton}
                  type="text"
                  danger
                  icon={<DeleteOutlined aria-hidden="true" />}
                  aria-label={`Xóa bậc ${index + 1}`}
                  onClick={() => remove(index)}
                  disabled={disabled}
                >
                  <span className={styles.deleteText}>Xóa</span>
                </Button>
              </div>
            ))}
          </div>

          <div className={styles.tierFooter}>
            <Button
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={() => append({ toKm: null, fee: null })}
              disabled={disabled}
            >
              Thêm khoảng cách
            </Button>
            {crossError ? (
              <span className={styles.tierError} role="alert">
                ⚠ {crossError}
              </span>
            ) : tiersComplete ? (
              <span className={styles.tierOk}>
                <CheckCircleOutlined aria-hidden="true" /> Không có khoảng trống hoặc chồng lấn
              </span>
            ) : null}
          </div>

          <div className={styles.radiusField}>
            <NumberField
              control={control}
              name="deliveryMaxRadiusKm"
              label="Bán kính hỗ trợ tối đa tự giao"
              labelAccessory={
                <PolicyInfoTip label="Giải thích bán kính hỗ trợ tối đa">
                  Mốc này phải khớp điểm kết thúc của bậc cuối. Ngoài bán kính, khách thấy “Liên hệ
                  chủ xe” và shop báo giá giao nhận thủ công.
                </PolicyInfoTip>
              }
              addonAfter="km"
              min={0}
              required
              disabled={disabled}
            />
          </div>

          {tiersComplete ? (
            <div className={styles.previewCard}>
              <InfoCircleOutlined className={styles.previewIcon} aria-hidden="true" />
              <span>
                <strong>Tiền tối thiểu hiển thị với khách đặt:</strong>{' '}
                {deliverySummaryText({ deliveryTiers: tiers, deliveryMaxRadiusKm: radius })}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.disabledNote}>
          Đang tắt — khách không thể yêu cầu giao xe tận nơi khi đặt.
        </p>
      )}
    </section>
  );
}

function OvertimeSection({
  control,
  title,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  disabled: boolean;
}) {
  const fmt = useAppFormat();

  const fee = useWatch({ control, name: 'overtimeFeePerHour' });

  return (
    <section className={styles.card} aria-label={title}>
      <SectionTitle title={title} infoLabel="Giải thích phí quá giờ">
        Phí quá giờ được tính khi bàn trả xe, sau khi trừ thời gian miễn phí và áp dụng đơn vị làm
        tròn đã cấu hình.
      </SectionTitle>
      <div className={styles.fieldRow}>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeFeePerHour"
            label="Phí mỗi giờ phát sinh"
            labelAccessory={
              <PolicyInfoTip label="Giải thích phí mỗi giờ phát sinh">
                Mức phí cho mỗi giờ khách trả xe trễ sau khoảng miễn phí.
              </PolicyInfoTip>
            }
            money
            addonAfter="đ / giờ"
            placeholder="Cần cấu hình"
            disabled={disabled}
          />
        </div>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeGraceMinutes"
            label="Thời gian miễn phí tối đa"
            labelAccessory={
              <PolicyInfoTip label="Giải thích thời gian miễn phí tối đa">
                Khoảng trễ chưa phát sinh phí quá giờ.
              </PolicyInfoTip>
            }
            addonAfter="phút"
            min={0}
            placeholder="Cần cấu hình"
            disabled={disabled}
          />
        </div>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeRoundingMinutes"
            label="Đơn vị làm tròn tối thiểu"
            labelAccessory={
              <PolicyInfoTip label="Giải thích đơn vị làm tròn tối thiểu">
                Bước thời gian nhỏ nhất dùng để làm tròn khi hệ thống tính phí.
              </PolicyInfoTip>
            }
            addonAfter="phút"
            min={1}
            placeholder="Cần cấu hình"
            disabled={disabled}
          />
        </div>
      </div>
      <div className={styles.formulaCard}>
        <span className={styles.previewTitle}>Công thức tính phí phạt trễ hạn tự động:</span>
        <span className={styles.previewText}>
          {fee != null
            ? `Phí quá giờ = (số giờ trễ thực tế) × ${fmt.money(String(fee))}. Tính ở bước bàn trả xe.`
            : 'Chưa cấu hình phí mỗi giờ — phí quá giờ sẽ thoả thuận thủ công ở bước bàn trả xe.'}
        </span>
      </div>
    </section>
  );
}

function DiscountSection({
  control,
  title,
  legacyTiers,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  legacyTiers?: readonly LegacyTierView[];
  disabled: boolean;
}) {
  const enabled = useWatch({ control, name: 'discountEnabled' });
  const tiers = useWatch({ control, name: 'discountTiers' }) ?? [];
  const { errors } = useFormState({ control, name: 'discountTiers' });
  const { fields, append, remove } = useFieldArray({ control, name: 'discountTiers' });

  const optionsFor = (index: number) =>
    LONG_TERM_PACKAGE_MONTHS.filter(
      (month) =>
        month === tiers[index]?.minMonths || !tiers.some((tier) => tier?.minMonths === month),
    ).map((month) => ({ value: String(month), label: longTermPackageLabel(month) }));
  const nextUnusedMonths =
    LONG_TERM_PACKAGE_MONTHS.find((month) => !tiers.some((tier) => tier?.minMonths === month)) ??
    null;

  const tierErrors = errors.discountTiers as
    { root?: { message?: string }; message?: string } | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.cardHeader}>
        <SectionTitle title={title} infoLabel="Giải thích ưu đãi thuê dài hạn">
          Chỉ áp dụng cho thuê dài hạn. Khách nhận mốc giảm cao nhất mà gói đã chọn đạt tới và các
          mốc không cộng dồn; ví dụ gói 9 tháng hưởng mốc 6 tháng nếu chưa có mốc cao hơn.
        </SectionTitle>
        <SwitchField
          control={control}
          name="discountEnabled"
          label={enabled ? 'Đang bật' : 'Đang tắt'}
          disabled={disabled}
        />
      </div>

      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label="Mốc ưu đãi thuê dài hạn">
            <div className={styles.discountHead}>
              <HeadLabel
                infoLabel="Giải thích gói thuê áp dụng ưu đãi"
                info="Chỉ chọn trong các gói cố định 1, 2, 3, 6, 9 hoặc 12 tháng."
              >
                Gói thuê từ
              </HeadLabel>
              <HeadLabel
                infoLabel="Giải thích mức giảm"
                info="Phần trăm được trừ trên giá gốc của toàn bộ gói thuê dài hạn."
              >
                Mức giảm (%)
              </HeadLabel>
              <HeadLabel
                infoLabel="Giải thích ghi chú ưu đãi"
                info="Nội dung ngắn giúp gian hàng nhận biết mục đích của mốc ưu đãi."
              >
                Ghi chú
              </HeadLabel>
              <span className={styles.tierActionHead}>Thao tác</span>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className={styles.discountRow}>
                <SelectField
                  control={control}
                  name={`discountTiers.${index}.minMonths`}
                  label={`Mốc gói của bậc ${index + 1}`}
                  options={optionsFor(index)}
                  placeholder="Chọn gói"
                  disabled={disabled}
                />
                <NumberField
                  control={control}
                  name={`discountTiers.${index}.percent`}
                  label={`Mức giảm của mốc ${index + 1}`}
                  percent
                  disabled={disabled}
                />
                <TextField
                  control={control}
                  name={`discountTiers.${index}.note`}
                  label={`Ghi chú mốc ${index + 1}`}
                  placeholder="Ghi chú ưu đãi…"
                  disabled={disabled}
                />
                <Button
                  className={styles.deleteButton}
                  type="text"
                  danger
                  icon={<DeleteOutlined aria-hidden="true" />}
                  aria-label={`Xóa mốc ưu đãi ${index + 1}`}
                  onClick={() => remove(index)}
                  disabled={disabled}
                >
                  <span className={styles.deleteText}>Xóa</span>
                </Button>
              </div>
            ))}
          </div>

          <div className={styles.tierFooter}>
            <Button
              icon={<PlusOutlined aria-hidden="true" />}
              disabled={disabled || nextUnusedMonths == null}
              onClick={() => append({ minMonths: nextUnusedMonths, percent: null, note: '' })}
            >
              Thêm mốc ưu đãi
            </Button>
            {crossError ? (
              <span className={styles.tierError} role="alert">
                ⚠ {crossError}
              </span>
            ) : null}
          </div>

          {legacyTiers?.length ? (
            <Alert
              type="warning"
              showIcon
              title={`${legacyTiers.length} mốc ưu đãi cũ theo NGÀY chưa quy đổi được sang gói`}
              description={
                <>
                  <span>
                    {legacyTiers
                      .map((tier) => `từ ${tier.minDays} ngày giảm ${tier.percent}%`)
                      .join(LIST_SEPARATOR)}
                  </span>
                  <br />
                  <span>
                    Các mốc này không còn được tính giá. Chọn lại mốc theo gói rồi lưu; hệ thống
                    không tự quy đổi để tránh thay đổi giá ngoài ý muốn.
                  </span>
                </>
              }
            />
          ) : null}
          <div className={styles.formulaCard}>
            <span className={styles.previewTitle}>Công thức tính giá gói:</span>
            <span className={styles.previewText}>
              giá_gói = giá_tháng × số_tháng − (giá_tháng × số_tháng × phần_trăm_giảm)
            </span>
          </div>
        </>
      ) : (
        <p className={styles.disabledNote}>Đang tắt — mọi lượt đặt tính nguyên giá thuê cơ bản.</p>
      )}
    </section>
  );
}

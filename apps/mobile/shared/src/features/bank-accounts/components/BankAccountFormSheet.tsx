import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { findBank, VIETNAM_BANKS } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { useErrorMessage } from '@/i18n/use-error-message';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import {
  BANK_ACCOUNT_SCOPE,
  type BankAccount,
  type BankAccountScope,
} from '@/api/bank-accounts/api';
import { useCreateBankAccount, useCreateChangeRequest } from '../hooks/use-bank-accounts';
import { BankAccountSavedSheet } from './BankAccountSavedSheet';
import { BankLogo } from './BankLogo';

/** Cỡ logo ở mỗi dòng ngân hàng — vuông 32px như dòng của web. */
const BANK_OPTION_LOGO = 32;
/** Figma `24228:102974`: chữ 14/22 của khối cảnh báo. */
const FIGMA_LH_22 = 22;
/** Logo tròn trước ngân hàng đã chọn trong ô (Figma 24). */
const BANK_VALUE_LOGO = 24;
import { bankAccountSaveOutcome } from '../current-account';

const BANK_CODE_MAX = 20;
const ACCOUNT_NUMBER_MAX = 40;
const ACCOUNT_NAME_MAX = 160;
const LABEL_MAX = 60;

/**
 * Khai một tài khoản nhận tiền — bản native của `BankAccountForm`.
 *
 * ## Ngân hàng là ô CHỌN, không phải ô gõ (16/09/2026)
 *
 * Trước đợt này nó là chữ tự do với gợi ý "VCB, ACB, TCB…" — ô nguy hiểm nhất trên đường tiền đi
 * ra. Mã gõ sai thì lệnh chuyển hoặc bị trả về sau vài ngày, hoặc trỏ về một nhà băng khác. Danh
 * mục sống ở `@xeprime/domain` (`VIETNAM_BANKS`), dùng chung với web và đúng bộ mã VietQR mà QR
 * trả cọc đang dùng.
 *
 * Ba ô bắt buộc, không có ô nào tuỳ tiện: ngân hàng và số tài khoản dựng nên lệnh chuyển,
 * còn TÊN CHỦ TÀI KHOẢN là thứ ngân hàng đối chiếu — sai tên thì lệnh bị trả về và tiền quay
 * lại sau vài ngày mà không ai biết vì sao. Vì thế ô tên có dòng nhắc riêng.
 *
 * ## Mỗi chủ MỘT tài khoản (PR #159, 07/10/2026)
 *
 * THÊM khi chưa có, ĐỔI khi đã có (`replacing`): server lưu trữ tài khoản cũ trong cùng
 * transaction. Không còn công tắc "mặc định" — luôn gửi `isDefault: true`, vì `false` khi đã có
 * tài khoản bị từ chối bằng `BANK_ACCOUNT_REPLACE_NOT_CONFIRMED`. Gửi lại đúng tài khoản đang
 * dùng thì server trả CÙNG id (chỉ đổi tên gợi nhớ) ⇒ báo "không đổi".
 */
export function BankAccountFormSheet({
  scope,
  open,
  onClose,
  onCreated,
  replacing = null,
  savedNotice = scope === BANK_ACCOUNT_SCOPE.ACCOUNT,
}: {
  scope: BankAccountScope;
  /**
   * Báo lưu thành công bằng HỘP "Thành công" thay cho toast — dáng `appearance="account"` của web
   * (tab Tài khoản thanh toán + lệnh rút của tài khoản khách). Luồng khai tài khoản nhận HOÀN
   * TIỀN của chuyến dùng dáng chuẩn (toast) như `RefundAccountDialog` web.
   */
  savedNotice?: boolean;
  /** Tài khoản đang dùng sẽ bị thay — có thì tấm này là luồng ĐỔI. */
  replacing?: BankAccount | null;
  open: boolean;
  onClose: () => void;
  /** Cho luồng RÚT: chọn sẵn tài khoản vừa khai, để khách không phải tự tìm lại nó. */
  onCreated?: (account: BankAccount) => void;
}) {
  const t = useTranslations('BankAccounts.form');
  const colors = useColors();
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const create = useCreateBankAccount(scope);
  /*
   * Đã có tài khoản ⇒ tài khoản KHOÁ (biên bản họp 19/11/2026, `BANK_ACCOUNT_LOCKED`): form gửi YÊU
   * CẦU đổi để XePrime gọi xác minh, không thay thẳng nữa - web `BankAccountForm` `requesting`.
   */
  const requesting = replacing != null;
  const request = useCreateChangeRequest(scope);
  const pending = create.isPending || request.isPending;
  /*
   * Lọc TẠI CHỖ, khác ô xã/phường.
   *
   * Danh mục ngân hàng là hằng nằm sẵn trong bundle (35 dòng), nên không có gì để hỏi server;
   * `SelectField` chỉ đẩy chữ đang gõ ra ngoài, còn lọc là việc của nơi gọi.
   */
  const [bankSearch, setBankSearch] = useState('');
  /** Câu của hộp "Thành công" (tài khoản khách); `null` = hộp đóng. */
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  /*
   * Nhãn ghép tên gọi hằng ngày + tên đầy đủ: VIB và VietinBank, SCB và Sacombank là bốn cái tên
   * mà người gõ vội chọn nhầm, và chọn nhầm ở đây là tiền đi sai chỗ. Tên ngân hàng KHÔNG dịch —
   * đó là tên riêng (ADR 0012).
   */
  const bankOptions = useMemo(() => {
    const needle = bankSearch.trim().toLowerCase();
    return VIETNAM_BANKS.filter(
      (bank) =>
        !needle ||
        bank.code.toLowerCase().includes(needle) ||
        bank.shortName.toLowerCase().includes(needle) ||
        bank.fullName.toLowerCase().includes(needle),
    ).map((bank) => ({
      value: bank.code,
      // Figma `24228:102448`: "Tên đầy đủ (Tên ngắn)", logo nhỏ trước giá trị đã chọn.
      label: `${bank.fullName} (${bank.shortName})`,
      // Logo trước tên — cùng danh sách chọn có logo của web (Figma `19973:52549`).
      leading: <BankLogo code={bank.code} size={BANK_OPTION_LOGO} radius={6} />,
      valueLeading: <BankLogo code={bank.code} size={BANK_VALUE_LOGO} radius={BANK_VALUE_LOGO / 2} />,
    }));
  }, [bankSearch]);

  const schema = useMemo(
    () =>
      yup.object({
        bankCode: yup.string().trim().required(t('validation.bankRequired')).max(BANK_CODE_MAX),
        accountNumber: yup
          .string()
          .trim()
          .required(t('validation.numberRequired'))
          // Cho phép khoảng trắng khi gõ/dán; server chuẩn hoá bỏ chúng trước khi lưu.
          .matches(/^[0-9\s]+$/, t('validation.numberDigits'))
          .max(ACCOUNT_NUMBER_MAX),
        accountName: yup
          .string()
          .trim()
          .required(t('validation.nameRequired'))
          .max(ACCOUNT_NAME_MAX),
        label: yup.string().trim().max(LABEL_MAX).default(''),
      }),
    [t],
  );

  const { control, handleSubmit, reset } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      bankCode: '',
      accountNumber: '',
      accountName: '',
      label: '',
    },
  });

  const replacingLabel = replacing
    ? `${findBank(replacing.bankCode)?.shortName ?? replacing.bankCode} (***${replacing.accountNumberMasked.replace(/\D/g, '').slice(-4)})`
    : '';

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit((values) => {
    if (pending) return;
    if (requesting) {
      request.mutate(
        {
          bankCode: values.bankCode,
          accountNumber: values.accountNumber,
          accountName: values.accountName,
          ...(values.label ? { label: values.label } : {}),
        },
        {
          onSuccess: () => {
            toast.showSuccess(t('requestSent'));
            close();
          },
          onError: (error) => toast.showError(errorMessage(error)),
        },
      );
      return;
    }
    create.mutate(
      {
        bankCode: values.bankCode,
        accountNumber: values.accountNumber,
        accountName: values.accountName,
        ...(values.label ? { label: values.label } : {}),
        // Một chủ một tài khoản: lưu là THAY tài khoản đang dùng (server lưu trữ cái cũ).
        isDefault: true,
      },
      {
        onSuccess: (account) => {
          const outcome = bankAccountSaveOutcome(replacing, account);
          /*
           * Tài khoản KHÁCH: hộp "Thành công" (Figma `19973:52952`) thay toast — như dáng
           * `account` của web. Khai lại đúng tài khoản đang dùng thì server không đổi gì ⇒ toast
           * "không đổi", không chúc mừng một việc chưa xảy ra.
           */
          if (savedNotice && outcome !== 'unchanged') {
            setSavedMessage(t(outcome));
          } else if (scope === BANK_ACCOUNT_SCOPE.SHOP && outcome !== 'unchanged') {
            // Site partner (web `appearance="partner"`, PR #276): câu đầy đủ nói tiền đi đâu tiếp.
            toast.showSuccess(replacing ? t('saved.changedDetail') : t('saved.createdDetail'));
          } else {
            toast.showSuccess(t(outcome));
          }
          reset();
          onCreated?.(account);
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  return (
    <>
      {/*
        Figma "Đổi tài khoản nhận tiền" (`24228:102833`): ô theo thứ tự Ngân hàng - Họ tên người
        thụ hưởng - Số tài khoản - Tên gợi nhớ, icon nét trong ô, chân tấm cố định hai nút Hủy /
        Xác nhận chia đôi. Luồng vẫn là YÊU CẦU đổi khi tài khoản đã khoá (giữ ô "Lý do đổi").
      */}
      <BottomSheet
        open={open}
        onClose={close}
        title={requesting ? t('requestTitle') : t('title')}
        footer={
          <XStack gap={space.sm}>
            <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
              <Button
                label={tCommon('cancel')}
                variant="secondary"
                disabled={pending}
                onPress={close}
              />
            </YStack>
            <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
              <Button
                variant="gradient"
                label={
                  requesting
                    ? t('requestSubmit')
                    : scope === BANK_ACCOUNT_SCOPE.SHOP
                      ? t('addSubmit')
                      : t('submit')
                }
                loading={pending}
                onPress={() => void onSubmit()}
              />
            </YStack>
          </XStack>
        }
      >
        <YStack gap={space.md}>
          {replacing ? (
            /*
              Figma: khối nền cam nhạt, không viền/icon, chữ cam 14/20, tên ngân hàng + 4 số cuối in
              đậm (người dùng chốt 26/11/2026 dùng câu của Figma).
            */
            <YStack bg={colors.warningSubtle} br={radius.control} p={toPx(XP_TOKENS['space-12'])}>
              <Text col={colors.warningVivid} fos={typeScale.body.fontSize} lh={FIGMA_LH_22}>
                {t.rich('replaceIntro', {
                  account: replacingLabel,
                  b: (chunks) => (
                    <Text
                      col={colors.warningVivid}
                      fos={typeScale.body.fontSize}
                      lh={FIGMA_LH_22}
                      fow={fontWeight.semibold}
                      fontFamily={FONT_FAMILY.semibold}
                    >
                      {chunks}
                    </Text>
                  ),
                })}
              </Text>
            </YStack>
          ) : null}
          {/* Ba mươi lăm nhà băng — gõ vài chữ nhanh hơn cuộn, đúng `showSearch` của web. */}
          <SelectField
            control={control}
            name="bankCode"
            label={t('bankCode')}
            options={bankOptions}
            placeholder={t('bankCodePlaceholder')}
            onSearch={setBankSearch}
            searchPlaceholder={t('bankCodePlaceholder')}
            emptyText={t('bankNotFound')}
            required
          />
          <TextField
            control={control}
            name="accountName"
            label={t('accountName')}
            icon="person-outline"
            hint={t('accountNameHint')}
            placeholder={t('accountNamePlaceholder')}
            autoCapitalize="characters"
            required
          />
          <TextField
            control={control}
            name="accountNumber"
            label={t('accountNumber')}
            icon="scan-outline"
            placeholder={t('accountNumberPlaceholder')}
            keyboardType="number-pad"
            required
          />
          <TextField
            control={control}
            name="label"
            label={t('label')}
            icon="text-outline"
            placeholder={t('labelPlaceholder')}
          />
        </YStack>
      </BottomSheet>
      {/* Hộp đứng NGOÀI tấm form: tấm đã đóng sau khi lưu, hộp vẫn phải còn để báo. */}
      <BankAccountSavedSheet
        open={savedMessage !== null}
        message={savedMessage ?? ''}
        onClose={() => setSavedMessage(null)}
      />
    </>
  );
}

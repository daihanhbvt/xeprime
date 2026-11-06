import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { PLAN_FEATURE } from '@xeprime/types';
import { Chip } from '@/components/ui/Chip';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';

export const TRANSACTION_HISTORY_VIEW = { LEDGER: 'ledger', DEBTS: 'debts' } as const;
export type TransactionHistoryView =
  (typeof TRANSACTION_HISTORY_VIEW)[keyof typeof TRANSACTION_HISTORY_VIEW];

const VIEWS: readonly TransactionHistoryView[] = [
  TRANSACTION_HISTORY_VIEW.LEDGER,
  TRANSACTION_HISTORY_VIEW.DEBTS,
];

/**
 * Hai tab của "Lịch sử giao dịch" — bản native của nút chuyển `Segmented` ở `/manage/receipts`
 * (web, PR #276): "Giao dịch thu chi" và "Công nợ". Web gộp hai màn vào MỘT route; app giữ hai
 * màn (mỗi màn một bộ lọc riêng — đúng như web đi tới URL sạch của tab kia), dải tab này nối chúng.
 *
 * Tab Công nợ mang cờ gói RIÊNG (`PLAN_FEATURE.DEBTS`): gói không có thì dải tab vắng hẳn, như web.
 * Đổi tab là THAY màn (`replace`), không chồng thêm một tầng để nút lui quay vòng giữa hai tab.
 */
export function TransactionHistoryTabs({ value }: { value: TransactionHistoryView }) {
  const t = useTranslations('Finance.history.views');
  const debts = useFeature(PLAN_FEATURE.DEBTS);

  if (!debts.isVisible) return null;

  return (
    <View style={styles.row} accessibilityLabel={t('label')}>
      {VIEWS.map((view) => (
        <Chip
          key={view}
          label={t(view)}
          selected={value === view}
          size="sm"
          onPress={() => {
            if (view === value) return;
            router.replace(
              view === TRANSACTION_HISTORY_VIEW.DEBTS
                ? ROUTES.manage.debts()
                : ROUTES.manage.receipts(),
            );
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
  },
});

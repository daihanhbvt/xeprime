import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { IconButton } from '@/components/ui/IconButton';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { BANK_ACCOUNT_SCOPE, type BankAccountScope } from '@/api/bank-accounts/api';
import { BankAccountList } from './components/BankAccountList';

/**
 * MÀN tài khoản nhận tiền — chỉ còn cái VỎ.
 *
 * Thân danh sách sống ở [`BankAccountList`](./components/BankAccountList.tsx) vì nó có HAI chỗ
 * đứng, đúng như web: màn riêng này, và khối tiền trong "Tài khoản của tôi"
 * (`AccountMoneyPanel`). Chép danh sách ra hai bản là hai chỗ phải sửa mỗi lần đổi luật xoá/đặt
 * mặc định — và hai chỗ để chúng nói khác nhau.
 *
 * KHÔNG gác bằng `OwnerGate`: khách thuê cũng cần khai tài khoản để nhận tiền hoàn cọc, và họ là
 * phần đông người dùng — đúng như web để trang này ngoài cổng chủ xe.
 *
 * **Thêm tài khoản nằm ở GÓC PHẢI thanh trên** khi đứng thành một màn: sổ này gần như luôn có
 * đúng một, hai dòng, và một nút to bằng cả bề ngang đứng trên hai thẻ đọc ra như thứ chính của
 * màn, trong khi thứ chính là chính các tài khoản.
 */
export function BankAccountListScreen({
  scope = BANK_ACCOUNT_SCOPE.ACCOUNT,
}: {
  scope?: BankAccountScope;
}) {
  const t = useTranslations('BankAccounts');
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
        right={
          <IconButton
            icon="add"
            tone="accent"
            label={t('actions.add')}
            onPress={() => setFormOpen(true)}
          />
        }
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <BankAccountList
          scope={scope}
          formOpen={formOpen}
          onFormOpenChange={setFormOpen}
          /* Nút thêm đã nằm ở góc phải thanh trên — thân danh sách không dựng nút thứ hai. */
          showAddButton={false}
        />
      </Screen>
    </>
  );
}

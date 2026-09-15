import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OWNER_STAGE } from '@xeprime/types';

import { OwnerGate } from '@/features/account/components/OwnerGate';
import { OwnerRegistrationView } from '@/features/account/components/OwnerRegistrationView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('registration'), robots: { index: false, follow: false } };
}

/**
 * `/account/registration` — tiến trình đăng ký chủ xe, và là màn "Hồ sơ chủ xe" về sau.
 *
 * Cổng ở mức `registering`: đây chính là màn của bậc đó, nên đòi bậc `owner` sẽ khoá đúng những
 * người duy nhất cần nó.
 */
export default function AccountRegistrationPage() {
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <OwnerRegistrationView />
    </OwnerGate>
  );
}

import { Redirect, usePathname, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { PARTNER_HANDOFF_INTENT, PARTNER_HANDOFF_PATHNAME, ROUTES } from '@/navigation/routes';

/**
 * Đường Owner Lite CŨ của app khách (trước ADR 0053) — push/deep link đã phát trước đây vẫn có thể
 * mở chúng. Không còn màn nào ở đây: chuyển sang màn handoff mở app Partner thay vì "không tìm thấy".
 */
const LEGACY_OWNER_LITE = [
  '/account/vehicles',
  '/account/calendar',
  '/account/earnings',
  '/account/subscription',
  '/account/tax',
  '/account/registration',
  '/account/host-guide',
  '/account/contracts-documents',
  '/account/data-protection',
  '/partner/register',
  '/partner/success',
  '/list-your-vehicle/register',
];

function isLegacyOwnerLite(pathname: string): boolean {
  return LEGACY_OWNER_LITE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function NotFoundScreen() {
  const router = useRouter();
  // Chữ chung với trang 404 của web (`Common.statePages`, Figma `22306:65272`).
  const tState = useTranslations('Common.statePages');
  const pathname = usePathname() ?? '';

  if (isLegacyOwnerLite(pathname)) {
    return (
      <Redirect
        href={{
          pathname: PARTNER_HANDOFF_PATHNAME,
          params: { intent: PARTNER_HANDOFF_INTENT.REGISTER },
        }}
      />
    );
  }

  return (
    <Screen scroll={false} centered>
      <ScreenMessage
        kind="not-found"
        title={tState('notFound.title')}
        description={tState('notFound.description')}
        actionLabel={tState('backHome')}
        onAction={() => router.replace(ROUTES.root.index())}
      />
    </Screen>
  );
}

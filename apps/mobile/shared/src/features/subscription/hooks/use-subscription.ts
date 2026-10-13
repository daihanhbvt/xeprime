import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { subscriptionApi } from '@/api/subscription/api';

/** Bản native của `features/subscription/hooks/use-subscription.ts` — cùng khoá, cùng luật. */
export function useMySubscription(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.me(),
    queryFn: () => subscriptionApi.me(),
    enabled,
  });
}


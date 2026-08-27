import { isUnauthenticated } from '@/lib/api-client';
import { useCurrentUser } from './use-auth';

export const SESSION_STATUS = {
  LOADING: 'loading',
  UNAUTHENTICATED: 'unauthenticated',
  UNREACHABLE: 'unreachable',
  READY: 'ready',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export interface SessionGate {
  status: SessionStatus;
  error: unknown;
  retry: () => void;
}

export function useSessionGate(): SessionGate {
  const me = useCurrentUser();

  const status: SessionStatus = me.isPending
    ? SESSION_STATUS.LOADING
    : !me.isError
      ? SESSION_STATUS.READY
      : isUnauthenticated(me.error)
        ? SESSION_STATUS.UNAUTHENTICATED
        : SESSION_STATUS.UNREACHABLE;

  return { status, error: me.error, retry: () => void me.refetch() };
}

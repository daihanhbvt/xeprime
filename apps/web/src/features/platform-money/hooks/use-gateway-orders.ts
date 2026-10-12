'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  applyGatewayOrder,
  fetchGatewayOrderDetail,
  fetchGatewayOrders,
  gatewayOrderFiltersToParams,
  requeryGatewayOrder,
  resolveGatewayOrder,
} from '../api';
import type {
  ApplyPaymentOrderInput,
  GatewayOrderFilters,
  ResolvePaymentOrderInput,
} from '../types';

/** Hàng đợi lượt thanh toán qua cổng — lọc/phân trang ở server, giữ trang cũ khi đổi lọc. */
export function useGatewayOrders(filters: GatewayOrderFilters) {
  return useQuery({
    queryKey: queryKeys.platformMoney.gatewayOrders(gatewayOrderFiltersToParams(filters)),
    queryFn: () => fetchGatewayOrders(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Chi tiết một lượt. `staleTime: 0`: tình trạng của khoản đích (hoá đơn/giữ chỗ) đổi theo tiền về
 * bằng mọi đường — người trực phải thấy con số của BÂY GIỜ trước khi đóng lượt.
 */
export function usePlatformGatewayOrder(id: string | null) {
  return useQuery({
    queryKey: queryKeys.platformMoney.gatewayOrder(id ?? ''),
    queryFn: () => fetchGatewayOrderDetail(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/**
 * Một thao tác trên lượt có thể vừa bật gói / tạo đơn (truy vấn lại thấy đã thu), nên làm mới cả nhánh
 * tiền (số đếm hàng đợi, đối soát ngày) lẫn nhánh gói.
 */
function useInvalidateAfterHandling() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformMoney.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
  };
}

export function useResolveGatewayOrder() {
  const invalidate = useInvalidateAfterHandling();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ResolvePaymentOrderInput) =>
      resolveGatewayOrder(id, body),
    onSuccess: invalidate,
  });
}

export function useApplyGatewayOrder() {
  const invalidate = useInvalidateAfterHandling();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ApplyPaymentOrderInput) =>
      applyGatewayOrder(id, body),
    onSuccess: invalidate,
  });
}

export function useRequeryGatewayOrder() {
  const invalidate = useInvalidateAfterHandling();
  return useMutation({
    mutationFn: (id: string) => requeryGatewayOrder(id),
    onSuccess: invalidate,
  });
}

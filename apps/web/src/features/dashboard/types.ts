import type { components } from '@xeprime/types';

/** Type Tổng quan partner lấy từ contract OpenAPI (ADR 0007) — không khai tay. */
type Schemas = components['schemas'];

export type PartnerOverview = Schemas['PartnerDashboardOverviewDto'];
export type PartnerOverviewToday = Schemas['PartnerDashboardTodayDto'];
export type PartnerOverviewRequests = Schemas['PartnerDashboardRequestsDto'];
export type PartnerOverviewAgenda = Schemas['PartnerDashboardAgendaDto'];
export type PartnerAgendaItem = Schemas['PartnerDashboardAgendaItemDto'];
export type PartnerOverviewMonth = Schemas['PartnerDashboardMonthDto'];
export type PartnerTrendPoint = Schemas['PartnerDashboardTrendPointDto'];
export type PartnerOverviewMarket = Schemas['PartnerDashboardMarketDto'];

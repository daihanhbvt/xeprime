/**
 * `@xeprime/api-client` — MỘT client HTTP cho mọi client của XePrime.
 *
 * Không có `next/*`, không có `antd`, không có DOM API, không có React. Emit CommonJS
 * (`packages/config/tsconfig/lib.json`) nên Metro của React Native đọc được trực tiếp.
 *
 * Cách cấu hình ở mỗi app: xem `README.md` của package.
 */
export { STALE_TIME } from './cache';

export {
  createApiClient,
  configureApiClient,
  getApiClient,
  getApiBaseUrl,
  apiRequest,
  apiGet,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
  fetchPage,
  type ApiClient,
  type ApiClientOptions,
  type ApiRequestOptions,
  type Paged,
} from './client';

export {
  ApiClientError,
  CLIENT_ERROR_CODE,
  getErrorCode,
  isRetriableError,
  isUnauthenticated,
  toApiClientError,
  toNetworkError,
  type ClientErrorCode,
} from './errors';

export {
  anonymousAuthTransport,
  bearerAuthTransport,
  webAuthTransport,
  type AuthCredentials,
  type AuthTransport,
} from './transport';

export {
  buildUrl,
  encodeQuery,
  normalizeBaseUrl,
  type QueryParams,
  type QueryParamValue,
} from './url';

export {
  platformFetch,
  type AbortSignalLike,
  type FetchCredentials,
  type FetchInit,
  type FetchLike,
  type FetchResponse,
} from './http';

export { queryKeys } from './query-keys';

export {
  catalogApi,
  catalogLabel,
  groupCatalog,
  EMPTY_CATALOG,
  type CatalogItem,
  type CatalogMap,
} from './features/catalog';

export {
  marketplaceApi,
  toListingQueryParams,
  publicQuote,
  deliveryDistance,
  DEFAULT_LISTING_LIMIT,
  type PublicQuote,
  type PublicQuoteParams,
  type DeliveryDistance,
} from './features/marketplace/api';
export { authApi, mobileAuthApi } from './features/auth/api';
export type {
  CurrentUser,
  ForgotPasswordInput,
  LoginInput,
  MobileLoginInput,
  MobileLogoutInput,
  MobileRefreshInput,
  MobilePhoneLoginInput,
  MobileRegisterInput,
  MobileSession,
  MobileSocialExchangeInput,
  MobileTokenPair,
  RegisterInput,
  ResetPasswordInput,
  SetPasswordInput,
} from './features/auth/types';

// Booking / Rental (BKG-01 → 16, FIN-05/06)
export {
  bookingRequestsApi,
  bookingRequestFiltersToParams,
  BOOKING_REQUESTS_DEFAULT_LIMIT,
  BOOKING_REQUEST_STATUS_ALL,
  BUSY_DAYS_LOOKAHEAD,
  type ApproveBookingRequestInput,
  type BookingRequestConversation,
  type BookingRequestFilters,
  type BookingRequestItem,
  type BookingRequestListMeta,
  type BookingRequestListResult,
  type BookingRequestReceipt,
  type BookingRequestStatusCount,
  type CheckAvailabilityInput,
  type CheckAvailabilityResult,
  type CreateBookingRequestInput,
  type VehicleBusyDays,
} from './features/booking-requests/api';

export {
  tripsApi,
  tripsToParams,
  TRIPS_DEFAULT_LIMIT,
  type CustomerSurcharge,
  type CustomerTrip,
  type CustomerTripCounts,
  type CustomerTripDetail,
  type CustomerTripFinance,
  type CustomerTripHandoverEvidence,
  type CustomerTripHandoverEvidencePhoto,
  type CustomerTripReview,
  type PrivateFileTicket,
  type TripsResult,
} from './features/trips/api';

export {
  bookingsApi,
  bookingFiltersToParams,
  BOOKINGS_DEFAULT_LIMIT,
  type BookingDetail,
  type BookingDriverSummary,
  type BookingFilters,
  type BookingListItem,
  type BookingSort,
  type CheckConflictInput,
  type QuoteBreakdown,
  type StaffQuoteParams,
  type CheckConflictResult,
  type CreateBookingInput,
  type TransitionBookingInput,
  type UpdateBookingInput,
  type UpdateDeliveryFeeInput,
} from './features/bookings/api';

export {
  driversApi,
  type AssignableDriver,
  type AssignableWindow,
  type Driver,
} from './features/drivers/api';

export {
  contractsApi,
  type Contract,
  type ContractSnapshot,
} from './features/contracts/api';

export {
  handoversApi,
  type ConfirmHandoverInput,
  type Handover,
  type HandoverBelowPickupDetails,
  type HandoverContext,
  type HandoverDownload,
  type HandoverPhoto,
  type HandoverPresign,
  type HandoverSuspicionDetails,
  type HandoverUploadMeta,
  type MissingOdometerItem,
  type ResolveOdometerInput,
  type SaveHandoverInput,
} from './features/handovers/api';

export { paymentsApi, type Payment, type RecordPaymentInput } from './features/payments/api';

export {
  settlementApi,
  type BookingSettlement,
  type BookingSurcharge,
  type CorrectRefundInput,
  type DepositRefund,
  type OvertimeSuggestion,
  type RecordRefundInput,
  type SaveSurchargeInput,
} from './features/settlement/api';


export { reviewsApi, type CreateReviewInput } from './features/reviews/api';

// Vehicle (VEH-01 → 12)
export {
  vehiclesApi,
  vehicleFiltersToParams,
  VEHICLES_DEFAULT_LIMIT,
  type CreateVehicleInput,
  type FleetSummary,
  type RentalPolicyValues,
  type SaveRentalPolicyInput,
  type SaveVehiclePricingInput,
  type SaveVehicleSourceInput,
  type ShopRentalPolicy,
  type SourceContractDownload,
  type SourceContractPresign,
  type UpdateVehicleInput,
  type UploadMeta,
  type UploadPresign,
  type Vehicle360Summary,
  type VehicleAlertGroup,
  type VehicleAlertItem,
  type VehicleBookingBrief,
  type VehicleDetail,
  type VehicleFilters,
  type VehicleListItem,
  type VehiclePricing,
  type VehicleSort,
  type VehicleSource,
  type VehicleSourceContractFile,
  type VehicleSourceDetail,
  type VehicleStats,
} from './features/vehicles/api';

export { branchesApi, branchLabel, type Branch, type BranchList } from './features/branches/api';

export {
  vehicleDocumentsApi,
  type ApplyOcrFieldsInput,
  type DocumentDownload,
  type DocumentPresign,
  type SaveVehicleDocumentInput,
  type VehicleDocumentDetail,
  type VehicleDocumentOcrFieldResult,
  type VehicleDocumentOcrJob,
  type VehicleDocumentSummary,
  type VehicleDocumentVersion,
} from './features/vehicle-documents/api';

export {
  maintenanceApi,
  maintenanceBoardToParams,
  MAINTENANCE_DEFAULT_LIMIT,
  type CompleteMaintenanceInput,
  type CorrectOdometerInput,
  type MaintenanceAttachment,
  type MaintenanceBoardFilters,
  type MaintenanceBoardItem,
  type MaintenanceBoardSummary,
  type MaintenanceDownload,
  type MaintenancePresign,
  type MaintenanceProfile,
  type MaintenanceRecord,
  type OdometerReading,
  type SaveMaintenanceProfileInput,
  type SaveMaintenanceRecordInput,
} from './features/vehicle-maintenance/api';

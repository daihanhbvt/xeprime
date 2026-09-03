// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { tripsApi, tripsToParams, TRIPS_DEFAULT_LIMIT } from '@xeprime/api-client';
export { reviewsApi } from '@xeprime/api-client';

export type {
  CreateReviewInput,
  CustomerSurcharge,
  CustomerTrip,
  CustomerTripCounts,
  CustomerTripDetail,
  CustomerTripFinance,
  CustomerTripHandoverEvidence,
  CustomerTripHandoverEvidencePhoto,
  CustomerTripReview,
  PrivateFileTicket,
  TripsResult,
} from '@xeprime/api-client';

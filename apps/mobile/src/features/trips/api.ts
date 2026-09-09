// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { tripsApi, tripsToParams, TRIPS_DEFAULT_LIMIT } from '@/api/trips/api';
export { reviewsApi } from '@/api/reviews/api';

export type { CreateReviewInput } from '@/api/reviews/api';
export type {
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
} from '@/api/trips/api';

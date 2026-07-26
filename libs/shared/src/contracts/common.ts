/** Generic paginated response envelope for list endpoints. */
export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

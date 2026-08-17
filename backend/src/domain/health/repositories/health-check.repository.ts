export const HEALTH_CHECK_REPOSITORY = Symbol('HEALTH_CHECK_REPOSITORY');

export interface HealthCheckRepository {
  ping(): Promise<boolean>;
}

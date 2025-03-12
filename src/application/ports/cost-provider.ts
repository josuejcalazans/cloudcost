import type {
  CostRecord,
  ProviderId,
} from '../../domain/entities/cost-record.ts';
import type { DateRange } from '../../domain/value-objects/date-range.ts';

export interface CostQuery {
  provider: ProviderId;
  range: DateRange;
}

/**
 * Port implemented by cloud adapters (OCI, AWS, ...). Adapters receive the
 * full query and are responsible for mapping native API rows to CostRecords.
 */
export interface CostProvider {
  readonly id: ProviderId;
  fetch(query: CostQuery): Promise<CostRecord[]>;
}

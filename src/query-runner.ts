import { Pool, RowDataPacket } from 'mysql2/promise';
import { Logger } from './logger';

interface WaitResult extends RowDataPacket {
  wait_code: 0 | 1 | null; // the only possible values
}

interface GtidExecutedResult extends RowDataPacket {
  gtid_executed: string;
}

const SUCCESS = 0;
const TIMEOUT = 1;
const ERROR = 2;
type Success = typeof SUCCESS;
type Timeout = typeof TIMEOUT;
type Error = typeof ERROR;

type WaitForReplicationResult = Timeout | Success | Error;

type WaitForReplicationOptions = {
  /** milliseconds to wait for replication at most */
  timeout: number;
  logger?: Logger;
};

export function isSuccessfulReplication(result: WaitForReplicationResult) {
  return result === SUCCESS;
}
// TODO: wrap writes in a way that

/**
 * Get the latest GTID executed on a connection after a write operation
 * This should be called on the same connection that performed the write
 */
export async function getGtidExecuted(pool: Pool): Promise<string | null> {
  const [[row]] = await pool.query<GtidExecutedResult[]>(
    'SELECT @@SESSION.gtid_executed AS gtid_executed',
  );

  return row?.gtid_executed || null;
}

export async function waitForReplication(
  pool: Pool,
  {
    gtidSet,
  }: {
    gtidSet: string;
  },
  { logger, timeout }: WaitForReplicationOptions,
): Promise<WaitForReplicationResult> {
  const [[row]] = await pool.query<WaitResult[]>(
    'SELECT WAIT_UNTIL_SQL_THREAD_AFTER_GTIDS(?, ?)',
    [gtidSet, timeout / 1000],
  );

  switch (row?.wait_code) {
    case SUCCESS:
      logger?.debug({ gtidSet }, 'GTID replication complete');
      return SUCCESS;
    case TIMEOUT:
      logger?.warn({ gtidSet }, 'Timeout waiting for GTID replication');
      return TIMEOUT;
    default:
      logger?.error(
        { gtidSet },
        'Something went wrong waiting for GTID replication. check replication settings',
      );
      return ERROR;
  }
}

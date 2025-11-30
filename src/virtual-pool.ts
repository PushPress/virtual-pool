import { createPool, Pool, PoolOptions } from 'mysql2/promise';
import { Logger } from './logger';
import { ReplicaSelector } from './replica-selector';
import { isSelectQuery } from './mysql-parser';
import {
  GTID_CONTEXT_ENABLED_MODE,
  PoolMode as Mode,
  REPLICA_SELECTION_MODE,
  includesMode,
} from './pool-modes';
import { isSuccessfulReplication, waitForReplication } from './query-runner';
import { getGtid } from './dd-trace-provider';

/**
 * Configuration options for a virtual pool
 */
export interface VirtualPoolOptions {
  logger?: Logger;
  primary: PoolOptions;
  timeout?: number;
  replicas: PoolOptions[];
  mode: Mode;
}

/**
 * Create a proxy that routes queries between primary and replica pools
 */
function createPoolProxy({
  primary,
  replicas,
  logger,
  mode,
  timeout,
}: {
  primary: Pool;
  replicas: Pool[];
  logger?: Logger;
  timeout?: number;
  mode: Mode;
}): Pool {
  const selector = new ReplicaSelector({
    logger,
    replicas,
  });

  const includesReplicaSelection = includesMode(mode, REPLICA_SELECTION_MODE);
  const includesGtidContext = includesMode(mode, GTID_CONTEXT_ENABLED_MODE);

  // Cache the query function to avoid recreating it on every access
  const queryFunction = async function (
    this: Pool,
    ...args: Parameters<Pool['query']>
  ) {
    const { sql } = args[0];

    if (isSelectQuery(sql) && includesReplicaSelection) {
      let gtid: string | undefined;
      let selected: Pool;

      selected = selector.getNextReplica() ?? primary;
      // only read gtid context if it is enabled
      if (includesGtidContext) {
        gtid = getGtid();
      }

      if (gtid) {
        const result = await waitForReplication(
          selected,
          {
            gtidSet: gtid,
          },
          { logger, timeout: timeout ?? 0.05 }, // default to wait 50ms
        );

        // Fallback to primary if wait for replica is unsuccessful
        if (!isSuccessfulReplication(result)) {
          logger?.warn(
            {
              sql: sql.substring(0, 100) as string,
              gtid: gtid,
            },
            "Replica didn't respond in time, falling back to primary",
          );
          selected = primary;
        }
      } else {
        logger?.debug('No GTID context found, skipping to replica');
      }
      return selected.query(...args);
    }

    // Default to primary for unrecognized queries (safer for writes)
    logger?.debug(
      {
        sql: sql.substring(0, 100) as string,
      },
      'Routing unrecognized query to primary (defaulting to write behavior)',
    );

    // TODO: apply wrapper to get gtid on unsuccessful write
    return primary.query(...args);
  } as Pool['query'];

  return new Proxy(primary, {
    async get(target, prop, receiver) {
      // test connections on replicas before testing the primary
      if (prop === 'ping') {
        await Promise.all(replicas.map((replica) => replica.ping()));
        return Reflect.get(target, prop, receiver);
      }

      if (prop === 'destroy') {
        replicas.forEach((replica) => replica.destroy());
        return Reflect.get(target, prop, receiver);
      }

      // Return cached query function
      if (prop === 'query') {
        return queryFunction;
      }

      // For all other properties, use default behavior
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Create a virtual pool that automatically routes queries between primary and replicas
 */
export const createVirtualPool = (options: VirtualPoolOptions): Pool => {
  const primary = createPool(options.primary);

  if (includesMode(options.mode, GTID_CONTEXT_ENABLED_MODE)) {
    // track session ids so they are returned on writes
    primary.on('connection', async (conn) => {
      await conn.query('SET SESSION session_track_gtids = OWN_GTID');
      options.logger?.info('GTID context enabled');
    });
  }

  const replicas = options.replicas.map((replicaConfig) =>
    createPool(replicaConfig),
  );

  return createPoolProxy({
    ...options,
    primary,
    replicas,
  });
};

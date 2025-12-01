import tracer from 'dd-trace';

export function setGtid(gtid: string) {
  const span = tracer.scope().active();
  if (span) {
    span.setBaggageItem('vitual-pool.gtid', gtid);
  }
  return span;
}

export function getGtid() {
  const span = tracer.scope().active();
  if (span) {
    return span.getBaggageItem('vitual-pool.gtid');
  }
}

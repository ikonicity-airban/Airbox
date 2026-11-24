const test = require("node:test");
const assert = require("node:assert");
const {
  getDomainConcurrency,
  getInitialDomainConcurrency,
  recordDomainBatchSuccess,
  resetDomainConcurrency
} = require("./domainConcurrency");
test("DomainConcurrency should maintain a floor of 4 on slow CDN throughput without 429", async () => {
  const domain = "test-slow-domain.top";
  resetDomainConcurrency(domain);
  let conc = await getInitialDomainConcurrency(domain, 8);
  assert.strictEqual(conc, 8);
  recordDomainBatchSuccess(domain, 25 * 1024 * 1024);
  conc = await getDomainConcurrency(domain);
  assert.ok(conc >= 6, `Expected conc >= 6, got ${conc}`);
  recordDomainBatchSuccess(domain, 80 * 1024);
  recordDomainBatchSuccess(domain, 70 * 1024);
  recordDomainBatchSuccess(domain, 30 * 1024);
  recordDomainBatchSuccess(domain, 20 * 1024);
  recordDomainBatchSuccess(domain, 10 * 1024);
  recordDomainBatchSuccess(domain, 5 * 1024);
  recordDomainBatchSuccess(domain, 1 * 1024);
  conc = await getDomainConcurrency(domain);
  assert.ok(conc >= 4, `Expected concurrency to stay >= 4 on slow throughput, got ${conc}`);
});
test("DomainConcurrency should ignore stale failure records older than 30 minutes", async () => {
  const { run } = require("./db");
  const staleDomain = "stale-failure-domain.com";
  resetDomainConcurrency(staleDomain);
  const oneHourAgo = Date.now() - 60 * 60 * 1e3;
  await run(
    `INSERT OR REPLACE INTO DomainConcurrency (domain, current_concurrency, max_concurrency, total_requests, failed_requests, updated_at)
     VALUES (?, 4, 4, 10, 5, ?)`,
    [staleDomain, oneHourAgo]
  );
  const conc = await getInitialDomainConcurrency(staleDomain, 8);
  assert.strictEqual(conc, 8, `Expected initial concurrency 8, got ${conc}`);
});

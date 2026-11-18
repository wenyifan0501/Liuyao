// Quota policy switch. Limits are off by default so the current internal test
// round can use the site without trial counts, follow-up caps or daily budgets.
// Set WEB_QUOTA_ENFORCED=true before opening to a larger audience; the ledger,
// reservation and budget tables stay in place, so no migration is needed.
const raw = (process.env.WEB_QUOTA_ENFORCED ?? "").trim().toLowerCase();
export const quotaEnforced = ["true", "1", "yes", "on"].includes(raw);

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Six-hourly collection keeps daily insights fresh without hammering Meta's
// rate limits. Manual sync remains available between runs.
crons.interval(
  "instagram analytics sync",
  { hours: 6 },
  internal.instagram.scheduledSync,
  {},
);

export default crons;

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "global-reddit-fetch",
  { minutes: 5 },
  internal.reddit.globalFetch,
  {}
);

export default crons;

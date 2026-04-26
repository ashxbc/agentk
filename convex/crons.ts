import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "global-reddit-fetch",
  { minutes: 15 },
  internal.reddit.globalFetch,
  {}
);

export default crons;

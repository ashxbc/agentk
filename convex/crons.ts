import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup-expired-reddit-results",
  { hours: 1 },
  internal.reddit.deleteExpiredResults
);

crons.interval(
  "auto-fetch-for-telegram-users",
  { minutes: 2 },
  internal.telegram.fetchForConnectedUsers
);

export default crons;

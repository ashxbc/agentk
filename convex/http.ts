import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { telegramWebhook } from "./telegram";
import { discordWebhook } from "./discord";
import { proxyHealthEndpoint } from "./reddit";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/telegram",
  method: "POST",
  handler: telegramWebhook,
});

http.route({
  path: "/discord",
  method: "POST",
  handler: discordWebhook,
});

http.route({
  path: "/proxy-health",
  method: "GET",
  handler: proxyHealthEndpoint,
});

export default http;

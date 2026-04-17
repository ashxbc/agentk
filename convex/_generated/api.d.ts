/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentTokens from "../agentTokens.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as clearDevData from "../clearDevData.js";
import type * as crons from "../crons.js";
import type * as devices from "../devices.js";
import type * as discord from "../discord.js";
import type * as http from "../http.js";
import type * as reddit from "../reddit.js";
import type * as telegram from "../telegram.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as webhookDodo from "../webhookDodo.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentTokens: typeof agentTokens;
  auth: typeof auth;
  billing: typeof billing;
  clearDevData: typeof clearDevData;
  crons: typeof crons;
  devices: typeof devices;
  discord: typeof discord;
  http: typeof http;
  reddit: typeof reddit;
  telegram: typeof telegram;
  userSettings: typeof userSettings;
  users: typeof users;
  webhookDodo: typeof webhookDodo;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

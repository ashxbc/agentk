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
import type * as crons from "../crons.js";
import type * as devices from "../devices.js";
import type * as discord from "../discord.js";
import type * as emailVerification from "../emailVerification.js";
import type * as feedPosts from "../feedPosts.js";
import type * as fetchProductUrl from "../fetchProductUrl.js";
import type * as generateSetup from "../generateSetup.js";
import type * as http from "../http.js";
import type * as postMatcher from "../postMatcher.js";
import type * as reddit from "../reddit.js";
import type * as telegram from "../telegram.js";
import type * as userProfile from "../userProfile.js";
import type * as userQueries from "../userQueries.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentTokens: typeof agentTokens;
  auth: typeof auth;
  crons: typeof crons;
  devices: typeof devices;
  discord: typeof discord;
  emailVerification: typeof emailVerification;
  feedPosts: typeof feedPosts;
  fetchProductUrl: typeof fetchProductUrl;
  generateSetup: typeof generateSetup;
  http: typeof http;
  postMatcher: typeof postMatcher;
  reddit: typeof reddit;
  telegram: typeof telegram;
  userProfile: typeof userProfile;
  userQueries: typeof userQueries;
  users: typeof users;
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

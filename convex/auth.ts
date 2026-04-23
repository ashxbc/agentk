import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password,
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const { existingUserId, profile, provider } = args;
      const {
        emailVerified: profileEmailVerified,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        phoneVerified: _phoneVerified,
        ...profileData
      } = profile;

      // OAuth providers (Google) always have verified emails.
      const emailVerified =
        profileEmailVerified ??
        (provider.type === "oauth" || provider.type === "oidc");

      const userData = {
        ...profileData,
        ...(emailVerified ? { emailVerificationTime: Date.now() } : {}),
      };

      // Normal case: existing account linked to a real user document — just update it.
      if (existingUserId !== null) {
        const existingUser = await ctx.db.get(existingUserId);
        if (existingUser !== null) {
          await ctx.db.patch(existingUserId, userData);
          return existingUserId;
        }
        // Orphaned case: authAccounts.userId points to a deleted users document.
        // Fall through to create a new user. Convex Auth will detect that the
        // returned userId !== existingUserId and will patch authAccounts.userId
        // to fix the orphaned state automatically (see createOrUpdateAccount in
        // @convex-dev/auth/src/server/implementation/users.ts lines 206-211).
      }

      // Email linking: if an OAuth provider returns a verified email and a user
      // with that email already exists (e.g. signed up via email+password), link
      // the OAuth account to that existing user instead of creating a duplicate.
      if (emailVerified && typeof profile.email === "string") {
        const linked = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("email"), profile.email as string))
          .filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
          .first();
        if (linked !== null) {
          await ctx.db.patch(linked._id, userData);
          return linked._id;
        }
      }

      // No existing user — create a fresh one.
      return await ctx.db.insert("users", userData);
    },
  },
});

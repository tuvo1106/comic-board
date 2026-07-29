import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { boards, comics } from "@/db/schema";
import * as authSchema from "@/db/auth-schema";

/**
 * better-auth instance: email/password, sessions in an HTTP-only cookie, backed
 * by the app's Drizzle/sqlite database.
 *
 * Set BETTER_AUTH_SECRET in production (see .env.example). The dev fallback keeps
 * `npm run dev` working with zero setup.
 */
// `next build` imports this module (to collect page data) with NODE_ENV
// "production" but without a runtime secret in the environment. That's a build,
// not a server boot, so don't fail it here — only refuse to *boot* a prod
// server without a real secret. NEXT_PHASE is "phase-production-build" during
// the build and unset when serving.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  !process.env.BETTER_AUTH_SECRET
) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set in production. Refusing to boot with the insecure dev fallback secret.",
  );
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true, // sign in immediately after signup
    minPasswordLength: 8,
  },
  // changePassword needs no config (it's core once emailAndPassword is on).
  // changeEmail is opt-in, and its "without verification" path only applies
  // to not-yet-verified users — which today is everyone, since this app has
  // no email-sending/verification flow at all (see ROADMAP.md item 6).
  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET || "dev-only-insecure-secret-change-me",
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          // The first account to sign up claims all pre-auth (unowned) data, so
          // the seeded/existing collection carries over to that owner.
          const { n } = db
            .select({ n: sql<number>`count(*)` })
            .from(authSchema.user)
            .get() ?? { n: 0 };
          if (n === 1) {
            db.update(comics).set({ userId: createdUser.id }).where(isNull(comics.userId)).run();
            db.update(boards).set({ userId: createdUser.id }).where(isNull(boards.userId)).run();
          }
        },
      },
    },
  },
  plugins: [nextCookies()], // must be last: writes Set-Cookie in route handlers
});

export type Session = typeof auth.$Infer.Session;

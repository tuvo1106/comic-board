"use client";

import { createAuthClient } from "better-auth/react";

/** Client-side auth: signUp / signIn / signOut / useSession. Same-origin. */
export const authClient = createAuthClient();

export const { signUp, signIn, signOut, useSession } = authClient;

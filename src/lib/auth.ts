import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

const socialProviders = process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
  : undefined;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, autoSignIn: true, requireEmailVerification: false },
  ...(socialProviders ? { socialProviders } : {}),
});

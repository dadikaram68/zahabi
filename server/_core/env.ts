export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

export function validateEnv() {
  const errors: string[] = [];
  if (!ENV.cookieSecret) {
    errors.push("JWT_SECRET environment variable is required");
  } else if (ENV.cookieSecret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters long");
  }
  if (!ENV.databaseUrl) {
    errors.push("DATABASE_URL environment variable is required");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(", ")}`);
  }
}

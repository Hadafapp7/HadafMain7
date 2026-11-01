import { defineConfig } from "drizzle-kit";
import path from "path";

import process from "process";

if (!process.env.DATABASE_URL) {
  const paths = [
    path.join(__dirname, "../../artifacts/api-server/.env"),
    path.join(process.cwd(), "artifacts/api-server/.env"),
    path.join(process.cwd(), ".env"),
  ];
  for (const p of paths) {
    try {
      process.loadEnvFile(p);
      if (process.env.DATABASE_URL) {
        console.log(`[Drizzle Config] Loaded environment variables from: ${p}`);
        break;
      }
    } catch {}
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

import { closeDbExec } from "@agent-native/core/db";
import { loadEnv } from "@agent-native/core/scripts";
import { configuredStudioId } from "../server/daycloser/merchant.js";
import { resetDemoStudio, seedStudio } from "../server/daycloser/seed.js";

loadEnv();

try {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const organizationId = args.find((arg) => !arg.startsWith("--"));
  const studioId = organizationId ?? configuredStudioId();
  if (flags.has("--reset")) {
    const demoMode = process.env.DAYCLOSER_DEMO_MODE === "1"; // guard:allow-env-credential — Deployment flag permitting destructive changes to synthetic demo data.
    if (!demoMode) throw new Error("Reset requires DAYCLOSER_DEMO_MODE=1.");
    if (!flags.has("--confirm"))
      throw new Error("Add --confirm to reset this organization's synthetic demo data.");
    await resetDemoStudio(studioId);
    console.log("Reset the Northlight Studio demo.");
  } else {
    const seeded = await seedStudio(studioId);
    console.log(
      seeded
        ? "Seeded the Northlight Studio demo."
        : "The Northlight Studio demo is already seeded.",
    );
  }
} finally {
  await closeDbExec();
}

/**
 * Side-effect client bootstrap for Next.js.
 * Uses static `process.env.NEXT_PUBLIC_*` so Next's DefinePlugin inlines values
 * even when this file ships from node_modules.
 */
import { init } from "../browser.js";

init({
  intakeUrl: process.env.NEXT_PUBLIC_CALYX_INTAKE_URL,
  token: process.env.NEXT_PUBLIC_CALYX_SOURCE_TOKEN,
  service: process.env.NEXT_PUBLIC_CALYX_SERVICE || "web",
});

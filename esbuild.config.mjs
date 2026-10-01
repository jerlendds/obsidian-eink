import esbuild from "esbuild";
import { buildOptions } from "./scripts/build-options.mjs";

const production = process.argv[2] === "production";
const context = await esbuild.context(buildOptions({ production }));
if (production) {
  try {
    await context.rebuild();
  } finally {
    await context.dispose();
  }
} else {
  await context.watch();
}

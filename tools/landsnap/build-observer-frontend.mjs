import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const rootDirectory = resolve(toolsDirectory, "..", "..");

await build({
    entryPoints: [resolve(toolsDirectory, "landsnap-showcase-ps2-observer-entry.js")],
    outfile: resolve(rootDirectory, "scripts", "vendor", "landsnap-showcase-ps2-observer.js"),
    bundle: true,
    format: "esm",
    minify: true,
    platform: "browser",
    target: "es2022",
    legalComments: "inline",
});

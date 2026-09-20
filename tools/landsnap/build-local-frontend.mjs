import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const rootDirectory = resolve(toolsDirectory, "..", "..");

const buildShowcaseFrontend = (entryPoint, outputFile) => build({
    entryPoints: [resolve(toolsDirectory, entryPoint)],
    outfile: resolve(rootDirectory, "scripts", "vendor", outputFile),
    bundle: true,
    format: "esm",
    minify: true,
    platform: "browser",
    target: "es2022",
    legalComments: "inline",
});

await Promise.all([
    buildShowcaseFrontend("landsnap-showcase-ps2-local-entry.js", "landsnap-showcase-ps2-local.js"),
    buildShowcaseFrontend("landsnap-showcase-ps2-public-entry.js", "landsnap-showcase-ps2-public.js"),
]);

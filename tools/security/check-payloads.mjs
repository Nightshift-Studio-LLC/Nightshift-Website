import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowlistPath = path.join(root, "tools", "security", "payload-allowlist.json");

const blockedExtensions = new Set([
    ".7z",
    ".apk",
    ".app",
    ".bat",
    ".cmd",
    ".com",
    ".dmg",
    ".dll",
    ".exe",
    ".hta",
    ".iso",
    ".jar",
    ".jsbundle",
    ".msi",
    ".pkg",
    ".ps1",
    ".rar",
    ".scr",
    ".sh",
    ".vbs",
    ".wsf",
    ".zip",
]);

const normalizePath = (value) => value.replace(/\\/g, "/").replace(/^\.\//, "");

const isIgnoredTree = (file) =>
    file === "dist" ||
    file.startsWith("dist/") ||
    file === "node_modules" ||
    file.startsWith("node_modules/") ||
    file.includes("/node_modules/") ||
    file === ".cache" ||
    file.startsWith(".cache/");

const loadAllowlist = () => {
    if (!fs.existsSync(allowlistPath)) {
        return new Map();
    }

    const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    if (!Array.isArray(parsed)) {
        throw new Error("tools/security/payload-allowlist.json must be an array.");
    }

    return new Map(parsed.map((entry) => {
        if (!entry || typeof entry.path !== "string" || typeof entry.reason !== "string" || !entry.reason.trim()) {
            throw new Error("Every payload allowlist entry must include a path and non-empty reason.");
        }

        return [normalizePath(entry.path), entry.reason.trim()];
    }));
};

const readTrackedFiles = () => {
    const output = execFileSync("git", ["ls-files", "-z"], { cwd: root });
    return output
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
};

const readExtraFiles = () => {
    const includeIndex = process.argv.indexOf("--include");
    if (includeIndex === -1) {
        return [];
    }

    return process.argv.slice(includeIndex + 1).filter((entry) => !entry.startsWith("--"));
};

const allowlist = loadAllowlist();
const files = [...readTrackedFiles(), ...readExtraFiles()]
    .map(normalizePath)
    .filter((file) => !isIgnoredTree(file));
const violations = files
    .filter((file) => blockedExtensions.has(path.extname(file).toLowerCase()))
    .filter((file) => !allowlist.has(file));

if (violations.length) {
    console.error("Blocked hosted payload file types found:");
    for (const file of violations) {
        console.error(`- ${file}`);
    }
    console.error("\nIf this file is intentionally hosted, add it to tools/security/payload-allowlist.json with a specific reason.");
    process.exit(1);
}

console.log(`Payload scan passed: ${files.length} file(s) checked.`);

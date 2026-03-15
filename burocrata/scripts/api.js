import os from "node:os";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const DEFAULT_BASE_URL = process.env.BUROCRATA_API_BASE_URL || "https://burocrata.com.br";

function getConfigDir() {
  return process.env.BUROCRATA_CONFIG_DIR || path.join(os.homedir(), ".burocrata");
}

function getConfigPath() {
  return path.join(getConfigDir(), "config.json");
}

export async function readConfig() {
  try {
    return JSON.parse(await readFile(getConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function writeConfig(config) {
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2));
}

export async function clearConfig() {
  await rm(getConfigPath(), { force: true });
}

export function parseArgv(argv) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { flags, positionals };
}

export function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export async function resolveBaseUrl(flags = {}) {
  if (typeof flags["base-url"] === "string") {
    return normalizeBaseUrl(flags["base-url"]);
  }

  const config = await readConfig();
  return normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
}

export async function resolveToken(flags = {}) {
  if (typeof flags.token === "string") {
    return flags.token;
  }

  if (process.env.BUROCRATA_API_TOKEN) {
    return process.env.BUROCRATA_API_TOKEN;
  }

  const config = await readConfig();
  return config.token || null;
}

export function encodeToolPath(toolName) {
  return toolName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function apiRequest(pathname, options = {}) {
  const baseUrl = options.baseUrl || await resolveBaseUrl(options.flags);
  const token = options.token ?? await resolveToken(options.flags);
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function printJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printTable(items, columns) {
  const widths = columns.map((column) =>
    Math.max(column.label.length, ...items.map((item) => String(item[column.key] ?? "").length))
  );

  const lines = [];
  lines.push(columns.map((column, index) => column.label.padEnd(widths[index], " ")).join("  "));
  lines.push(widths.map((width) => "-".repeat(width)).join("  "));
  for (const item of items) {
    lines.push(
      columns.map((column, index) => String(item[column.key] ?? "").padEnd(widths[index], " ")).join("  ")
    );
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  apiRequest,
  clearConfig,
  encodeToolPath,
  parseArgv,
  printJson,
  printTable,
  readConfig,
  resolveBaseUrl,
  resolveToken,
  writeConfig,
  isLocalBaseUrl,
} from "./api.js";

function printHelp() {
  process.stdout.write(`burocrata.com.br local helper

Usage:
  node scripts/burocrata.com.br.js login --token <token> [--base-url <url>]
  node scripts/burocrata.com.br.js logout
  node scripts/burocrata.com.br.js doctor [--json]
  node scripts/burocrata.com.br.js whoami [--json]
  node scripts/burocrata.com.br.js credits [--json]
  node scripts/burocrata.com.br.js search [query] [--limit <n>] [--json]
  node scripts/burocrata.com.br.js schema <tool-name> [--json]
  node scripts/burocrata.com.br.js run <tool-name> --input '{"cnpj":"..."}' [--json]
  node scripts/burocrata.com.br.js run <tool-name> --input-file <file.json> [--json]
`);
}

function wantsJson(flags) {
  return Boolean(flags.json);
}

async function readInputPayload(flags) {
  if (typeof flags.input === "string") {
    return JSON.parse(flags.input);
  }

  if (typeof flags["input-file"] === "string") {
    return JSON.parse(await readFile(flags["input-file"], "utf8"));
  }

  throw new Error("Provide --input or --input-file.");
}

async function runDoctor(flags) {
  const config = await readConfig();
  const baseUrl = await resolveBaseUrl(flags);
  const token = await resolveToken(flags);
  const detectedLocalConfig = Boolean(config.baseUrl && isLocalBaseUrl(config.baseUrl));

  const report = {
    ok: false,
    baseUrl,
    configBaseUrl: config.baseUrl || null,
    usedProductionFallback: detectedLocalConfig,
    tokenPresent: Boolean(token),
    authenticated: false,
    user: null,
    nextStep: "",
  };

  if (!token) {
    report.nextStep = "Generate a token in https://burocrata.com.br/cli and run login.";
    return report;
  }

  try {
    const me = await apiRequest("/api/external/me", { flags, token, baseUrl });
    report.ok = true;
    report.authenticated = true;
    report.user = me.user;
    report.nextStep = "Search the desired document with the local helper.";
    return report;
  } catch (error) {
    report.nextStep = formatCliError(error);
    return report;
  }
}

function formatCliError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = error?.status;

  if (status === 401 || /Não autorizado/i.test(message)) {
    return "Authentication failed. Generate a fresh token in https://burocrata.com.br/cli and run: node scripts/burocrata.com.br.js login --token <token>";
  }

  if (status === 402 || /INSUFFICIENT_CREDITS/i.test(message)) {
    return "Insufficient credits. Recharge in https://burocrata.com.br/preco and try again.";
  }

  if (/Could not reach/i.test(message)) {
    return "Connection failed. Confirm internet access or run with --base-url https://burocrata.com.br.";
  }

  return message;
}

async function main(argv) {
  const { flags, positionals } = parseArgv(argv);
  const command = positionals[0];

  if (!command || flags.help) {
    printHelp();
    return;
  }

  if (command === "login") {
    const token = await resolveToken(flags);
    if (!token) {
      throw new Error("Missing token. Generate one in https://burocrata.com.br/cli and pass --token.");
    }

    const baseUrl = await resolveBaseUrl(flags);
    const data = await apiRequest("/api/external/me", { token, baseUrl });
    await writeConfig({ token, baseUrl });

    if (wantsJson(flags)) {
      printJson({ ok: true, baseUrl, user: data.user });
      return;
    }

    process.stdout.write(`Authenticated as ${data.user.email} on ${baseUrl}\n`);
    return;
  }

  if (command === "logout") {
    await clearConfig();
    process.stdout.write("Local Burocrata session removed.\n");
    return;
  }

  if (command === "doctor") {
    const report = await runDoctor(flags);
    if (wantsJson(flags)) {
      printJson(report);
      return;
    }

    process.stdout.write(`Base URL: ${report.baseUrl}\n`);
    if (report.usedProductionFallback) {
      process.stdout.write("Detected localhost in saved config. Using https://burocrata.com.br automatically.\n");
    }
    process.stdout.write(`Token: ${report.tokenPresent ? "present" : "missing"}\n`);
    process.stdout.write(`Authenticated: ${report.authenticated ? "yes" : "no"}\n`);
    if (report.user?.email) {
      process.stdout.write(`User: ${report.user.email}\n`);
    }
    process.stdout.write(`Next step: ${report.nextStep}\n`);
    return;
  }

  if (command === "whoami") {
    const data = await apiRequest("/api/external/me", { flags });
    if (wantsJson(flags)) {
      printJson(data);
      return;
    }
    process.stdout.write(`${data.user.email} (${data.user.role})\n`);
    return;
  }

  if (command === "credits") {
    const data = await apiRequest("/api/external/credits", { flags });
    if (wantsJson(flags)) {
      printJson(data);
      return;
    }
    process.stdout.write(`Credits: ${data.credits}\n`);
    return;
  }

  if (command === "search") {
    const query = positionals.slice(1).join(" ");
    const limit = flags.limit ? Number(flags.limit) : 10;
    const data = await apiRequest(
      `/api/external/tools?query=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`,
      { flags }
    );

    if (wantsJson(flags)) {
      printJson(data);
      return;
    }

    printTable(
      data.tools.map((tool) => ({
        name: tool.name,
        label: tool.shortLabel || tool.label,
        category: tool.category,
      })),
      [
        { key: "name", label: "Tool" },
        { key: "label", label: "Label" },
        { key: "category", label: "Category" },
      ]
    );
    return;
  }

  if (command === "schema") {
    const toolName = positionals[1];
    if (!toolName) {
      throw new Error("Provide a tool name. Example: node scripts/burocrata.com.br.js schema receita-federal/pgfn");
    }

    const data = await apiRequest(`/api/external/tools/${encodeToolPath(toolName)}`, { flags });
    if (wantsJson(flags)) {
      printJson(data);
      return;
    }

    process.stdout.write(`${data.tool.label}\n`);
    for (const field of data.tool.fields || []) {
      process.stdout.write(`${field.required ? "*" : "-"} ${field.name}: ${field.description}\n`);
    }
    return;
  }

  if (command === "run") {
    const toolName = positionals[1];
    if (!toolName) {
      throw new Error("Provide a tool name. Example: node scripts/burocrata.com.br.js run receita-federal/pgfn --input '{\"cpf_cnpj\":\"...\"}'");
    }

    const input = await readInputPayload(flags);
    const data = await apiRequest("/api/external/execute", {
      method: "POST",
      flags,
      body: { tool: toolName, input },
    });

    if (wantsJson(flags)) {
      printJson(data);
      return;
    }

    process.stdout.write(`${data.success ? "Success" : "Failure"}: ${data.tool.label}\n`);
    if (data.errorMessage) {
      process.stdout.write(`${data.errorMessage}\n`);
    }
    if (typeof data.creditsRemaining === "number") {
      process.stdout.write(`Credits remaining: ${data.creditsRemaining}\n`);
    }
    if (data.attachmentUrl) {
      process.stdout.write(`Attachment: ${data.attachmentUrl}\n`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(formatCliError(error));
  process.exit(1);
});

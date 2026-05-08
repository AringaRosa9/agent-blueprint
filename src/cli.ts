#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILLS_TARGET = join(homedir(), ".claude", "skills");
const SKILLS_SOURCE = join(__dirname, "..", "skills");
const SKILL_NAMES = ["agent-architect", "tool-designer", "agent-patterns"];

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(icon: string, message: string): void {
  console.log(`  ${icon}  ${message}`);
}

function banner(title: string): void {
  console.log();
  console.log(`${COLORS.cyan}${"═".repeat(50)}${COLORS.reset}`);
  console.log(`${COLORS.cyan}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${"═".repeat(50)}${COLORS.reset}`);
  console.log();
}

function install(): void {
  banner("Agent Blueprint — Install Skills");

  const claudeDir = join(homedir(), ".claude");
  if (!existsSync(claudeDir)) {
    log("❌", `${claudeDir} not found. Please install Claude Code first.`);
    log("  ", "https://claude.ai/code");
    process.exit(1);
  }

  if (!existsSync(SKILLS_TARGET)) {
    mkdirSync(SKILLS_TARGET, { recursive: true });
  }

  let installed = 0;
  let updated = 0;

  for (const name of SKILL_NAMES) {
    const source = join(SKILLS_SOURCE, name);
    const target = join(SKILLS_TARGET, name);

    if (!existsSync(source)) {
      log("⚠️", `${COLORS.yellow}Source not found: ${name} (skipped)${COLORS.reset}`);
      continue;
    }

    if (existsSync(target)) {
      rmSync(target, { recursive: true });
      cpSync(source, target, { recursive: true });
      log("🔄", `${COLORS.yellow}Updated: ${name}${COLORS.reset}`);
      updated++;
    } else {
      cpSync(source, target, { recursive: true });
      log("✅", `${COLORS.green}Installed: ${name}${COLORS.reset}`);
      installed++;
    }
  }

  console.log();
  log("📊", `${installed} installed, ${updated} updated`);
  console.log();
  console.log(`${COLORS.dim}  Available skills in Claude Code:${COLORS.reset}`);
  console.log(`    /agent-architect  ${COLORS.dim}— Architecture selection advisor${COLORS.reset}`);
  console.log(`    /tool-designer    ${COLORS.dim}— ACI tool design assistant${COLORS.reset}`);
  console.log(`    /agent-patterns   ${COLORS.dim}— Pattern code generator${COLORS.reset}`);
  console.log();
  console.log(`  Restart Claude Code to activate the skills.`);
  console.log();
}

function uninstall(): void {
  banner("Agent Blueprint — Uninstall Skills");

  let removed = 0;

  for (const name of SKILL_NAMES) {
    const target = join(SKILLS_TARGET, name);

    if (existsSync(target)) {
      rmSync(target, { recursive: true });
      log("🗑️ ", `${COLORS.red}Removed: ${name}${COLORS.reset}`);
      removed++;
    } else {
      log("· ", `${COLORS.dim}Not found: ${name} (skipped)${COLORS.reset}`);
    }
  }

  console.log();
  log("📊", `${removed} removed`);
  console.log();
  console.log(`  Restart Claude Code to apply changes.`);
  console.log();
}

function list(): void {
  banner("Agent Blueprint — Skill Status");

  for (const name of SKILL_NAMES) {
    const target = join(SKILLS_TARGET, name);
    const status = existsSync(target)
      ? `${COLORS.green}● installed${COLORS.reset}`
      : `${COLORS.dim}○ not installed${COLORS.reset}`;
    log("  ", `${name.padEnd(20)} ${status}`);
  }

  console.log();
}

function help(): void {
  console.log(`
${COLORS.cyan}Agent Blueprint${COLORS.reset} — Claude Code Skills for building effective agents

${COLORS.yellow}Usage:${COLORS.reset}
  npx agent-blueprint <command>

${COLORS.yellow}Commands:${COLORS.reset}
  install      Install all skills to ~/.claude/skills/
  uninstall    Remove all skills from ~/.claude/skills/
  list         Show installation status of each skill
  help         Show this help message

${COLORS.yellow}Examples:${COLORS.reset}
  npx agent-blueprint install
  npx agent-blueprint list
`);
}

const command = process.argv[2];

switch (command) {
  case "install":
    install();
    break;
  case "uninstall":
    uninstall();
    break;
  case "list":
    list();
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  default:
    if (command) {
      console.log(`\n  Unknown command: ${command}\n`);
    }
    help();
    break;
}

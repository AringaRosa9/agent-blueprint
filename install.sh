#!/bin/bash

set -e

SKILLS_DIR="$HOME/.claude/skills"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/skills"

SKILLS=("agent-architect" "tool-designer" "agent-patterns")

echo "=================================="
echo "  Agent Blueprint - Installer"
echo "=================================="
echo ""

if [ ! -d "$HOME/.claude" ]; then
    echo "[!] ~/.claude directory not found."
    echo "    Please install Claude Code first: https://claude.ai/code"
    exit 1
fi

mkdir -p "$SKILLS_DIR"

installed=0
skipped=0

for skill in "${SKILLS[@]}"; do
    target="$SKILLS_DIR/$skill"
    source="$SOURCE_DIR/$skill"

    if [ ! -d "$source" ]; then
        echo "[!] Source not found: $source (skipped)"
        skipped=$((skipped + 1))
        continue
    fi

    if [ -d "$target" ]; then
        echo "[~] $skill already exists, updating..."
        rm -rf "$target"
    fi

    cp -r "$source" "$target"
    echo "[+] Installed: $skill"
    installed=$((installed + 1))
done

echo ""
echo "=================================="
echo "  Done! $installed installed, $skipped skipped"
echo "=================================="
echo ""
echo "Available skills in Claude Code:"
echo "  /agent-architect  - Architecture selection advisor"
echo "  /tool-designer    - ACI tool design assistant"
echo "  /agent-patterns   - Pattern code generator"
echo ""
echo "Restart Claude Code to activate the skills."

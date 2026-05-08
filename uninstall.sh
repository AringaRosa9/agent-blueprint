#!/bin/bash

SKILLS_DIR="$HOME/.claude/skills"
SKILLS=("agent-architect" "tool-designer" "agent-patterns")

echo "=================================="
echo "  Agent Blueprint - Uninstaller"
echo "=================================="
echo ""

removed=0

for skill in "${SKILLS[@]}"; do
    target="$SKILLS_DIR/$skill"
    if [ -d "$target" ]; then
        rm -rf "$target"
        echo "[-] Removed: $skill"
        removed=$((removed + 1))
    else
        echo "[.] Not found: $skill (skipped)"
    fi
done

echo ""
echo "=================================="
echo "  Done! $removed removed."
echo "=================================="
echo ""
echo "Restart Claude Code to apply changes."

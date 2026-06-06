#!/bin/sh
SLUG="$1"
BUDGET_S="$2"
[ -n "$BUDGET_S" ] || BUDGET_S=0
command -v python3 >/dev/null 2>&1 || { echo "goal watcher: python3 not found; edit watcher.sh to JSON-encode with node or jq instead" >&2; exit 1; }
START_TS=$(date +%s)
TRANSCRIPT="$AGENT_TRANSCRIPTS/$CURSOR_CONVERSATION_ID/$CURSOR_CONVERSATION_ID.jsonl"
GOAL_DIR=".cursor/goals/$SLUG"
OBJ_FILE="$GOAL_DIR/objective.txt"
UNDER_FILE="$GOAL_DIR/under.tmpl"
OVER_FILE="$GOAL_DIR/over.tmpl"

tail -n 0 -F "$TRANSCRIPT" 2>/dev/null | while IFS= read -r line; do
  case "$line" in
    *'"type":"turn_ended"'*)
      NOW_TS=$(date +%s)
      ELAPSED=$((NOW_TS - START_TS))
      if [ "$BUDGET_S" -gt 0 ]; then BUDGET_DISP="$BUDGET_S seconds"; else BUDGET_DISP="unlimited"; fi
      if [ "$BUDGET_S" -gt 0 ] && [ "$ELAPSED" -ge "$BUDGET_S" ]; then TMPL_FILE="$OVER_FILE"; else TMPL_FILE="$UNDER_FILE"; fi

      PROMPT_JSON=$(python3 -c '
import json, sys
tmpl, obj, elapsed, budget = sys.argv[1:5]
objective = open(obj, encoding="utf-8").read().rstrip("\n")
text = open(tmpl, encoding="utf-8").read()
text = text.replace("__OBJECTIVE__", objective).replace("__TIME_USED__", elapsed).replace("__BUDGET__", budget)
print(json.dumps({"prompt": text}), end="")
' "$TMPL_FILE" "$OBJ_FILE" "$ELAPSED" "$BUDGET_DISP") || exit 1
      printf 'AGENT_GOAL_WAKE_%s %s\n' "$SLUG" "$PROMPT_JSON"
      ;;
  esac
done

#!/usr/bin/env bash
# SOVIR Android measurement harness — real-device corpus + energy.
# Usage: bash local/android_measure.sh <phase>
#   baseline  — reset batterystats + clear logcat (run BEFORE the tour)
#   tour      — drive the phone through real apps/pages via adb
#   capture   — dump SovirObserver logcat + batterystats + API events
ADB="C:/Users/jesui/AppData/Local/Android/Sdk/platform-tools/adb.exe"
API="http://127.0.0.1:8787"
OUT="local/measure_$(date +%H%M)"
mkdir -p "$OUT"

case "${1:-}" in
baseline)
  "$ADB" shell dumpsys batterystats --reset
  "$ADB" logcat -c
  "$ADB" shell dumpsys battery | grep -E "level|status"
  echo "baseline reset → $OUT" ;;
tour)
  # Real surfaces, benign + suspicious. Each opens, waits for the
  # observer window event, then moves on. Scam page served over
  # `adb reverse tcp:8090` from apps/console/public.
  open() { "$ADB" shell am start -a android.intent.action.VIEW -d "$1" >/dev/null 2>&1; sleep "${2:-12}"; }
  open "http://localhost:8090/scam-test.html" 15      # phishing fixture (expect warn)
  open "https://www.microsoft.com" 12                  # benign w/ login link (known FP)
  open "https://es.wikipedia.org/wiki/Malware" 12      # benign informational
  open "https://github.com" 12                          # benign dev site
  "$ADB" shell am start -n com.google.android.youtube/.app.honeycomb.Shell\$HomeActivity >/dev/null 2>&1; sleep 12
  "$ADB" shell input keyevent 3                         # back home
  echo "tour done → $OUT" ;;
capture)
  "$ADB" logcat -d -s SovirObserver:* > "$OUT/logcat.txt"
  "$ADB" shell dumpsys batterystats > "$OUT/batterystats.txt"
  "$ADB" shell dumpsys battery > "$OUT/battery.txt"
  grep -c "signals" "$OUT/logcat.txt" | xargs echo "observer signal lines:"
  grep -A12 "Estimated power use" "$OUT/batterystats.txt" | head -14
  echo "--- app uid drain ---"
  "$ADB" shell dumpsys batterystats | grep -B2 -A30 "app.sovir.android" | head -40
  echo "saved → $OUT" ;;
*)
  echo "usage: $0 baseline|tour|capture" ;;
esac

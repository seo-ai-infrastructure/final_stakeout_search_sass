/**
 * observe.sh (SEARCH_MODE=rpa). Args: scan pin max_secs
 * While the account's DuoPlus RPA template does the search, this only records the screen:
 * screenrecord uses no UI automation, so it can't collide with the template. When the
 * worker writes $D/stop (template finished), a read-only pass over the results list the
 * template ended on: back to the top, then a snapshot after each swipe down to the footer
 * (where Google prints "From your device"). Output matches run_pin.sh: dump_N.xml,
 * serp.xml, final.xml, meta.txt, video.mp4, status=done.
 */
export const OBSERVE_SH = `#!/system/bin/sh
# observe v8
SCAN=$1; PIN=$2; MAXS=$3; RUN=$4; WAITREC=\${5:-0}
[ -n "$MAXS" ] || MAXS=420
TS=$(date +%s)
T=/sdcard/stakeout
RT=/data/local/tmp/rt
D="$RT/$SCAN"_"$PIN"
mkdir -p "$D"; rm -f "$D"/*
S=$(wm size | tail -n1 | sed 's/.*: //'); W=$(echo "$S" | cut -dx -f1); H=$(echo "$S" | cut -dx -f2)
X=$((W/2)); SW=$((W/4*2)); SH=$((H/4*2))
{ echo "mode=rpa"; echo "scan=$SCAN"; echo "pin=$PIN"; } > "$D/meta.txt"
# Templates that mark the moment (v3.9+: "$T/$RUN.rec", right before typing the keyword)
# are recorded from that moment; if the marker never comes, recording starts anyway.
TRIG=launch
if [ -n "$RUN" ] && [ "$WAITREC" -gt 0 ] 2>/dev/null; then
  TRIG=timeout
  while [ $(( $(date +%s) - TS )) -lt "$WAITREC" ]; do
    [ -e "$T/$RUN.rec" ] && { TRIG=marker; break; }
    [ -f "$D/stop" ] || [ -f "$T/$RUN.done" ] && { TRIG=ended; break; }
    sleep 0.3
  done
fi
echo "rec_trigger=$TRIG" >> "$D/meta.txt"; echo "rec_wait=$(( $(date +%s) - TS ))" >> "$D/meta.txt"
screenrecord --size "$SW"x"$SH" --bit-rate 1200000 --time-limit 180 "$D/video.mp4" >/dev/null 2>&1 &
REC=$!
T0=$(date +%s); echo "rec_start=$T0" >> "$D/meta.txt"
# Hands off while the template runs (it ends by writing $T/$RUN.done).
while [ ! -f "$D/stop" ] && [ ! -f "$T/$RUN.done" ]; do
  [ $(( $(date +%s) - TS )) -ge "$MAXS" ] && break
  sleep 1
done
echo "rpa_end_t=$(( $(date +%s) - T0 ))" >> "$D/meta.txt"
sleep 1
n=0
# The template saves the results page and the full business list itself: use those.
if [ -n "$RUN" ] && [ -s "$T/$RUN"_finder.xml ]; then
  [ -s "$T/$RUN"_serp.xml ] && cp "$T/$RUN"_serp.xml "$D/dump_$n.xml" && n=$((n+1))
  cp "$T/$RUN"_finder.xml "$D/dump_$n.xml" && n=$((n+1))
  # AI Overview: collapsed (inside the results page) and, when the template expanded it, the full view.
  [ -s "$T/$RUN"_serp.xml ] && cp "$T/$RUN"_serp.xml "$D/aio_initial.xml"
  [ -s "$T/$RUN"_aio.xml ] && cp "$T/$RUN"_aio.xml "$D/aio_expanded.xml"
  # Capture-only template extras: first screen, the page at the 3-pack, top of the Local Finder,
  # the AI Overview as first shown, and its own manifest and event log.
  [ -s "$T/$RUN"_serp_initial.xml ] && cp "$T/$RUN"_serp_initial.xml "$D/first_screen.xml"
  [ -s "$T/$RUN"_pack.xml ] && cp "$T/$RUN"_pack.xml "$D/pack.xml"
  [ -s "$T/$RUN"_finder_top.xml ] && cp "$T/$RUN"_finder_top.xml "$D/finder_top.xml"
  [ -s "$T/$RUN"_aio_initial.xml ] && cp "$T/$RUN"_aio_initial.xml "$D/aio_initial.xml"
  # The AI Overview copied with its own copy button (full text with links and Google business ids).
  [ -s "$T/$RUN"_aio_copy.txt ] && cp "$T/$RUN"_aio_copy.txt "$D/aio_copy.txt"
  for x in capture.json events.tsv captures.tsv; do [ -s "$T/$RUN.$x" ] && cp "$T/$RUN.$x" "$D/$x"; done
  # The template taps "Update location" and leaves this marker (v3.7+); kept in meta.txt.
  [ -e "$T/$RUN".location_refreshed ] && echo "location_refreshed=1" >> "$D/meta.txt"
  # Screenshots: the full AI Overview, and the tracked business visible on the results page / in the Local Finder.
  [ -s "$T/$RUN"_aio.png ] && cp "$T/$RUN"_aio.png "$D/shot_ai.png"
  [ -s "$T/$RUN"_pack_target.png ] && cp "$T/$RUN"_pack_target.png "$D/shot_pack.png"
  [ -s "$T/$RUN"_finder_target.png ] && cp "$T/$RUN"_finder_target.png "$D/shot_finder.png"
  echo "evidence=template" >> "$D/meta.txt"
elif [ -n "$RUN" ] && { [ -e "$T/$RUN".blocked ] || [ -e "$T/$RUN".surface_error ]; }; then
  # The template stopped itself (wrong page or blocked): keep its log, no scrolling.
  echo "evidence=template_blocked" >> "$D/meta.txt"
  for x in blocked surface_error; do [ -s "$T/$RUN.$x" ] && echo "$x=$(head -c 160 "$T/$RUN.$x" | tr '\n' ' ')" >> "$D/meta.txt"; done
  for x in events.tsv captures.tsv; do [ -s "$T/$RUN.$x" ] && cp "$T/$RUN.$x" "$D/$x"; done
else
echo "evidence=observer_pass" >> "$D/meta.txt"
# Fallback read-only pass: to the top of the list, then down to the footer.
i=0
while [ $i -lt 6 ]; do input swipe $X $((H*30/100)) $X $((H*80/100)) 250; sleep 0.4; i=$((i+1)); done
sleep 1.2
n=0
uiautomator dump "$D/dump_$n.xml" >/dev/null 2>&1 && n=$((n+1))
s=0
while [ $s -lt 14 ]; do
  input swipe $X $((H*78/100)) $X $((H*32/100)) $((400 + RANDOM % 300))
  sleep 1.6
  uiautomator dump "$D/dump_$n.xml" >/dev/null 2>&1 && n=$((n+1))
  s=$((s+1))
done
fi
[ -n "$RUN" ] && rm -rf "$T/$RUN"_* "$T/$RUN".*
kill -INT $REC 2>/dev/null; wait $REC 2>/dev/null
L=$((n-1))
[ $L -ge 0 ] && cp "$D/dump_$L.xml" "$D/final.xml"
[ -f "$D/dump_0.xml" ] && cp "$D/dump_0.xml" "$D/serp.xml"
echo "dumps=$n" >> "$D/meta.txt"; echo "t_end=$(date +%s)" >> "$D/meta.txt"
[ -s "$D/video.mp4" ] || exit 1
# Pack the evidence exactly as run_pin.sh does: the worker pulls $RT/<scan>_<pin>.tar.gz.
tar -czf "$D.tar.gz" -C "$RT" "$SCAN"_"$PIN" || exit 1
echo done > "$D/status"
`;

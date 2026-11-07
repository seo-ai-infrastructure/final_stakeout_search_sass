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
# observe v1
SCAN=$1; PIN=$2; MAXS=$3
[ -n "$MAXS" ] || MAXS=420
RT=/data/local/tmp/rt
D="$RT/$SCAN"_"$PIN"
mkdir -p "$D"; rm -f "$D"/*
S=$(wm size | tail -n1 | sed 's/.*: //'); W=$(echo "$S" | cut -dx -f1); H=$(echo "$S" | cut -dx -f2)
X=$((W/2)); SW=$((W/4*2)); SH=$((H/4*2))
{ echo "mode=rpa"; echo "scan=$SCAN"; echo "pin=$PIN"; } > "$D/meta.txt"
screenrecord --size "$SW"x"$SH" --bit-rate 1200000 --time-limit 180 "$D/video.mp4" >/dev/null 2>&1 &
REC=$!
T0=$(date +%s); echo "rec_start=$T0" >> "$D/meta.txt"
# Hands off while the template runs.
while [ ! -f "$D/stop" ]; do
  [ $(( $(date +%s) - T0 )) -ge "$MAXS" ] && break
  sleep 1
done
echo "rpa_end_t=$(( $(date +%s) - T0 ))" >> "$D/meta.txt"
sleep 1
# Read-only results pass: to the top of the list, then down to the footer.
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
kill -INT $REC 2>/dev/null; wait $REC 2>/dev/null
L=$((n-1))
[ $L -ge 0 ] && cp "$D/dump_$L.xml" "$D/final.xml"
[ -f "$D/dump_0.xml" ] && cp "$D/dump_0.xml" "$D/serp.xml"
echo "dumps=$n" >> "$D/meta.txt"; echo "t_end=$(date +%s)" >> "$D/meta.txt"
[ -s "$D/video.mp4" ] || exit 1
echo done > "$D/status"
`;

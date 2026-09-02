#!/bin/sh
# Test seam for stdin-fed gh calls. Records argv (one line per call) to $VSK_STUB_LOG
# and stdin to $VSK_STUB_LOG.stdin. VSK_STUB_409_FIRST: first call fails HTTP 409.
# VSK_STUB_FAIL: every call fails HTTP 500.
printf '%s\n' "$*" >> "$VSK_STUB_LOG"
cat >> "$VSK_STUB_LOG.stdin"
calls=$(wc -l < "$VSK_STUB_LOG" | tr -d ' ')
if [ -n "$VSK_STUB_FAIL" ]; then echo "gh: HTTP 500: boom (https://api.github.com/x)" >&2; exit 1; fi
if [ -n "$VSK_STUB_409_FIRST" ] && [ "$calls" -eq 1 ]; then echo "gh: HTTP 409: conflict (https://api.github.com/x)" >&2; exit 1; fi
p=''
for a in "$@"; do case "$a" in repos/*) p="$a";; esac; done
printf '{"content":{"path":"%s","html_url":"https://github.com/o/evidence/blob/main/%s"}}\n' "$p" "$p"

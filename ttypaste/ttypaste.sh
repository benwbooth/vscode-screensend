#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PTY=${SSH_ORIGINAL_COMMAND%% *}
TEXT=${SSH_ORIGINAL_COMMAND#* }
exec "$DIR/ttypaste" "$PTY" "$TEXT"

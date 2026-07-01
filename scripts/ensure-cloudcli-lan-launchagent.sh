#!/usr/bin/env bash
set -u

LABEL="com.local.cloudcli-lan"
PORT="3001"
USER_NAME="$(/usr/bin/id -un)"
HOME_DIR="${HOME:-/Users/$USER_NAME}"
PLIST="$HOME_DIR/Library/LaunchAgents/${LABEL}.plist"
LOG_FILE="/tmp/cloudcli-lan-ensure.log"

exec >>"$LOG_FILE" 2>&1

timestamp() {
  /bin/date '+%Y-%m-%d %H:%M:%S %Z'
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

user_domain() {
  printf 'gui/%s' "$(/usr/bin/id -u)"
}

service_ref() {
  printf '%s/%s' "$(user_domain)" "$LABEL"
}

is_http_ready() {
  /usr/bin/curl --noproxy '*' -fsS "http://127.0.0.1:${PORT}/api/auth/status" >/dev/null 2>&1
}

has_port_listener() {
  /usr/sbin/lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

is_loaded() {
  /bin/launchctl print "$(service_ref)" >/dev/null 2>&1
}

wait_until_loaded() {
  local remaining="${1:-15}"
  while [[ "$remaining" -gt 0 ]]; do
    if is_loaded; then
      return 0
    fi
    sleep 1
    remaining=$((remaining - 1))
  done
  return 1
}

ensure_loaded() {
  if is_loaded; then
    return 0
  fi

  if [[ ! -f "$PLIST" ]]; then
    log "missing plist: $PLIST"
    return 1
  fi

  log "service not loaded; bootstrapping $LABEL"
  /bin/launchctl bootstrap "$(user_domain)" "$PLIST"
  local bootstrap_status=$?
  log "bootstrap exit=$bootstrap_status"
  /bin/launchctl enable "$(service_ref)" || true
  if wait_until_loaded 15; then
    return 0
  fi

  log "bootstrap did not make service visible; trying launchctl load -w"
  /bin/launchctl load -w "$PLIST"
  local load_status=$?
  log "load -w exit=$load_status"
  wait_until_loaded 15
}

kickstart_service() {
  log "kickstarting $LABEL"
  /bin/launchctl kickstart -k "$(service_ref)" || true
}

wait_until_http_ready() {
  local remaining="${1:-30}"
  while [[ "$remaining" -gt 0 ]]; do
    if is_http_ready; then
      return 0
    fi
    sleep 1
    remaining=$((remaining - 1))
  done
  return 1
}

main() {
  log "ensure start"
  ensure_loaded

  if ! is_loaded; then
    log "service still not loaded after bootstrap"
    return 1
  fi

  if wait_until_http_ready 5; then
    log "healthy on port $PORT"
    return 0
  fi

  if ! has_port_listener; then
    log "port $PORT has no listener"
    kickstart_service
  elif ! is_http_ready; then
    log "port $PORT listener exists but health check failed"
    kickstart_service
  fi

  if wait_until_http_ready 30; then
    log "healthy on port $PORT"
    return 0
  fi

  log "unhealthy after ensure"
  return 1
}

main "$@"

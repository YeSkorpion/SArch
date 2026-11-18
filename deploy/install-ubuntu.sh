#!/usr/bin/env bash
# SArch auf einem Ubuntu-Server installieren und hinter HTTPS starten.
#
# Ein Befehl. Er lädt dieses Skript und danach den Quellcode von GitHub:
#   curl -fsSL https://raw.githubusercontent.com/YeSkorpion/SArch/main/deploy/install-ubuntu.sh | sudo bash
#
# Der DNS-Name muss vorher auf diesen Server zeigen.
# Andere Adresse, anderer SSH-Port, Kontakt für das Zertifikat:
#   curl -fsSL https://raw.githubusercontent.com/YeSkorpion/SArch/main/deploy/install-ubuntu.sh | sudo DOMAIN=www.beispiel.de SSH_PORT=2222 CADDY_EMAIL=admin@beispiel.de bash
#
# Privates Repository, derselbe Token für den Download und das Klonen:
#   curl -fsSL -H "Authorization: Bearer github_pat_..." https://raw.githubusercontent.com/YeSkorpion/SArch/main/deploy/install-ubuntu.sh | sudo GITHUB_TOKEN=github_pat_... bash
#
# Aus einem bereits vorhandenen Checkout:
#   sudo bash deploy/install-ubuntu.sh

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo ausführen: curl -fsSL https://raw.githubusercontent.com/YeSkorpion/SArch/main/deploy/install-ubuntu.sh | sudo bash" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]] || ! grep -qi '^ID=ubuntu' /etc/os-release; then
  echo "Dieses Skript ist für Ubuntu." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/sarch}"

load_saved_settings() {
  local file="${APP_DIR}/.install-env"
  [[ -f "${file}" ]] || return 0
  local key="" value=""
  while IFS='=' read -r key value || [[ -n "${key}" ]]; do
    [[ -z "${key}" || "${key}" == \#* ]] && continue
    case "${key}" in
      DOMAIN|CADDY_EMAIL|SSH_PORT|REPO_URL|REPO_REF) ;;
      *) continue ;;
    esac
    if [[ -z "${!key+x}" ]]; then
      printf -v "${key}" '%s' "${value-}"
    fi
  done < "${file}"
}

load_saved_settings

REPO_URL="${REPO_URL:-https://github.com/YeSkorpion/SArch.git}"
REPO_REF="${REPO_REF:-main}"
DOMAIN="${DOMAIN:-www.sarch.systemhaus-ess.de}"
CADDY_EMAIL="${CADDY_EMAIL:-}"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export APT_LISTCHANGES_FRONTEND=none

apt_update() {
  if ! apt-get update; then
    echo "apt-get update hat eine fremde Paketquelle übersprungen. Die Installation verwendet die übrigen Quellen." >&2
  fi
}

# Andere Dienste auf demselben Server behalten ihre Ports.
check_web_ports() {
  WEB_PORTS_BUSY=0
  command -v ss >/dev/null 2>&1 || return 0
  local port listener
  for port in 80 443; do
    listener="$(ss -ltnp "sport = :${port}" 2>/dev/null | awk 'NR>1 { print }' || true)"
    [[ -z "${listener}" ]] && continue
    if grep -q 'caddy' <<<"${listener}"; then
      continue
    fi
    WEB_PORTS_BUSY=1
    echo "Port ${port} ist belegt. Caddy wird nicht davor gesetzt:" >&2
    echo "${listener}" >&2
  done
}

locate_checkout() {
  local script_path="${BASH_SOURCE[0]:-}"
  [[ -n "${script_path}" && -f "${script_path}" ]] || return 1
  local root
  root="$(cd "$(dirname "${script_path}")/.." && pwd)"
  [[ -f "${root}/docker-compose.yml" && -f "${root}/src/Studio.Api/Dockerfile" ]] || return 1
  SOURCE="${root}"
}

bootstrap_from_github() {
  apt_update
  apt-get install -y git ca-certificates
  local staging
  staging="$(mktemp -d /tmp/sarch-src.XXXXXX)"
  echo "Lade SArch von ${REPO_URL} (Branch ${REPO_REF})."
  export GIT_TERMINAL_PROMPT=0
  local cloned=0
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    if git -c "http.extraHeader=AUTHORIZATION: bearer ${GITHUB_TOKEN}" clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" "${staging}"; then
      cloned=1
    fi
  elif git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" "${staging}"; then
    cloned=1
  fi
  if [[ "${cloned}" -ne 1 ]]; then
    rm -rf "${staging}"
    echo "Das Repository ${REPO_URL} (Branch ${REPO_REF}) ließ sich nicht klonen." >&2
    echo "Ein öffentliches Repository braucht keine Anmeldung. Für ein privates Repository GITHUB_TOKEN setzen." >&2
    exit 1
  fi
  if [[ ! -f "${staging}/deploy/install-ubuntu.sh" ]]; then
    rm -rf "${staging}"
    echo "Auf ${REPO_REF} fehlt deploy/install-ubuntu.sh." >&2
    exit 1
  fi
  echo "Starte die Installation aus dem geladenen Stand."
  local -a cmd=(
    env -u GITHUB_TOKEN
    "DOMAIN=${DOMAIN}"
    "CADDY_EMAIL=${CADDY_EMAIL}"
    "APP_DIR=${APP_DIR}"
    "REPO_URL=${REPO_URL}"
    "REPO_REF=${REPO_REF}"
  )
  if [[ -n "${SSH_PORT:-}" ]]; then
    cmd+=("SSH_PORT=${SSH_PORT}")
  fi
  cmd+=(bash "${staging}/deploy/install-ubuntu.sh")
  exec "${cmd[@]}"
}

if ! locate_checkout; then
  bootstrap_from_github
fi

install_base_packages() {
  apt_update
  apt-get install -y ca-certificates curl openssl rsync
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    systemctl enable --now docker
    return
  fi
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  local codename
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" > /etc/apt/sources.list.d/docker.list
  apt_update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

install_caddy() {
  if [[ "${WEB_PORTS_BUSY}" -eq 1 ]]; then
    echo "Caddy bleibt aus, damit der Dienst auf Port 80 oder 443 weiterläuft."
    return
  fi
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt_update
    apt-get install -y caddy
  fi
  systemctl enable --now caddy
}

configure_firewall() {
  if ! command -v ufw >/dev/null 2>&1 || ! ufw status | grep -q '^Status: active'; then
    echo "Die Firewall bleibt unverändert. Port 80 und 443 müssen für SArch erreichbar sein."
    return
  fi
  ufw allow OpenSSH
  if [[ -n "${SSH_PORT:-}" ]]; then
    ufw allow "${SSH_PORT}/tcp"
  fi
  ufw allow 80/tcp
  ufw allow 443/tcp
}

save_settings() {
  local old_umask
  old_umask="$(umask)"
  umask 077
  {
    printf 'DOMAIN=%s\n' "${DOMAIN}"
    printf 'CADDY_EMAIL=%s\n' "${CADDY_EMAIL}"
    printf 'SSH_PORT=%s\n' "${SSH_PORT:-}"
    printf 'REPO_URL=%s\n' "${REPO_URL}"
    printf 'REPO_REF=%s\n' "${REPO_REF}"
  } > "${APP_DIR}/.install-env"
  chmod 600 "${APP_DIR}/.install-env"
  umask "${old_umask}"
}

install_app() {
  install -d -m 0755 "${APP_DIR}"
  if [[ "${SOURCE}" != "${APP_DIR}" ]]; then
    rsync -a --delete \
      --exclude '.git/' \
      --exclude 'node_modules/' \
      --exclude 'bin/' \
      --exclude 'obj/' \
      --exclude 'dist/' \
      --exclude '.local/' \
      --exclude '.env' \
      --exclude '.install-env' \
      --exclude 'compose.https.yml' \
      "${SOURCE}/" "${APP_DIR}/"
  fi

  if grep -q '"8080:80"' "${APP_DIR}/docker-compose.yml"; then
    sed -i 's/"8080:80"/"127.0.0.1:8080:80"/' "${APP_DIR}/docker-compose.yml"
  fi

  cat > "${APP_DIR}/compose.https.yml" <<'EOF'
services:
  db:
    restart: unless-stopped
  api:
    restart: unless-stopped
    environment:
      ASPNETCORE_ENVIRONMENT: Production
  web:
    restart: unless-stopped
EOF

  # Das erste Passwort bleibt. PostgreSQL liegt im Volume und erwartet es beim nächsten Start.
  if [[ ! -f "${APP_DIR}/.env" ]]; then
    local db_password old_umask
    db_password="$(openssl rand -hex 24)"
    old_umask="$(umask)"
    umask 077
    cat > "${APP_DIR}/.env" <<EOF
POSTGRES_USER=studio
POSTGRES_PASSWORD=${db_password}
POSTGRES_DB=studio
STUDIO_SEED_DEMO=false
EOF
    chmod 600 "${APP_DIR}/.env"
    umask "${old_umask}"
  fi

  save_settings
}

caddyfile_is_replaceable() {
  [[ ! -f /etc/caddy/Caddyfile ]] && return 0
  local sites
  sites="$(grep -E '^[^#[:space:]].*\{' /etc/caddy/Caddyfile || true)"
  [[ -z "${sites}" ]] && return 0
  [[ "${sites}" == ":80 {" ]] && grep -q '/usr/share/caddy' /etc/caddy/Caddyfile
}

write_caddy() {
  if [[ "${WEB_PORTS_BUSY}" -eq 1 ]]; then
    return
  fi
  if [[ -f /etc/caddy/Caddyfile && ! -f /etc/caddy/Caddyfile.before-sarch ]]; then
    cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-sarch
  fi
  local site email_block=""
  site="$(printf '%s {\n    encode zstd gzip\n    reverse_proxy 127.0.0.1:8080\n}\n' "${DOMAIN}")"
  if [[ -n "${CADDY_EMAIL}" ]]; then
    email_block="$(printf '{\n    email %s\n}\n' "${CADDY_EMAIL}")"
  fi
  if [[ -f /etc/caddy/Caddyfile ]] && grep -q '# BEGIN sarch' /etc/caddy/Caddyfile; then
    local tmp
    tmp="$(mktemp)"
    awk 'BEGIN {skip=0} /# BEGIN sarch/ {skip=1; next} /# END sarch/ {skip=0; next} skip==0 {print}' /etc/caddy/Caddyfile > "${tmp}"
    mv "${tmp}" /etc/caddy/Caddyfile
  fi
  if caddyfile_is_replaceable; then
    cat > /etc/caddy/Caddyfile <<EOF
${email_block}# BEGIN sarch
${site}# END sarch
EOF
  else
    cat >> /etc/caddy/Caddyfile <<EOF
# BEGIN sarch
${site}# END sarch
EOF
  fi
  chmod 644 /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
}

compose() {
  docker compose --project-directory "${APP_DIR}" \
    -f "${APP_DIR}/docker-compose.yml" \
    -f "${APP_DIR}/compose.https.yml" \
    "$@"
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:8080/health >/dev/null; then
      return
    fi
    sleep 2
  done
  echo "Die Anwendung antwortet nicht auf http://127.0.0.1:8080/health." >&2
  compose logs --tail 80 >&2 || true
  exit 1
}

echo "Installiere Docker, Caddy und prüfe die Firewall."
install_base_packages
install_docker
check_web_ports
install_caddy
configure_firewall

echo "Lege SArch nach ${APP_DIR}."
install_app

echo "Baue und starte die Container."
compose up --build -d
wait_for_health

if [[ "${WEB_PORTS_BUSY}" -eq 1 ]]; then
  echo "Starte SArch ohne Caddy, weil Port 80 oder 443 belegt ist."
else
  echo "Aktiviere HTTPS für ${DOMAIN}."
  write_caddy
fi

if [[ "${SOURCE}" == /tmp/sarch-src.* ]]; then
  rm -rf "${SOURCE}"
fi

if [[ "${WEB_PORTS_BUSY}" -eq 1 ]]; then
  cat <<EOF

SArch läuft auf diesem Server unter http://127.0.0.1:8080
Port 80 oder 443 war schon belegt, deshalb wurde Caddy nicht davorgesetzt.
Leite https://${DOMAIN} im bestehenden Webserver auf http://127.0.0.1:8080 weiter.
EOF
else
  cat <<EOF

SArch läuft hinter https://${DOMAIN}
Die Oberfläche ist nur über Caddy erreichbar.
EOF
fi

cat <<EOF
PostgreSQL hat keinen offenen Port.
Das Datenbankpasswort steht in ${APP_DIR}/.env.
Adresse, SSH-Port und Zertifikat-Kontakt stehen in ${APP_DIR}/.install-env.

Lege im Browser das erste Konto an. Die Registrierung ist offen.
Das Passwort braucht mindestens 12 Zeichen, Groß- und Kleinbuchstaben, eine Ziffer und ein Sonderzeichen.

Aktualisieren später, denselben Befehl erneut ausführen:
  curl -fsSL https://raw.githubusercontent.com/YeSkorpion/SArch/${REPO_REF}/deploy/install-ubuntu.sh | sudo bash
EOF

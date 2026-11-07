#!/usr/bin/env bash
# Prepares the host to run the relay (server/) under systemd. Run setup-vm.sh first. Safe to run again.
# usage: sudo ./setup-relay.sh <file with the CI relay public key>
set -euo pipefail

pub="${1:?usage: setup-relay.sh <ci-relay-public-key-file>}"
here="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

# node 24 (the version in .nvmrc) from nodesource, kept patched by unattended-upgrades
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]; then
	curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
		gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
	echo 'deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main' \
		>/etc/apt/sources.list.d/nodesource.list
	apt-get update -qq
	apt-get install -y -qq nodejs >/dev/null
fi
uu=/etc/apt/apt.conf.d/52lobster-unattended
grep -q 'deb.nodesource.com' "$uu" ||
	echo 'Unattended-Upgrade::Origins-Pattern:: "site=deb.nodesource.com";' >>"$uu"

# the relay runs as its own account; deploy installs the code, the relay only reads it
id lobster-bff >/dev/null 2>&1 || adduser --system --group --home /var/lib/lobster-bff --shell /usr/sbin/nologin lobster-bff
install -d -m 755 -o deploy -g deploy /srv/lobster-bff /srv/lobster-bff/releases
install -d -m 750 -o root -g lobster-bff /etc/lobster-bff
[ -f /etc/lobster-bff/env ] || install -m 640 -o root -g lobster-bff /dev/null /etc/lobster-bff/env

# deploy may restart the relay, nothing else
sudoers=/etc/sudoers.d/60-deploy-relay
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart lobster-bff.service' >"$sudoers"
chmod 440 "$sudoers"
visudo -cqf "$sudoers"

install -m 755 "$here/relay-deploy" /usr/local/bin/relay-deploy
install -m 644 "$here/lobster-bff.service" /etc/systemd/system/lobster-bff.service
systemctl daemon-reload
systemctl enable -q lobster-bff.service

ak=/var/lib/deploy/.ssh/authorized_keys
key="$(tr -d '\r' <"$pub")"
grep -qF "$key" "$ak" || printf 'restrict,command="/usr/local/bin/relay-deploy" %s\n' "$key" >>"$ak"
echo "setup-relay: ready; the first relay-deploy upload starts it"

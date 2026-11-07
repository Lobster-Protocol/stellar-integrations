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

# three accounts, three jobs: bff-deploy installs the relay code, lobster-bff runs it read-only,
# and deploy (the front) has no say over either
id lobster-bff >/dev/null 2>&1 || adduser --system --group --home /var/lib/lobster-bff --shell /usr/sbin/nologin lobster-bff
id bff-deploy >/dev/null 2>&1 || adduser --system --group --home /var/lib/bff-deploy --shell /bin/sh bff-deploy
chown root:root /var/lib/bff-deploy
chmod 755 /var/lib/bff-deploy
install -d -m 755 /srv/lobster-bff
chown -R bff-deploy:bff-deploy /srv/lobster-bff
install -d -m 755 -o bff-deploy -g bff-deploy /srv/lobster-bff/releases /srv/lobster-bff/.npm-cache
install -d -m 750 -o root -g lobster-bff /etc/lobster-bff
for f in env env.vm; do
	[ -f "/etc/lobster-bff/$f" ] || install -m 640 -o root -g lobster-bff /dev/null "/etc/lobster-bff/$f"
done

# bff-deploy may restart the relay, nothing else. Checked before it goes in: one bad file in
# sudoers.d breaks sudo for every account
sudo_new="$(mktemp)"
echo 'bff-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart lobster-bff.service' >"$sudo_new"
visudo -cqf "$sudo_new"
install -m 440 -o root -g root "$sudo_new" /etc/sudoers.d/60-deploy-relay
rm -f "$sudo_new"

install -m 755 "$here/relay-deploy" /usr/local/bin/relay-deploy
install -m 644 "$here/lobster-bff.service" /etc/systemd/system/lobster-bff.service
systemctl daemon-reload
systemctl enable -q lobster-bff.service

# the relay key goes to bff-deploy only (setup-vm.sh set up the key directory and the Match block)
ak=/etc/ssh/authorized_keys/bff-deploy
touch "$ak"
key="$(tr -d '\r' <"$pub")"
grep -qF "$key" "$ak" || printf 'restrict,command="/usr/local/bin/relay-deploy" %s\n' "$key" >>"$ak"
chown root:root "$ak"
chmod 644 "$ak"
sed -i '/relay-deploy/d' /etc/ssh/authorized_keys/deploy
conf=/etc/ssh/sshd_config.d/00-lobster-hardening.conf
conf_saved="$(mktemp)"
cp -a "$conf" "$conf_saved"
grep -Eq '^AllowUsers(.* )?bff-deploy( |$)' "$conf" || sed -i 's/^AllowUsers .*/& bff-deploy/' "$conf"
if ! sshd -t; then
	cp -a "$conf_saved" "$conf"
	rm -f "$conf_saved"
	echo "setup-relay: the sshd change does not validate, the previous file is back" >&2
	exit 1
fi
rm -f "$conf_saved"
systemctl reload ssh
echo "setup-relay: ready; the first relay-deploy upload starts the relay"

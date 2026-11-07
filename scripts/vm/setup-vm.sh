#!/usr/bin/env bash
# Prepares a Debian host to serve the static front end. Safe to run again.
# usage: sudo ./setup-vm.sh <file with the CI upload public key>
set -euo pipefail

pub="${1:?usage: setup-vm.sh <ci-public-key-file>}"
site=stellar-instit
here="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

# caddy from its own repo, kept patched by unattended-upgrades like the rest of the system
if ! command -v caddy >/dev/null; then
	apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg >/dev/null
	curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
		gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
	chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -qq
	apt-get install -y -qq caddy >/dev/null
fi
uu=/etc/apt/apt.conf.d/52lobster-unattended
grep -q 'cloudsmith/caddy' "$uu" 2>/dev/null ||
	echo 'Unattended-Upgrade::Origins-Pattern:: "origin=cloudsmith/caddy/stable";' >>"$uu"

# the VM hosts other projects: their sites stay in the main Caddyfile or in their own file,
# this one only adds the import line (or replaces the stock welcome page on a fresh install)
mkdir -p /etc/caddy/sites
cf=/etc/caddy/Caddyfile
if grep -q '/usr/share/caddy' "$cf" 2>/dev/null; then
	printf '%s\n' '# one file per site in /etc/caddy/sites' 'import /etc/caddy/sites/*.caddy' >"$cf"
elif ! grep -qxF 'import /etc/caddy/sites/*.caddy' "$cf"; then
	printf '\n%s\n%s\n' '# sites kept in their own file, one per project (stellar-instit: repo stellar-integrations, scripts/vm)' \
		'import /etc/caddy/sites/*.caddy' >>"$cf"
fi
install -m 644 "$here/$site.caddy" "/etc/caddy/sites/$site.caddy"

# upload account: no password, and each key in authorized_keys is pinned to site-deploy
id deploy >/dev/null 2>&1 || adduser --system --group --home /var/lib/deploy --shell /bin/sh deploy
install -m 755 "$here/site-deploy" /usr/local/bin/site-deploy
install -d -m 755 -o deploy -g deploy "/srv/$site" "/srv/$site/releases" "/srv/$site/assets"
# root owns the key list, so even a hostile upload running as deploy cannot lift the pin
install -d -m 755 -o root -g root /var/lib/deploy/.ssh
ak=/var/lib/deploy/.ssh/authorized_keys
key="$(tr -d '\r' <"$pub")"
touch "$ak"
grep -qF "$key" "$ak" || printf 'restrict,command="/usr/local/bin/site-deploy %s" %s\n' "$site" "$key" >>"$ak"
chown root:root "$ak"
chmod 644 "$ak"

# sshd: let deploy in, without a terminal or any forwarding
conf=/etc/ssh/sshd_config.d/00-lobster-hardening.conf
sed -i 's/^AllowUsers alexis$/AllowUsers alexis deploy/' "$conf"
grep -q '^Match User deploy' "$conf" || printf '\n%s\n' \
	'# CI upload keys: authorized_keys pins each one to a single command' \
	'Match User deploy' $'\tPermitTTY no' $'\tAllowTcpForwarding no' $'\tAllowAgentForwarding no' $'\tX11Forwarding no' >>"$conf"
sshd -t
systemctl reload ssh

# firewall: web ports next to SSH; reloading the ruleset drops fail2ban's table, so restart it
nft=/etc/nftables.conf
if ! grep -q 'dport { 80, 443 }' "$nft"; then
	sed -i -e $'s/^\t\ttcp dport 22 accept$/\t\ttcp dport 22 accept\\\n\t\ttcp dport { 80, 443 } accept\\\n\t\tudp dport 443 accept/' \
		-e 's/^# Inbound is SSH only.*/# Inbound: SSH (rate limited) and the web server on 80 and 443./' "$nft"
	nft -c -f "$nft"
	nft -f "$nft"
	systemctl restart fail2ban
fi

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy
echo "setup-vm: ready, $site is served from /srv/$site/current"

#!/usr/bin/env bash
# Run this ON the VM (password SSH session). Adds the laptop key, clones WQMS.
set -euo pipefail

mkdir -p "$HOME/.ssh"
chmod go-w "$HOME" || true
chmod 700 "$HOME/.ssh"
KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILmFrO7/ZSzv1Be/UsDDcG/qQY0TX39JfWZ5iYT2P/MH aubair.akif@devslooptech.com'
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
grep -qxF "$KEY" "$HOME/.ssh/authorized_keys" || echo "$KEY" >> "$HOME/.ssh/authorized_keys"

if [[ ! -d "$HOME/wqms/.git" ]]; then
  mkdir -p "$HOME/wqms"
  rm -rf /tmp/wqms-src
  git clone https://github.com/adminprmsc/prmsc-ens-wqms.git /tmp/wqms-src
  cp -a /tmp/wqms-src/. "$HOME/wqms/"
  rm -rf /tmp/wqms-src
else
  git -C "$HOME/wqms" pull --ff-only || true
fi

echo "KEY_AND_CLONE_OK"
ls -la "$HOME/.ssh"
echo "repo: $(git -C "$HOME/wqms" rev-parse --short HEAD)"

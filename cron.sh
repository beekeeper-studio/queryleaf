#! /bin/bash

set -euxo pipefail
source ~/.bashrc
export GIT_SSH_COMMAND='ssh -i /home/rathboma/.ssh/id_rsa -o IdentitiesOnly=yes -o UserKnownHostsFile=/home/rathboma/.ssh/known_hosts -o StrictHostKeyChecking=yes'
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

git pull
/home/rathboma/.local/bin/mise exec node@18 -- ./automate.sh

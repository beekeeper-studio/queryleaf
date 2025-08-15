#! /bin/bash

set -euxo pipefail
source ~/.bashrc
export GIT_SSH_COMMAND='ssh -i /home/rathboma/.ssh/ql_rsa -o IdentitiesOnly=yes -o UserKnownHostsFile=/home/rathboma/.ssh/known_hosts -o StrictHostKeyChecking=no'
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

git fetch origin
git checkout main
git reset --hard origin/main
/home/rathboma/.local/bin/mise exec node@18 -- bin/automate.sh
git push
curl https://api.honeybadger.io/v1/check_in/nKIB9E &> /dev/null

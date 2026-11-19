#!/bin/sh
set -eu
umask 077
# Repair the mount root before dropping privileges. SQLite files are created as UID 1000.
mkdir -p /app/data
chown 1000:0 /app/data
chmod 700 /app/data
cp /etc/benchify/config.json /app/data/config.json
chown 1000:0 /app/data/config.json
chmod 600 /app/data/config.json
exec su-exec 1000:0 /bin/sh /etc/benchify/check-start.sh

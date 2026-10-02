#!/usr/bin/env bash
# Démarre l'environnement local : Docker (si le démon est arrêté), Supabase (Postgres, Auth,
# REST, Storage, Mailpit) puis, avec --app, le serveur Next.js. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Démarrage du démon Docker…"
  # Après recyclage du conteneur, le fichier PID peut désigner un autre processus.
  if [[ -f /var/run/docker.pid ]] && ! grep -qs dockerd "/proc/$(cat /var/run/docker.pid)/comm"; then
    rm -f /var/run/docker.pid /var/run/docker.sock
  fi
  (nohup dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
fi

if ! npx supabase status >/dev/null 2>&1; then
  echo "Démarrage de Supabase…"
  npx supabase stop --no-backup >/dev/null 2>&1 || true
  npx supabase start -x studio,vector,logflare,edge-runtime,supavisor,postgres-meta
fi

if [[ "${1:-}" == "--app" ]] && ! curl -s -o /dev/null http://localhost:3000/login; then
  echo "Démarrage de Next.js…"
  (nohup npm run dev >/tmp/next-dev.log 2>&1 &)
  for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:3000/login && break; sleep 1; done
fi
echo "Environnement prêt."

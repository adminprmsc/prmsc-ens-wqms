# Replace live WQMS at wqms.essprmsc.com (101.50.84.115)

**Goal:** [http://wqms.essprmsc.com/login](http://wqms.essprmsc.com/login) should serve the **Arsham Flask** app with **`instance/water_quality.db`** (SQLite), instead of the app currently on the VM.

**SSH (password):**
```bash
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no prmsc101@101.50.84.115
```

**Expect ~15–30 minutes** and a short outage while Nginx is switched and the old stack is stopped.

---

## Before you start (on your Mac)

1. Confirm local DB is the one you want live:
   ```bash
   cd "/Users/aubairakif/Codebases/ESS PRMSC-HO/Water Quality/Arsham code/wqms"
   sqlite3 instance/water_quality.db "SELECT count(*) FROM test_report_metadata;"
   ```
2. Have the VM password for `prmsc101`.
3. Tell users the site may be down briefly during cutover.

---

## Step 1 — Backup what is live today (on VM)

SSH in, then:

```bash
# Backup Nginx site config (rollback)
sudo cp /etc/nginx/sites-available/wqms.essprmsc.com \
  /etc/nginx/sites-available/wqms.essprmsc.com.bak.$(date +%Y%m%d) 2>/dev/null || true

# If old Docker WQMS exists in ~/wqms — backup Postgres (optional but recommended)
if [ -d "$HOME/wqms" ]; then
  cd ~/wqms
  docker compose -f docker-compose.prod.yml ps 2>/dev/null || true
  make db-backup 2>/dev/null || docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U wqms_user wqms_db > ~/wqms_postgres_backup_$(date +%Y%m%d).sql 2>/dev/null || true
fi
```

---

## Step 2 — Upload new app + SQLite (from your Mac)

On your Mac (not the VM):

```bash
cd "/Users/aubairakif/Codebases/ESS PRMSC-HO/Water Quality/Arsham code/wqms"
chmod +x deploy/push-from-local.sh
./deploy/push-from-local.sh
```

This creates/updates **`~/wqms-flask`** on the VM and copies **`instance/water_quality.db`**.

Verify on VM (optional):

```bash
ssh prmsc101@101.50.84.115
sqlite3 ~/wqms-flask/instance/water_quality.db "SELECT count(*) FROM test_report_metadata;"
```

---

## Step 3 — Install Python app on VM (first time or after big updates)

On the VM:

```bash
cd ~/wqms-flask
bash deploy/server-setup.sh
```

Set production secret (first time):

```bash
nano ~/wqms-flask/.env
# Set SECRET_KEY=... (long random string)
# Keep GUNICORN_BIND=127.0.0.1:5000
chmod 600 ~/wqms-flask/.env
sudo systemctl restart wqms-flask
```

**Test new app only on the server** (old site can still be public):

```bash
curl -I http://127.0.0.1:5000/login
# Expect HTTP 200
sudo systemctl status wqms-flask
```

Log in at `http://127.0.0.1:5000/login` via SSH tunnel if needed:

```bash
# On your Mac:
ssh -L 5000:127.0.0.1:5000 prmsc101@101.50.84.115
# Browser: http://localhost:5000/login
```

---

## Step 4 — Switch the domain to Flask (replacement moment)

On the VM:

```bash
# Stop old Docker stack so port 8080 is free (if you used Docker before)
cd ~/wqms 2>/dev/null && docker compose -f docker-compose.prod.yml stop || true

# Point Nginx at Flask (127.0.0.1:5000) instead of Docker (:8080)
sudo cp ~/wqms-flask/deploy/wqms.essprmsc.com.flask.conf \
  /etc/nginx/sites-available/wqms.essprmsc.com
sudo ln -sf /etc/nginx/sites-available/wqms.essprmsc.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 5 — Verify production

```bash
curl -I http://wqms.essprmsc.com/login
curl -I https://wqms.essprmsc.com/login
```

In a browser:

- [http://wqms.essprmsc.com/login](http://wqms.essprmsc.com/login) or **https://** — should show **Flask** login (Arsham UI), not the old React SPA.
- Log in with accounts that exist in **SQLite** (e.g. local test users you created, or reset passwords on VM).
- Open a few reports and confirm counts match your uploaded DB.

On VM:

```bash
sqlite3 ~/wqms-flask/instance/water_quality.db "SELECT count(*) FROM test_report_metadata;"
sudo journalctl -u wqms-flask -n 30 --no-pager
```

---

## Step 6 — After go-live

| Task | Command |
|------|---------|
| Watch logs | `sudo journalctl -u wqms-flask -f` |
| Restart app | `sudo systemctl restart wqms-flask` |
| Backup SQLite | `cp ~/wqms-flask/instance/water_quality.db ~/backups/wqms_$(date +%Y%m%d).db` |

**Update code later:** run `./deploy/push-from-local.sh` from Mac, then on VM:
`cd ~/wqms-flask && source venv/bin/activate && pip install -r requirements.txt && sudo systemctl restart wqms-flask`

**Replace DB only:** backup on VM, then `scp` new `water_quality.db` to `~/wqms-flask/instance/` and restart service.

---

## Rollback (restore old site)

```bash
sudo cp /etc/nginx/sites-available/wqms.essprmsc.com.bak.YYYYMMDD \
  /etc/nginx/sites-available/wqms.essprmsc.com
sudo nginx -t && sudo systemctl reload nginx
cd ~/wqms && docker compose -f docker-compose.prod.yml up -d
sudo systemctl stop wqms-flask
```

---

## Important notes

| Topic | Detail |
|-------|--------|
| **Database** | New site uses **SQLite** (`water_quality.db`). Old Docker app used **Postgres**. This guide **replaces** live data with your **uploaded SQLite file**, not an automatic Postgres→SQLite merge. |
| **Users/passwords** | Only users in the uploaded SQLite file work unless you register new ones or run `create_viewer_user.py` on the VM. |
| **HTTPS** | If Certbot already configured the domain, the HTTP block may redirect to HTTPS; Flask config still sits behind Nginx. Re-run `sudo certbot --nginx -d wqms.essprmsc.com` only if SSL breaks after config swap. |
| **OCR / lab import** | Needs `tesseract-ocr` and `poppler-utils` (installed by `server-setup.sh`). |

---

## Quick checklist

- [ ] Step 1 — Backups on VM  
- [ ] Step 2 — `push-from-local.sh` from Mac  
- [ ] Step 3 — `server-setup.sh`, `.env`, curl `:5000/login`  
- [ ] Step 4 — Stop Docker, Nginx → Flask  
- [ ] Step 5 — Browser test on wqms.essprmsc.com  
- [ ] Step 6 — SQLite backup cron / process agreed with team  

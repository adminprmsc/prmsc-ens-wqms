# Host WQMS (Flask + SQLite) on the VM

**Replacing the live site at [wqms.essprmsc.com](http://wqms.essprmsc.com/login)?**  
Use the full checklist: **[REPLACE_LIVE_SITE.md](./REPLACE_LIVE_SITE.md)**.

This app runs with a **single SQLite file**: `instance/water_quality.db`.  
No Postgres required for this project.

| | |
|---|---|
| **SSH** | `ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no prmsc101@101.50.84.115` |
| **App on VM** | `~/wqms-flask` |
| **Database** | `~/wqms-flask/instance/water_quality.db` |
| **App process** | Gunicorn → `127.0.0.1:5000` (systemd: `wqms-flask`) |
| **Public URL** | https://wqms.essprmsc.com (Nginx in front) |

---

## 1. Upload code + SQLite (from your Mac)

Use the copy of the app that has the data you want live (including `instance/water_quality.db`).

```bash
cd "/Users/aubairakif/Codebases/ESS PRMSC-HO/Water Quality/Arsham code/wqms"
./deploy/push-from-local.sh
```

Enter the VM password when prompted. The script uploads the app and **overwrites** `~/wqms-flask/instance/water_quality.db` on the server.

---

## 2. Install / update on the VM

```bash
ssh prmsc101@101.50.84.115
cd ~/wqms-flask
bash deploy/server-setup.sh
```

First time only — set secrets:

```bash
cp deploy/.env.production.example .env
nano .env          # set SECRET_KEY
chmod 600 .env
sudo systemctl restart wqms-flask
```

Check:

```bash
curl -I http://127.0.0.1:5000/login
sqlite3 instance/water_quality.db "SELECT count(*) FROM test_report_metadata;"
```

---

## 3. Nginx (public access)

One-time (or after config changes):

```bash
sudo cp ~/wqms-flask/deploy/wqms.essprmsc.com.flask.conf \
  /etc/nginx/sites-available/wqms.essprmsc.com
sudo ln -sf /etc/nginx/sites-available/wqms.essprmsc.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. Later updates (code or DB only)

**Code only** (keep server DB):

```bash
./deploy/push-from-local.sh
# On VM:
cd ~/wqms-flask && source venv/bin/activate && pip install -r requirements.txt
sudo systemctl restart wqms-flask
```

**Replace DB from your Mac** (e.g. refreshed local copy):

```bash
scp -o PreferredAuthentications=password -o PubkeyAuthentication=no \
  instance/water_quality.db \
  prmsc101@101.50.84.115:~/wqms-flask/instance/water_quality.db
sudo systemctl restart wqms-flask   # on VM
```

**Backup DB on VM** before replacing:

```bash
cp ~/wqms-flask/instance/water_quality.db \
  ~/water_quality_backup_$(date +%Y%m%d_%H%M).db
```

---

## 5. Logs & service

```bash
sudo systemctl status wqms-flask
sudo journalctl -u wqms-flask -f
```

---

## Requirements on VM

Installed by `server-setup.sh`:

- Python 3 + venv, Gunicorn, pip packages from `requirements.txt`
- **tesseract-ocr**, **poppler-utils** (lab report OCR)
- Nginx (reverse proxy)

SQLite needs no separate database server — back up `water_quality.db` regularly.

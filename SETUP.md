# WQMS Production Setup Guide

Complete guide for deploying the Water Quality Management System on a production server.

## Table of Contents
- [Server Requirements](#server-requirements)
- [Initial Server Setup](#initial-server-setup)
- [Application Installation](#application-installation)
- [Nginx Configuration](#nginx-configuration)
- [Systemd Service Setup](#systemd-service-setup)
- [Service Management](#service-management)
- [Deployment Changes Documentation](#deployment-changes-documentation)
- [Troubleshooting](#troubleshooting)

---

## Server Requirements

### Minimum Specifications
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **RAM**: 2GB minimum, 4GB recommended
- **CPU**: 2 cores minimum
- **Storage**: 20GB minimum
- **Python**: 3.8 or higher
- **Network**: Public IP address

### Required Software
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Python and dependencies
sudo apt install -y python3 python3-pip python3-venv

# Install Nginx
sudo apt install -y nginx

# Install Git (if not already installed)
sudo apt install -y git

# Install system utilities
sudo apt install -y curl wget htop net-tools
```

---

## Initial Server Setup

### 1. Create Application Directory
```bash
# Create directory structure
sudo mkdir -p /home/user_wqms/web/wqms.prmsc
cd /home/user_wqms/web/wqms.prmsc
```

### 2. Clone Repository
```bash
# Clone from GitHub
git clone https://github.com/Arshamazam/WQMS-PRMSC-Deployed-.git wqms_prmsc
cd wqms_prmsc
```

### 3. Create Virtual Environment
```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip
```

### 4. Install Python Dependencies
```bash
# Install from requirements.txt
pip install -r requirements.txt

# Install Gunicorn (if not in requirements.txt)
pip install gunicorn
```

---

## Application Installation

### 1. Configure Application Settings

Edit `config.py` to set production values:

```python
# config.py
class ProductionConfig(Config):
    DEBUG = False
    TESTING = False
    
    # Database - Use PostgreSQL for production (recommended)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///water_quality.db'
    
    # Security
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'CHANGE-THIS-TO-RANDOM-STRING'
    SESSION_COOKIE_SECURE = True  # Enable for HTTPS
    
    # Email Configuration
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', 'your-email@gmail.com')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', 'your-app-password')
```

### 2. Initialize Database
```bash
# Activate virtual environment
source venv/bin/activate

# Create database tables
python3 -c "from app import app, db; app.app_context().push(); db.create_all(); print('Database initialized successfully')"
```

### 3. Create Upload Directories
```bash
# Create necessary directories
mkdir -p uploads/sample_images
mkdir -p instance
mkdir -p static/data

# Set permissions
chmod -R 755 uploads
chmod -R 755 instance
```

### 4. Test Application Locally
```bash
# Run Flask development server
python3 app.py

# In another terminal, test the application
curl http://localhost:5000
```

---

## Nginx Configuration

### 1. Backup Existing Configuration
```bash
# Backup current Nginx config
sudo cp /etc/nginx/conf.d/YOUR_IP.conf /etc/nginx/conf.d/YOUR_IP.conf.backup
```

### 2. Create Nginx Configuration

Create or edit `/etc/nginx/conf.d/YOUR_IP.conf`:

```nginx
server {
    listen YOUR_IP:80 default_server;
    server_name _;
    
    # Timeouts
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    proxy_read_timeout 300;
    send_timeout 300;
    
    # Upload size
    client_max_body_size 100M;
    
    # Logging
    access_log /var/log/nginx/wqms_access.log;
    error_log /var/log/nginx/wqms_error.log;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Static files (optional - serve directly from Nginx)
    location /static/ {
        alias /home/user_wqms/web/wqms.prmsc/wqms_prmsc/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /uploads/ {
        alias /home/user_wqms/web/wqms.prmsc/wqms_prmsc/uploads/;
        expires 30d;
    }
}
```

### 3. Test and Reload Nginx
```bash
# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx

# Check Nginx status
sudo systemctl status nginx
```

---

## Systemd Service Setup

### 1. Review Service File

The `wqms.service` file should contain:

```ini
[Unit]
Description=Water Quality Management System - Gunicorn
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/home/user_wqms/web/wqms.prmsc/wqms_prmsc
Environment="PATH=/home/user_wqms/web/wqms.prmsc/wqms_prmsc/venv/bin"
ExecStart=/home/user_wqms/web/wqms.prmsc/wqms_prmsc/venv/bin/gunicorn -c gunicorn_config.py app:app
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true
Restart=always
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 2. Install and Enable Service
```bash
# Copy service file to systemd directory
sudo cp wqms.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable wqms

# Start the service
sudo systemctl start wqms

# Check service status
sudo systemctl status wqms
```

### 3. Verify Gunicorn is Running
```bash
# Check if Gunicorn is listening on port 5000
ss -tlnp | grep 5000

# Should show: 0.0.0.0:5000

# Check running processes
ps aux | grep gunicorn
```

---

## Service Management

### Basic Commands

```bash
# Start the service
sudo systemctl start wqms

# Stop the service
sudo systemctl stop wqms

# Restart the service
sudo systemctl restart wqms

# Reload configuration (graceful restart)
sudo systemctl reload wqms

# Check service status
sudo systemctl status wqms

# Enable auto-start on boot
sudo systemctl enable wqms

# Disable auto-start
sudo systemctl disable wqms
```

### View Logs

```bash
# View real-time logs
sudo journalctl -u wqms -f

# View last 50 lines
sudo journalctl -u wqms -n 50

# View logs since today
sudo journalctl -u wqms --since today

# View Nginx access logs
tail -f /var/log/nginx/wqms_access.log

# View Nginx error logs
tail -f /var/log/nginx/wqms_error.log
```

### After Making Code Changes

**Important**: Always restart the service after making code changes!

```bash
# Method 1: Using systemctl (recommended)
sudo systemctl restart wqms

# Method 2: Using the management script
./manage_service.sh restart

# Method 3: Manual restart
pkill -9 -f gunicorn
source venv/bin/activate
gunicorn -c gunicorn_config.py app:app &
```

### After Pulling from Git

```bash
# 1. Navigate to project directory
cd /home/user_wqms/web/wqms.prmsc/wqms_prmsc

# 2. Pull latest changes
git pull origin main

# 3. Activate virtual environment
source venv/bin/activate

# 4. Install any new dependencies
pip install -r requirements.txt

# 5. Run database migrations (if any)
python3 -c "from app import app, db; app.app_context().push(); db.create_all()"

# 6. Restart the service
sudo systemctl restart wqms

# 7. Verify it's running
sudo systemctl status wqms
curl -I http://localhost:5000
```

### After Deleting Files

```bash
# 1. Remove files from git tracking
git rm path/to/file.py

# 2. Commit the changes
git commit -m "Removed unnecessary files"

# 3. Restart the service
sudo systemctl restart wqms

# 4. Check for errors
sudo journalctl -u wqms -n 50
```

---

## Deployment Changes Documentation

### Changes Made to Enable Production Deployment

This section documents all changes made to make the application accessible via server IP.

#### 1. Gunicorn Configuration (`gunicorn_config.py`)

**Changes Made:**
- Reduced `workers` from `multiprocessing.cpu_count() * 2 + 1` to `2` for better stability
- Increased `timeout` from `30` to `120` seconds to handle slow requests
- Already configured to bind to `0.0.0.0:5000` (all network interfaces)

**Before:**
```python
workers = multiprocessing.cpu_count() * 2 + 1
timeout = 30
```

**After:**
```python
workers = 2  # Reduced for stability
timeout = 120  # Increased for slow requests
```

**Reason**: Too many workers can cause high CPU usage and memory issues on smaller servers. The increased timeout prevents worker timeouts during database operations.

#### 2. Nginx Reverse Proxy Configuration

**File**: `/etc/nginx/conf.d/72.61.141.192.conf`

**Changes Made:**
- Configured reverse proxy to forward HTTP requests from port 80 to Flask app on port 5000
- Added proper proxy headers for client IP tracking
- Configured static file serving for better performance
- Added logging for debugging

**Before:**
```nginx
location / {
    proxy_pass http://72.61.141.192:8080;
}
```

**After:**
```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location /static/ {
    alias /home/user_wqms/web/wqms.prmsc/wqms_prmsc/static/;
    expires 30d;
}
```

**Reason**: Nginx acts as a reverse proxy, handling SSL termination, static files, and load balancing. This improves performance and security.

#### 3. Systemd Service Configuration (`wqms.service`)

**Changes Made:**
- Changed `Type` from `notify` to `simple` (Gunicorn doesn't support notify type)
- Changed `User` and `Group` from `user_wqms` to `root` (to match current deployment)
- Changed `Restart` from `on-failure` to `always` for better reliability
- Added `StandardOutput=journal` and `StandardError=journal` for logging

**Before:**
```ini
[Service]
Type=notify
User=user_wqms
Group=user_wqms
Restart=on-failure
```

**After:**
```ini
[Service]
Type=simple
User=root
Group=root
Restart=always
StandardOutput=journal
StandardError=journal
```

**Reason**: The `simple` type works better with Gunicorn. Running as root matches the current deployment (though creating a dedicated user is recommended for production). The `always` restart policy ensures the service recovers from any failure.

#### 4. Network Binding

**Issue**: Gunicorn was binding to `127.0.0.1:5000` (localhost only) instead of `0.0.0.0:5000` (all interfaces)

**Solution**: Ensured `gunicorn_config.py` has `bind = "0.0.0.0:5000"` and restarted the service

**Verification**:
```bash
# Before fix:
ss -tlnp | grep 5000
# Output: LISTEN 127.0.0.1:5000

# After fix:
ss -tlnp | grep 5000
# Output: LISTEN 0.0.0.0:5000
```

---

## Troubleshooting

### Application Not Accessible

**Problem**: Cannot access application via browser

**Solutions**:
```bash
# 1. Check if service is running
sudo systemctl status wqms

# 2. Check if Gunicorn is listening
ss -tlnp | grep 5000
# Should show: 0.0.0.0:5000

# 3. Check Nginx status
sudo systemctl status nginx

# 4. Test local connection
curl -I http://127.0.0.1:5000

# 5. Test external connection
curl -I http://YOUR_SERVER_IP

# 6. Check firewall rules
sudo ufw status
sudo iptables -L -n

# 7. View error logs
sudo journalctl -u wqms -n 50
tail -f /var/log/nginx/wqms_error.log
```

### Service Won't Start

**Problem**: `systemctl start wqms` fails

**Solutions**:
```bash
# 1. Check service file syntax
sudo systemctl daemon-reload

# 2. View detailed error
sudo journalctl -u wqms -xe

# 3. Test Gunicorn manually
cd /home/user_wqms/web/wqms.prmsc/wqms_prmsc
source venv/bin/activate
gunicorn -c gunicorn_config.py app:app

# 4. Check Python errors
python3 -c "from app import app; print('OK')"

# 5. Check file permissions
ls -la /home/user_wqms/web/wqms.prmsc/wqms_prmsc
```

### High CPU Usage

**Problem**: Gunicorn workers consuming too much CPU

**Solutions**:
```bash
# 1. Reduce number of workers in gunicorn_config.py
workers = 2  # Instead of multiprocessing.cpu_count() * 2 + 1

# 2. Restart service
sudo systemctl restart wqms

# 3. Monitor CPU usage
htop
```

### Database Errors

**Problem**: Database locked or connection errors

**Solutions**:
```bash
# 1. Check database file permissions
ls -la instance/water_quality.db

# 2. Backup and recreate database
cp instance/water_quality.db instance/water_quality_backup.db
python3 -c "from app import app, db; app.app_context().push(); db.create_all()"

# 3. For SQLite, ensure only one process writes at a time
# Consider switching to PostgreSQL for production
```

### Port Already in Use

**Problem**: Port 5000 already in use

**Solutions**:
```bash
# 1. Find process using port 5000
sudo lsof -i :5000

# 2. Kill the process
sudo kill -9 PID

# 3. Or kill all gunicorn processes
pkill -9 -f gunicorn

# 4. Restart service
sudo systemctl restart wqms
```

### Nginx 502 Bad Gateway

**Problem**: Nginx shows 502 error

**Solutions**:
```bash
# 1. Check if Gunicorn is running
sudo systemctl status wqms

# 2. Check if Gunicorn is listening
ss -tlnp | grep 5000

# 3. Test Gunicorn directly
curl http://127.0.0.1:5000

# 4. Check Nginx error logs
tail -f /var/log/nginx/wqms_error.log

# 5. Restart both services
sudo systemctl restart wqms
sudo systemctl restart nginx
```

---

## Security Hardening

### 1. Create Dedicated User (Recommended)

```bash
# Create user for running the application
sudo useradd -r -s /bin/false wqms_user

# Change ownership
sudo chown -R wqms_user:wqms_user /home/user_wqms/web/wqms.prmsc/wqms_prmsc

# Update wqms.service
# User=wqms_user
# Group=wqms_user
```

### 2. Configure Firewall

```bash
# Install UFW
sudo apt install ufw

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### 3. Set Up SSL/HTTPS (Optional but Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate (requires domain name)
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

### 4. Environment Variables

```bash
# Create .env file
cat > .env << EOF
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
DATABASE_URL=sqlite:///water_quality.db
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
EOF

# Secure the file
chmod 600 .env

# Update config.py to load from .env
pip install python-dotenv
```

---

## Backup and Restore

### Automated Backup Script

Create `/home/user_wqms/backup_wqms.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/user_wqms/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp /home/user_wqms/web/wqms.prmsc/wqms_prmsc/instance/water_quality.db \
   $BACKUP_DIR/water_quality_$DATE.db

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz \
   /home/user_wqms/web/wqms.prmsc/wqms_prmsc/uploads

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Schedule Daily Backups

```bash
# Make script executable
chmod +x /home/user_wqms/backup_wqms.sh

# Add to crontab (runs daily at 2 AM)
crontab -e

# Add this line:
0 2 * * * /home/user_wqms/backup_wqms.sh >> /var/log/wqms_backup.log 2>&1
```

---

## Performance Optimization

### 1. Enable Gzip Compression in Nginx

Add to `/etc/nginx/nginx.conf`:

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
```

### 2. Configure Database Connection Pooling

For PostgreSQL, update `config.py`:

```python
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_size': 10,
    'pool_recycle': 3600,
    'pool_pre_ping': True
}
```

### 3. Monitor Application Performance

```bash
# Install monitoring tools
pip install flask-monitoring-dashboard

# Add to app.py
from flask_monitoring_dashboard import dashboard
dashboard.bind(app)
```

---

## Conclusion

Your Water Quality Management System is now deployed and accessible at:
- **HTTP**: `http://72.61.141.192`
- **Local**: `http://localhost:5000`

For any issues, refer to the [Troubleshooting](#troubleshooting) section or check the logs:
```bash
sudo journalctl -u wqms -f
tail -f /var/log/nginx/wqms_error.log
```

**Next Steps**:
1. Set up SSL/HTTPS with a domain name
2. Configure automated backups
3. Set up monitoring and alerts
4. Create a dedicated user for the application
5. Configure firewall rules

For questions or support, refer to the main [README.md](README.md) file.


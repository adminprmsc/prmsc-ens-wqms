"""
Gunicorn configuration file for Water Quality Management System
"""

import multiprocessing
import os

# Server socket (production: GUNICORN_BIND=127.0.0.1:5000 behind Nginx)
bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:5000")
backlog = 2048

# Worker processes
workers = 2  # Reduced from multiprocessing.cpu_count() * 2 + 1 for stability
worker_class = 'sync'
worker_connections = 1000
timeout = 120  # Increased timeout for slow requests
keepalive = 2

# Logging
accesslog = '-'  # Log to stdout
errorlog = '-'   # Log to stderr
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = 'wqms_gunicorn'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL (uncomment and configure if you want HTTPS)
# keyfile = '/path/to/keyfile'
# certfile = '/path/to/certfile'


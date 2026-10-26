"""Production Gunicorn overrides — import after gunicorn_config in ExecStart if needed."""
bind = "127.0.0.1:5000"
workers = 2
timeout = 300
loglevel = "info"

"""
Configuration file for Water Quality Management System
"""

import os
from datetime import timedelta

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_COOKIE_SECURE = False  # Set to True in production with HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Flask-Mail Configuration for Email Notifications
    # Gmail SMTP Configuration with App Password
    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USE_SSL = False
    
    # Email credentials - UPDATE THESE WITH YOUR GMAIL ACCOUNT
    MAIL_USERNAME = 'prmsc.notifications.wqms@gmail.com'  # Change to your Gmail address
    MAIL_PASSWORD = 'youvouklaskutkzs'  # Change to your 16-character Google App Password (no spaces)
    MAIL_DEFAULT_SENDER = 'prmsc.notifications.wqms@gmail.com'  # Sender email address
    
    MAIL_MAX_EMAILS = None
    MAIL_SUPPRESS_SEND = False  # Set to True for testing without sending

    # Shareable read-only dashboard link
    # Anyone with this URL sees the dashboard without logging in:
    #   https://<host>/shared-dashboard/<SHARED_DASHBOARD_TOKEN>
    # Rotate by changing the token here (or setting the env var) and restarting.
    SHARED_DASHBOARD_TOKEN = os.environ.get('SHARED_DASHBOARD_TOKEN') or 'dd6y9VR9KtJmiUPqzjOIuMQFKTxV6BjK'
    # The dashboard_viewer account the link signs in as.
    SHARED_DASHBOARD_EMAIL = os.environ.get('SHARED_DASHBOARD_EMAIL') or 'viewer@prmsc.org'

    # Claude AI - Narrative Generation (set ANTHROPIC_API_KEY in .env — never commit keys)
    ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///water_quality_dev.db'
    SQLALCHEMY_ECHO = True
    
    # Development Email Configuration
    # Uncomment and update for development
    # MAIL_USERNAME = 'your-dev-email@gmail.com'
    # MAIL_PASSWORD = 'your-app-password'


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///water_quality.db'
    SESSION_COOKIE_SECURE = True
    
    # Production Email Configuration
    # Make sure to set these with your Gmail account
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', 'your-email@gmail.com')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')


class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    MAIL_SUPPRESS_SEND = True  # Don't send emails during testing


# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


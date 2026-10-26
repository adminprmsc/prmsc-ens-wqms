# Water Quality Management System (WQMS)

A comprehensive Flask-based web application for managing and monitoring water quality tests across different regions in Pakistan. Built for PRMSC (Pakistan Red Crescent Society) to track and analyze water quality parameters with role-based access control.

## 🌟 Key Features

### 🔐 Authentication & Authorization
- **Multi-role User System**: Environmental Specialist, Research Analyst, PCRWR User
- **Secure Authentication**: Password hashing with Werkzeug
- **Session Management**: Persistent sessions with configurable lifetime
- **Password Reset**: Email-based password recovery system

### 📊 Dashboard & Analytics
- **Real-time Statistics**: Total tests, completed, pending, and draft forms
- **Interactive Maps**: GPS-based location visualization with Leaflet.js
- **Data Visualization**: Charts for physical, chemical, and microbiological parameters
- **Water Quality Indicators**: Safety status tracking and alerts
- **Recent Activity Feed**: Timeline of submissions and approvals

### 🧪 Water Quality Testing
- **Dual Form Types**: Priority (9 parameters) and Full (60+ parameters)
- **Comprehensive Parameters**:
  - Physical & Aesthetic (pH, TDS, Turbidity, Temperature, etc.)
  - Major Chemical (Calcium, Magnesium, Chloride, Fluoride, etc.)
  - Trace & Ultra-trace Elements (Arsenic, Lead, Mercury, etc.)
  - Microbiological (E. coli, Total Coliforms, etc.)
- **GPS Integration**: Automatic location capture
- **Image Upload**: Sample photos with metadata
- **Draft System**: Save incomplete forms for later completion

### 📝 Submission Management
- **Advanced Filtering**: By status, region, date range, form type
- **Approval Workflow**: Submit → Review → Approve/Reject
- **Bulk Operations**: Export data, batch approvals
- **Detailed Reports**: View complete test results with all parameters
- **Edit & Update**: Modify submissions before approval

### 📧 Email Notifications
- **Automated Alerts**: Water quality threshold violations
- **Submission Notifications**: Status updates to users
- **Gmail Integration**: SMTP configuration with app passwords

## 🛠️ Technology Stack

### Backend
- **Flask 2.3.3**: Python web framework
- **SQLAlchemy 3.0.5**: ORM for database operations
- **Flask-Mail 0.9.1**: Email notification system
- **Gunicorn 23.0.0**: Production WSGI server
- **SQLite**: Database (easily switchable to PostgreSQL)

### Frontend
- **HTML5/CSS3**: Modern responsive design
- **JavaScript (Vanilla)**: Interactive UI components
- **Leaflet.js**: Interactive maps
- **Chart.js**: Data visualization
- **Font Awesome**: Icon library
- **Google Fonts (Poppins)**: Typography

### Infrastructure
- **Nginx**: Reverse proxy server
- **Systemd**: Service management
- **Linux (Ubuntu/Debian)**: Server OS

## 📁 Project Structure

```
wqms_prmsc/
├── app.py                      # Main Flask application (6000+ lines)
├── config.py                   # Configuration settings
├── gunicorn_config.py          # Gunicorn server configuration
├── wqms.service                # Systemd service file
├── manage_service.sh           # Service management script
├── requirements.txt            # Python dependencies
├── database_schema.sql         # PostgreSQL schema (optional)
│
├── instance/
│   └── water_quality.db        # SQLite database
│
├── templates/                  # HTML templates
│   ├── login.html
│   ├── register.html
│   ├── reset_password.html
│   ├── index.html              # Main dashboard
│   ├── dashboard.html
│   ├── add_water_test.html
│   ├── draft_form.html
│   ├── view_submissions.html
│   └── email/                  # Email templates
│
├── static/                     # Static assets
│   ├── css/
│   ├── js/
│   ├── images/
│   └── data/
│
├── uploads/                    # User uploaded files
│   └── sample_images/
│
├── venv/                       # Python virtual environment
│
├── README.md                   # This file
└── SETUP.md                    # Detailed setup guide
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- pip (Python package manager)
- Virtual environment support
- Linux server (for production deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Arshamazam/WQMS-PRMSC-Deployed-.git
   cd wqms_prmsc
   ```

2. **Create virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Initialize database**
   ```bash
   python3 -c "from app import app, db; app.app_context().push(); db.create_all()"
   ```

5. **Run development server**
   ```bash
   python3 app.py
   # Access at http://localhost:5000
   ```

For **production deployment**, see [SETUP.md](SETUP.md) for detailed instructions.

## 🔧 Configuration

### Environment Variables
Create a `.env` file (optional):
```bash
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///water_quality.db
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
```

### Email Configuration
Edit `config.py` to configure Gmail SMTP:
```python
MAIL_SERVER = 'smtp.gmail.com'
MAIL_PORT = 587
MAIL_USERNAME = 'your-email@gmail.com'
MAIL_PASSWORD = 'your-16-char-app-password'
```

### Database Configuration
- **Development**: SQLite (default)
- **Production**: PostgreSQL (recommended)

Update `config.py` for PostgreSQL:
```python
SQLALCHEMY_DATABASE_URI = 'postgresql://user:password@localhost/wqms_db'
```

## 🔄 Service Management

### Start/Stop/Restart Application

```bash
# Start the service
sudo systemctl start wqms

# Stop the service
sudo systemctl stop wqms

# Restart the service (after code changes)
sudo systemctl restart wqms

# Check service status
sudo systemctl status wqms

# View logs
sudo journalctl -u wqms -f

# Enable auto-start on boot
sudo systemctl enable wqms

# Disable auto-start
sudo systemctl disable wqms
```

### After Making Code Changes

```bash
# 1. Pull latest changes (if using git)
git pull origin main

# 2. Activate virtual environment
source venv/bin/activate

# 3. Install any new dependencies
pip install -r requirements.txt

# 4. Restart the service
sudo systemctl restart wqms

# 5. Check if it's running
sudo systemctl status wqms
```

### Manual Process Management

```bash
# Kill all gunicorn processes
pkill -9 -f gunicorn

# Start manually (for debugging)
cd /home/user_wqms/web/wqms.prmsc/wqms_prmsc
source venv/bin/activate
gunicorn -c gunicorn_config.py app:app

# Or use the management script
./manage_service.sh restart
```

## � Security Recommendations

- ✅ Change default `SECRET_KEY` in production
- ✅ Use HTTPS with SSL certificates (Let's Encrypt)
- ✅ Configure firewall rules (UFW/iptables)
- ✅ Regular database backups
- ✅ Keep dependencies updated
- ✅ Use strong passwords for user accounts
- ✅ Enable Gmail 2FA and use App Passwords
- ✅ Restrict file upload sizes and types
- ✅ Implement rate limiting for API endpoints

## 📊 Database Management

### Backup Database
```bash
# SQLite backup
cp instance/water_quality.db instance/water_quality_backup_$(date +%Y%m%d).db

# PostgreSQL backup
pg_dump -U postgres wqms_db > backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
# SQLite restore
cp instance/water_quality_backup_20241228.db instance/water_quality.db

# PostgreSQL restore
psql -U postgres wqms_db < backup_20241228.sql
```

## 🌐 Accessing the Application

- **Local Development**: `http://localhost:5000`
- **Production (IP)**: `http://72.61.141.192`
- **Production (Domain)**: `http://your-domain.com` (after DNS setup)

### Default User Roles
1. **Environmental Specialist**: Full access (view, edit, approve, reject)
2. **Research Analyst**: View and edit submissions
3. **PCRWR User**: Submit tests and view approved data

## 📱 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🎯 Roadmap

- [x] Flask backend with SQLAlchemy
- [x] User authentication and authorization
- [x] Water quality test submission
- [x] Dashboard with analytics
- [x] Email notifications
- [x] Production deployment with Gunicorn + Nginx
- [ ] PDF report generation
- [ ] Excel data export
- [ ] Advanced data analytics
- [ ] Mobile app (React Native)
- [ ] Multi-language support (Urdu)
- [ ] Dark mode theme
- [ ] Real-time notifications (WebSocket)

## 🐛 Troubleshooting

### Application not accessible
```bash
# Check if service is running
sudo systemctl status wqms

# Check if port 5000 is listening
ss -tlnp | grep 5000

# Check Nginx status
sudo systemctl status nginx

# View error logs
sudo journalctl -u wqms -n 50
tail -f /var/log/nginx/wqms_error.log
```

### Database errors
```bash
# Recreate database tables
python3 -c "from app import app, db; app.app_context().push(); db.create_all()"
```

### Permission errors
```bash
# Fix file permissions
sudo chown -R root:root /home/user_wqms/web/wqms.prmsc/wqms_prmsc
sudo chmod -R 755 /home/user_wqms/web/wqms.prmsc/wqms_prmsc
```

## 📞 Support

For issues, questions, or contributions:
- **GitHub Issues**: [Report a bug](https://github.com/Arshamazam/WQMS-PRMSC-Deployed-/issues)
- **Email**: Contact the development team
- **Documentation**: See [SETUP.md](SETUP.md) for detailed setup

## 📄 License

This project is developed for PRMSC (Pakistan Red Crescent Society) as part of the Community Well-Being & Infrastructure Monitoring System.

---

**Version**: 2.0.0
**Last Updated**: December 2024
**Deployed**: Production-ready with Gunicorn + Nginx


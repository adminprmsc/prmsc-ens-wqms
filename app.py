"""
Water Quality Management System - Flask Backend
Main application file
"""

# Fix UnicodeEncodeError on Windows (cp1252 can't handle emoji in print statements)
import sys
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash, send_file, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_mail import Mail, Message
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime
import os
import json
import uuid
import hmac
from functools import wraps
import threading
from io import BytesIO
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Initialize Flask app
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Load configuration from config.py if available
try:
    from config import Config
    app.config.from_object(Config)
    print('[CONFIG] Loaded configuration from config.Config')
except Exception as _e:
    print(f"[CONFIG] No external config loaded: {_e}")

# Add response headers to allow external scripts
@app.after_request
def set_response_headers(response):
    """Set response headers to allow external scripts and CDN resources"""
    # Remove strict permissions policy to allow external scripts like Leaflet
    # Don't set Permissions-Policy header - let browser defaults handle it
    # This allows CDN scripts to work properly
    return response

# Configuration
app.config['SECRET_KEY'] = 'your-secret-key-change-this'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///water_quality.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Flask-Mail Configuration for Email Notifications
# Configure in config.py instead of environment variables
app.config['MAIL_SERVER'] = app.config.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = app.config.get('MAIL_PORT', 587)
app.config['MAIL_USE_TLS'] = app.config.get('MAIL_USE_TLS', True)
app.config['MAIL_USE_SSL'] = app.config.get('MAIL_USE_SSL', False)
app.config['MAIL_USERNAME'] = app.config.get('MAIL_USERNAME', '')
app.config['MAIL_PASSWORD'] = app.config.get('MAIL_PASSWORD', '')
app.config['MAIL_DEFAULT_SENDER'] = app.config.get('MAIL_DEFAULT_SENDER', 'noreply@prmsc-water-quality.com')
app.config['MAIL_MAX_EMAILS'] = app.config.get('MAIL_MAX_EMAILS', None)
app.config['MAIL_SUPPRESS_SEND'] = app.config.get('MAIL_SUPPRESS_SEND', False)

# File upload configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'sample_images')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize extensions
db = SQLAlchemy(app)
mail = Mail(app)

# ==================== USER & WATERTES MODELS (MINIMAL) ====================

class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    role = db.Column(db.String(50))
    organization = db.Column(db.String(100))
    is_active = db.Column(db.Boolean, default=True)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class WaterTest(db.Model):
    __tablename__ = 'water_test'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    form_type = db.Column(db.String(20))
    location = db.Column(db.String(255))
    region = db.Column(db.String(100))
    district = db.Column(db.String(100))
    village = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    test_date = db.Column(db.Date)
    test_time = db.Column(db.Time)
    ph_level = db.Column(db.Float)
    turbidity = db.Column(db.Float)
    tds = db.Column(db.Float)
    temperature = db.Column(db.Float)
    chlorine = db.Column(db.Float)
    observations = db.Column(db.Text)
    tested_by = db.Column(db.String(100))
    contact = db.Column(db.String(100))
    status = db.Column(db.String(20), default='draft')
    submitted_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    submitted_at = db.Column(db.DateTime)
    approved_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    approved_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def allowed_file(filename):
    """Check if uploaded file has allowed extension"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user account"""
    try:
        data = request.get_json()
        # Validate input
        if not data.get('name') or not data.get('email') or not data.get('password'):
            return jsonify({'success': False, 'message': 'Missing name, email, or password'}), 400

        # Check if user already exists
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'success': False, 'message': 'Email already registered'}), 400

        # Create user
        user = User(
            name=data['name'],
            email=data['email'],
            password_hash=generate_password_hash(data['password']),
            role=data.get('role', 'user'),
            organization=data.get('organization', ''),
            is_active=True
        )
        db.session.add(user)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Registration successful'}), 201
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

# ==================== HTML DOWNLOAD ENDPOINT ====================
@app.route('/api/test-reports/<int:report_id>/download-html')
def download_report_html(report_id):
    """Download the report as HTML in the same format as the email report (all report types)"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        # Get report with all related data
        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        # Use the same data builder as for the email
        from flask import make_response
        report_data = build_formatted_report_email_data(report)
        html = render_template('email/water_test_report_formatted.html', report=report_data, is_resend=False)

        # Set headers for download
        filename = f"{report.report_serial_no or f'Report-{report_id}'}.html"
        response = make_response(html)
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/test-reports/<int:report_id>/download-pdf')
def download_report_pdf(report_id):
    """Download the report as PDF matching the add_water_test.html format"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
            
        # Get report
        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404
            
        # Helper to safely get value
        def get_val(obj, attr, default='-'):
            val = getattr(obj, attr, None)
            return val if val is not None else default

        # Create buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=30,
            leftMargin=30,
            topMargin=30,
            bottomMargin=30
        )
        
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom Styles
        title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=16, alignment=TA_CENTER, textColor=colors.HexColor('#1e3c72'), spaceAfter=10)
        subtitle_style = ParagraphStyle('CustomSubtitle', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, textColor=colors.grey, spaceAfter=20)
        header_table_style = TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ])
        
        # ── Header matching view_submissions.html ──────────────────────────
        logo_gop_path   = os.path.join(app.static_folder, 'images', 'GOP Logo (1).png')
        logo_prmsc_path = os.path.join(app.static_folder, 'images', 'PRMSC Logo PSD (1).png')

        logo_gop_elem   = Image(logo_gop_path,   width=65, height=65) if os.path.exists(logo_gop_path)   else Paragraph('', styles['Normal'])
        logo_prmsc_elem = Image(logo_prmsc_path, width=65, height=65) if os.path.exists(logo_prmsc_path) else Paragraph('', styles['Normal'])

        org_name_style_h = ParagraphStyle(
            'OrgNameH', parent=styles['Normal'],
            fontSize=17, fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1e3c72'),
            alignment=TA_CENTER, spaceAfter=4
        )

        center_col = [
            Paragraph('Punjab Rural Municipal Services Company', org_name_style_h),
        ]

        t_header = Table([[logo_gop_elem, center_col, logo_prmsc_elem]], colWidths=[80, 370, 80])
        t_header.setStyle(TableStyle([
            ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('LINEBELOW',     (0, 0), (-1,  0), 1.2, colors.HexColor('#1e3c72')),
            ('TOPPADDING',    (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(t_header)

        sys_title_style_h = ParagraphStyle(
            'SysTitleH', parent=styles['Normal'],
            fontSize=12, fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1e3c72'),
            alignment=TA_CENTER, spaceBefore=8, spaceAfter=14
        )
        elements.append(Paragraph('Water Quality Management System', sys_title_style_h))
        
        # Section 1: Test Report Info
        def create_section_header(text):
            return Paragraph(f"<b>{text}</b>", ParagraphStyle('SectionHeader', parent=styles['Heading3'], textColor=colors.HexColor('#1e3c72'), spaceBefore=10, spaceAfter=5))

        elements.append(create_section_header("TEST REPORT INFORMATION"))
        
        # Info Table
        # Safely handling dates
        sampling_date = report.sampling_datetime.strftime('%Y-%m-%d %H:%M') if report.sampling_datetime else '-'
        receipt_date = report.sample_receipt_datetime.strftime('%Y-%m-%d %H:%M') if report.sample_receipt_datetime else '-'
        
        info_data = [
            [Paragraph(f"<b>Report Serial No:</b> {get_val(report, 'report_serial_no')}", styles['Normal']), Paragraph(f"<b>Total Pages:</b> {get_val(report, 'total_pages')}", styles['Normal'])],
            [Paragraph(f"<b>Customer:</b> {get_val(report, 'customer_name_address')}", styles['Normal']), Paragraph(f"<b>Date:</b> {report.reporting_date.strftime('%Y-%m-%d') if report.reporting_date else (report.sampling_datetime.strftime('%Y-%m-%d') if report.sampling_datetime else '-')}", styles['Normal'])],
            [Paragraph(f"<b>Sampling Date:</b> {sampling_date}", styles['Normal']), Paragraph(f"<b>Receipt Date:</b> {receipt_date}", styles['Normal'])],
            [Paragraph(f"<b>Sample Type:</b> {get_val(report, 'sample_type')}", styles['Normal']), Paragraph(f"<b>NWQL Code:</b> {get_val(report, 'nwql_sample_code')}", styles['Normal'])],
            [Paragraph(f"<b>Location:</b> {get_val(report, 'location')}", styles['Normal']), Paragraph(f"<b>Work Order:</b> {get_val(report, 'work_order_no')}", styles['Normal'])],
            [Paragraph(f"<b>Tehsil:</b> {get_val(report, 'tehsil')}", styles['Normal']), Paragraph(f"<b>Village:</b> {get_val(report, 'village')}", styles['Normal'])]
        ]
        
        t_info = Table(info_data, colWidths=[260, 260])
        t_info.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(t_info)
        elements.append(Spacer(1, 10))
        
        # Section 2: Parameters
        param_table_style = TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e3c72')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('PADDING', (0,0), (-1,-1), 4),
        ])
        
        # Physical
        elements.append(create_section_header("PHYSICAL AND AESTHETIC PARAMETERS"))
        pp = report.physical_params
        p_data = [['Parameter', 'Result', 'Unit', 'WHO Guideline', 'NSDWQ Guideline']]
        if pp:
            p_data.append(['pH', get_val(pp, 'ph'), '-', '6.5-8.5', '6.5-8.5'])
            p_data.append(['Temperature', get_val(pp, 'temperature'), '°C', '-', '-'])
            p_data.append(['Electrical Conductivity', get_val(pp, 'electrical_conductivity'), 'μS/cm', '-', '-'])
            p_data.append(['Color', get_val(pp, 'color'), '-', 'Colorless', 'Colorless'])
            p_data.append(['Odour', get_val(pp, 'odour'), '-', 'Odourless', 'Odourless'])
            p_data.append(['Taste', get_val(pp, 'taste'), '-', 'Acceptable', 'Acceptable'])
            p_data.append(['Suspended Solids', get_val(pp, 'suspended_solids'), 'mg/L', '-', '-'])
            p_data.append(['Total Dissolved Solids', get_val(pp, 'total_dissolved_solids'), 'mg/L', '1000', '1000'])
            p_data.append(['Turbidity', get_val(pp, 'turbidity'), 'NTU', '<5', '<5'])
        
        t_phys = Table(p_data, colWidths=[140, 80, 60, 100, 100])
        t_phys.setStyle(param_table_style)
        elements.append(t_phys)
        elements.append(Spacer(1, 10))
        
        # Chemical (if full)
        if report.form_type == 'full':
            elements.append(create_section_header("CHEMICAL PARAMETERS"))
            cp = report.chemical_params
            c_data = [['Parameter', 'Result', 'Unit', 'WHO Guideline', 'NSDWQ Guideline']]
            if cp:
                c_data.append(['Alkalinity (as CaCO3)', get_val(cp, 'alkalinity_caco3'), 'mg/L', '-', '-'])
                c_data.append(['Bicarbonates', get_val(cp, 'bicarbonates'), 'mg/L', '-', '-'])
                c_data.append(['Calcium', get_val(cp, 'calcium'), 'mg/L', '-', '-'])
                c_data.append(['Carbonates', get_val(cp, 'carbonates'), 'mg/L', '-', '-'])
                c_data.append(['Chlorides', get_val(cp, 'chlorides'), 'mg/L', '250', '250'])
                c_data.append(['Total Hardness', get_val(cp, 'total_hardness'), 'mg/L', '500', '500'])
                c_data.append(['Magnesium', get_val(cp, 'magnesium'), 'mg/L', '-', '-'])
                c_data.append(['Potassium', get_val(cp, 'potassium'), 'mg/L', '-', '-'])
                c_data.append(['Sodium', get_val(cp, 'sodium'), 'mg/L', '200', '200'])
                c_data.append(['Sulphate', get_val(cp, 'sulphate'), 'mg/L', '250', '250'])
                c_data.append(['Nitrate (as N)', get_val(cp, 'nitrate_n'), 'mg/L', '50', '50'])
                c_data.append(['Nitrite', get_val(cp, 'nitrite'), 'mg/L', '3', '3'])
                c_data.append(['TDS', get_val(cp, 'tds'), 'mg/L', '1000', '1000'])
                c_data.append(['Iron', get_val(cp, 'iron'), 'mg/L', '0.3', '0.3'])
                c_data.append(['Fluoride', get_val(cp, 'fluoride'), 'mg/L', '1.5', '1.5'])
                c_data.append(['Phosphate', get_val(cp, 'phosphate'), 'mg/L', '-', '-'])
            
            t_chem = Table(c_data, colWidths=[140, 80, 60, 100, 100])
            t_chem.setStyle(param_table_style)
            elements.append(t_chem)
            elements.append(Spacer(1, 10))

            # Trace/Ultratrace
            elements.append(create_section_header("TRACE ELEMENTS"))
            te = report.trace_elements
            t_data = [['Parameter', 'Result', 'Unit', 'WHO Guideline', 'NSDWQ Guideline']]
            if te:
                 t_data.append(['Aluminum', get_val(te, 'aluminum'), 'μg/L', '200', '200'])
                 t_data.append(['Antimony', get_val(te, 'antimony'), 'mg/L', '0.02', '0.02'])
                 t_data.append(['Arsenic', get_val(te, 'arsenic'), 'μg/L', '10', '50'])
                 t_data.append(['Barium', get_val(te, 'barium'), 'μg/L', '700', '700'])
                 t_data.append(['Boron', get_val(te, 'boron'), 'mg/L', '2.4', '1.5'])
                 t_data.append(['Cadmium', get_val(te, 'cadmium'), 'μg/L', '3', '5'])
                 t_data.append(['Chromium', get_val(te, 'chromium'), 'μg/L', '50', '50'])
                 t_data.append(['Copper', get_val(te, 'copper'), 'μg/L', '2000', '2000'])
                 t_data.append(['Cyanide', get_val(te, 'cyanide'), 'mg/L', '0.07', '0.05'])
                 t_data.append(['Iron', get_val(te, 'iron'), 'μg/L', '300', '300'])
                 t_data.append(['Lead', get_val(te, 'lead'), 'μg/L', '10', '50'])
                 t_data.append(['Manganese', get_val(te, 'manganese'), 'μg/L', '400', '400'])
                 t_data.append(['Mercury', get_val(te, 'mercury'), 'mg/L', '0.006', '0.001'])
                 t_data.append(['Molybdenum', get_val(te, 'molybdenum'), 'μg/L', '70', '70'])
                 t_data.append(['Nickel', get_val(te, 'nickel'), 'μg/L', '70', '20'])
                 t_data.append(['Selenium', get_val(te, 'selenium'), 'μg/L', '40', '10'])
                 t_data.append(['Silica', get_val(te, 'silica'), 'μg/L', '-', '-'])
                 t_data.append(['Silver', get_val(te, 'silver'), 'μg/L', '-', '-'])
                 t_data.append(['Strontium', get_val(te, 'strontium'), 'μg/L', '-', '-'])
                 t_data.append(['Thallium', get_val(te, 'thallium'), 'μg/L', '-', '-'])
                 t_data.append(['Uranium', get_val(te, 'uranium'), 'μg/L', '30', '30'])
                 t_data.append(['Zinc', get_val(te, 'zinc'), 'μg/L', '3000', '5000'])

            t_trace = Table(t_data, colWidths=[140, 80, 60, 100, 100])
            t_trace.setStyle(param_table_style)
            elements.append(t_trace)
            elements.append(Spacer(1, 10))
            
        # Microbio
        elements.append(create_section_header("MICROBIOLOGICAL PARAMETERS"))
        mp = report.microbio_params
        m_data = [['Parameter', 'Result', 'Unit', 'WHO Guideline', 'NSDWQ Guideline']]
        if mp:
             m_data.append(['Total Coliforms', get_val(mp, 'total_coliforms'), 'CFU/100ml', '0', '0'])
             m_data.append(['Fecal Coliforms', get_val(mp, 'fecal_coliforms'), 'CFU/100ml', '0', '0'])
             m_data.append(['E. Coli', get_val(mp, 'e_coli'), 'CFU/100ml', '0', '0'])
        
        t_micro = Table(m_data, colWidths=[140, 80, 60, 100, 100])
        t_micro.setStyle(param_table_style)
        elements.append(t_micro)
        elements.append(Spacer(1, 10))
        
        # Quality Assessment
        elements.append(create_section_header("QUALITY ASSESSMENT"))
        qa = report.quality_assessment
        if qa:
            qa_rows = [['Category', 'Result']]
            if qa.physical_quality:
                qa_rows.append(['Physical', qa.physical_quality.upper()])
            if report.form_type == 'full' and qa.chemical_quality:
                qa_rows.append(['Chemical', qa.chemical_quality.upper()])
            if report.form_type == 'full' and qa.trace_elements_quality:
                qa_rows.append(['Trace Elements', qa.trace_elements_quality.upper()])
            if qa.microbial_quality:
                qa_rows.append(['Microbial', qa.microbial_quality.upper()])
            if len(qa_rows) > 1:
                t_qa = Table(qa_rows, colWidths=[260, 260])
                t_qa.setStyle(param_table_style)
                elements.append(t_qa)
                elements.append(Spacer(1, 6))
            remarks_text = qa.remarks or 'No remarks'
        else:
            remarks_text = 'No assessment available'
        elements.append(Paragraph(f"<b>Remarks:</b> {remarks_text}", styles['Normal']))

        # Footer / Signatures
        elements.append(Spacer(1, 40))
        submitted_name = report.submitted_by.name if report.submitted_by else '-'
        approved_name = report.approved_by.name if report.approved_by else '-'
        sig_data = [['Tested By', 'Verified By', 'Approved By'],
                    ['', '', ''],
                    [submitted_name, '', approved_name]]
                    
        t_sig = Table(sig_data, colWidths=[150, 150, 150])
        t_sig.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('LINEABOVE', (0,2), (0,2), 1, colors.black),
            ('LINEABOVE', (1,2), (1,2), 1, colors.black),
            ('LINEABOVE', (2,2), (2,2), 1, colors.black),
        ]))
        elements.append(t_sig)
        
        # Build
        doc.build(elements)
        buffer.seek(0)
        
        from flask import make_response
        response = make_response(buffer.getvalue())
        response.headers['Content-Type'] = 'application/pdf'
        filename = f"{get_val(report, 'report_serial_no', 'Report')}.pdf"
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        return response


    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


class DraftForm(db.Model):
    """Draft form model"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    data = db.Column(db.JSON)
    status = db.Column(db.String(20), default='draft')
    progress = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== NEW NORMALIZED DATABASE MODELS ====================

class TestReportMetadata(db.Model):
    """Test report metadata - core information for each water quality test"""
    __tablename__ = 'test_report_metadata'

    report_id = db.Column(db.Integer, primary_key=True)
    report_serial_no = db.Column(db.String(100), unique=True, nullable=False)
    total_pages = db.Column(db.Integer, default=2)
    customer_name_address = db.Column(db.Text, nullable=False)
    customer_code = db.Column(db.String(50))
    nwql_sample_code = db.Column(db.String(100), unique=True, nullable=False)
    sampling_datetime = db.Column(db.DateTime, nullable=False)
    sample_receipt_datetime = db.Column(db.DateTime, nullable=False)
    temperature_at_receipt = db.Column(db.Numeric(5, 2), nullable=False)
    humidity_at_receipt = db.Column(db.Numeric(5, 2), nullable=False)
    analysis_date_from = db.Column(db.Date, nullable=False)
    analysis_date_to = db.Column(db.Date)
    reporting_date = db.Column(db.Date, nullable=False)
    gps_latitude = db.Column(db.Numeric(10, 7))
    gps_longitude = db.Column(db.Numeric(10, 7))
    location = db.Column(db.String(255), nullable=False)
    work_order_no = db.Column(db.String(100), nullable=False)
    tehsil = db.Column(db.String(100), nullable=False)
    village = db.Column(db.String(100), nullable=False)
    settlement = db.Column(db.String(100), nullable=False)
    sample_type = db.Column(db.String(50))  # 'source_well', 'pov_tab', 'ohr', 'all'
    total_samples = db.Column(db.Integer, nullable=False, default=1)
    form_type = db.Column(db.String(20), nullable=False)  # 'priority' or 'full'
    report_category = db.Column(db.String(20), default='pcrwr_report')  # 'pcrwr_report' or 'baseline_report'

    # Workflow fields
    status = db.Column(db.String(20), default='draft')  # draft, submitted, pending_review, approved, rejected
    submitted_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    submitted_at = db.Column(db.DateTime)
    approved_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    approved_at = db.Column(db.DateTime)
    rejection_reason = db.Column(db.Text)

    # User tracking
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='test_reports')
    submitted_by = db.relationship('User', foreign_keys=[submitted_by_id])
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])
    physical_params = db.relationship('PhysicalAestheticParameters', backref='report', uselist=False, cascade='all, delete-orphan')
    chemical_params = db.relationship('MajorChemicalParameters', backref='report', uselist=False, cascade='all, delete-orphan')
    trace_elements = db.relationship('TraceUltratraceElements', backref='report', uselist=False, cascade='all, delete-orphan')
    microbio_params = db.relationship('MicrobiologicalParameters', backref='report', uselist=False, cascade='all, delete-orphan')
    quality_assessment = db.relationship('QualityAssessment', backref='report', uselist=False, cascade='all, delete-orphan')
    post_treatment = db.relationship('ParametersPostTreatment', backref='report', uselist=False, cascade='all, delete-orphan')
    sample_images = db.relationship('SampleImages', backref='report', cascade='all, delete-orphan')


class PhysicalAestheticParameters(db.Model):
    """Physical and aesthetic water quality parameters"""
    __tablename__ = 'physical_aesthetic_parameters'

    physical_params_id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='CASCADE'), unique=True, nullable=False)

    # Priority parameters (rows 1-9)
    ph = db.Column(db.Numeric(4, 2))
    electrical_conductivity = db.Column(db.Numeric(10, 2))
    temperature = db.Column(db.Numeric(5, 2))
    color = db.Column(db.String(50))
    odour = db.Column(db.String(50))
    taste = db.Column(db.String(50))
    suspended_solids = db.Column(db.Numeric(10, 4))
    total_dissolved_solids = db.Column(db.Numeric(10, 4))
    turbidity = db.Column(db.Numeric(10, 4))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MajorChemicalParameters(db.Model):
    """Major chemical parameters (Full mode only)"""
    __tablename__ = 'major_chemical_parameters'

    chemical_params_id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='CASCADE'), unique=True, nullable=False)

    # Chemical parameters (rows 10-22 in Full mode)
    alkalinity_caco3 = db.Column(db.Numeric(10, 4))
    bicarbonates = db.Column(db.Numeric(10, 4))
    calcium = db.Column(db.Numeric(10, 4))
    carbonates = db.Column(db.Numeric(10, 4))
    chlorides = db.Column(db.Numeric(10, 4))
    total_hardness = db.Column(db.Numeric(10, 4))
    magnesium = db.Column(db.Numeric(10, 4))
    potassium = db.Column(db.Numeric(10, 4))
    sodium = db.Column(db.Numeric(10, 4))
    sulphate = db.Column(db.Numeric(10, 4))
    nitrate_n = db.Column(db.Numeric(10, 4))
    nitrite = db.Column(db.Numeric(10, 4))
    tds = db.Column(db.Numeric(10, 4))
    iron = db.Column(db.Numeric(10, 4))
    fluoride = db.Column(db.Numeric(10, 4))
    phosphate = db.Column(db.Numeric(10, 4))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TraceUltratraceElements(db.Model):
    """Trace and ultra-trace toxic elements (Full mode only)"""
    __tablename__ = 'trace_ultratrace_elements'

    trace_elements_id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='CASCADE'), unique=True, nullable=False)

    # Trace elements in μg/L (rows 23-40 in Full mode)
    aluminum = db.Column(db.Numeric(10, 4))
    arsenic = db.Column(db.Numeric(10, 4))
    barium = db.Column(db.Numeric(10, 4))
    cadmium = db.Column(db.Numeric(10, 4))
    chromium = db.Column(db.Numeric(10, 4))
    copper = db.Column(db.Numeric(10, 4))
    iron = db.Column(db.Numeric(10, 4))  # μg/L - Iron
    manganese = db.Column(db.Numeric(10, 4))
    molybdenum = db.Column(db.Numeric(10, 4))
    nickel = db.Column(db.Numeric(10, 4))
    lead = db.Column(db.Numeric(10, 4))
    selenium = db.Column(db.Numeric(10, 4))
    silver = db.Column(db.Numeric(10, 4))  # μg/L - Silver
    strontium = db.Column(db.Numeric(10, 4))
    thallium = db.Column(db.Numeric(10, 4))  # μg/L - Thallium
    uranium = db.Column(db.Numeric(10, 4))  # μg/L - Uranium
    zinc = db.Column(db.Numeric(10, 4))
    boron = db.Column(db.Numeric(10, 6))  # mg/L
    antimony = db.Column(db.Numeric(10, 6))  # mg/L
    mercury = db.Column(db.Numeric(10, 6))  # mg/L
    cyanide = db.Column(db.Numeric(10, 6))  # mg/L
    silica = db.Column(db.Numeric(10, 4))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MicrobiologicalParameters(db.Model):
    """Microbiological water quality parameters"""
    __tablename__ = 'microbiological_parameters'

    microbio_params_id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='CASCADE'), unique=True, nullable=False)

    # Microbiological parameters (rows 10-12 in Priority, 41-43 in Full)
    # Changed to String to support both numeric values and 'TNTC' (Too Numerous to Count)
    total_coliforms = db.Column(db.String(50))  # Can be numeric or 'TNTC'
    fecal_coliforms = db.Column(db.String(50))  # Can be numeric or 'TNTC'
    e_coli = db.Column(db.String(50))  # Can be numeric or 'TNTC'

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class QualityAssessment(db.Model):
    """Quality assessment and statement of conformity"""
    __tablename__ = 'quality_assessment'

    quality_assessment_id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='CASCADE'), unique=True, nullable=False)

    physical_quality = db.Column(db.String(20))  # safe, unsafe
    chemical_quality = db.Column(db.String(20))  # safe, unsafe
    trace_elements_quality = db.Column(db.String(20))  # safe, unsafe
    microbial_quality = db.Column(db.String(20))  # safe, unsafe, contaminated
    remarks = db.Column(db.Text)
    terms_agreed = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ParametersPostTreatment(db.Model):
    """Post-treatment parameters (optional)"""
    __tablename__ = 'parameters_post_treatment'

    post_treatment_id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='CASCADE'), unique=True, nullable=False)

    residual_chlorine = db.Column(db.Numeric(10, 4))
    free_chlorine = db.Column(db.Numeric(10, 4))
    total_chlorine = db.Column(db.Numeric(10, 4))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SampleImages(db.Model):
    """Sample images for water quality test reports"""
    __tablename__ = 'sample_images'

    image_id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='CASCADE'), nullable=False)

    image_filename = db.Column(db.String(255), nullable=False)  # Original filename
    image_path = db.Column(db.String(500), nullable=False)  # Stored file path
    image_size = db.Column(db.Integer)  # File size in bytes
    image_type = db.Column(db.String(50))  # MIME type (image/jpeg, image/png)

    uploaded_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship
    uploaded_by = db.relationship('User', foreign_keys=[uploaded_by_id])


# ==================== EMAIL NOTIFICATION MODELS ====================

class AlertRecipient(db.Model):
    """Alert recipients for email notifications"""
    __tablename__ = 'alert_recipients'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    role = db.Column(db.String(50), default='Stakeholder')  # Admin, Manager, Technician, Stakeholder
    is_active = db.Column(db.Boolean, default=True)

    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    created_by = db.relationship('User', foreign_keys=[created_by_id])


class AlertHistory(db.Model):
    """History of sent alert notifications"""
    __tablename__ = 'alert_history'

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('test_report_metadata.report_id', ondelete='SET NULL'), nullable=True)

    # Alert details
    category = db.Column(db.String(50), nullable=False)  # Biological, Chemical, Physical
    unsafe_percentage = db.Column(db.Numeric(5, 2))  # Percentage of unsafe parameters

    # Notification status
    status = db.Column(db.String(20), default='pending')  # pending, sent, failed, partially_sent
    sent_at = db.Column(db.DateTime)

    # Recipients tracking (stored as JSON string)
    recipients = db.Column(db.Text)  # JSON list of {email, status, error_message}

    # Error tracking
    error_message = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    report = db.relationship('TestReportMetadata', backref='alert_history')


# ==================== HELPER FUNCTIONS ====================

def convert_empty_to_none(value):
    """Convert empty strings to None for database storage"""
    if value is None or value == '' or value == 'null':
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return value


_report_category_col_exists = None

def apply_report_category_filter(query, report_category):
    """Filter query by report_category. Falls back to no filter if column not yet migrated."""
    global _report_category_col_exists
    if _report_category_col_exists is None:
        try:
            from sqlalchemy import inspect as _sa_inspect
            _cols = [c['name'] for c in _sa_inspect(db.engine).get_columns('test_report_metadata')]
            _report_category_col_exists = 'report_category' in _cols
        except Exception:
            _report_category_col_exists = False
    if not _report_category_col_exists:
        return query
    if report_category == 'baseline_report':
        return query.filter(TestReportMetadata.report_category == 'baseline_report')
    # 'pcrwr' is the legacy value from the pre-existing column default — treat it as pcrwr_report
    return query.filter(
        db.or_(
            TestReportMetadata.report_category == 'pcrwr_report',
            TestReportMetadata.report_category == 'pcrwr',
            TestReportMetadata.report_category.is_(None)
        )
    )



@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login user with role-based access control"""
    try:
        data = request.get_json()

        # Validate input
        if not data.get('email') or not data.get('password'):
            return jsonify({'success': False, 'message': 'Missing email or password'}), 400

        # Find user (email is case-insensitive)
        email = (data['email'] or '').strip().lower()
        user = User.query.filter(db.func.lower(User.email) == email).first()

        if not user or not user.password_hash or not user.check_password(data['password']):
            return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

        if not user.is_active:
            return jsonify({'success': False, 'message': 'User account is inactive'}), 401

        # Set session with role information
        session['user_id'] = user.id
        session['user_name'] = user.name
        session['user_email'] = user.email
        session['user_role'] = user.role
        session['user_organization'] = user.organization

        return jsonify({
            'success': True,
            'message': 'Login successful',
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'role': user.role,
                'organization': user.organization
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout user"""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200


@app.route('/api/auth/user', methods=['GET'])
def get_current_user():
    """Get current user information with permissions"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user = User.query.get(session['user_id'])
        if not user:
            # User no longer exists in database (possibly deleted or database cleared)
            # Clear the stale session to force re-login
            print(f"⚠️ User with id {session.get('user_id')} not found in database, clearing session")
            session.clear()
            return jsonify({'success': False, 'message': 'User not found, please login again'}), 401

        # Define role display names and permissions
        role_info = {
            'environmental_specialist': {
                'display_name': 'Environmental Specialist',
                'permissions': ['view', 'edit', 'approve', 'reject', 'submit'],
                'can_approve': True,
                'can_view_status_column': True,
                'can_view_actions_column': True
            },
            'research_analyst': {
                'display_name': 'Research Analyst',
                'permissions': ['view', 'edit', 'submit'],
                'can_approve': False,
                'can_view_status_column': False,
                'can_view_actions_column': False
            },
            'pcrwr_user': {
                'display_name': 'PCRWR User',
                'permissions': ['submit', 'view_approved'],
                'can_approve': False,
                'can_view_status_column': False,
                'can_view_actions_column': False
            },
            'dashboard_viewer': {
                'display_name': 'Dashboard Viewer',
                'permissions': ['view'],
                'can_approve': False,
                'can_view_status_column': False,
                'can_view_actions_column': False
            }
        }

        role_data = role_info.get(user.role, {})

        return jsonify({
            'success': True,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'role': user.role,
                'role_display_name': role_data.get('display_name', user.role),
                'organization': user.organization,
                'permissions': role_data.get('permissions', []),
                'can_approve': role_data.get('can_approve', False),
                'can_view_status_column': role_data.get('can_view_status_column', False),
                'can_view_actions_column': role_data.get('can_view_actions_column', False)
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== ROLE-BASED ACCESS CONTROL ====================

def require_role(*allowed_roles):
    """Decorator to check if user has required role"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'success': False, 'message': 'Unauthorized'}), 401

            user_role = session.get('user_role')
            if user_role not in allowed_roles:
                return jsonify({'success': False, 'message': 'Insufficient permissions'}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def require_permission(permission):
    """Decorator to check if user has specific permission"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'success': False, 'message': 'Unauthorized'}), 401

            user = User.query.get(session['user_id'])
            if not user or not user.has_permission(permission):
                return jsonify({'success': False, 'message': 'Insufficient permissions'}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


# ==================== VIEW-ONLY (DASHBOARD) ACCESS ====================

# Roles that may read the analytics dashboard and nothing else.
VIEW_ONLY_ROLES = {'dashboard_viewer'}

# Pages a view-only user must not reach even by typing the URL directly.
VIEW_ONLY_BLOCKED_PAGES = {
    '/add_water_test', '/add-water-test', '/add_water_test.html',
    '/baseline-report', '/baseline_report.html',
    '/add-water-test-priority', '/add_water_test_priority.html',
    '/view-submissions', '/view_submissions.html',
    '/draft-form', '/draft_form.html',
    '/comparison',
}

# Non-GET requests a view-only user is still allowed to make.
VIEW_ONLY_ALLOWED_WRITES = {'/api/auth/logout'}


@app.before_request
def enforce_view_only_access():
    """Hard gate for dashboard-only accounts.

    Hiding nav items in index.html is cosmetic; this is what actually stops a
    view-only user from opening a data-entry page or writing anything. Every
    non-GET request is refused, so new write routes are covered automatically.
    """
    if session.get('user_role') not in VIEW_ONLY_ROLES:
        return None

    if request.method in ('GET', 'HEAD', 'OPTIONS'):
        if request.path.rstrip('/') in VIEW_ONLY_BLOCKED_PAGES:
            return redirect(url_for('serve_dashboard'))
        return None

    if request.path in VIEW_ONLY_ALLOWED_WRITES:
        return None

    return jsonify({
        'success': False,
        'message': 'This account has dashboard view-only access.'
    }), 403


# ==================== WATER TEST ROUTES ====================

@app.route('/api/water-tests', methods=['POST'])
@require_permission('submit')
def create_water_test():
    """Create a new water test with submission workflow"""
    try:
        data = request.get_json()

        # Determine initial status based on user role
        user_role = session.get('user_role')
        if user_role == 'environmental_specialist':
            initial_status = 'draft'  # Can save as draft
        else:
            initial_status = 'draft'  # Others also save as draft first

        # Create water test
        water_test = WaterTest(
            user_id=session['user_id'],
            location=data.get('location'),
            region=data.get('region'),
            district=data.get('district'),
            village=data.get('village'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            test_date=data.get('test_date'),
            test_time=data.get('test_time'),
            ph_level=data.get('ph_level'),
            turbidity=data.get('turbidity'),
            tds=data.get('tds'),
            temperature=data.get('temperature'),
            chlorine=data.get('chlorine'),
            observations=data.get('observations'),
            tested_by=data.get('tested_by'),
            contact=data.get('contact'),
            status=initial_status,
            submitted_by_id=session['user_id'] if data.get('submit', False) else None,
            submitted_at=datetime.utcnow() if data.get('submit', False) else None
        )

        db.session.add(water_test)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Water test created successfully',
            'test_id': water_test.id,
            'status': water_test.status
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/water-tests', methods=['GET'])
def get_water_tests():
    """Get water tests based on user role and permissions"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')
        user_id = session['user_id']

        # Filter based on role
        if user_role == 'pcrwr_user':
            # PCRWR users can only see approved tests
            tests = WaterTest.query.filter_by(status='approved').all()
        elif user_role in ['environmental_specialist', 'mto_environment', 'research_analyst']:
            # Approvers can see all tests
            tests = WaterTest.query.all()
        else:
            # Regular users see their own tests
            tests = WaterTest.query.filter_by(user_id=user_id).all()

        return jsonify({
            'success': True,
            'tests': [{
                'id': test.id,
                'location': test.location,
                'region': test.region,
                'village': test.village,
                'test_date': test.test_date.isoformat(),
                'ph_level': test.ph_level,
                'tds': test.tds,
                'status': test.status,
                'submitted_at': test.submitted_at.isoformat() if test.submitted_at else None,
                'approved_at': test.approved_at.isoformat() if test.approved_at else None,
                'created_at': test.created_at.isoformat()
            } for test in tests]
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/water-tests/submissions/pending', methods=['GET'])
@require_role('environmental_specialist', 'mto_environment', 'research_analyst')
def get_pending_submissions():
    """Get all pending submissions for review"""
    try:
        # Get all pending submissions
        submissions = WaterTest.query.filter(
            WaterTest.status.in_(['pending_review', 'submitted'])
        ).order_by(WaterTest.submitted_at.desc()).all()

        return jsonify({
            'success': True,
            'submissions': [{
                'id': test.id,
                'test_id': f'TEST-{test.id:05d}',
                'village': test.village,
                'region': test.region,
                'test_date': test.test_date.isoformat(),
                'ph_level': test.ph_level,
                'tds': test.tds,
                'status': test.status,
                'submitted_by': test.submitter.name if test.submitter else 'Unknown',
                'submitted_at': test.submitted_at.isoformat() if test.submitted_at else None,
                'created_at': test.created_at.isoformat()
            } for test in submissions]
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/test-reports', methods=['GET'])
def get_test_reports():
    """Get test reports based on user role and permissions"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')
        user_id = session['user_id']

        # Get status filter from query params
        status_param = request.args.get('status', '')

        # Build base query
        query = db.session.query(TestReportMetadata).outerjoin(
            QualityAssessment,
            TestReportMetadata.report_id == QualityAssessment.report_id
        )

        # Apply role-based filtering
        if user_role == 'pcrwr_user':
            # PCRWR users only see approved reports
            query = query.filter(TestReportMetadata.status == 'approved')
        elif user_role in ['environmental_specialist', 'research_analyst']:
            # Environmental specialists and research analysts see submitted and approved
            if status_param:
                # Parse comma-separated statuses
                statuses = [s.strip() for s in status_param.split(',')]
                query = query.filter(TestReportMetadata.status.in_(statuses))
            else:
                # Default: show submitted and approved
                query = query.filter(TestReportMetadata.status.in_(['submitted', 'approved']))
        else:
            # Other roles see only their own reports
            query = query.filter(TestReportMetadata.user_id == user_id)

        # Order by most recent first
        query = query.order_by(TestReportMetadata.sampling_datetime.desc())

        # Execute query
        reports = query.all()

        # Format response
        reports_data = []
        for report in reports:
            # Get quality assessment if exists
            quality = report.quality_assessment if hasattr(report, 'quality_assessment') else None

            report_dict = {
                'report_id': report.report_id,
                'report_serial_no': report.report_serial_no,
                'nwql_sample_code': report.nwql_sample_code,
                'customer_name_address': report.customer_name_address,
                'sampling_datetime': report.sampling_datetime.isoformat() if report.sampling_datetime else None,
                'reporting_date': report.reporting_date.isoformat() if report.reporting_date else None,
                'work_order_no': report.work_order_no,
                'tehsil': report.tehsil,
                'village': report.village,
                'settlement': report.settlement,
                'sample_type': report.sample_type,
                'form_type': report.form_type,
                'report_category': report.report_category or 'pcrwr_report',
                'status': report.status,
                'user_id': report.user_id,
                'created_at': report.created_at.isoformat() if report.created_at else None,
                'updated_at': report.updated_at.isoformat() if report.updated_at else None,
            }

            # Add quality assessment if available
            if quality:
                report_dict['quality_assessment'] = {
                    'physical_quality': quality.physical_quality,
                    'chemical_quality': quality.chemical_quality,
                    'trace_elements_quality': quality.trace_elements_quality,
                    'microbial_quality': quality.microbial_quality,
                    'remarks': quality.remarks
                }
            else:
                report_dict['quality_assessment'] = None

            reports_data.append(report_dict)

        return jsonify({
            'success': True,
            'reports': reports_data,
            'total': len(reports_data)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/generate-narrative', methods=['POST'])
def generate_report_narrative():
    """Rule-based professional narrative generator — no external API required."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        data      = request.get_json() or {}
        loc       = data.get('location', {})
        physical  = data.get('physical', {})
        chemical  = data.get('chemical', {})
        trace     = data.get('trace', {})
        microbio  = data.get('microbio', {})
        quality   = data.get('quality', {})
        form_type = data.get('form_type', 'priority')

        village = loc.get('village') or 'N/A'
        tehsil  = loc.get('tehsil')  or 'N/A'

        def num(v):
            try:
                return float(v) if v not in (None, '', 'N/A', 'TNTC') else None
            except (TypeError, ValueError):
                return None

        exceedances = []   # list of strings describing limit violations
        safe_items  = []   # key parameters confirmed within range

        # ── Physical ──────────────────────────────────────────────────────
        ph = num(physical.get('ph'))
        if ph is not None:
            if ph < 6.5 or ph > 8.5:
                exceedances.append(f"pH at {ph} (permissible range: 6.5–8.5)")
            else:
                safe_items.append(f"pH ({ph})")

        turbidity = num(physical.get('turbidity'))
        if turbidity is not None:
            if turbidity > 5:
                exceedances.append(f"turbidity at {turbidity} NTU (permissible limit: <5 NTU)")
            else:
                safe_items.append(f"turbidity ({turbidity} NTU)")

        tds = num(physical.get('tds'))
        if tds is not None:
            if tds > 1000:
                exceedances.append(f"Total Dissolved Solids at {tds} mg/L (permissible limit: ≤1000 mg/L)")
            else:
                safe_items.append(f"TDS ({tds} mg/L)")

        ec = num(physical.get('ec'))
        if ec is not None and ec > 1500:
            exceedances.append(f"electrical conductivity at {ec} μS/cm (permissible limit: ≤1500 μS/cm)")

        # Aesthetic parameters
        for key, label, expected in [
            ('color', 'color', 'colorless'),
            ('odour', 'odour', 'odourless'),
            ('taste', 'taste', 'acceptable'),
        ]:
            val = (physical.get(key) or '').strip().lower()
            if val and val not in (expected, 'normal', 'non-objectionable', ''):
                exceedances.append(f"{label} reported as '{physical.get(key)}'")

        # ── Chemical ──────────────────────────────────────────────────────
        if form_type == 'full':
            chem_checks = [
                ('chlorides',    'Chlorides',         250,   'mg/L'),
                ('total_hardness','Total Hardness',   500,   'mg/L'),
                ('sodium',       'Sodium',            200,   'mg/L'),
                ('sulphate',     'Sulphate',          250,   'mg/L'),
                ('nitrate_n',    'Nitrate (as N)',     10,   'mg/L'),
                ('nitrite',      'Nitrite',             3,   'mg/L'),
                ('iron',         'Iron',              0.3,   'mg/L'),
                ('fluoride',     'Fluoride',          1.5,   'mg/L'),
            ]
            for key, label, limit, unit in chem_checks:
                v = num(chemical.get(key))
                if v is not None:
                    if v > limit:
                        exceedances.append(f"{label} at {v} {unit} (permissible limit: ≤{limit} {unit})")
                    else:
                        safe_items.append(f"{label} ({v} {unit})")

            # ── Trace elements ────────────────────────────────────────────
            trace_checks = [
                ('arsenic',   'Arsenic',    50,    'μg/L'),
                ('lead',      'Lead',       50,    'μg/L'),
                ('chromium',  'Chromium',   50,    'μg/L'),
                ('cadmium',   'Cadmium',     5,    'μg/L'),
                ('nickel',    'Nickel',     20,    'μg/L'),
                ('selenium',  'Selenium',   10,    'μg/L'),
                ('mercury',   'Mercury',  0.001,   'mg/L'),
                ('manganese', 'Manganese', 400,    'μg/L'),
                ('copper',    'Copper',   2000,    'μg/L'),
                ('zinc',      'Zinc',     5000,    'μg/L'),
                ('aluminum',  'Aluminum',  200,    'μg/L'),
            ]
            for key, label, limit, unit in trace_checks:
                v = num(trace.get(key))
                if v is not None and v > limit:
                    exceedances.append(f"{label} at {v} {unit} (permissible limit: ≤{limit} {unit})")

        # ── Microbiological ───────────────────────────────────────────────
        micro_labels = [
            ('total_coliforms', 'Total Coliforms'),
            ('fecal_coliforms', 'Fecal Coliforms'),
            ('e_coli',          'Escherichia coli'),
        ]
        micro_exceedances = []
        for key, label in micro_labels:
            raw = microbio.get(key)
            if raw == 'TNTC':
                micro_exceedances.append(f"{label} Too Numerous to Count (TNTC)")
            else:
                v = num(raw)
                if v is not None and v > 0:
                    micro_exceedances.append(f"{label} at {int(v)} CFU/100mL (permissible limit: 0 CFU/100mL)")
        exceedances.extend(micro_exceedances)

        # ── Build narrative ───────────────────────────────────────────────
        intro = f"Sample collected from Village {village}, Tehsil {tehsil}, was analysed for water quality parameters in accordance with WHO Guidelines and National Standards for Drinking Water Quality (NSDWQ), Pakistan."

        if not exceedances:
            # All safe
            tested = []
            if ph is not None or turbidity is not None or tds is not None:
                tested.append("physical and aesthetic parameters")
            if form_type == 'full':
                tested.append("major chemical constituents")
                tested.append("trace and ultra-trace elements")
            tested.append("microbiological parameters")
            tested_str = ", ".join(tested) if tested else "all tested parameters"
            body = (f"All tested {tested_str} were found to be within the permissible limits prescribed by WHO and NSDWQ. "
                    f"The water sample is fit for human consumption.")
        else:
            exc_str = "; ".join(exceedances)
            if len(exceedances) == 1:
                exc_sentence = f"The following parameter was found to exceed the permissible limit: {exc_str}."
            else:
                exc_sentence = f"The following parameters were found to exceed permissible limits: {exc_str}."

            # Safe highlights (top 3 only to keep paragraph concise)
            safe_str = ""
            if safe_items:
                safe_str = f" Parameters including {', '.join(safe_items[:3])} were within acceptable limits."

            # Recommendation based on severity
            has_micro   = bool(micro_exceedances)
            has_arsenic = any('Arsenic' in e or 'Lead' in e or 'Mercury' in e or 'Cadmium' in e for e in exceedances)

            if has_micro and has_arsenic:
                recommendation = ("The sample presents both microbiological contamination and elevated heavy metal concentrations. "
                                  "It is not fit for human consumption and requires comprehensive treatment including filtration, disinfection, and heavy metal removal before use.")
            elif has_micro:
                recommendation = ("Microbiological contamination renders the sample unsafe for direct human consumption. "
                                  "Disinfection treatment is strongly recommended prior to use.")
            elif has_arsenic:
                recommendation = ("Elevated heavy metal concentration(s) pose a health risk. "
                                  "Appropriate treatment for heavy metal removal is required before the water is deemed fit for human consumption.")
            else:
                recommendation = ("It is recommended that corrective measures be taken to bring the water quality within permissible limits before use for human consumption.")

            body = f"{exc_sentence}{safe_str} {recommendation}"

        narrative = f"{intro} {body}"
        return jsonify({'success': True, 'narrative': narrative})

    except Exception as e:
        return jsonify({'success': False, 'message': f'Narrative generation failed: {str(e)}'}), 500


@app.route('/api/lab-report/parse', methods=['POST'])
def parse_lab_report_upload():
    """Extract fields from an uploaded PCRWR NWQL .pdf or .docx lab report."""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        upload = request.files.get('file')
        if not upload or not upload.filename:
            return jsonify({'success': False, 'message': 'No file uploaded'}), 400
        from lab_report_parser import LabDocumentExtractionError, parse_lab_document_file

        parsed = parse_lab_document_file(
            upload.read(),
            upload.filename,
            upload.mimetype,
        )
        return jsonify({'success': True, 'data': parsed}), 200
    except LabDocumentExtractionError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(exc)}), 500


@app.route('/api/lab-report/parse-text', methods=['POST'])
def parse_lab_report_text():
    """Parse report fields from plain text (e.g. client-side OCR on a photo)."""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        body = request.get_json() or {}
        text = body.get('text') or ''
        file_name = body.get('fileName') or 'ocr.txt'
        from lab_report_parser import LabDocumentExtractionError, parse_lab_document_text

        parsed = parse_lab_document_text(text, file_name)
        return jsonify({'success': True, 'data': parsed}), 200
    except LabDocumentExtractionError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'message': str(exc)}), 500


@app.route('/api/test-reports', methods=['POST'])
def create_test_report():
    """Create a new test report with all related data"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'No data provided'}), 400

        # Helper to parse numeric values
        def parse_numeric(val):
            if val is None or val == '':
                return None
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        # Generate unique report serial number and sample code
        import uuid
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        unique_id = str(uuid.uuid4())[:8].upper()
        report_serial_no = data.get('report_serial_no') or f"NWQL-{timestamp}-{unique_id}"
        nwql_sample_code = data.get('nwql_sample_code') or f"NWQL-SC-{timestamp}-{unique_id}"

        # Parse datetime fields
        sampling_datetime = None
        if data.get('sampling_date'):
            sampling_time = data.get('sampling_time', '00:00')
            sampling_datetime = datetime.strptime(f"{data['sampling_date']} {sampling_time}", '%Y-%m-%d %H:%M')
        else:
            sampling_datetime = datetime.utcnow()

        sample_receipt_datetime = None
        if data.get('sample_receipt_date'):
            sample_receipt_time = data.get('sample_receipt_time', '00:00')
            sample_receipt_datetime = datetime.strptime(f"{data['sample_receipt_date']} {sample_receipt_time}", '%Y-%m-%d %H:%M')
        else:
            sample_receipt_datetime = datetime.utcnow()

        analysis_date_from = None
        if data.get('analysis_date_from'):
            analysis_date_from = datetime.strptime(data['analysis_date_from'], '%Y-%m-%d').date()
        else:
            analysis_date_from = datetime.utcnow().date()

        analysis_date_to = None
        if data.get('analysis_date_to'):
            analysis_date_to = datetime.strptime(data['analysis_date_to'], '%Y-%m-%d').date()

        reporting_date = None
        if data.get('reporting_date'):
            reporting_date = datetime.strptime(data['reporting_date'], '%Y-%m-%d').date()
        else:
            reporting_date = datetime.utcnow().date()

        # Create the main report metadata
        report = TestReportMetadata(
            report_serial_no=report_serial_no,
            total_pages=parse_numeric(data.get('total_pages')) or 2,
            customer_name_address=data.get('customer_name_address', 'N/A'),
            customer_code=data.get('customer_code'),
            nwql_sample_code=nwql_sample_code,
            sampling_datetime=sampling_datetime,
            sample_receipt_datetime=sample_receipt_datetime,
            temperature_at_receipt=parse_numeric(data.get('temperature_at_receipt')) if parse_numeric(data.get('temperature_at_receipt')) is not None else 25.0,
            humidity_at_receipt=parse_numeric(data.get('humidity_at_receipt')) if parse_numeric(data.get('humidity_at_receipt')) is not None else 50.0,
            analysis_date_from=analysis_date_from,
            analysis_date_to=analysis_date_to,
            reporting_date=reporting_date,
            gps_latitude=parse_numeric(data.get('gps_latitude')),
            gps_longitude=parse_numeric(data.get('gps_longitude')),
            location=data.get('location', 'N/A'),
            work_order_no=data.get('work_order_no', f"WO-{timestamp}"),
            tehsil=data.get('tehsil', 'N/A'),
            village=data.get('village', 'N/A'),
            settlement=data.get('settlement') or data.get('settlement_name', 'N/A'),
            sample_type=data.get('sampleType') or data.get('sample_type'),
            total_samples=parse_numeric(data.get('total_samples')) or 1,
            form_type=data.get('form_type', 'priority'),
            report_category=data.get('report_category', 'pcrwr_report'),
            status='submitted',
            submitted_by_id=session['user_id'],
            submitted_at=datetime.utcnow(),
            user_id=session['user_id']
        )

        db.session.add(report)
        db.session.flush()  # Get the report_id

        # Create Physical/Aesthetic Parameters
        physical_params = PhysicalAestheticParameters(
            report_id=report.report_id,
            ph=parse_numeric(data.get('ph')),
            electrical_conductivity=parse_numeric(data.get('electrical_conductivity')),
            temperature=parse_numeric(data.get('temperature')),
            color=data.get('color'),
            odour=data.get('odour'),
            taste=data.get('taste'),
            suspended_solids=parse_numeric(data.get('suspended_solids')),
            total_dissolved_solids=parse_numeric(data.get('total_dissolved_solids')),
            turbidity=parse_numeric(data.get('turbidity'))
        )
        db.session.add(physical_params)

        # Create Microbiological Parameters
        microbio_params = MicrobiologicalParameters(
            report_id=report.report_id,
            total_coliforms=data.get('total_coliforms'),
            fecal_coliforms=data.get('fecal_coliforms'),
            e_coli=data.get('e_coli')
        )
        db.session.add(microbio_params)

        # For full form type, also create chemical and trace element records
        if data.get('form_type') == 'full':
            # Create Major Chemical Parameters
            chemical_params = MajorChemicalParameters(
                report_id=report.report_id,
                alkalinity_caco3=parse_numeric(data.get('alkalinity_caco3')),
                bicarbonates=parse_numeric(data.get('bicarbonates')),
                calcium=parse_numeric(data.get('calcium')),
                carbonates=parse_numeric(data.get('carbonates')),
                chlorides=parse_numeric(data.get('chlorides')),
                total_hardness=parse_numeric(data.get('total_hardness')),
                magnesium=parse_numeric(data.get('magnesium')),
                potassium=parse_numeric(data.get('potassium')),
                sodium=parse_numeric(data.get('sodium')),
                sulphate=parse_numeric(data.get('sulphate')),
                nitrate_n=parse_numeric(data.get('nitrate_n')),
                nitrite=parse_numeric(data.get('nitrite')),
                tds=parse_numeric(data.get('tds')),
                iron=parse_numeric(data.get('iron')),
                fluoride=parse_numeric(data.get('fluoride')),
                phosphate=parse_numeric(data.get('phosphate'))
            )
            db.session.add(chemical_params)

            # Create Trace/Ultra-trace Elements
            trace_elements = TraceUltratraceElements(
                report_id=report.report_id,
                aluminum=parse_numeric(data.get('aluminum')),
                arsenic=parse_numeric(data.get('arsenic')),
                barium=parse_numeric(data.get('barium')),
                cadmium=parse_numeric(data.get('cadmium')),
                chromium=parse_numeric(data.get('chromium')),
                copper=parse_numeric(data.get('copper')),
                iron=parse_numeric(data.get('iron')),
                manganese=parse_numeric(data.get('manganese')),
                molybdenum=parse_numeric(data.get('molybdenum')),
                nickel=parse_numeric(data.get('nickel')),
                lead=parse_numeric(data.get('lead')),
                selenium=parse_numeric(data.get('selenium')),
                silver=parse_numeric(data.get('silver')),
                strontium=parse_numeric(data.get('strontium')),
                thallium=parse_numeric(data.get('thallium')),
                uranium=parse_numeric(data.get('uranium')),
                zinc=parse_numeric(data.get('zinc')),
                boron=parse_numeric(data.get('boron')),
                antimony=parse_numeric(data.get('antimony')),
                mercury=parse_numeric(data.get('mercury')),
                cyanide=parse_numeric(data.get('cyanide')),
                silica=parse_numeric(data.get('silica'))
            )
            db.session.add(trace_elements)

        # Create Quality Assessment
        quality_assessment = QualityAssessment(
            report_id=report.report_id,
            physical_quality=data.get('physicalQuality'),
            chemical_quality=data.get('chemicalQuality'),
            trace_elements_quality=data.get('traceElementsQuality'),
            microbial_quality=data.get('microbialQuality'),
            remarks=data.get('remarks')
        )
        db.session.add(quality_assessment)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Test report created successfully',
            'report_id': report.report_id,
            'report_serial_no': report.report_serial_no
        }), 201

    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/test-reports/<int:report_id>', methods=['GET'])
def get_single_test_report(report_id):
    """Get a single test report with all related data"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')
        user_id = session['user_id']

        # Get report with all relationships
        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        # Access control
        if user_role == 'pcrwr_user' and report.status != 'approved':
            return jsonify({'success': False, 'message': 'Access denied'}), 403

        # Build response with all related data
        report_data = {
            'report_id': report.report_id,
            'report_serial_no': report.report_serial_no,
            'total_pages': report.total_pages,
            'customer_name_address': report.customer_name_address,
            'customer_code': report.customer_code,
            'nwql_sample_code': report.nwql_sample_code,
            'sampling_datetime': report.sampling_datetime.isoformat() if report.sampling_datetime else None,
            'sample_receipt_datetime': report.sample_receipt_datetime.isoformat() if report.sample_receipt_datetime else None,
            'temperature_at_receipt': float(report.temperature_at_receipt) if report.temperature_at_receipt else None,
            'humidity_at_receipt': float(report.humidity_at_receipt) if report.humidity_at_receipt else None,
            'analysis_date_from': report.analysis_date_from.isoformat() if report.analysis_date_from else None,
            'analysis_date_to': report.analysis_date_to.isoformat() if report.analysis_date_to else None,
            'reporting_date': report.reporting_date.isoformat() if report.reporting_date else None,
            'gps_latitude': float(report.gps_latitude) if report.gps_latitude else None,
            'gps_longitude': float(report.gps_longitude) if report.gps_longitude else None,
            'location': report.location,
            'work_order_no': report.work_order_no,
            'tehsil': report.tehsil,
            'village': report.village,
            'settlement': report.settlement,
            'sample_type': report.sample_type,
            'total_samples': report.total_samples,
            'form_type': report.form_type,
            'status': report.status,
            'user_id': report.user_id,
            'created_at': report.created_at.isoformat() if report.created_at else None,
            'updated_at': report.updated_at.isoformat() if report.updated_at else None,
        }

        # Physical parameters
        if report.physical_params:
            pp = report.physical_params
            report_data['physical_params'] = {
                'ph': float(pp.ph) if pp.ph is not None else None,
                'electrical_conductivity': float(pp.electrical_conductivity) if pp.electrical_conductivity is not None else None,
                'temperature': float(pp.temperature) if pp.temperature is not None else None,
                'color': pp.color,
                'odour': pp.odour,
                'taste': pp.taste,
                'suspended_solids': float(pp.suspended_solids) if pp.suspended_solids is not None else None,
                'total_dissolved_solids': float(pp.total_dissolved_solids) if pp.total_dissolved_solids is not None else None,
                'turbidity': float(pp.turbidity) if pp.turbidity is not None else None
            }

        # Chemical parameters (full mode only)
        if report.chemical_params:
            cp = report.chemical_params
            report_data['chemical_params'] = {
                'alkalinity_caco3': float(cp.alkalinity_caco3) if cp.alkalinity_caco3 is not None else None,
                'bicarbonates': float(cp.bicarbonates) if cp.bicarbonates is not None else None,
                'calcium': float(cp.calcium) if cp.calcium is not None else None,
                'carbonates': float(cp.carbonates) if cp.carbonates is not None else None,
                'chlorides': float(cp.chlorides) if cp.chlorides is not None else None,
                'total_hardness': float(cp.total_hardness) if cp.total_hardness is not None else None,
                'magnesium': float(cp.magnesium) if cp.magnesium is not None else None,
                'potassium': float(cp.potassium) if cp.potassium is not None else None,
                'sodium': float(cp.sodium) if cp.sodium is not None else None,
                'sulphate': float(cp.sulphate) if cp.sulphate is not None else None,
                'nitrate_n': float(cp.nitrate_n) if cp.nitrate_n is not None else None,
                'nitrite': float(cp.nitrite) if cp.nitrite is not None else None,
                'tds': float(cp.tds) if cp.tds is not None else None,
                'iron': float(cp.iron) if cp.iron is not None else None,
                'fluoride': float(cp.fluoride) if cp.fluoride is not None else None,
                'phosphate': float(cp.phosphate) if cp.phosphate is not None else None
            }

        # Trace elements (full mode only)
        if report.trace_elements:
            te = report.trace_elements
            report_data['trace_elements'] = {
                'aluminum': float(te.aluminum) if te.aluminum is not None else None,
                'arsenic': float(te.arsenic) if te.arsenic is not None else None,
                'barium': float(te.barium) if te.barium is not None else None,
                'cadmium': float(te.cadmium) if te.cadmium is not None else None,
                'chromium': float(te.chromium) if te.chromium is not None else None,
                'copper': float(te.copper) if te.copper is not None else None,
                'iron': float(te.iron) if te.iron is not None else None,
                'manganese': float(te.manganese) if te.manganese is not None else None,
                'molybdenum': float(te.molybdenum) if te.molybdenum is not None else None,
                'nickel': float(te.nickel) if te.nickel is not None else None,
                'lead': float(te.lead) if te.lead is not None else None,
                'selenium': float(te.selenium) if te.selenium is not None else None,
                'silver': float(te.silver) if te.silver is not None else None,
                'strontium': float(te.strontium) if te.strontium is not None else None,
                'thallium': float(te.thallium) if te.thallium is not None else None,
                'uranium': float(te.uranium) if te.uranium is not None else None,
                'zinc': float(te.zinc) if te.zinc is not None else None,
                'boron': float(te.boron) if te.boron is not None else None,
                'antimony': float(te.antimony) if te.antimony is not None else None,
                'mercury': float(te.mercury) if te.mercury is not None else None,
                'cyanide': float(te.cyanide) if te.cyanide is not None else None,
                'silica': float(te.silica) if te.silica is not None else None
            }

        # Microbiological parameters
        if report.microbio_params:
            mp = report.microbio_params
            report_data['microbio_params'] = {
                'total_coliforms': mp.total_coliforms,
                'fecal_coliforms': mp.fecal_coliforms,
                'e_coli': mp.e_coli
            }

        # Quality assessment
        if report.quality_assessment:
            qa = report.quality_assessment
            report_data['quality_assessment'] = {
                'physical_quality': qa.physical_quality,
                'chemical_quality': qa.chemical_quality,
                'trace_elements_quality': qa.trace_elements_quality,
                'microbial_quality': qa.microbial_quality,
                'remarks': qa.remarks
            }

        return jsonify({
            'success': True,
            'report': report_data
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/test-reports/<int:report_id>', methods=['PUT'])
def update_test_report(report_id):
    """Update a test report - only for environmental_specialist"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')
        if user_role != 'environmental_specialist':
            return jsonify({'success': False, 'message': 'Only environmental specialists can edit reports'}), 403

        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        data = request.get_json()

        # Helper to parse numeric values
        def parse_numeric(val):
            if val is None or val == '':
                return None
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        # Update metadata fields
        if 'report_serial_no' in data:
            report.report_serial_no = data['report_serial_no']
        if 'total_pages' in data:
            report.total_pages = parse_numeric(data['total_pages'])
        if 'customer_name_address' in data:
            report.customer_name_address = data['customer_name_address']
        if 'customer_code' in data:
            report.customer_code = data['customer_code']
        if 'nwql_sample_code' in data:
            report.nwql_sample_code = data['nwql_sample_code']
        if 'sampling_datetime' in data and data['sampling_datetime']:
            report.sampling_datetime = datetime.fromisoformat(data['sampling_datetime'].replace('Z', '+00:00'))
        if 'sample_receipt_datetime' in data and data['sample_receipt_datetime']:
            report.sample_receipt_datetime = datetime.fromisoformat(data['sample_receipt_datetime'].replace('Z', '+00:00'))
        if 'temperature_at_receipt' in data:
            report.temperature_at_receipt = parse_numeric(data['temperature_at_receipt'])
        if 'humidity_at_receipt' in data:
            report.humidity_at_receipt = parse_numeric(data['humidity_at_receipt'])
        if 'analysis_date_from' in data and data['analysis_date_from']:
            report.analysis_date_from = datetime.strptime(data['analysis_date_from'], '%Y-%m-%d').date()
        if 'analysis_date_to' in data and data['analysis_date_to']:
            report.analysis_date_to = datetime.strptime(data['analysis_date_to'], '%Y-%m-%d').date()
        if 'reporting_date' in data and data['reporting_date']:
            report.reporting_date = datetime.strptime(data['reporting_date'], '%Y-%m-%d').date()
        if 'gps_latitude' in data:
            report.gps_latitude = parse_numeric(data['gps_latitude'])
        if 'gps_longitude' in data:
            report.gps_longitude = parse_numeric(data['gps_longitude'])
        if 'location' in data:
            report.location = data['location']
        if 'work_order_no' in data:
            report.work_order_no = data['work_order_no']
        if 'tehsil' in data:
            report.tehsil = data['tehsil']
        if 'village' in data:
            report.village = data['village']
        if 'settlement' in data:
            report.settlement = data['settlement']
        if 'sample_type' in data or 'sampleType' in data:
            report.sample_type = data.get('sampleType') or data.get('sample_type')
        if 'total_samples' in data:
            report.total_samples = parse_numeric(data['total_samples'])

        # Update physical parameters
        if 'physical_params' in data:
            pp_data = data['physical_params']
            if not report.physical_params:
                report.physical_params = PhysicalAestheticParameters(report_id=report_id)
            pp = report.physical_params
            pp.ph = parse_numeric(pp_data.get('ph'))
            pp.electrical_conductivity = parse_numeric(pp_data.get('electrical_conductivity'))
            pp.temperature = parse_numeric(pp_data.get('temperature'))
            pp.color = pp_data.get('color')
            pp.odour = pp_data.get('odour')
            pp.taste = pp_data.get('taste')
            pp.suspended_solids = parse_numeric(pp_data.get('suspended_solids'))
            pp.total_dissolved_solids = parse_numeric(pp_data.get('total_dissolved_solids'))
            pp.turbidity = parse_numeric(pp_data.get('turbidity'))

        # Update chemical parameters
        if 'chemical_params' in data:
            cp_data = data['chemical_params']
            if not report.chemical_params:
                report.chemical_params = MajorChemicalParameters(report_id=report_id)
            cp = report.chemical_params
            cp.alkalinity_caco3 = parse_numeric(cp_data.get('alkalinity_caco3'))
            cp.bicarbonates = parse_numeric(cp_data.get('bicarbonates'))
            cp.calcium = parse_numeric(cp_data.get('calcium'))
            cp.carbonates = parse_numeric(cp_data.get('carbonates'))
            cp.chlorides = parse_numeric(cp_data.get('chlorides'))
            cp.total_hardness = parse_numeric(cp_data.get('total_hardness'))
            cp.magnesium = parse_numeric(cp_data.get('magnesium'))
            cp.potassium = parse_numeric(cp_data.get('potassium'))
            cp.sodium = parse_numeric(cp_data.get('sodium'))
            cp.sulphate = parse_numeric(cp_data.get('sulphate'))
            cp.nitrate_n = parse_numeric(cp_data.get('nitrate_n'))
            cp.nitrite = parse_numeric(cp_data.get('nitrite'))
            cp.tds = parse_numeric(cp_data.get('tds'))
            cp.iron = parse_numeric(cp_data.get('iron'))
            cp.fluoride = parse_numeric(cp_data.get('fluoride'))
            cp.phosphate = parse_numeric(cp_data.get('phosphate'))

        # Update trace elements
        if 'trace_elements' in data:
            te_data = data['trace_elements']
            if not report.trace_elements:
                report.trace_elements = TraceUltratraceElements(report_id=report_id)
            te = report.trace_elements
            te.aluminum = parse_numeric(te_data.get('aluminum'))
            te.arsenic = parse_numeric(te_data.get('arsenic'))
            te.barium = parse_numeric(te_data.get('barium'))
            te.cadmium = parse_numeric(te_data.get('cadmium'))
            te.chromium = parse_numeric(te_data.get('chromium'))
            te.copper = parse_numeric(te_data.get('copper'))
            te.iron = parse_numeric(te_data.get('iron'))
            te.manganese = parse_numeric(te_data.get('manganese'))
            te.molybdenum = parse_numeric(te_data.get('molybdenum'))
            te.nickel = parse_numeric(te_data.get('nickel'))
            te.lead = parse_numeric(te_data.get('lead'))
            te.selenium = parse_numeric(te_data.get('selenium'))
            te.silver = parse_numeric(te_data.get('silver'))
            te.strontium = parse_numeric(te_data.get('strontium'))
            te.thallium = parse_numeric(te_data.get('thallium'))
            te.uranium = parse_numeric(te_data.get('uranium'))
            te.zinc = parse_numeric(te_data.get('zinc'))
            te.boron = parse_numeric(te_data.get('boron'))
            te.antimony = parse_numeric(te_data.get('antimony'))
            te.mercury = parse_numeric(te_data.get('mercury'))
            te.cyanide = parse_numeric(te_data.get('cyanide'))
            te.silica = parse_numeric(te_data.get('silica'))

        # Update microbiological parameters
        if 'microbio_params' in data:
            mp_data = data['microbio_params']
            if not report.microbio_params:
                report.microbio_params = MicrobiologicalParameters(report_id=report_id)
            mp = report.microbio_params
            mp.total_coliforms = mp_data.get('total_coliforms')
            mp.fecal_coliforms = mp_data.get('fecal_coliforms')
            mp.e_coli = mp_data.get('e_coli')

        # Update quality assessment
        if 'quality_assessment' in data:
            qa_data = data['quality_assessment']
            if not report.quality_assessment:
                report.quality_assessment = QualityAssessment(report_id=report_id)
            qa = report.quality_assessment
            qa.physical_quality = qa_data.get('physical_quality')
            qa.chemical_quality = qa_data.get('chemical_quality')
            qa.trace_elements_quality = qa_data.get('trace_elements_quality')
            qa.microbial_quality = qa_data.get('microbial_quality')
            qa.remarks = qa_data.get('remarks')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Report updated successfully'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/test-reports/<int:report_id>/approve', methods=['POST'])
def approve_test_report(report_id):
    """Approve a test report - only for environmental_specialist"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')
        if user_role != 'environmental_specialist':
            return jsonify({'success': False, 'message': 'Only environmental specialists can approve reports'}), 403

        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        if report.status not in ['submitted', 'pending_review']:
            return jsonify({'success': False, 'message': f'Cannot approve report with status: {report.status}'}), 400

        # Update status
        report.status = 'approved'
        report.approved_by_id = session['user_id']
        report.approved_at = datetime.utcnow()

        db.session.commit()

        # Everything after commit is best-effort — never let it turn a successful approval into an error
        notification_result = None
        try:
            print(f"[APPROVE] Report {report_id} approved, sending notifications...")
            try:
                notification_result = send_report_notification(report_id)
            except Exception as email_error:
                notification_result = {'success': False, 'message': str(email_error)}
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': 'Report approved successfully',
            'notification': notification_result
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/test-reports/<int:report_id>/reject', methods=['POST'])
def reject_test_report(report_id):
    """Reject a test report - only for environmental_specialist"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')
        if user_role != 'environmental_specialist':
            return jsonify({'success': False, 'message': 'Only environmental specialists can reject reports'}), 403

        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        if report.status not in ['submitted', 'pending_review']:
            return jsonify({'success': False, 'message': f'Cannot reject report with status: {report.status}'}), 400

        data = request.get_json() or {}
        rejection_reason = data.get('rejection_reason', '')

        if not rejection_reason:
            return jsonify({'success': False, 'message': 'Rejection reason is required'}), 400

        # Update status
        report.status = 'rejected'
        report.rejection_reason = rejection_reason

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Report rejected successfully'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== IMAGE UPLOAD ENDPOINTS ====================

@app.route('/api/test-reports/<int:report_id>/images', methods=['POST'])
def upload_sample_images(report_id):
    """Upload sample images for a test report"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        # Check if report exists
        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        # Check if files were uploaded
        if 'images' not in request.files:
            return jsonify({'success': False, 'message': 'No images provided'}), 400

        files = request.files.getlist('images')

        if len(files) == 0:
            return jsonify({'success': False, 'message': 'No images selected'}), 400

        if len(files) > 4:
            return jsonify({'success': False, 'message': 'Maximum 4 images allowed'}), 400

        uploaded_images = []

        for file in files:
            if file.filename == '':
                continue

            if file and allowed_file(file.filename):
                # Generate unique filename
                original_filename = secure_filename(file.filename)
                ext = original_filename.rsplit('.', 1)[1].lower()
                unique_filename = f"{report_id}_{uuid.uuid4().hex[:8]}.{ext}"

                # Save file to disk
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                file.save(file_path)

                # Get file size
                file_size = os.path.getsize(file_path)

                # Save to database
                sample_image = SampleImages(
                    report_id=report_id,
                    image_filename=original_filename,
                    image_path=unique_filename,
                    image_size=file_size,
                    image_type=file.content_type,
                    uploaded_by_id=session['user_id']
                )
                db.session.add(sample_image)

                uploaded_images.append({
                    'filename': original_filename,
                    'path': unique_filename,
                    'size': file_size
                })
            else:
                return jsonify({
                    'success': False,
                    'message': f'Invalid file type for {file.filename}. Allowed: JPG, PNG, GIF, WebP'
                }), 400

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{len(uploaded_images)} image(s) uploaded successfully',
            'images': uploaded_images
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/test-reports/<int:report_id>/images', methods=['GET'])
def get_sample_images(report_id):
    """Get all images for a test report"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        images = SampleImages.query.filter_by(report_id=report_id).all()

        return jsonify({
            'success': True,
            'images': [{
                'image_id': img.image_id,
                'filename': img.image_filename,
                'path': img.image_path,
                'size': img.image_size,
                'type': img.image_type,
                'uploaded_at': img.uploaded_at.isoformat() if img.uploaded_at else None
            } for img in images]
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/sample-images/<path:filename>')
def serve_sample_image(filename):
    """Serve uploaded sample images"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        return jsonify({'success': False, 'message': 'Image not found'}), 404


@app.route('/api/test-reports/<int:report_id>/images/<int:image_id>', methods=['DELETE'])
def delete_sample_image(report_id, image_id):
    """Delete a sample image"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        image = SampleImages.query.filter_by(image_id=image_id, report_id=report_id).first()
        if not image:
            return jsonify({'success': False, 'message': 'Image not found'}), 404

        # Delete file from disk
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], image.image_path)
        if os.path.exists(file_path):
            os.remove(file_path)

        # Delete from database
        db.session.delete(image)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Image deleted successfully'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== PDF GENERATION ENDPOINT ====================

@app.route('/api/test-reports/<int:report_id>/download-pdf-v2', endpoint='download_report_pdf_v2')
def download_report_pdf_v2(report_id):
    """Generate and download a PDF report (v2)"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        # Get report with all related data
        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        # Import reportlab components
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch, mm
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
            from io import BytesIO
        except ImportError:
            return jsonify({
                'success': False,
                'message': 'PDF generation library not installed. Please install reportlab: pip install reportlab'
            }), 500

        # Create PDF buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=30,
            leftMargin=30,
            topMargin=30,
            bottomMargin=30
        )

        # Styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1e3c72')
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=12,
            spaceAfter=6,
            textColor=colors.HexColor('#1e3c72')
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=9,
            spaceAfter=4
        )

        elements = []

        # ── Header matching view_submissions.html ──────────────────────────
        logo_gop_path   = os.path.join(app.static_folder, 'images', 'GOP Logo (1).png')
        logo_prmsc_path = os.path.join(app.static_folder, 'images', 'PRMSC Logo PSD (1).png')

        logo_gop_elem   = RLImage(logo_gop_path,   width=65, height=65) if os.path.exists(logo_gop_path)   else Paragraph('', normal_style)
        logo_prmsc_elem = RLImage(logo_prmsc_path, width=65, height=65) if os.path.exists(logo_prmsc_path) else Paragraph('', normal_style)

        org_name_style_v2 = ParagraphStyle(
            'OrgNameV2', parent=styles['Normal'],
            fontSize=17, fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1e3c72'),
            alignment=TA_CENTER, spaceAfter=4
        )

        center_col = [
            Paragraph('Punjab Rural Municipal Services Company', org_name_style_v2),
        ]

        t_header = Table([[logo_gop_elem, center_col, logo_prmsc_elem]], colWidths=[80, 370, 80])
        t_header.setStyle(TableStyle([
            ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('LINEBELOW',     (0, 0), (-1,  0), 1.2, colors.HexColor('#1e3c72')),
            ('TOPPADDING',    (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(t_header)

        sys_title_style_v2 = ParagraphStyle(
            'SysTitleV2', parent=styles['Normal'],
            fontSize=12, fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1e3c72'),
            alignment=TA_CENTER, spaceBefore=8, spaceAfter=14
        )
        elements.append(Paragraph('Water Quality Management System', sys_title_style_v2))
        elements.append(Spacer(1, 12))

        # Report Information
        elements.append(Paragraph("<b>Report Information</b>", heading_style))
        report_info = [
            ['Report Serial No:', report.report_serial_no or 'N/A'],
            ['NWQL Sample Code:', report.nwql_sample_code or 'N/A'],
            ['Sampling Date/Time:', report.sampling_datetime.strftime('%Y-%m-%d %H:%M') if report.sampling_datetime else 'N/A'],
            ['Reporting Date:', report.reporting_date.strftime('%Y-%m-%d') if report.reporting_date else 'N/A'],
            ['Location:', report.location or 'N/A'],
            ['Tehsil:', report.tehsil or 'N/A'],
            ['Village:', report.village or 'N/A'],
            ['Settlement:', report.settlement or 'N/A'],
        ]
        info_table = Table(report_info, colWidths=[150, 350])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 12))

        # Physical Parameters
        if report.physical_params:
            elements.append(Paragraph("<b>Physical & Aesthetic Parameters</b>", heading_style))
            phys = report.physical_params
            phys_data = [
                ['Parameter', 'Result', 'Permissible Limit'],
                ['pH', str(phys.ph) if phys.ph else 'N/A', '6.5 - 8.5'],
                ['Temperature (°C)', str(phys.temperature) if phys.temperature else 'N/A', '-'],
                ['Electrical Conductivity (µS/cm)', str(phys.electrical_conductivity) if phys.electrical_conductivity else 'N/A', '≤ 1500'],
                ['Color', phys.color or 'N/A', 'Non-objectionable'],
                ['Odour', phys.odour or 'N/A', 'Non-objectionable'],
                ['Taste', phys.taste or 'N/A', 'Non-objectionable'],
                ['Suspended Solids (mg/L)', str(phys.suspended_solids) if phys.suspended_solids else 'N/A', '-'],
                ['TDS (mg/L)', str(phys.total_dissolved_solids) if phys.total_dissolved_solids else 'N/A', '≤ 1000'],
                ['Turbidity (NTU)', str(phys.turbidity) if phys.turbidity else 'N/A', '< 5'],
            ]
            phys_table = Table(phys_data, colWidths=[200, 150, 150])
            phys_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3c72')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(phys_table)
            elements.append(Spacer(1, 12))

        # Microbiological Parameters
        if report.microbio_params:
            elements.append(Paragraph("<b>Microbiological Parameters</b>", heading_style))
            micro = report.microbio_params
            micro_data = [
                ['Parameter', 'Result', 'Permissible Limit'],
                ['Total Coliforms (CFU/100mL)', str(micro.total_coliforms) if micro.total_coliforms is not None else 'N/A', '0'],
                ['Fecal Coliforms (CFU/100mL)', str(micro.fecal_coliforms) if micro.fecal_coliforms is not None else 'N/A', '0'],
                ['E. coli (CFU/100mL)', str(micro.e_coli) if micro.e_coli is not None else 'N/A', '0'],
            ]
            micro_table = Table(micro_data, colWidths=[200, 150, 150])
            micro_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3c72')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(micro_table)
            elements.append(Spacer(1, 12))

        # Quality Assessment
        if report.quality_assessment:
            elements.append(Paragraph("<b>Interpretation / Statement of Conformity</b>", heading_style))
            qa = report.quality_assessment
            qa_data = [
                ['Category', 'Status'],
                ['Physical Quality', qa.physical_quality.upper() if qa.physical_quality else 'N/A'],
                ['Chemical Quality', qa.chemical_quality.upper() if qa.chemical_quality else 'N/A'],
                ['Microbial Quality', qa.microbial_quality.upper() if qa.microbial_quality else 'N/A'],
            ]
            qa_table = Table(qa_data, colWidths=[250, 250])
            qa_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3c72')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(qa_table)

            if qa.remarks:
                elements.append(Spacer(1, 8))
                elements.append(Paragraph(f"<b>Remarks:</b> {qa.remarks}", normal_style))
            elements.append(Spacer(1, 12))

        # Sample Images
        sample_images = SampleImages.query.filter_by(report_id=report_id).all()
        if sample_images:
            elements.append(PageBreak())
            elements.append(Paragraph("<b>Sample Images</b>", heading_style))
            elements.append(Spacer(1, 8))

            for img in sample_images:
                try:
                    img_path = os.path.join(app.config['UPLOAD_FOLDER'], img.image_path)
                    if os.path.exists(img_path):
                        rl_image = RLImage(img_path, width=4*inch, height=3*inch)
                        elements.append(rl_image)
                        elements.append(Paragraph(f"<i>{img.image_filename}</i>", normal_style))
                        elements.append(Spacer(1, 8))
                except Exception as e:
                    print(f"Error adding image to PDF: {e}")

        # Footer
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("<i>* This is a computer generated report and does not need any signature.</i>", normal_style))
        elements.append(Paragraph(f"<i>Generated on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</i>", normal_style))

        # Build PDF
        doc.build(elements)
        buffer.seek(0)

        # Generate filename
        filename = f"{report.report_serial_no or f'Report-{report_id}'}.pdf"

        return send_file(
            buffer,
            as_attachment=True,
            download_name=filename,
            mimetype='application/pdf'
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/water-tests/<int:test_id>', methods=['GET'])
def get_water_test(test_id):
    """Get a specific water test with role-based access"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')
        user_id = session['user_id']

        # Check access permissions
        test = WaterTest.query.get(test_id)
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # PCRWR users can only view approved tests
        if user_role == 'pcrwr_user' and test.status != 'approved':
            return jsonify({'success': False, 'message': 'Access denied'}), 403

        # Other roles can view their own or pending tests
        if user_role not in ['environmental_specialist', 'mto_environment', 'research_analyst']:
            if test.user_id != user_id:
                return jsonify({'success': False, 'message': 'Access denied'}), 403

        return jsonify({
            'success': True,
            'test': {
                'id': test.id,
                'location': test.location,
                'region': test.region,
                'district': test.district,
                'village': test.village,
                'latitude': test.latitude,
                'longitude': test.longitude,
                'test_date': test.test_date.isoformat(),
                'test_time': test.test_time.isoformat(),
                'ph_level': test.ph_level,
                'turbidity': test.turbidity,
                'tds': test.tds,
                'temperature': test.temperature,
                'chlorine': test.chlorine,
                'observations': test.observations,
                'tested_by': test.tested_by,
                'contact': test.contact,
                'status': test.status,
                'submitted_at': test.submitted_at.isoformat() if test.submitted_at else None,
                'approved_at': test.approved_at.isoformat() if test.approved_at else None,
                'approval_notes': test.approval_notes
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== SUBMISSION WORKFLOW ROUTES ====================

@app.route('/api/water-tests/<int:test_id>/submit', methods=['POST'])
@require_permission('submit')
def submit_water_test(test_id):
    """Submit a water test for review"""
    try:
        test = WaterTest.query.get(test_id)
        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        # Check if user owns the test or is an approver
        user_role = session.get('user_role')
        if test.user_id != session['user_id'] and user_role not in ['environmental_specialist', 'mto_environment', 'research_analyst']:
            return jsonify({'success': False, 'message': 'Access denied'}), 403

        # Update status
        test.status = 'pending_review'
        test.submitted_by_id = session['user_id']
        test.submitted_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Test submitted for review',
            'status': test.status
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/water-tests/<int:test_id>/approve', methods=['POST'])
@require_role('environmental_specialist', 'mto_environment', 'research_analyst')
def approve_water_test(test_id):
    """Approve a water test submission"""
    try:
        data = request.get_json()
        test = WaterTest.query.get(test_id)

        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        if test.status not in ['pending_review', 'submitted']:
            return jsonify({'success': False, 'message': 'Test cannot be approved in current status'}), 400

        # Update status
        test.status = 'approved'
        test.approved_by_id = session['user_id']
        test.approved_at = datetime.utcnow()
        test.approval_notes = data.get('notes', '')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Test approved successfully',
            'status': test.status,
            'approved_at': test.approved_at.isoformat()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/water-tests/<int:test_id>/reject', methods=['POST'])
@require_role('environmental_specialist', 'mto_environment', 'research_analyst')
def reject_water_test(test_id):
    """Reject a water test submission"""
    try:
        data = request.get_json()
        test = WaterTest.query.get(test_id)

        if not test:
            return jsonify({'success': False, 'message': 'Test not found'}), 404

        if test.status not in ['pending_review', 'submitted']:
            return jsonify({'success': False, 'message': 'Test cannot be rejected in current status'}), 400

        # Update status
        test.status = 'rejected'
        test.approval_notes = data.get('reason', '')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Test rejected',
            'status': test.status
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics (only approved submissions)"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        user_role = session.get('user_role')

        # Only show approved submissions on dashboard
        if user_role == 'pcrwr_user':
            # PCRWR users see only approved
            approved_reports = TestReportMetadata.query.filter_by(status='approved').all()
        elif user_role == 'environmental_specialist':
            # Environmental specialists see all for stats, but dashboard shows approved
            approved_reports = TestReportMetadata.query.filter_by(status='approved').all()
            pending_count = TestReportMetadata.query.filter_by(status='submitted').count()
        else:
            # Research analysts see approved
            approved_reports = TestReportMetadata.query.filter_by(status='approved').all()

        # Calculate statistics from approved reports
        total_approved = len(approved_reports)
        priority_count = sum(1 for r in approved_reports if r.form_type == 'priority')
        full_count = sum(1 for r in approved_reports if r.form_type == 'full')

        # Quality statistics
        safe_count = 0
        unsafe_count = 0
        for report in approved_reports:
            if report.quality_assessment:
                if report.quality_assessment.microbial_quality == 'safe':
                    safe_count += 1
                elif report.quality_assessment.microbial_quality in ['unsafe', 'contaminated']:
                    unsafe_count += 1

        stats = {
            'total_approved': total_approved,
            'priority_tests': priority_count,
            'full_tests': full_count,
            'safe_samples': safe_count,
            'unsafe_samples': unsafe_count
        }

        # Add pending count for environmental specialists
        if user_role == 'environmental_specialist':
            stats['pending_review'] = pending_count

        return jsonify({
            'success': True,
            'stats': stats
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/dashboard/email-notifications', methods=['GET'])
def get_email_notifications():
    """Get email notifications and alert history for dashboard"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status_filter = request.args.get('status', '')  # Filter by status

        # Build query
        query = AlertHistory.query

        # Apply status filter if provided
        if status_filter and status_filter in ['sent', 'failed', 'partially_sent', 'pending']:
            query = query.filter_by(status=status_filter)

        # Order by most recent first
        query = query.order_by(AlertHistory.created_at.desc())

        # Get paginated results
        paginated_alerts = query.paginate(page=page, per_page=per_page, error_out=False)

        # Build response with alert details
        alerts_data = []
        for alert in paginated_alerts.items:
            # Parse recipients JSON
            recipients_list = []
            try:
                import json
                recipients_list = json.loads(alert.recipients) if alert.recipients else []
            except:
                recipients_list = []

            # Get report info if available
            report_info = None
            if alert.report_id:
                report = TestReportMetadata.query.get(alert.report_id)
                if report:
                    report_info = {
                        'id': report.report_id,
                        'serial_no': report.report_serial_no,
                        'location': report.location,
                        'village': report.village,
                        'tehsil': report.tehsil,
                        'test_date': report.sampling_datetime.strftime('%Y-%m-%d') if report.sampling_datetime else 'N/A'
                    }

            # Count sent and failed
            sent_count = sum(1 for r in recipients_list if r.get('status') == 'sent')
            failed_count = sum(1 for r in recipients_list if r.get('status') == 'failed')
            total_count = len(recipients_list)

            alerts_data.append({
                'id': alert.id,
                'report_id': alert.report_id,
                'report_info': report_info,
                'category': alert.category,
                'unsafe_percentage': float(alert.unsafe_percentage) if alert.unsafe_percentage else 0,
                'status': alert.status,
                'sent_at': alert.sent_at.strftime('%Y-%m-%d %H:%M:%S') if alert.sent_at else None,
                'created_at': alert.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'recipients': recipients_list,
                'total_recipients': total_count,
                'sent_count': sent_count,
                'failed_count': failed_count,
                'error_message': alert.error_message
            })

        # Get summary statistics
        total_alerts = AlertHistory.query.count()
        sent_alerts = AlertHistory.query.filter_by(status='sent').count()
        failed_alerts = AlertHistory.query.filter(AlertHistory.status.in_(['failed', 'partially_sent'])).count()

        return jsonify({
            'success': True,
            'alerts': alerts_data,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': paginated_alerts.total,
                'pages': paginated_alerts.pages
            },
            'summary': {
                'total_alerts': total_alerts,
                'sent_alerts': sent_alerts,
                'failed_alerts': failed_alerts,
                'pending_alerts': AlertHistory.query.filter_by(status='pending').count()
            }
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/dashboard/email-alert-detail/<int:alert_id>', methods=['GET'])
def get_email_alert_detail(alert_id):
    """Get detailed information about a specific email alert"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401

        alert = AlertHistory.query.get(alert_id)
        if not alert:
            return jsonify({'success': False, 'message': 'Alert not found'}), 404

        # Parse recipients
        recipients_list = []
        try:
            import json
            recipients_list = json.loads(alert.recipients) if alert.recipients else []
        except:
            recipients_list = []

        # Get report info
        report_info = None
        if alert.report_id:
            report = TestReportMetadata.query.get(alert.report_id)
            if report:
                quality = report.quality_assessment
                report_info = {
                    'id': report.report_id,
                    'serial_no': report.report_serial_no,
                    'location': report.location,
                    'village': report.village,
                    'tehsil': report.tehsil,
                    'settlement': report.settlement,
                    'test_date': report.sampling_datetime.strftime('%Y-%m-%d %H:%M') if report.sampling_datetime else 'N/A',
                    'reporting_date': report.reporting_date.strftime('%Y-%m-%d') if report.reporting_date else 'N/A',
                    'form_type': report.form_type,
                    'quality': {
                        'physical': quality.physical_quality if quality else 'N/A',
                        'chemical': quality.chemical_quality if quality else 'N/A',
                        'microbial': quality.microbial_quality if quality else 'N/A'
                    }
                }

        return jsonify({
            'success': True,
            'alert': {
                'id': alert.id,
                'report_id': alert.report_id,
                'report_info': report_info,
                'category': alert.category,
                'unsafe_percentage': float(alert.unsafe_percentage) if alert.unsafe_percentage else 0,
                'status': alert.status,
                'sent_at': alert.sent_at.strftime('%Y-%m-%d %H:%M:%S') if alert.sent_at else None,
                'created_at': alert.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'recipients': recipients_list,
                'error_message': alert.error_message
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'message': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'success': False, 'message': 'Internal server error'}), 500


# ==================== DASHBOARD API ENDPOINTS ====================

@app.route('/api/dashboard/metrics', methods=['GET'])
def get_dashboard_metrics():
    """
    Get dashboard metrics with optional filters
    Returns: total_samples, full_parameters, priority_parameters, safe_samples
    """
    # Check if user is logged in
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters from query string
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        test_type = request.args.get('test_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        print(f"[METRICS API] Received filters - tehsil: '{tehsil}', village: '{village}', settlement: '{settlement}', test_type: '{test_type}', sample_type: '{sample_type}', year: '{year}'")

        # Base query - count only APPROVED reports
        # Dashboard shows finalized/approved data for reporting and metrics
        base_query = TestReportMetadata.query.filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
            print(f"[METRICS API] Filtering by tehsil: {tehsil}")

        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
            print(f"[METRICS API] Filtering by village: {village}")

        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)

        if test_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.form_type == test_type)

        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)

        # Year filter - extract year from sampling_datetime
        if year != 'ALL':
            year_int = int(year)
            base_query = base_query.filter(
                db.extract('year', TestReportMetadata.sampling_datetime) == year_int
            )

        base_query = apply_report_category_filter(base_query, report_category)

        # Metric 1: Total Samples Collected
        total_samples = base_query.count()

        # Metric 2: Full Parameters
        full_parameters_query = base_query.filter(TestReportMetadata.form_type == 'full')
        full_parameters = full_parameters_query.count()

        # Metric 3: Priority Parameters
        priority_parameters_query = base_query.filter(TestReportMetadata.form_type == 'priority')
        priority_parameters = priority_parameters_query.count()

        # Metric 4: Safe Samples
        # A sample is "safe" if NONE of its relevant quality assessments are 'unsafe' or 'contaminated'
        # Null/N/A values are treated as safe (not counted as unsafe)

        # Join with quality_assessment table
        safe_samples_query = base_query.join(
            QualityAssessment,
            TestReportMetadata.report_id == QualityAssessment.report_id
        )

        # For Priority Parameters: physical_quality and microbial_quality must NOT be unsafe/contaminated
        priority_safe = safe_samples_query.filter(
            TestReportMetadata.form_type == 'priority',
            db.or_(
                QualityAssessment.physical_quality == None,
                QualityAssessment.physical_quality == '',
                QualityAssessment.physical_quality == 'N/A',
                QualityAssessment.physical_quality == 'safe'
            ),
            db.or_(
                QualityAssessment.microbial_quality == None,
                QualityAssessment.microbial_quality == '',
                QualityAssessment.microbial_quality == 'N/A',
                QualityAssessment.microbial_quality == 'safe'
            )
        ).count()

        # For Full Parameters: all four quality assessments must NOT be unsafe/contaminated
        full_safe = safe_samples_query.filter(
            TestReportMetadata.form_type == 'full',
            db.or_(
                QualityAssessment.physical_quality == None,
                QualityAssessment.physical_quality == '',
                QualityAssessment.physical_quality == 'N/A',
                QualityAssessment.physical_quality == 'safe'
            ),
            db.or_(
                QualityAssessment.chemical_quality == None,
                QualityAssessment.chemical_quality == '',
                QualityAssessment.chemical_quality == 'N/A',
                QualityAssessment.chemical_quality == 'safe'
            ),
            db.or_(
                QualityAssessment.trace_elements_quality == None,
                QualityAssessment.trace_elements_quality == '',
                QualityAssessment.trace_elements_quality == 'N/A',
                QualityAssessment.trace_elements_quality == 'safe'
            ),
            db.or_(
                QualityAssessment.microbial_quality == None,
                QualityAssessment.microbial_quality == '',
                QualityAssessment.microbial_quality == 'N/A',
                QualityAssessment.microbial_quality == 'safe'
            )
        ).count()

        safe_samples = priority_safe + full_safe

        print(f"[METRICS API] Results - total: {total_samples}, full: {full_parameters}, priority: {priority_parameters}, safe: {safe_samples}")

        # Return metrics as JSON
        return jsonify({
            'success': True,
            'total_samples': total_samples,
            'full_parameters': full_parameters,
            'priority_parameters': priority_parameters,
            'safe_samples': safe_samples
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/filter-options', methods=['GET'])
def get_filter_options():
    """
    Get unique filter options from approved reports.
    Returns distinct tehsils, villages, settlements, sample_types, and years.
    This allows dropdowns to be dynamically populated with actual data.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Base query - only approved reports
        base_query = TestReportMetadata.query.filter(
            TestReportMetadata.status == 'approved'
        )

        # Get unique tehsils
        tehsils = db.session.query(TestReportMetadata.tehsil).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.tehsil.isnot(None),
            TestReportMetadata.tehsil != ''
        ).distinct().order_by(TestReportMetadata.tehsil).all()
        tehsil_list = [t[0] for t in tehsils if t[0]]

        # Get unique villages
        villages = db.session.query(TestReportMetadata.village).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.village.isnot(None),
            TestReportMetadata.village != ''
        ).distinct().order_by(TestReportMetadata.village).all()
        village_list = [v[0] for v in villages if v[0]]

        # Get unique settlements
        settlements = db.session.query(TestReportMetadata.settlement).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.settlement.isnot(None),
            TestReportMetadata.settlement != ''
        ).distinct().order_by(TestReportMetadata.settlement).all()
        settlement_list = [s[0] for s in settlements if s[0]]

        # Get unique sample types
        sample_types = db.session.query(TestReportMetadata.sample_type).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.sample_type.isnot(None),
            TestReportMetadata.sample_type != ''
        ).distinct().order_by(TestReportMetadata.sample_type).all()
        sample_type_list = [st[0] for st in sample_types if st[0]]

        # Get unique years from sampling_datetime
        years = db.session.query(
            db.func.strftime('%Y', TestReportMetadata.sampling_datetime)
        ).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.sampling_datetime.isnot(None)
        ).distinct().all()
        year_list = sorted([int(y[0]) for y in years if y[0]], reverse=True)

        return jsonify({
            'success': True,
            'tehsils': tehsil_list,
            'villages': village_list,
            'settlements': settlement_list,
            'sample_types': sample_type_list,
            'years': year_list
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/map-locations', methods=['GET'])
def get_map_locations():
    """
    Get GPS locations for approved reports to display on the dashboard map.
    Supports filtering by tehsil, village, settlement, date range, and form type.
    Groups reports by location and returns aggregated data.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', '').strip()
        village = request.args.get('village', '').strip()
        settlement = request.args.get('settlement', '').strip()
        date_from = request.args.get('date_from', '').strip()
        date_to = request.args.get('date_to', '').strip()
        form_type = request.args.get('form_type', '').strip()
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - only approved reports with GPS coordinates
        query = TestReportMetadata.query.filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.gps_latitude.isnot(None),
            TestReportMetadata.gps_longitude.isnot(None)
        )

        # Apply filters
        if tehsil:
            query = query.filter(TestReportMetadata.tehsil.ilike(f'%{tehsil}%'))
        if village:
            query = query.filter(TestReportMetadata.village.ilike(f'%{village}%'))
        if settlement:
            query = query.filter(TestReportMetadata.settlement.ilike(f'%{settlement}%'))
        if form_type:
            query = query.filter(TestReportMetadata.form_type == form_type)

        # Date range filters
        if date_from:
            try:
                from_date = datetime.strptime(date_from, '%Y-%m-%d').date()
                query = query.filter(TestReportMetadata.reporting_date >= from_date)
            except ValueError:
                pass
        if date_to:
            try:
                to_date = datetime.strptime(date_to, '%Y-%m-%d').date()
                query = query.filter(TestReportMetadata.reporting_date <= to_date)
            except ValueError:
                pass

        query = apply_report_category_filter(query, report_category)
        reports = query.all()

        # Group reports by GPS location (rounded to 4 decimal places for clustering)
        location_groups = {}
        for report in reports:
            lat = round(float(report.gps_latitude), 4)
            lng = round(float(report.gps_longitude), 4)
            key = f"{lat},{lng}"

            # Get quality status
            quality_assessment = report.quality_assessment
            is_safe = True
            if quality_assessment:
                # Check all quality fields - if any is 'unsafe', mark as unsafe
                if quality_assessment.physical_quality and quality_assessment.physical_quality.lower() == 'unsafe':
                    is_safe = False
                if quality_assessment.chemical_quality and quality_assessment.chemical_quality.lower() == 'unsafe':
                    is_safe = False
                if quality_assessment.trace_elements_quality and quality_assessment.trace_elements_quality.lower() == 'unsafe':
                    is_safe = False
                if quality_assessment.microbial_quality and quality_assessment.microbial_quality.lower() == 'unsafe':
                    is_safe = False

            if key not in location_groups:
                location_groups[key] = {
                    'lat': lat,
                    'lng': lng,
                    'tehsil': report.tehsil,
                    'village': report.village,
                    'settlement': report.settlement,
                    'test_count': 0,
                    'safe_count': 0,
                    'unsafe_count': 0,
                    'form_types': set(),
                    'sample_types': set(),
                    'latest_date': None
                }

            group = location_groups[key]
            group['test_count'] += 1
            if is_safe:
                group['safe_count'] += 1
            else:
                group['unsafe_count'] += 1
            if report.form_type:
                group['form_types'].add(report.form_type)
            if report.sample_type:
                group['sample_types'].add(report.sample_type)
            if report.reporting_date:
                if group['latest_date'] is None or report.reporting_date > group['latest_date']:
                    group['latest_date'] = report.reporting_date

        # Convert to list and format for JSON
        locations = []
        for key, group in location_groups.items():
            locations.append({
                'lat': group['lat'],
                'lng': group['lng'],
                'tehsil': group['tehsil'],
                'village': group['village'],
                'settlement': group['settlement'],
                'test_count': group['test_count'],
                'safe_count': group['safe_count'],
                'unsafe_count': group['unsafe_count'],
                'form_types': list(group['form_types']),
                'sample_types': list(group['sample_types']),
                'latest_date': group['latest_date'].isoformat() if group['latest_date'] else None,
                'status': 'safe' if group['unsafe_count'] == 0 else 'unsafe'
            })

        return jsonify({
            'success': True,
            'locations': locations,
            'total_locations': len(locations),
            'total_tests': sum(loc['test_count'] for loc in locations)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/villages-by-tehsil', methods=['GET'])
def get_villages_by_tehsil():
    """
    Get villages for a specific tehsil from approved reports.
    Used for cascading dropdown filtering.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        tehsil = request.args.get('tehsil', 'ALL')

        query = db.session.query(TestReportMetadata.village).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.village.isnot(None),
            TestReportMetadata.village != ''
        )

        if tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)

        villages = query.distinct().order_by(TestReportMetadata.village).all()
        village_list = [v[0] for v in villages if v[0]]

        return jsonify({
            'success': True,
            'villages': village_list
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/settlements-by-village', methods=['GET'])
def get_settlements_by_village():
    """
    Get settlements for a specific village from approved reports.
    Used for cascading dropdown filtering.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        village = request.args.get('village', 'ALL')

        query = db.session.query(TestReportMetadata.settlement).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.settlement.isnot(None),
            TestReportMetadata.settlement != ''
        )

        if village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)

        settlements = query.distinct().order_by(TestReportMetadata.settlement).all()
        settlement_list = [s[0] for s in settlements if s[0]]

        return jsonify({
            'success': True,
            'settlements': settlement_list
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/quality-progress', methods=['GET'])
def get_quality_progress():
    """
    Get quality progress data for dashboard progress bars
    Returns: physical, chemical, biological safe counts and percentages
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters from query string
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        test_type = request.args.get('test_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - only APPROVED reports
        base_query = TestReportMetadata.query.filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if test_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.form_type == test_type)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            base_query = base_query.filter(db.extract('year', TestReportMetadata.reporting_date) == int(year))

        base_query = apply_report_category_filter(base_query, report_category)

        # Join with quality_assessment table
        quality_query = base_query.join(
            QualityAssessment,
            TestReportMetadata.report_id == QualityAssessment.report_id
        )

        # Physical Quality: Count all approved samples
        physical_total = quality_query.count()
        physical_safe = quality_query.filter(
            QualityAssessment.physical_quality == 'safe'
        ).count()

        # Chemical Quality: Only count full parameter tests (priority tests don't have chemical quality)
        chemical_query = quality_query.filter(TestReportMetadata.form_type == 'full')
        chemical_total = chemical_query.count()
        chemical_safe = chemical_query.filter(
            QualityAssessment.chemical_quality == 'safe'
        ).count()

        # Biological/Microbial Quality: Count all approved samples
        biological_total = quality_query.count()
        biological_safe = quality_query.filter(
            QualityAssessment.microbial_quality == 'safe'
        ).count()

        # Calculate percentages (avoid division by zero)
        physical_percent = round((physical_safe / physical_total * 100), 1) if physical_total > 0 else 0
        chemical_percent = round((chemical_safe / chemical_total * 100), 1) if chemical_total > 0 else 0
        biological_percent = round((biological_safe / biological_total * 100), 1) if biological_total > 0 else 0

        return jsonify({
            'success': True,
            'physical': {
                'safe': physical_safe,
                'total': physical_total,
                'percent': physical_percent
            },
            'chemical': {
                'safe': chemical_safe,
                'total': chemical_total,
                'percent': chemical_percent
            },
            'biological': {
                'safe': biological_safe,
                'total': biological_total,
                'percent': biological_percent
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Chemical parameters configuration with limits
CHEMICAL_PARAMETERS_CONFIG = [
    {'key': 'alkalinity_caco3', 'name': 'Alkalinity as CaCO3', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'bicarbonates', 'name': 'Bicarbonates', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'calcium', 'name': 'Calcium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'carbonates', 'name': 'Carbonates', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'chlorides', 'name': 'Chlorides', 'unit': 'mg/L', 'limit': 250, 'limit_type': '<'},
    {'key': 'total_hardness', 'name': 'Total Hardness', 'unit': 'mg/L', 'limit': 500, 'limit_type': '<'},
    {'key': 'magnesium', 'name': 'Magnesium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'potassium', 'name': 'Potassium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'sodium', 'name': 'Sodium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'sulphate', 'name': 'Sulphate', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'nitrate_n', 'name': 'Nitrate (N)', 'unit': 'mg/L', 'limit': 50, 'limit_type': '<='},
    {'key': 'nitrite', 'name': 'Nitrite', 'unit': 'mg/L', 'limit': 3, 'limit_type': '<='},
    {'key': 'tds', 'name': 'TDS', 'unit': 'mg/L', 'limit': 1000, 'limit_type': '<'},
    {'key': 'iron', 'name': 'Iron', 'unit': 'mg/L', 'limit': 0.3, 'limit_type': '<='},
    {'key': 'fluoride', 'name': 'Fluoride', 'unit': 'mg/L', 'limit': 1.5, 'limit_type': '<='},
    {'key': 'phosphate', 'name': 'Phosphate', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
]


@app.route('/api/dashboard/chemical-constituents', methods=['GET'])
def get_chemical_constituents():
    """
    Get chemical constituent data for dashboard chart
    Returns: average values for each chemical parameter with limit and safety status
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')
        # Get selected parameters (comma-separated)
        selected_params = request.args.get('parameters', '')

        # Base query - only APPROVED reports with FULL form type
        base_query = db.session.query(TestReportMetadata, MajorChemicalParameters).join(
            MajorChemicalParameters,
            TestReportMetadata.report_id == MajorChemicalParameters.report_id
        ).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.form_type == 'full'
        )

        # Apply filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            base_query = base_query.filter(db.extract('year', TestReportMetadata.reporting_date) == int(year))

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()

        # Parse selected parameters
        selected_keys = [p.strip() for p in selected_params.split(',') if p.strip()] if selected_params else None

        # Calculate aggregates for each parameter
        parameters_data = []
        for param_config in CHEMICAL_PARAMETERS_CONFIG:
            key = param_config['key']

            # Skip if not in selected parameters (when selection is provided)
            if selected_keys and key not in selected_keys:
                continue

            values = []
            for report, chem_params in results:
                value = getattr(chem_params, key, None)
                if value is not None:
                    values.append(float(value))

            if values:
                avg_value = round(sum(values) / len(values), 2)
                min_value = round(min(values), 2)
                max_value = round(max(values), 2)

                # Determine if safe based on limit
                is_safe = True
                if param_config['limit'] is not None:
                    limit = param_config['limit']
                    limit_type = param_config['limit_type']
                    if limit_type == '<':
                        is_safe = avg_value < limit
                    elif limit_type == '<=':
                        is_safe = avg_value <= limit

                parameters_data.append({
                    'key': key,
                    'name': param_config['name'],
                    'value': round(avg_value, 2),
                    'min': round(min_value, 2),
                    'max': round(max_value, 2),
                    'count': len(values),
                    'unit': param_config['unit'],
                    'limit': param_config['limit'],
                    'limit_type': param_config['limit_type'],
                    'is_safe': is_safe
                })

        return jsonify({
            'success': True,
            'total_samples': len(results),
            'parameters': parameters_data,
            'available_parameters': CHEMICAL_PARAMETERS_CONFIG
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Physical & Aesthetic parameters configuration with limits
PHYSICAL_PARAMETERS_CONFIG = [
    {'key': 'ph', 'name': 'pH', 'unit': '-', 'limit_min': 6.5, 'limit_max': 8.5, 'limit_type': 'range'},
    {'key': 'electrical_conductivity', 'name': 'Electrical Conductivity', 'unit': 'μS/cm', 'limit': 1500, 'limit_type': '<'},
    {'key': 'temperature', 'name': 'Temperature', 'unit': '°C', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'color', 'name': 'Color', 'unit': '-', 'limit': None, 'limit_type': 'categorical'},
    {'key': 'odour', 'name': 'Odour', 'unit': '-', 'limit': None, 'limit_type': 'categorical'},
    {'key': 'taste', 'name': 'Taste', 'unit': '-', 'limit': None, 'limit_type': 'categorical'},
    {'key': 'suspended_solids', 'name': 'Suspended Solids', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'total_dissolved_solids', 'name': 'Total Dissolved Solids (TDS)', 'unit': 'mg/L', 'limit': 1000, 'limit_type': '<'},
    {'key': 'turbidity', 'name': 'Turbidity', 'unit': 'NTU', 'limit': 5, 'limit_type': '<'},
]


@app.route('/api/dashboard/physical-aesthetic', methods=['GET'])
def get_physical_aesthetic():
    """
    Get physical & aesthetic parameter data for dashboard chart
    Works with BOTH form types (priority and full)
    Returns: average values for each physical parameter with limit and safety status
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        form_type = request.args.get('form_type', 'ALL')  # Can be 'priority', 'full', or 'ALL'
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - APPROVED reports with physical parameters
        base_query = db.session.query(TestReportMetadata, PhysicalAestheticParameters).join(
            PhysicalAestheticParameters,
            TestReportMetadata.report_id == PhysicalAestheticParameters.report_id
        ).filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply form type filter (key difference from chemical constituents)
        if form_type == 'priority':
            base_query = base_query.filter(TestReportMetadata.form_type == 'priority')
        elif form_type == 'full':
            base_query = base_query.filter(TestReportMetadata.form_type == 'full')
        # 'ALL' = no form_type filter, include both

        # Apply other filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            base_query = base_query.filter(
                db.extract('year', TestReportMetadata.sampling_datetime) == int(year)
            )

        base_query = apply_report_category_filter(base_query, report_category)

        # Execute query
        results = base_query.all()
        total_samples = len(results)

        if total_samples == 0:
            return jsonify({
                'success': True,
                'total_samples': 0,
                'parameters': [],
                'available_parameters': PHYSICAL_PARAMETERS_CONFIG
            })

        # Calculate aggregates for each parameter
        parameters_data = []
        for param_config in PHYSICAL_PARAMETERS_CONFIG:
            key = param_config['key']
            values = []

            for report, physical_params in results:
                val = getattr(physical_params, key, None)
                if val is not None:
                    # Handle categorical values (color, odour, taste)
                    if param_config['limit_type'] == 'categorical':
                        # Skip categorical values for numeric aggregation
                        continue
                    try:
                        values.append(float(val))
                    except (ValueError, TypeError):
                        pass

            if values:
                avg_val = sum(values) / len(values)
                min_val = min(values)
                max_val = max(values)

                # Determine if value is safe based on limit type
                is_safe = None
                if param_config['limit_type'] == 'range':
                    # For range limits (e.g., pH 6.5-8.5)
                    is_safe = param_config['limit_min'] <= avg_val <= param_config['limit_max']
                elif param_config['limit_type'] == '<':
                    is_safe = avg_val < param_config['limit']
                elif param_config['limit_type'] == '<=':
                    is_safe = avg_val <= param_config['limit']
                # NGVS and categorical have no limit check

                parameters_data.append({
                    'key': key,
                    'name': param_config['name'],
                    'value': round(avg_val, 2),
                    'min': round(min_val, 2),
                    'max': round(max_val, 2),
                    'count': len(values),
                    'unit': param_config['unit'],
                    'limit': param_config.get('limit'),
                    'limit_min': param_config.get('limit_min'),
                    'limit_max': param_config.get('limit_max'),
                    'limit_type': param_config['limit_type'],
                    'is_safe': is_safe
                })

        # Handle categorical parameters separately (color, odour, taste)
        for param_config in PHYSICAL_PARAMETERS_CONFIG:
            if param_config['limit_type'] == 'categorical':
                key = param_config['key']
                objectionable_count = 0
                non_objectionable_count = 0

                for report, physical_params in results:
                    val = getattr(physical_params, key, None)
                    if val:
                        val_lower = str(val).lower()
                        if 'non' in val_lower or 'acceptable' in val_lower:
                            non_objectionable_count += 1
                        elif val_lower and val_lower != 'none':
                            objectionable_count += 1

                total_categorical = objectionable_count + non_objectionable_count
                if total_categorical > 0:
                    # Calculate percentage of non-objectionable
                    safe_percent = (non_objectionable_count / total_categorical) * 100
                    parameters_data.append({
                        'key': key,
                        'name': param_config['name'],
                        'value': round(safe_percent, 1),
                        'min': 0,
                        'max': 100,
                        'count': total_categorical,
                        'unit': '% acceptable',
                        'limit': 100,
                        'limit_type': 'categorical',
                        'is_safe': safe_percent >= 80,  # Safe if 80%+ are non-objectionable
                        'objectionable': objectionable_count,
                        'non_objectionable': non_objectionable_count
                    })

        return jsonify({
            'success': True,
            'total_samples': total_samples,
            'parameters': parameters_data,
            'available_parameters': PHYSICAL_PARAMETERS_CONFIG
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ==================== MICROBIOLOGICAL PARAMETERS CONFIG ====================
MICROBIOLOGICAL_PARAMETERS_CONFIG = [
    {'key': 'total_coliforms', 'name': 'Total Coliforms', 'unit': 'CFU/100mL', 'limit': 0, 'limit_type': '='},
    {'key': 'fecal_coliforms', 'name': 'Fecal Coliforms', 'unit': 'CFU/100mL', 'limit': 0, 'limit_type': '='},
    {'key': 'e_coli', 'name': 'E. coli', 'unit': 'CFU/100mL', 'limit': 0, 'limit_type': '='},
]


@app.route('/api/dashboard/microbiological', methods=['GET'])
def get_microbiological():
    """
    Get microbiological parameter data for dashboard chart
    Works with BOTH form types (priority and full)
    Returns: aggregated values for each microbiological parameter with safety status
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        form_type = request.args.get('form_type', 'ALL')  # Can be 'priority', 'full', or 'ALL'
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - APPROVED reports with microbiological parameters
        base_query = db.session.query(TestReportMetadata, MicrobiologicalParameters).join(
            MicrobiologicalParameters,
            TestReportMetadata.report_id == MicrobiologicalParameters.report_id
        ).filter(TestReportMetadata.status == 'approved')

        # Apply form type filter
        if form_type and form_type.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.form_type == form_type.lower())

        # Apply location filters
        if tehsil and tehsil.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement and settlement.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)

        # Apply sample type filter
        if sample_type and sample_type.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)

        # Apply year filter
        if year and year.upper() != 'ALL':
            try:
                year_int = int(year)
                base_query = base_query.filter(db.extract('year', TestReportMetadata.sample_collection_date) == year_int)
            except ValueError:
                pass

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()
        total_samples = len(results)

        if total_samples == 0:
            return jsonify({
                'success': True,
                'parameters': [],
                'available_parameters': [p['name'] for p in MICROBIOLOGICAL_PARAMETERS_CONFIG],
                'total_samples': 0,
                'form_type': form_type
            })

        # Aggregate data for each microbiological parameter
        parameters_data = []

        for param_config in MICROBIOLOGICAL_PARAMETERS_CONFIG:
            key = param_config['key']
            values = []
            tntc_count = 0
            detected_count = 0

            for report, microbio_params in results:
                value_str = getattr(microbio_params, key, None)
                if value_str is not None and value_str != '':
                    if str(value_str).upper() == 'TNTC':
                        tntc_count += 1
                        detected_count += 1
                    else:
                        try:
                            numeric_value = float(value_str)
                            values.append(numeric_value)
                            if numeric_value > 0:
                                detected_count += 1
                        except (ValueError, TypeError):
                            pass

            # Calculate statistics
            if values:
                avg_value = sum(values) / len(values)
                min_value = min(values)
                max_value = max(values)
                sample_count = len(values) + tntc_count
            else:
                avg_value = 0
                min_value = 0
                max_value = 0
                sample_count = tntc_count

            # Determine safety - any detection means unsafe
            is_safe = detected_count == 0

            parameters_data.append({
                'key': key,
                'name': param_config['name'],
                'unit': param_config['unit'],
                'value': round(avg_value, 2),
                'min': round(min_value, 2) if values else 0,
                'max': round(max_value, 2) if values else ('TNTC' if tntc_count > 0 else 0),
                'count': sample_count,
                'limit': param_config['limit'],
                'limit_type': param_config['limit_type'],
                'is_safe': is_safe,
                'detected_count': detected_count,
                'tntc_count': tntc_count,
                'zero_count': sample_count - detected_count
            })

        return jsonify({
            'success': True,
            'parameters': parameters_data,
            'available_parameters': [p['name'] for p in MICROBIOLOGICAL_PARAMETERS_CONFIG],
            'total_samples': total_samples,
            'form_type': form_type
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ==================== TIME SERIES API ENDPOINTS ====================

@app.route('/api/dashboard/chemical-timeseries', methods=['GET'])
def get_chemical_timeseries():
    """
    Get chemical parameters data aggregated by month for time series chart
    Only works with FULL form type (chemical data not available in priority mode)
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - only APPROVED reports with FULL form type
        base_query = db.session.query(TestReportMetadata, MajorChemicalParameters).join(
            MajorChemicalParameters,
            TestReportMetadata.report_id == MajorChemicalParameters.report_id
        ).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.form_type == 'full'
        )

        # Apply filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            base_query = base_query.filter(db.extract('year', TestReportMetadata.reporting_date) == int(year))

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()

        if len(results) == 0:
            return jsonify({
                'success': True,
                'total_samples': 0,
                'months': [],
                'series': [],
                'available_parameters': CHEMICAL_PARAMETERS_CONFIG
            })

        # Aggregate by month
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        # Initialize data structure: {param_key: {month_index: [values]}}
        monthly_data = {}
        for param_config in CHEMICAL_PARAMETERS_CONFIG:
            monthly_data[param_config['key']] = {i: [] for i in range(12)}

        # Populate monthly data
        for report, chem_params in results:
            month_index = report.reporting_date.month - 1 if report.reporting_date else None
            if month_index is not None:
                for param_config in CHEMICAL_PARAMETERS_CONFIG:
                    key = param_config['key']
                    value = getattr(chem_params, key, None)
                    if value is not None:
                        try:
                            monthly_data[key][month_index].append(float(value))
                        except (ValueError, TypeError):
                            pass

        # Build series data
        param_colors = [
            '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
            '#00BCD4', '#795548', '#607D8B', '#F44336', '#3F51B5',
            '#8BC34A', '#FFC107', '#673AB7', '#009688', '#CDDC39',
            '#FF5722', '#03A9F4', '#FFEB3B'
        ]

        series = []
        color_index = 0
        for param_config in CHEMICAL_PARAMETERS_CONFIG:
            key = param_config['key']
            data = []
            for month_idx in range(12):
                values = monthly_data[key][month_idx]
                avg = round(sum(values) / len(values), 4) if values else None
                data.append(avg)

            if any(v is not None for v in data):
                series.append({
                    'key': key,
                    'name': param_config['name'],
                    'unit': param_config['unit'],
                    'limit': param_config['limit'],
                    'limit_type': param_config['limit_type'],
                    'data': data,
                    'color': param_colors[color_index % len(param_colors)]
                })
                color_index += 1

        return jsonify({
            'success': True,
            'total_samples': len(results),
            'months': months,
            'series': series,
            'available_parameters': [p['name'] for p in CHEMICAL_PARAMETERS_CONFIG]
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/risk-summary', methods=['GET'])
def get_risk_summary():
    """
    Get water quality risk summary data for dashboard chart
    Returns safe/unsafe percentages for each quality category based on filters
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - only approved reports with quality assessments
        query = db.session.query(TestReportMetadata, QualityAssessment).join(
            QualityAssessment,
            TestReportMetadata.report_id == QualityAssessment.report_id
        ).filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply filters
        if tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if form_type != 'ALL':
            query = query.filter(TestReportMetadata.form_type == form_type)
        if sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            query = query.filter(
                db.extract('year', TestReportMetadata.sampling_datetime) == int(year)
            )

        query = apply_report_category_filter(query, report_category)
        results = query.all()
        total_samples = len(results)

        if total_samples == 0:
            return jsonify({
                'success': True,
                'categories': [],
                'total_samples': 0,
                'message': 'No data available for selected filters'
            })

        # Initialize counters for each category
        categories = {}
        
        # Determine which categories to include based on form type
        if form_type.lower() == 'priority':
            # Priority: Only Physical and Biological
            category_fields = {
                'Physical': 'physical_quality',
                'Biological': 'microbial_quality'
            }
        elif form_type.lower() == 'full':
            # Full: All 4 categories
            category_fields = {
                'Physical': 'physical_quality',
                'Biological': 'microbial_quality',
                'Chemical': 'chemical_quality',
                'Trace & Ultra-Trace': 'trace_elements_quality'
            }
        else:
            # ALL: Include all categories, but separate by form type
            category_fields = {
                'Physical': 'physical_quality',
                'Biological': 'microbial_quality',
                'Chemical': 'chemical_quality',
                'Trace & Ultra-Trace': 'trace_elements_quality'
            }

        # Count safe/unsafe for each category
        for category_name, field_name in category_fields.items():
            safe_count = 0
            unsafe_count = 0

            for report, qa in results:
                field_value = getattr(qa, field_name, None)

                if field_value and field_value not in ['', 'N/A']:
                    if field_value == 'safe':
                        safe_count += 1
                    elif field_value in ['unsafe', 'contaminated']:
                        unsafe_count += 1

            total_count = safe_count + unsafe_count
            if total_count > 0:
                safe_percentage = round((safe_count / total_count) * 100, 1)
                unsafe_percentage = round((unsafe_count / total_count) * 100, 1)
            else:
                safe_percentage = 0
                unsafe_percentage = 0

            categories[category_name] = {
                'safe': safe_count,
                'unsafe': unsafe_count,
                'total': total_count,
                'safe_percentage': safe_percentage,
                'unsafe_percentage': unsafe_percentage
            }

        return jsonify({
            'success': True,
            'categories': categories,
            'total_samples': total_samples,
            'form_type_filter': form_type
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/physical-timeseries', methods=['GET'])
def get_physical_timeseries():
    """
    Get physical & aesthetic parameters data aggregated by month for time series chart
    Works with BOTH form types (priority and full)
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - APPROVED reports with physical parameters
        base_query = db.session.query(TestReportMetadata, PhysicalAestheticParameters).join(
            PhysicalAestheticParameters,
            TestReportMetadata.report_id == PhysicalAestheticParameters.report_id
        ).filter(TestReportMetadata.status == 'approved')

        # Apply form type filter
        if form_type and form_type.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.form_type == form_type.lower())

        # Apply other filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            base_query = base_query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == int(year))

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()

        if len(results) == 0:
            return jsonify({
                'success': True,
                'total_samples': 0,
                'months': [],
                'series': [],
                'available_parameters': PHYSICAL_PARAMETERS_CONFIG
            })

        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        # Only include numeric parameters for time series
        numeric_params = [p for p in PHYSICAL_PARAMETERS_CONFIG if p['limit_type'] != 'categorical']

        monthly_data = {}
        for param_config in numeric_params:
            monthly_data[param_config['key']] = {i: [] for i in range(12)}

        for report, phys_params in results:
            month_index = report.sampling_datetime.month - 1 if report.sampling_datetime else None
            if month_index is not None:
                for param_config in numeric_params:
                    key = param_config['key']
                    value = getattr(phys_params, key, None)
                    if value is not None:
                        try:
                            monthly_data[key][month_index].append(float(value))
                        except (ValueError, TypeError):
                            pass

        param_colors = [
            '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
            '#00BCD4', '#795548', '#607D8B', '#F44336', '#3F51B5'
        ]

        series = []
        color_index = 0
        for param_config in numeric_params:
            key = param_config['key']
            data = []
            for month_idx in range(12):
                values = monthly_data[key][month_idx]
                avg = round(sum(values) / len(values), 2) if values else None
                data.append(avg)

            if any(v is not None for v in data):
                series.append({
                    'key': key,
                    'name': param_config['name'],
                    'unit': param_config['unit'],
                    'limit': param_config.get('limit') or param_config.get('limit_max'),
                    'data': data,
                    'color': param_colors[color_index % len(param_colors)]
                })
                color_index += 1

        return jsonify({
            'success': True,
            'total_samples': len(results),
            'months': months,
            'series': series,
            'available_parameters': numeric_params
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/dashboard/physical-categorical-timeseries', methods=['GET'])
def get_physical_categorical_timeseries():
    """
    Get monthly percent-safe series for categorical physical parameters (color, odour, taste).
    Returns percent of non-objectionable samples per month for each categorical parameter.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - APPROVED reports with physical parameters
        base_query = db.session.query(TestReportMetadata, PhysicalAestheticParameters).join(
            PhysicalAestheticParameters,
            TestReportMetadata.report_id == PhysicalAestheticParameters.report_id
        ).filter(TestReportMetadata.status == 'approved')

        # Apply form type filter
        if form_type and form_type.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.form_type == form_type.lower())

        # Apply other filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            try:
                base_query = base_query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == int(year))
            except ValueError:
                pass

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()

        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        categorical_keys = [p['key'] for p in PHYSICAL_PARAMETERS_CONFIG if p['limit_type'] == 'categorical']

        # Initialize counters
        monthly_counts = {k: {i: {'non_objectionable': 0, 'objectionable': 0} for i in range(12)} for k in categorical_keys}

        for report, phys in results:
            if not report.sampling_datetime:
                continue
            m = report.sampling_datetime.month - 1
            for key in categorical_keys:
                val = getattr(phys, key, None)
                if val is None or str(val).strip() == '':
                    continue
                v = str(val).lower()
                if 'non' in v or 'acceptable' in v:
                    monthly_counts[key][m]['non_objectionable'] += 1
                elif v and v != 'none':
                    monthly_counts[key][m]['objectionable'] += 1

        series = []
        colors = ['#2196F3', '#4CAF50', '#FF9800']
        for idx, key in enumerate(categorical_keys):
            data = []
            counts_info = []  # Track count details for each month
            for i in range(12):
                counts = monthly_counts[key][i]
                total = counts['non_objectionable'] + counts['objectionable']
                if total > 0:
                    pct = round((counts['non_objectionable'] / total) * 100, 1)
                    counts_info.append({
                        'non_objectionable': counts['non_objectionable'],
                        'objectionable': counts['objectionable'],
                        'total': total
                    })
                else:
                    pct = None
                    counts_info.append(None)
                data.append(pct)

            series.append({
                'key': key,
                'name': key.capitalize(),
                'unit': '%',
                'data': data,
                'counts': counts_info,  # Include count breakdown for tooltip
                'color': colors[idx % len(colors)]
            })

        return jsonify({
            'success': True,
            'months': months,
            'series': series,
            'total_samples': len(results)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/dashboard/microbiological-timeseries', methods=['GET'])
def get_microbiological_timeseries():
    """
    Get microbiological parameters data aggregated by month for time series chart
    Works with BOTH form types (priority and full)
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - APPROVED reports with microbiological parameters
        base_query = db.session.query(TestReportMetadata, MicrobiologicalParameters).join(
            MicrobiologicalParameters,
            TestReportMetadata.report_id == MicrobiologicalParameters.report_id
        ).filter(TestReportMetadata.status == 'approved')

        # Apply form type filter
        if form_type and form_type.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.form_type == form_type.lower())

        # Apply location filters
        if tehsil and tehsil.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement and settlement.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type and sample_type.upper() != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year and year.upper() != 'ALL':
            try:
                year_int = int(year)
                base_query = base_query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == year_int)
            except ValueError:
                pass

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()

        if len(results) == 0:
            return jsonify({
                'success': True,
                'total_samples': 0,
                'months': [],
                'series': [],
                'available_parameters': MICROBIOLOGICAL_PARAMETERS_CONFIG
            })

        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        monthly_data = {}
        for param_config in MICROBIOLOGICAL_PARAMETERS_CONFIG:
            monthly_data[param_config['key']] = {i: [] for i in range(12)}

        for report, microbio_params in results:
            month_index = report.sampling_datetime.month - 1 if report.sampling_datetime else None
            if month_index is not None:
                for param_config in MICROBIOLOGICAL_PARAMETERS_CONFIG:
                    key = param_config['key']
                    value_str = getattr(microbio_params, key, None)
                    if value_str is not None and value_str != '':
                        if str(value_str).upper() != 'TNTC':
                            try:
                                monthly_data[key][month_index].append(float(value_str))
                            except (ValueError, TypeError):
                                pass

        param_colors = ['#F44336', '#E91E63', '#9C27B0']  # Red shades for bacteria

        series = []
        color_index = 0
        for param_config in MICROBIOLOGICAL_PARAMETERS_CONFIG:
            key = param_config['key']
            data = []
            for month_idx in range(12):
                values = monthly_data[key][month_idx]
                avg = round(sum(values) / len(values), 2) if values else None
                data.append(avg)

            if any(v is not None for v in data):
                series.append({
                    'key': key,
                    'name': param_config['name'],
                    'unit': param_config['unit'],
                    'limit': param_config['limit'],
                    'data': data,
                    'color': param_colors[color_index % len(param_colors)]
                })
                color_index += 1

        return jsonify({
            'success': True,
            'total_samples': len(results),
            'months': months,
            'series': series,
            'available_parameters': MICROBIOLOGICAL_PARAMETERS_CONFIG
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== TRACE ELEMENTS CONFIG ====================
TRACE_ELEMENTS_CONFIG = [
    {'key': 'aluminum', 'name': 'Aluminum', 'unit': 'μg/L', 'limit': 200, 'limit_type': '<='},
    {'key': 'arsenic', 'name': 'Arsenic', 'unit': 'μg/L', 'limit': 50, 'limit_type': '<='},
    {'key': 'barium', 'name': 'Barium', 'unit': 'μg/L', 'limit': 700, 'limit_type': '<='},
    {'key': 'cadmium', 'name': 'Cadmium', 'unit': 'μg/L', 'limit': 10, 'limit_type': '<='},
    {'key': 'chromium', 'name': 'Chromium', 'unit': 'μg/L', 'limit': 50, 'limit_type': '<='},
    {'key': 'copper', 'name': 'Copper', 'unit': 'μg/L', 'limit': 2000, 'limit_type': '<='},
    {'key': 'manganese', 'name': 'Manganese', 'unit': 'μg/L', 'limit': 500, 'limit_type': '<='},
    {'key': 'molybdenum', 'name': 'Molybdenum', 'unit': 'μg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'nickel', 'name': 'Nickel', 'unit': 'μg/L', 'limit': 20, 'limit_type': '<='},
    {'key': 'lead', 'name': 'Lead', 'unit': 'μg/L', 'limit': 50, 'limit_type': '<='},
    {'key': 'selenium', 'name': 'Selenium', 'unit': 'μg/L', 'limit': 10, 'limit_type': '<='},
    {'key': 'strontium', 'name': 'Strontium', 'unit': 'μg/L', 'limit': None, 'limit_type': 'NGVS'},
    {'key': 'zinc', 'name': 'Zinc', 'unit': 'μg/L', 'limit': 5000, 'limit_type': '<='},
    {'key': 'boron', 'name': 'Boron', 'unit': 'mg/L', 'limit': 2.4, 'limit_type': '<='},
    {'key': 'antimony', 'name': 'Antimony', 'unit': 'mg/L', 'limit': 0.02, 'limit_type': '<='},
    {'key': 'mercury', 'name': 'Mercury', 'unit': 'mg/L', 'limit': 0.006, 'limit_type': '<='},
    {'key': 'cyanide', 'name': 'Cyanide', 'unit': 'mg/L', 'limit': 0.05, 'limit_type': '<'},
    {'key': 'silica', 'name': 'Silica', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
]


@app.route('/api/dashboard/trace-elements', methods=['GET'])
def get_trace_elements():
    """
    Get trace and ultra-trace elements data for dashboard chart
    NOTE: Trace elements are ONLY available in Full Parameter forms
    """
    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Base query - only APPROVED reports with FULL form type
        base_query = db.session.query(TestReportMetadata, TraceUltratraceElements).join(
            TraceUltratraceElements,
            TestReportMetadata.report_id == TraceUltratraceElements.report_id
        ).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.form_type == 'full'
        )

        # Apply filters
        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            base_query = base_query.filter(db.extract('year', TestReportMetadata.reporting_date) == int(year))

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()

        if len(results) == 0:
            return jsonify({
                'success': True,
                'total_samples': 0,
                'parameters': [],
                'available_parameters': TRACE_ELEMENTS_CONFIG
            })

        # Calculate aggregates for each parameter
        parameters_data = []
        for param_config in TRACE_ELEMENTS_CONFIG:
            key = param_config['key']
            values = []

            for report, trace_params in results:
                value = getattr(trace_params, key, None)
                if value is not None:
                    try:
                        values.append(float(value))
                    except (ValueError, TypeError):
                        pass

            if values:
                avg_value = round(sum(values) / len(values), 2)
                min_value = round(min(values), 2)
                max_value = round(max(values), 2)

                # Determine if safe based on limit
                is_safe = True
                if param_config['limit'] is not None:
                    limit = param_config['limit']
                    limit_type = param_config['limit_type']
                    if limit_type == '<':
                        is_safe = avg_value < limit
                    elif limit_type == '<=':
                        is_safe = avg_value <= limit

                parameters_data.append({
                    'key': key,
                    'name': param_config['name'],
                    'value': round(avg_value, 2),
                    'min': round(min_value, 2),
                    'max': round(max_value, 2),
                    'count': len(values),
                    'unit': param_config['unit'],
                    'limit': param_config['limit'],
                    'limit_type': param_config['limit_type'],
                    'is_safe': is_safe
                })

        return jsonify({
            'success': True,
            'total_samples': len(results),
            'parameters': parameters_data,
            'available_parameters': TRACE_ELEMENTS_CONFIG
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ==================== DRAFT ROUTES ====================

@app.route('/api/drafts', methods=['POST'])
def create_draft():
    """Create a new draft"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        
        data = request.get_json()
        
        draft = DraftForm(
            user_id=session['user_id'],
            title=data.get('title', 'Untitled Draft'),
            data=data.get('data', {}),
            progress=data.get('progress', 0)
        )
        
        db.session.add(draft)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Draft created successfully',
            'draft_id': draft.id
        }), 201
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/drafts', methods=['GET'])
def get_drafts():
    """Get all drafts for current user"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        
        drafts = DraftForm.query.filter_by(user_id=session['user_id'], status='draft').all()
        
        return jsonify({
            'success': True,
            'drafts': [{
                'id': draft.id,
                'title': draft.title,
                'progress': draft.progress,
                'created_at': draft.created_at.isoformat(),
                'updated_at': draft.updated_at.isoformat()
            } for draft in drafts]
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/drafts/<int:draft_id>', methods=['GET'])
def get_draft(draft_id):
    """Get a specific draft by ID"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        
        draft = DraftForm.query.filter_by(id=draft_id, user_id=session['user_id']).first()
        
        if not draft:
            return jsonify({'success': False, 'message': 'Draft not found'}), 404
        
        # Include images if present at the top level or inside data
        images = None
        if isinstance(draft.data, dict) and 'images' in draft.data:
            images = draft.data['images']
        elif hasattr(draft, 'images'):
            images = draft.images
        return jsonify({
            'success': True,
            'draft': {
                'id': draft.id,
                'title': draft.title,
                'data': draft.data,
                'images': images,
                'progress': draft.progress,
                'status': draft.status,
                'created_at': draft.created_at.isoformat(),
                'updated_at': draft.updated_at.isoformat()
            }
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/drafts/<int:draft_id>', methods=['DELETE'])
def delete_draft(draft_id):
    """Delete a specific draft by ID"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        
        draft = DraftForm.query.filter_by(id=draft_id, user_id=session['user_id']).first()
        
        if not draft:
            return jsonify({'success': False, 'message': 'Draft not found'}), 404
        
        db.session.delete(draft)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Draft deleted successfully'
        }), 200
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/drafts/<int:draft_id>', methods=['PUT'])
def update_draft(draft_id):
    """Update a specific draft by ID"""
    try:
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        
        data = request.get_json()
        draft = DraftForm.query.filter_by(id=draft_id, user_id=session['user_id']).first()
        
        if not draft:
            return jsonify({'success': False, 'message': 'Draft not found'}), 404
        
        draft.title = data.get('title', draft.title)
        draft.data = data.get('data', draft.data)
        draft.progress = data.get('progress', draft.progress)
        # Allow updating status (e.g., 'draft' -> 'submitted')
        if 'status' in data:
            draft.status = data.get('status')
        draft.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Draft updated successfully',
            'draft_id': draft.id
        }), 200
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/dashboard/images', methods=['GET'])
def get_dashboard_images():
    """Return sample images for approved reports matching optional filters.
    Query params: tehsil, village, settlement, test_type, sample_type, year, limit
    Returns list of {report_id, report_serial_no, image_url, filename, uploaded_at, tehsil, village}
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        test_type = request.args.get('test_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')
        limit = int(request.args.get('limit', 20))

        # Base query: approved reports joined with sample images
        query = db.session.query(SampleImages, TestReportMetadata).join(
            TestReportMetadata, SampleImages.report_id == TestReportMetadata.report_id
        ).filter(TestReportMetadata.status == 'approved')

        # Apply all filters
        if tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if test_type != 'ALL':
            query = query.filter(TestReportMetadata.form_type == test_type)
        if sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            try:
                year_int = int(year)
                query = query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == year_int)
            except (ValueError, TypeError):
                pass

        query = apply_report_category_filter(query, report_category)
        # Order by uploaded_at desc so most recent images first
        query = query.order_by(SampleImages.uploaded_at.desc())

        results = query.limit(limit).all()

        def image_file_exists(image_path):
            """A row can outlive its file (restore, re-deploy, manual cleanup).
            Serving those produces broken 'Image not found' cards in the gallery,
            so drop them here instead."""
            if not image_path:
                return False
            return os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], image_path))

        def as_payload(img, rpt):
            return {
                'report_id': rpt.report_id,
                'report_serial_no': rpt.report_serial_no,
                'image_id': img.image_id,
                'filename': img.image_filename,
                'image_url': url_for('serve_sample_image', filename=img.image_path),
                'uploaded_at': img.uploaded_at.isoformat() + 'Z' if img.uploaded_at else None,
                'tehsil': rpt.tehsil,
                'village': rpt.village
            }

        images = [as_payload(img, rpt) for img, rpt in results
                  if image_file_exists(img.image_path)]

        # If no images found for given filters, return some random approved images
        if len(images) == 0:
            fallback = db.session.query(SampleImages, TestReportMetadata).join(
                TestReportMetadata, SampleImages.report_id == TestReportMetadata.report_id
            ).filter(TestReportMetadata.status == 'approved').order_by(db.func.random()).limit(limit).all()
            images = [as_payload(img, rpt) for img, rpt in fallback
                      if image_file_exists(img.image_path)]

        return jsonify({'success': True, 'images': images})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== STATIC ROUTES ====================

@app.route('/')
def index():
    """Serve login page"""
    if 'user_id' in session:
        return redirect(url_for('serve_dashboard'))
    return redirect(url_for('serve_login'))


@app.route('/login')
@app.route('/login.html')
def serve_login():
    """Serve login page"""
    print(f"🔍 /login called, user_id in session: {session.get('user_id')}")
    if 'user_id' in session:
        print(f"   → Redirecting to serve_dashboard (index.html)")
        return redirect(url_for('serve_dashboard'))
    print(f"   → Returning login.html")
    return render_template('login.html')


@app.route('/register')
@app.route('/register.html')
def serve_register():
    """Serve registration page"""
    if 'user_id' in session:
        return redirect(url_for('serve_dashboard'))
    return render_template('register.html')


@app.route('/reset-password')
@app.route('/reset_password.html')
def serve_reset_password():
    """Serve reset password page"""
    if 'user_id' in session:
        return redirect(url_for('serve_dashboard'))
    return render_template('reset_password.html')


@app.route('/dashboard')
@app.route('/dashboard.html')
def serve_dashboard_content():
    """Serve dashboard content - accessible to all logged-in users"""
    print(f"🔍 /dashboard called, user_id: {session.get('user_id')}")
    if 'user_id' not in session:
        print(f"   → No user_id, redirecting to login")
        return redirect(url_for('serve_login'))

    # Verify user exists in database
    user = User.query.get(session['user_id'])
    if not user:
        print(f"   → User not found in database, clearing session")
        session.clear()
        return redirect(url_for('serve_login'))

    print(f"   ✅ Returning dashboard.html")
    return render_template(
        'dashboard.html',
        is_viewer=session.get('user_role') in VIEW_ONLY_ROLES
    )


@app.route('/shared-dashboard/<token>')
def shared_dashboard(token):
    """Open the dashboard from a shareable link, with no login prompt.

    The link signs the visitor in as the dashboard_viewer account named by
    SHARED_DASHBOARD_EMAIL, so enforce_view_only_access() still applies: the
    session it creates can read the dashboard and nothing else. Treat the URL
    itself as the credential — anyone holding it sees the data.
    """
    expected = app.config.get('SHARED_DASHBOARD_TOKEN') or ''
    if not expected or not hmac.compare_digest(str(token), str(expected)):
        return render_template('login.html'), 404

    viewer = User.query.filter_by(
        email=app.config.get('SHARED_DASHBOARD_EMAIL', ''),
        role='dashboard_viewer'
    ).first()

    if not viewer or not viewer.is_active:
        print("⚠️  /shared-dashboard: no active dashboard_viewer account configured")
        return (
            'Shared dashboard is not configured yet. '
            'Create the viewer account with create_viewer_user.py.',
            503
        )

    session.clear()
    session['user_id'] = viewer.id
    session['user_name'] = viewer.name
    session['user_email'] = viewer.email
    session['user_role'] = viewer.role
    session['user_organization'] = viewer.organization
    session['shared_link'] = True

    # Send them to the app shell, not dashboard.html directly. dashboard.html
    # calls L.map()/L.tileLayer() but loads no Leaflet itself — index.html is
    # what pulls it in, so opening the bare page gives "Map library failed to
    # load". The shell loads Leaflet, then injects the dashboard into it.
    return redirect(url_for('serve_dashboard'))


@app.route('/index.html')
def serve_dashboard():
    """Serve main dashboard page"""
    if 'user_id' not in session:
        return redirect(url_for('serve_login'))

    # Verify user exists in database
    user = User.query.get(session['user_id'])
    if not user:
        print(f"🔍 /index.html - User not found in database, clearing session")
        session.clear()
        return redirect(url_for('serve_login'))

    # Get user information from session
    user_role = session.get('user_role', 'pcrwr_user')
    user_name = session.get('user_name', 'User')

    return render_template('index.html', user_role=user_role, user_name=user_name)


@app.route('/add_water_test')
@app.route('/add-water-test')
@app.route('/add_water_test.html')
def serve_add_water_test():
    """Serve add water test page"""
    if 'user_id' not in session:
        return redirect(url_for('serve_login'))
    return render_template('add_water_test.html')


@app.route('/baseline-report')
@app.route('/baseline_report.html')
def serve_baseline_report():
    """Serve baseline report form page (reuses add_water_test template with is_baseline=True)"""
    if 'user_id' not in session:
        return redirect(url_for('serve_login'))
    return render_template('add_water_test.html', is_baseline=True)


# ═══════════════════════════════════════════════════════════════════════════
#  BASELINE vs POST-INTERVENTION COMPARISON ENGINE
# ═══════════════════════════════════════════════════════════════════════════

# Parameter definitions: (display_name, category, source_relation, db_field, unit, limit_spec, is_critical)
# limit_spec: None | ('max', value) | ('range', lo, hi)
_CMP_PARAMS = [
    # Physical
    ('pH',                      'Physical', 'physical', 'ph',                     '',       ('range', 6.5, 8.5), False),
    ('Turbidity',               'Physical', 'physical', 'turbidity',              'NTU',    ('max', 5.0),        False),
    ('Total Dissolved Solids',  'Physical', 'physical', 'total_dissolved_solids', 'mg/L',   ('max', 1000),       False),
    ('Electrical Conductivity', 'Physical', 'physical', 'electrical_conductivity','μS/cm',  ('max', 1500),       False),
    ('Temperature',             'Physical', 'physical', 'temperature',            '°C',     None,                False),
    ('Suspended Solids',        'Physical', 'physical', 'suspended_solids',       'mg/L',   None,                False),
    # Chemical
    ('Chlorides',               'Chemical', 'chemical', 'chlorides',              'mg/L',   ('max', 250),        False),
    ('Total Hardness',          'Chemical', 'chemical', 'total_hardness',         'mg/L',   ('max', 500),        False),
    ('Sodium',                  'Chemical', 'chemical', 'sodium',                 'mg/L',   ('max', 200),        False),
    ('Sulphate',                'Chemical', 'chemical', 'sulphate',               'mg/L',   ('max', 250),        False),
    ('Nitrate (as N)',          'Chemical', 'chemical', 'nitrate_n',              'mg/L',   ('max', 10),         False),
    ('Nitrite',                 'Chemical', 'chemical', 'nitrite',                'mg/L',   ('max', 3),          False),
    ('Iron (Chem.)',            'Chemical', 'chemical', 'iron',                   'mg/L',   ('max', 0.3),        False),
    ('Fluoride',                'Chemical', 'chemical', 'fluoride',               'mg/L',   ('max', 1.5),        False),
    ('Calcium',                 'Chemical', 'chemical', 'calcium',                'mg/L',   None,                False),
    ('Magnesium',               'Chemical', 'chemical', 'magnesium',              'mg/L',   None,                False),
    ('Alkalinity (CaCO3)',      'Chemical', 'chemical', 'alkalinity_caco3',       'mg/L',   None,                False),
    ('Bicarbonates',            'Chemical', 'chemical', 'bicarbonates',           'mg/L',   None,                False),
    ('Potassium',               'Chemical', 'chemical', 'potassium',              'mg/L',   None,                False),
    # Trace elements
    ('Arsenic',                 'Trace',    'trace',    'arsenic',                'μg/L',   ('max', 50),         True),
    ('Lead',                    'Trace',    'trace',    'lead',                   'μg/L',   ('max', 50),         True),
    ('Chromium',                'Trace',    'trace',    'chromium',               'μg/L',   ('max', 50),         True),
    ('Cadmium',                 'Trace',    'trace',    'cadmium',                'μg/L',   ('max', 5),          True),
    ('Nickel',                  'Trace',    'trace',    'nickel',                 'μg/L',   ('max', 20),         False),
    ('Selenium',                'Trace',    'trace',    'selenium',               'μg/L',   ('max', 10),         False),
    ('Mercury',                 'Trace',    'trace',    'mercury',                'mg/L',   ('max', 0.001),      True),
    ('Manganese',               'Trace',    'trace',    'manganese',              'μg/L',   ('max', 400),        False),
    ('Copper',                  'Trace',    'trace',    'copper',                 'μg/L',   ('max', 2000),       False),
    ('Zinc',                    'Trace',    'trace',    'zinc',                   'μg/L',   ('max', 5000),       False),
    ('Aluminum',                'Trace',    'trace',    'aluminum',               'μg/L',   ('max', 200),        False),
    ('Iron (Trace)',             'Trace',    'trace',    'iron',                   'μg/L',   ('max', 300),        False),
    ('Barium',                  'Trace',    'trace',    'barium',                 'μg/L',   ('max', 700),        False),
    ('Boron',                   'Trace',    'trace',    'boron',                  'mg/L',   ('max', 2.4),        False),
    ('Antimony',                'Trace',    'trace',    'antimony',               'mg/L',   ('max', 0.02),       False),
    ('Cyanide',                 'Trace',    'trace',    'cyanide',                'mg/L',   ('max', 0.07),       False),
    ('Molybdenum',              'Trace',    'trace',    'molybdenum',             'μg/L',   ('max', 70),         False),
]

_CMP_MICROBIAL = [
    ('Total Coliforms', 'total_coliforms', True),
    ('Fecal Coliforms', 'fecal_coliforms', True),
    ('E. coli',         'e_coli',          True),
]


def _cmp_get_num(report, source, field):
    obj_map = {
        'physical': report.physical_params,
        'chemical': report.chemical_params,
        'trace':    report.trace_elements,
    }
    obj = obj_map.get(source)
    if obj is None:
        return None
    val = getattr(obj, field, None)
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _cmp_compliant(val, limit_spec):
    if val is None or limit_spec is None:
        return None
    if limit_spec[0] == 'range':
        return limit_spec[1] <= val <= limit_spec[2]
    if limit_spec[0] == 'max':
        return val <= limit_spec[1]
    return None


def _cmp_direction(base_val, post_val, limit_spec):
    if base_val is None or post_val is None:
        return 'N/A'
    diff = post_val - base_val
    if abs(diff) < 1e-9:
        return 'no_change'
    if limit_spec is None:
        return 'improved' if diff < 0 else 'deteriorated'
    if limit_spec[0] == 'range':
        lo, hi = limit_spec[1], limit_spec[2]
        center = (lo + hi) / 2.0
        base_in = lo <= base_val <= hi
        post_in = lo <= post_val <= hi
        if not base_in and post_in:
            return 'improved'
        if base_in and not post_in:
            return 'deteriorated'
        return 'improved' if abs(post_val - center) < abs(base_val - center) else 'deteriorated'
    if limit_spec[0] == 'max':
        return 'improved' if diff < 0 else 'deteriorated'
    return 'N/A'


def _cmp_microbial_val(report, field):
    obj = report.microbio_params
    if obj is None:
        return None, None
    raw = getattr(obj, field, None)
    if raw is None or str(raw).strip() == '':
        return None, None
    s = str(raw).strip().upper()
    if s == 'TNTC':
        return 'TNTC', None   # (display, numeric)
    try:
        n = float(s)
        return str(int(n)) if n == int(n) else str(n), n
    except (ValueError, TypeError):
        return s, None


def _build_comparison(baseline, post):
    """Core comparison logic. Returns full comparison dict."""
    params = []
    total_measured  = 0
    improved_count  = 0
    deteriorated_count = 0
    no_change_count = 0
    compliance_fixes = 0     # non-compliant in baseline → compliant in post
    treatment_failures = []  # compliant in baseline → non-compliant in post (critical)

    for (name, category, source, field, unit, limit_spec, is_critical) in _CMP_PARAMS:
        bv = _cmp_get_num(baseline, source, field)
        pv = _cmp_get_num(post,     source, field)

        if bv is None and pv is None:
            continue  # skip parameters not measured in either report

        b_compliant = _cmp_compliant(bv, limit_spec)
        p_compliant = _cmp_compliant(pv, limit_spec)
        direction   = _cmp_direction(bv, pv, limit_spec)

        change_pct  = None
        if bv is not None and pv is not None and bv != 0:
            change_pct = round((pv - bv) / abs(bv) * 100, 1)
        elif bv == 0 and pv is not None:
            change_pct = None

        limit_label = None
        if limit_spec:
            if limit_spec[0] == 'range':
                limit_label = f"{limit_spec[1]}–{limit_spec[2]}"
            else:
                limit_label = f"≤{limit_spec[1]}"

        # Scoring — only when both values available
        if bv is not None and pv is not None:
            total_measured += 1
            if direction == 'improved':
                improved_count += 1
                if b_compliant is False and p_compliant is True:
                    compliance_fixes += 1
            elif direction == 'deteriorated':
                deteriorated_count += 1
                if b_compliant is True and p_compliant is False and is_critical:
                    treatment_failures.append(name)
            else:
                no_change_count += 1

        params.append({
            'name':         name,
            'category':     category,
            'unit':         unit,
            'limit':        limit_label,
            'base_val':     round(bv, 4) if bv is not None else None,
            'post_val':     round(pv, 4) if pv is not None else None,
            'change_pct':   change_pct,
            'direction':    direction,
            'base_compliant': b_compliant,
            'post_compliant': p_compliant,
            'is_critical':  is_critical,
        })

    # Microbial parameters
    for (name, field, is_critical) in _CMP_MICROBIAL:
        b_disp, b_num = _cmp_microbial_val(baseline, field)
        p_disp, p_num = _cmp_microbial_val(post,     field)

        if b_disp is None and p_disp is None:
            continue

        # TNTC = definitely non-compliant
        b_compliant = (b_num == 0) if b_num is not None else (False if b_disp == 'TNTC' else None)
        p_compliant = (p_num == 0) if p_num is not None else (False if p_disp == 'TNTC' else None)

        direction = 'N/A'
        change_pct = None
        if b_num is not None and p_num is not None:
            total_measured += 1
            if b_num > p_num:
                direction = 'improved'
                improved_count += 1
                if b_num > 0 and p_num == 0:
                    compliance_fixes += 1
            elif p_num > b_num:
                direction = 'deteriorated'
                deteriorated_count += 1
                if b_num == 0 and p_num > 0 and is_critical:
                    treatment_failures.append(name)
            else:
                direction = 'no_change'
                no_change_count += 1
            if b_num != 0:
                change_pct = round((p_num - b_num) / abs(b_num) * 100, 1)
        elif b_disp == 'TNTC' and p_disp == 'TNTC':
            direction = 'no_change'
        elif b_disp == 'TNTC' and p_num is not None:
            direction = 'improved'  # TNTC → numeric is always improvement
        elif b_num is not None and p_disp == 'TNTC':
            direction = 'deteriorated'

        params.append({
            'name':          name,
            'category':      'Microbial',
            'unit':          'CFU/100mL',
            'limit':         '0',
            'base_val':      b_disp,
            'post_val':      p_disp,
            'change_pct':    change_pct,
            'direction':     direction,
            'base_compliant': b_compliant,
            'post_compliant': p_compliant,
            'is_critical':   is_critical,
        })

    # Effectiveness Score
    if total_measured > 0:
        maintained_safe = sum(
            1 for p in params
            if p['direction'] == 'no_change'
            and p['base_val'] is not None
            and p['post_val'] is not None
            and p['base_compliant'] is True
        )
        score = round((improved_count + maintained_safe) / total_measured * 100, 1)
    else:
        score = None

    # Verdict
    if treatment_failures:
        verdict = 'Treatment Failure'
        verdict_color = 'danger'
    elif score is None:
        verdict = 'Insufficient Data'
        verdict_color = 'secondary'
    elif score >= 80:
        verdict = 'Highly Effective'
        verdict_color = 'success-strong'
    elif score >= 60:
        verdict = 'Effective'
        verdict_color = 'success'
    elif score >= 40:
        verdict = 'Partially Effective'
        verdict_color = 'warning'
    else:
        verdict = 'Ineffective'
        verdict_color = 'danger'

    def _report_summary(r):
        return {
            'report_id':        r.report_id,
            'report_serial_no': r.report_serial_no,
            'reporting_date':   r.reporting_date.strftime('%d %b %Y') if r.reporting_date else 'N/A',
            'sampling_date':    r.sampling_datetime.strftime('%d %b %Y') if r.sampling_datetime else 'N/A',
            'form_type':        r.form_type,
            'status':           r.status,
            'submitted_by':     r.submitted_by.name if r.submitted_by else 'N/A',
        }

    return {
        'location': {
            'tehsil':     baseline.tehsil,
            'village':    baseline.village,
            'settlement': baseline.settlement,
        },
        'baseline':  _report_summary(baseline),
        'post':      _report_summary(post),
        'parameters': params,
        'summary': {
            'total_measured':    total_measured,
            'improved':          improved_count,
            'deteriorated':      deteriorated_count,
            'no_change':         no_change_count,
            'compliance_fixes':  compliance_fixes,
            'treatment_failures': len(treatment_failures),
        },
        'effectiveness_score':  score,
        'verdict':              verdict,
        'verdict_color':        verdict_color,
        'treatment_failures':   treatment_failures,
    }


@app.route('/comparison')
def serve_comparison():
    if 'user_id' not in session:
        return redirect(url_for('serve_login'))
    return render_template('comparison.html')


@app.route('/api/comparison/locations')
def api_comparison_locations():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    try:
        from sqlalchemy import func as _func
        ALL_STATUSES = ('approved', 'submitted', 'pending_review', 'draft')

        base_locs = db.session.query(
            TestReportMetadata.tehsil,
            TestReportMetadata.village,
            TestReportMetadata.settlement,
            _func.count(TestReportMetadata.report_id).label('cnt'),
            _func.max(TestReportMetadata.reporting_date).label('latest'),
        ).filter(
            TestReportMetadata.report_category == 'baseline_report',
            TestReportMetadata.status.in_(ALL_STATUSES)
        ).group_by(
            TestReportMetadata.tehsil,
            TestReportMetadata.village,
            TestReportMetadata.settlement
        ).all()

        post_locs = db.session.query(
            TestReportMetadata.tehsil,
            TestReportMetadata.village,
            TestReportMetadata.settlement,
            _func.count(TestReportMetadata.report_id).label('cnt'),
            _func.max(TestReportMetadata.reporting_date).label('latest'),
        ).filter(
            TestReportMetadata.report_category == 'pcrwr_report',
            TestReportMetadata.status.in_(ALL_STATUSES)
        ).group_by(
            TestReportMetadata.tehsil,
            TestReportMetadata.village,
            TestReportMetadata.settlement
        ).all()

        base_map = {
            (r.tehsil, r.village, r.settlement): {
                'baseline_count':  r.cnt,
                'latest_baseline': r.latest.strftime('%d %b %Y') if r.latest else None,
            }
            for r in base_locs
        }
        post_map = {
            (r.tehsil, r.village, r.settlement): {
                'post_count':  r.cnt,
                'latest_post': r.latest.strftime('%d %b %Y') if r.latest else None,
            }
            for r in post_locs
        }

        # Build village-level lookup (tehsil+village) for fallback pairing
        base_village_map = {}
        for r in base_locs:
            key = (r.tehsil, r.village)
            if key not in base_village_map:
                base_village_map[key] = {'baseline_count': 0, 'latest_baseline': None}
            base_village_map[key]['baseline_count'] += r.cnt
            if r.latest and (base_village_map[key]['latest_baseline'] is None or
                             r.latest > base_village_map[key]['latest_baseline']):
                base_village_map[key]['latest_baseline'] = r.latest

        post_village_map = {}
        for r in post_locs:
            key = (r.tehsil, r.village)
            if key not in post_village_map:
                post_village_map[key] = {'post_count': 0, 'latest_post': None}
            post_village_map[key]['post_count'] += r.cnt
            if r.latest and (post_village_map[key]['latest_post'] is None or
                             r.latest > post_village_map[key]['latest_post']):
                post_village_map[key]['latest_post'] = r.latest

        # Union of all settlement-level keys
        all_keys = set(base_map.keys()) | set(post_map.keys())
        all_locations = []
        seen_village_pairs = set()
        paired = []

        for key in sorted(all_keys, key=lambda k: (k[0], k[1], k[2])):
            tehsil, village, settlement = key
            has_baseline = key in base_map
            has_post     = key in post_map

            # Check village-level pairing if settlement-level not paired
            v_key = (tehsil, village)
            village_paired = v_key in base_village_map and v_key in post_village_map
            is_paired = (has_baseline and has_post) or village_paired

            loc = {
                'tehsil':          tehsil,
                'village':         village,
                'settlement':      settlement,
                'has_baseline':    has_baseline or (v_key in base_village_map),
                'has_post':        has_post     or (v_key in post_village_map),
                'paired':          is_paired,
                'match_level':     'exact' if (has_baseline and has_post) else ('village' if village_paired else 'none'),
                'baseline_count':  base_map[key]['baseline_count']  if has_baseline else (base_village_map.get(v_key, {}).get('baseline_count', 0)),
                'post_count':      post_map[key]['post_count']       if has_post     else (post_village_map.get(v_key, {}).get('post_count', 0)),
                'latest_baseline': (base_map[key]['latest_baseline']  if has_baseline else
                                    (base_village_map[v_key]['latest_baseline'].strftime('%d %b %Y') if v_key in base_village_map and base_village_map[v_key]['latest_baseline'] else None)),
                'latest_post':     (post_map[key]['latest_post']      if has_post     else
                                    (post_village_map[v_key]['latest_post'].strftime('%d %b %Y') if v_key in post_village_map and post_village_map[v_key]['latest_post'] else None)),
            }
            all_locations.append(loc)
            if is_paired:
                paired.append(loc)

        # Also add village-level pairs that aren't captured in settlement-level
        for v_key in sorted(set(base_village_map.keys()) | set(post_village_map.keys())):
            tehsil, village = v_key
            if v_key in base_village_map and v_key in post_village_map:
                # Check if this village already appears in all_locations as paired
                already_paired = any(
                    l['tehsil'] == tehsil and l['village'] == village and l['paired']
                    for l in all_locations
                )
                if not already_paired and v_key not in seen_village_pairs:
                    seen_village_pairs.add(v_key)
                    bv = base_village_map[v_key]
                    pv = post_village_map[v_key]
                    loc = {
                        'tehsil':          tehsil,
                        'village':         village,
                        'settlement':      'Any',
                        'has_baseline':    True,
                        'has_post':        True,
                        'paired':          True,
                        'match_level':     'village',
                        'baseline_count':  bv['baseline_count'],
                        'post_count':      pv['post_count'],
                        'latest_baseline': bv['latest_baseline'].strftime('%d %b %Y') if bv['latest_baseline'] else None,
                        'latest_post':     pv['latest_post'].strftime('%d %b %Y')     if pv['latest_post']     else None,
                    }
                    all_locations.append(loc)
                    paired.append(loc)

        return jsonify({
            'success':       True,
            'locations':     all_locations,
            'paired':        paired,
            'total':         len(all_locations),
            'total_paired':  len(paired),
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/comparison/detail')
def api_comparison_detail():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    try:
        tehsil     = request.args.get('tehsil', '').strip()
        village    = request.args.get('village', '').strip()
        settlement = request.args.get('settlement', '').strip()

        if not all([tehsil, village, settlement]):
            return jsonify({'success': False, 'message': 'tehsil, village, and settlement are required'}), 400

        VALID = ('approved', 'submitted', 'pending_review', 'draft')

        def _find_report(category, tehsil, village, settlement):
            """Try exact match first, fall back to village-level match."""
            exact = TestReportMetadata.query.filter(
                TestReportMetadata.report_category == category,
                TestReportMetadata.tehsil     == tehsil,
                TestReportMetadata.village    == village,
                TestReportMetadata.settlement == settlement,
                TestReportMetadata.status.in_(VALID)
            ).order_by(TestReportMetadata.reporting_date.desc()).first()
            if exact:
                return exact, 'exact'
            # Fallback: match by tehsil+village only (pick most recent)
            village_match = TestReportMetadata.query.filter(
                TestReportMetadata.report_category == category,
                TestReportMetadata.tehsil  == tehsil,
                TestReportMetadata.village == village,
                TestReportMetadata.status.in_(VALID)
            ).order_by(TestReportMetadata.reporting_date.desc()).first()
            if village_match:
                return village_match, 'village'
            # Fallback 2: tehsil only (widest match)
            tehsil_match = TestReportMetadata.query.filter(
                TestReportMetadata.report_category == category,
                TestReportMetadata.tehsil == tehsil,
                TestReportMetadata.status.in_(VALID)
            ).order_by(TestReportMetadata.reporting_date.desc()).first()
            if tehsil_match:
                return tehsil_match, 'tehsil'
            return None, None

        baseline, b_match = _find_report('baseline_report', tehsil, village, settlement)
        post,     p_match = _find_report('pcrwr_report',    tehsil, village, settlement)

        if not baseline:
            return jsonify({'success': False, 'message': f'No baseline report found for Tehsil {tehsil}. Submit a baseline report first to enable comparison.'}), 404
        if not post:
            return jsonify({'success': False, 'message': f'No post-intervention report found for Tehsil {tehsil}. Submit a post-intervention report first to enable comparison.'}), 404

        result = _build_comparison(baseline, post)
        result['match_level'] = {'baseline': b_match, 'post': p_match}
        return jsonify({'success': True, **result})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/add-water-test-priority')
@app.route('/add_water_test_priority.html')
def serve_add_water_test_priority():
    """Serve add water test priority form page"""
    if 'user_id' not in session:
        return redirect(url_for('serve_login'))
    return render_template('add_water_test_priority.html')


@app.route('/view-submissions')
@app.route('/view_submissions.html')
def serve_view_submissions():
    """Serve view submissions page - For environmental_specialist and research_analyst"""
    print(f"🔍 /view-submissions called")
    print(f"   Session user_id: {session.get('user_id')}")
    print(f"   Session user_role: {session.get('user_role')}")

    if 'user_id' not in session:
        print(f"   ❌ No user_id in session - redirecting to login")
        return redirect(url_for('serve_login'))

    # Verify user exists in database (handles stale sessions after database clear)
    user = User.query.get(session['user_id'])
    if not user:
        print(f"   ❌ User not found in database - clearing session and redirecting to login")
        session.clear()
        return redirect(url_for('serve_login'))

    # Only environmental_specialist and research_analyst can view submissions
    user_role = session.get('user_role')
    if user_role == 'pcrwr_user':
        print(f"   ❌ User is pcrwr_user - returning 403")
        return jsonify({
            'success': False,
            'message': 'Access denied. PCRWR users can only access the water test submission form.',
            'redirect': '/add-water-test'
        }), 403

    # Check if this is a fetch/AJAX request (SPA navigation) or a direct browser request (page refresh)
    # The loadPage() function uses fetch() which doesn't send X-Requested-With header by default,
    # but we can check for the Accept header - fetch requests typically accept */* while browsers prefer text/html
    accept_header = request.headers.get('Accept', '')
    is_fetch_request = request.headers.get('Sec-Fetch-Mode') == 'cors' or \
                       request.headers.get('X-Requested-With') == 'XMLHttpRequest' or \
                       'text/html' not in accept_header

    if is_fetch_request:
        # SPA navigation - return just the fragment
        print(f"   ✅ Returning view_submissions.html (AJAX)")
        return render_template('view_submissions.html')
    else:
        # Direct browser request (page refresh) - return index.html with initial_page set
        print(f"   ✅ Returning index.html with initial_page=/view-submissions")
        return render_template('index.html',
                               user_name=user.name,
                               user_role=user.role,
                               initial_page='/view-submissions')


@app.route('/draft-form')
@app.route('/draft_form.html')
def serve_draft_form():
    """Serve draft form page"""
    if 'user_id' not in session:
        return redirect(url_for('serve_login'))
    return render_template('draft_form.html')


# ==================== WATER QUALITY ALERT ENDPOINTS ====================

@app.route('/api/send-water-quality-alert', methods=['POST'])
def send_water_quality_alert():
    """Send water quality alert notification"""
    try:
        data = request.get_json()
        category = data.get('category')
        unsafe_percentage = data.get('unsafe_percentage')
        timestamp = data.get('timestamp')

        # Log the alert
        print(f"\n{'='*60}")
        print(f"⚠️  WATER QUALITY ALERT")
        print(f"{'='*60}")
        print(f"Category: {category}")
        print(f"Unsafe Percentage: {unsafe_percentage}%")
        print(f"Timestamp: {timestamp}")
        print(f"{'='*60}\n")

        # In a production environment, you would:
        # 1. Send email notifications using Flask-Mail or similar
        # 2. Store alert in database
        # 3. Trigger SMS notifications

        return jsonify({
            'success': True,
            'message': 'Alert logged successfully'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/trace-elements-analytics')
def get_trace_elements_analytics():
    try:
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        base_query = db.session.query(TestReportMetadata, TraceUltratraceElements).join(
            TraceUltratraceElements,
            TestReportMetadata.report_id == TraceUltratraceElements.report_id
        ).filter(TestReportMetadata.status == 'approved')

        if tehsil != 'ALL':
            base_query = base_query.filter(TestReportMetadata.tehsil == tehsil)
        if village != 'ALL':
            base_query = base_query.filter(TestReportMetadata.village == village)
        if settlement != 'ALL':
            base_query = base_query.filter(TestReportMetadata.settlement == settlement)
        if sample_type != 'ALL':
            base_query = base_query.filter(TestReportMetadata.sample_type == sample_type)
        if year != 'ALL':
            base_query = base_query.filter(db.extract('year', TestReportMetadata.reporting_date) == int(year))

        base_query = apply_report_category_filter(base_query, report_category)
        results = base_query.all()

        # Calculate aggregates for each parameter
        parameters_data = []
        for param_config in TRACE_ELEMENTS_CONFIG:
            key = param_config['key']
            values = []

            for report, trace_params in results:
                value = getattr(trace_params, key, None)
                if value is not None:
                    values.append(float(value))

            if values:
                avg_value = round(sum(values) / len(values), 2)
                min_value = round(min(values), 2)
                max_value = round(max(values), 2)

                # Determine if safe based on limit
                is_safe = True
                if param_config['limit'] is not None:
                    limit = param_config['limit']
                    limit_type = param_config['limit_type']
                    if limit_type == '<':
                        is_safe = avg_value < limit
                    elif limit_type == '<=':
                        is_safe = avg_value <= limit

                parameters_data.append({
                    'key': key,
                    'name': param_config['name'],
                    'value': avg_value,
                    'min': min_value,
                    'max': max_value,
                    'limit': param_config['limit'],
                    'limit_type': param_config['limit_type'],
                    'unit': param_config['unit'],
                    'is_safe': is_safe,
                    'sample_count': len(values)
                })

        return jsonify({
            'success': True,
            'parameters': parameters_data,
            'total_samples': len(results)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@app.route('/api/trace-elements-time-series')
def get_trace_elements_time_series():
    try:
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        form_type = request.args.get('form_type', 'full')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        if form_type.lower() == 'priority':
            return jsonify({
                'success': True,
                'parameters': [],
                'available_parameters': [p['name'] for p in TRACE_ELEMENTS_CONFIG],
                'total_samples': 0,
                'form_type': form_type,
                'message': 'Trace and Ultra-Trace Elements data is only available for Full Parameter tests'
            })

        query = db.session.query(TestReportMetadata, TraceUltratraceElements).join(
            TraceUltratraceElements,
            TestReportMetadata.report_id == TraceUltratraceElements.report_id
        ).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.form_type == 'full'
        )

        # Apply location filters
        if tehsil and tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement and settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if sample_type and sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year and year != 'ALL':
            try:
                year_int = int(year)
                query = query.filter(db.extract('year', TestReportMetadata.date_of_collection) == year_int)
            except (ValueError, TypeError):
                pass

        results = query.all()
        total_samples = len(results)

        if total_samples == 0:
            return jsonify({
                'success': True,
                'parameters': [],
                'available_parameters': [p['name'] for p in TRACE_ELEMENTS_CONFIG],
                'total_samples': 0,
                'form_type': form_type
            })

        # Aggregate data for each trace element parameter
        parameters_data = []

        for param_config in TRACE_ELEMENTS_CONFIG:
            key = param_config['key']
            values = []

            for report, trace_params in results:
                value = getattr(trace_params, key, None)
                if value is not None:
                    try:
                        numeric_value = float(value)
                        values.append(numeric_value)
                    except (ValueError, TypeError):
                        pass

            if len(values) > 0:
                avg_value = sum(values) / len(values)
                min_value = min(values)
                max_value = max(values)

                # Determine safety status
                limit = param_config['limit']
                limit_type = param_config['limit_type']

                if limit is None or limit_type == 'NGVS':
                    is_safe = None  # No guideline value
                else:
                    if limit_type == '<':
                        is_safe = avg_value < limit
                    else:  # <= or default
                        is_safe = avg_value <= limit

                parameters_data.append({
                    'key': key,
                    'name': param_config['name'],
                    'value': round(avg_value, 4),
                    'min': round(min_value, 4),
                    'max': round(max_value, 4),
                    'unit': param_config['unit'],
                    'limit': limit,
                    'limit_type': limit_type,
                    'is_safe': is_safe,
                    'count': len(values)
                })

        return jsonify({
            'success': True,
            'parameters': parameters_data,
            'available_parameters': [p['name'] for p in TRACE_ELEMENTS_CONFIG],
            'total_samples': total_samples,
            'form_type': form_type
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/trace-elements-timeseries', methods=['GET'])
def get_trace_elements_timeseries():
    """
    Get trace and ultra-trace elements time series data for dashboard chart
    Returns monthly averages for each trace element parameter
    NOTE: Trace elements are ONLY available in Full Parameter forms
    """
    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # If user filtered by Priority Parameters, return empty with message
        if form_type.lower() == 'priority':
            return jsonify({
                'success': True,
                'total_samples': 0,
                'months': [],
                'series': [],
                'available_parameters': [p['name'] for p in TRACE_ELEMENTS_CONFIG],
                'message': 'Trace and Ultra-Trace Elements data is only available for Full Parameter tests'
            })

        # Build query - ALWAYS filter for form_type='full' (trace elements only in full mode)
        query = db.session.query(TestReportMetadata, TraceUltratraceElements).join(
            TraceUltratraceElements,
            TestReportMetadata.report_id == TraceUltratraceElements.report_id
        ).filter(
            TestReportMetadata.status == 'approved',
            TestReportMetadata.form_type == 'full'
        )

        # Apply location filters
        if tehsil and tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement and settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if sample_type and sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year and year != 'ALL':
            try:
                year_int = int(year)
                query = query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == year_int)
            except (ValueError, TypeError):
                pass

        query = apply_report_category_filter(query, report_category)
        results = query.all()
        total_samples = len(results)

        if total_samples == 0:
            return jsonify({
                'success': True,
                'total_samples': 0,
                'months': [],
                'series': [],
                'available_parameters': [p['name'] for p in TRACE_ELEMENTS_CONFIG]
            })

        # Aggregate by month
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        # Initialize data structure: {param_key: {month_index: [values]}}
        monthly_data = {}
        for param_config in TRACE_ELEMENTS_CONFIG:
            monthly_data[param_config['key']] = {i: [] for i in range(12)}

        # Populate monthly data
        for report, trace_params in results:
            month_index = report.sampling_datetime.month - 1 if report.sampling_datetime else None
            if month_index is not None:
                for param_config in TRACE_ELEMENTS_CONFIG:
                    key = param_config['key']
                    value = getattr(trace_params, key, None)
                    if value is not None:
                        try:
                            monthly_data[key][month_index].append(float(value))
                        except (ValueError, TypeError):
                            pass

        # Build series data
        param_colors = [
            '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
            '#00BCD4', '#795548', '#607D8B', '#F44336', '#3F51B5',
            '#8BC34A', '#FFC107', '#673AB7', '#009688', '#CDDC39',
            '#FF5722', '#03A9F4', '#FFEB3B'
        ]

        series = []
        color_index = 0
        for param_config in TRACE_ELEMENTS_CONFIG:
            key = param_config['key']
            data = []
            for month_idx in range(12):
                values = monthly_data[key][month_idx]
                avg = round(sum(values) / len(values), 4) if values else None
                data.append(avg)

            if any(v is not None for v in data):
                series.append({
                    'key': key,
                    'name': param_config['name'],
                    'unit': param_config['unit'],
                    'limit': param_config['limit'],
                    'limit_type': param_config['limit_type'],
                    'data': data,
                    'color': param_colors[color_index % len(param_colors)]
                })
                color_index += 1

        return jsonify({
            'success': True,
            'total_samples': total_samples,
            'months': months,
            'series': series,
            'available_parameters': [p['name'] for p in TRACE_ELEMENTS_CONFIG]
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/compliance-overview', methods=['GET'])
def get_compliance_overview():
    """
    Get compliance overview data for pie chart
    Classifies each approved report as:
    - Fully Compliant: ALL available categories are safe
    - Partially Compliant: SOME categories safe, SOME unsafe
    - Non-Compliant: ALL categories with limits are unsafe

    Uses QualityAssessment table which stores safety status for each category
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Build base query for approved reports with quality assessment
        query = db.session.query(TestReportMetadata, QualityAssessment).join(
            QualityAssessment,
            TestReportMetadata.report_id == QualityAssessment.report_id
        ).filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply form_type filter
        if form_type and form_type.lower() == 'priority':
            query = query.filter(TestReportMetadata.form_type == 'priority')
        elif form_type and form_type.lower() == 'full':
            query = query.filter(TestReportMetadata.form_type == 'full')
        # 'ALL' includes both types

        # Apply other filters
        if tehsil and tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement and settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if sample_type and sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year and year != 'ALL':
            try:
                year_int = int(year)
                query = query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == year_int)
            except (ValueError, TypeError):
                pass

        query = apply_report_category_filter(query, report_category)
        results = query.all()
        total_reports = len(results)

        if total_reports == 0:
            return jsonify({
                'success': True,
                'fully_compliant': 0,
                'partially_compliant': 0,
                'non_compliant': 0,
                'total_reports': 0,
                'message': 'No approved reports found'
            })

        # Classify each report
        fully_compliant = 0
        partially_compliant = 0
        non_compliant = 0

        for report, qa in results:
            # Determine which categories to evaluate based on form type
            is_priority = report.form_type == 'priority'

            # Get safety status for each category
            # Values can be: 'safe', 'unsafe', 'contaminated', None, '', 'N/A'
            physical_safe = qa.physical_quality in (None, '', 'N/A', 'safe')
            microbial_safe = qa.microbial_quality in (None, '', 'N/A', 'safe')

            if is_priority:
                # Priority reports only have Physical and Microbial
                categories_evaluated = []
                if qa.physical_quality and qa.physical_quality not in ('', 'N/A'):
                    categories_evaluated.append(physical_safe)
                if qa.microbial_quality and qa.microbial_quality not in ('', 'N/A'):
                    categories_evaluated.append(microbial_safe)
            else:
                # Full reports have all four categories
                chemical_safe = qa.chemical_quality in (None, '', 'N/A', 'safe')
                trace_safe = qa.trace_elements_quality in (None, '', 'N/A', 'safe')

                categories_evaluated = []
                if qa.physical_quality and qa.physical_quality not in ('', 'N/A'):
                    categories_evaluated.append(physical_safe)
                if qa.chemical_quality and qa.chemical_quality not in ('', 'N/A'):
                    categories_evaluated.append(chemical_safe)
                if qa.trace_elements_quality and qa.trace_elements_quality not in ('', 'N/A'):
                    categories_evaluated.append(trace_safe)
                if qa.microbial_quality and qa.microbial_quality not in ('', 'N/A'):
                    categories_evaluated.append(microbial_safe)

            # Classify based on evaluated categories
            if not categories_evaluated:
                # No categories with data - consider fully compliant (all NGVS)
                fully_compliant += 1
            elif all(categories_evaluated):
                # All evaluated categories are safe
                fully_compliant += 1
            elif not any(categories_evaluated):
                # All evaluated categories are unsafe
                non_compliant += 1
            else:
                # Mix of safe and unsafe
                partially_compliant += 1

        return jsonify({
            'success': True,
            'fully_compliant': fully_compliant,
            'partially_compliant': partially_compliant,
            'non_compliant': non_compliant,
            'total_reports': total_reports,
            'form_type_filter': form_type
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard/biological-parameters', methods=['GET'])
def get_biological_parameters():
    """
    Get biological (microbiological) parameters for the table view.
    Only includes: Total Coliforms, Fecal Coliforms, E. coli

    For microbiological parameters, the permissible limit is 0 (any detection is unsafe)
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Debug logging
        print(f"[BIOLOGICAL API] Received filters - form_type: '{form_type}', tehsil: '{tehsil}'")

        # Build query for approved reports with microbiological data
        query = db.session.query(TestReportMetadata, MicrobiologicalParameters).join(
            MicrobiologicalParameters,
            TestReportMetadata.report_id == MicrobiologicalParameters.report_id
        ).filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply form_type filter
        if form_type and form_type.lower() == 'priority':
            query = query.filter(TestReportMetadata.form_type == 'priority')
            print(f"[BIOLOGICAL API] Filtering by PRIORITY only")
        elif form_type and form_type.lower() == 'full':
            query = query.filter(TestReportMetadata.form_type == 'full')
            print(f"[BIOLOGICAL API] Filtering by FULL only")
        else:
            print(f"[BIOLOGICAL API] No form_type filter applied (ALL)")

        # Apply other filters
        if tehsil and tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement and settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if sample_type and sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year and year != 'ALL':
            try:
                year_int = int(year)
                query = query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == year_int)
            except (ValueError, TypeError):
                pass

        query = apply_report_category_filter(query, report_category)
        results = query.all()
        total_samples = len(results)
        print(f"[BIOLOGICAL API] Found {total_samples} matching reports")
        for r in results:
            print(f"  - Report {r[0].report_id}: form_type={r[0].form_type}, TC={r[1].total_coliforms}, FC={r[1].fecal_coliforms}, EC={r[1].e_coli}")

        if total_samples == 0:
            return jsonify({
                'success': True,
                'parameters': [],
                'total_samples': 0,
                'message': 'No approved reports found'
            })

        # Define the microbiological parameters config
        # Limit is 0 for all - any detection is considered unsafe
        micro_params_config = [
            {'key': 'total_coliforms', 'name': 'Total Coliforms', 'unit': 'CFU/100mL', 'limit': 0},
            {'key': 'fecal_coliforms', 'name': 'Fecal Coliforms', 'unit': 'CFU/100mL', 'limit': 0},
            {'key': 'e_coli', 'name': 'E. coli', 'unit': 'CFU/100mL', 'limit': 0}
        ]

        parameters_data = []

        for param_config in micro_params_config:
            key = param_config['key']
            numeric_values = []
            tntc_count = 0
            detected_count = 0
            not_detected_count = 0

            for report, micro_params in results:
                value_str = getattr(micro_params, key, None)
                if value_str is not None and value_str != '':
                    if str(value_str).upper() == 'TNTC':
                        tntc_count += 1
                        detected_count += 1
                    else:
                        try:
                            numeric_val = float(value_str)
                            numeric_values.append(numeric_val)
                            if numeric_val > 0:
                                detected_count += 1
                            else:
                                not_detected_count += 1
                        except (ValueError, TypeError):
                            pass

            # Calculate average (only for numeric values)
            if len(numeric_values) > 0:
                avg_value = sum(numeric_values) / len(numeric_values)
            else:
                avg_value = 0

            # Determine display value
            if tntc_count > 0 and len(numeric_values) == 0:
                display_value = 'TNTC'
            elif tntc_count > 0:
                display_value = f'{round(avg_value, 1)} (+ {tntc_count} TNTC)'
            else:
                display_value = round(avg_value, 1)

            # Safety: any detection (>0 or TNTC) is unsafe
            # Safe only if all samples are 0 or not detected
            is_safe = detected_count == 0

            parameters_data.append({
                'key': key,
                'name': param_config['name'],
                'value': display_value,
                'avg_value': round(avg_value, 2),
                'unit': param_config['unit'],
                'limit': param_config['limit'],
                'is_safe': is_safe,
                'detected_count': detected_count,
                'not_detected_count': not_detected_count,
                'tntc_count': tntc_count,
                'sample_count': len(numeric_values) + tntc_count
            })

        # Calculate summary stats
        safe_count = sum(1 for p in parameters_data if p['is_safe'])
        unsafe_count = len(parameters_data) - safe_count

        return jsonify({
            'success': True,
            'parameters': parameters_data,
            'total_samples': total_samples,
            'total_parameters': len(parameters_data),
            'safe_count': safe_count,
            'unsafe_count': unsafe_count,
            'form_type_filter': form_type
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ==================== PARAMETER TREND API ====================

# Parameter Trend configuration - maps parameter key to database table and field
PARAMETER_TREND_CONFIG = {
    'tds': {
        'name': 'TDS (Total Dissolved Solids)',
        'table': 'physical',  # PhysicalAestheticParameters
        'field': 'total_dissolved_solids',
        'unit': 'mg/L',
        'limit': 1000,
        'color': '#2196F3'
    },
    'ph': {
        'name': 'pH Level',
        'table': 'physical',
        'field': 'ph',
        'unit': '-',
        'limit': 8.5,  # Upper limit (range is 6.5-8.5)
        'color': '#4CAF50'
    },
    'hardness': {
        'name': 'Total Hardness',
        'table': 'chemical',  # MajorChemicalParameters
        'field': 'total_hardness',
        'unit': 'mg/L',
        'limit': 500,
        'color': '#FF9800'
    },
    'turbidity': {
        'name': 'Turbidity',
        'table': 'physical',
        'field': 'turbidity',
        'unit': 'NTU',
        'limit': 5,
        'color': '#9C27B0'
    },
    'conductivity': {
        'name': 'Electrical Conductivity',
        'table': 'physical',
        'field': 'electrical_conductivity',
        'unit': 'μS/cm',
        'limit': 1500,
        'color': '#F44336'
    },
    'arsenic': {
        'name': 'Arsenic',
        'table': 'trace',  # TraceUltratraceElements
        'field': 'arsenic',
        'unit': 'μg/L',
        'limit': 50,
        'color': '#E91E63'
    }
}


@app.route('/api/dashboard/parameter-trend', methods=['GET'])
def get_parameter_trend():
    """
    Get monthly trend data for a specific parameter.
    Returns 12 months of averaged data based on filters.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get parameters
        parameter = request.args.get('parameter', 'tds')
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Validate parameter
        if parameter not in PARAMETER_TREND_CONFIG:
            return jsonify({
                'success': False,
                'message': f'Invalid parameter: {parameter}'
            }), 400

        config = PARAMETER_TREND_CONFIG[parameter]

        # Determine which table to query
        if config['table'] == 'physical':
            ParamTable = PhysicalAestheticParameters
        elif config['table'] == 'chemical':
            ParamTable = MajorChemicalParameters
        elif config['table'] == 'trace':
            ParamTable = TraceUltratraceElements
        else:
            return jsonify({'success': False, 'message': 'Invalid table config'}), 500

        # Build base query for approved reports
        query = db.session.query(
            TestReportMetadata,
            ParamTable
        ).join(
            ParamTable,
            TestReportMetadata.report_id == ParamTable.report_id
        ).filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply form_type filter
        if form_type and form_type.lower() == 'priority':
            query = query.filter(TestReportMetadata.form_type == 'priority')
        elif form_type and form_type.lower() == 'full':
            query = query.filter(TestReportMetadata.form_type == 'full')

        # Apply location filters
        if tehsil and tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement and settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if sample_type and sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year and year != 'ALL':
            try:
                year_int = int(year)
                query = query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == year_int)
            except (ValueError, TypeError):
                pass

        query = apply_report_category_filter(query, report_category)
        results = query.all()

        # Initialize monthly data
        monthly_values = {i: [] for i in range(12)}  # 0-11 for Jan-Dec

        for report, params in results:
            # Get the month from sampling_datetime
            if report.sampling_datetime:
                month = report.sampling_datetime.month - 1  # 0-indexed

                # Get the parameter value
                value = getattr(params, config['field'], None)
                if value is not None:
                    try:
                        monthly_values[month].append(float(value))
                    except (ValueError, TypeError):
                        pass

        # Calculate monthly averages
        month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        monthly_data = []
        all_values = []

        for i in range(12):
            values = monthly_values[i]
            if values:
                avg = sum(values) / len(values)
                monthly_data.append({
                    'month': month_names[i],
                    'month_index': i,
                    'value': round(avg, 2),
                    'count': len(values)
                })
                all_values.extend(values)
            else:
                monthly_data.append({
                    'month': month_names[i],
                    'month_index': i,
                    'value': None,
                    'count': 0
                })

        # Calculate statistics
        if all_values:
            current_value = monthly_data[-1]['value'] if monthly_data[-1]['value'] is not None else None
            # Find most recent non-null value for "current"
            for i in range(11, -1, -1):
                if monthly_data[i]['value'] is not None:
                    current_value = monthly_data[i]['value']
                    break

            avg_value = round(sum(all_values) / len(all_values), 2)
            min_value = round(min(all_values), 2)
            max_value = round(max(all_values), 2)
        else:
            current_value = None
            avg_value = None
            min_value = None
            max_value = None

        return jsonify({
            'success': True,
            'parameter': parameter,
            'name': config['name'],
            'unit': config['unit'],
            'limit': config['limit'],
            'color': config['color'],
            'monthly_data': monthly_data,
            'stats': {
                'current': current_value,
                'average': avg_value,
                'min': min_value,
                'max': max_value
            },
            'total_samples': len(results)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ==================== WATER QUALITY INDICATOR API ====================

@app.route('/api/dashboard/water-quality-indicator', methods=['GET'])
def get_water_quality_indicator():
    """
    Get monthly water quality indicator data (fit vs unfit samples).
    Returns monthly aggregated counts based on quality assessment.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        # Get filter parameters
        tehsil = request.args.get('tehsil', 'ALL')
        village = request.args.get('village', 'ALL')
        settlement = request.args.get('settlement', 'ALL')
        form_type = request.args.get('form_type', 'ALL')
        sample_type = request.args.get('sample_type', 'ALL')
        year = request.args.get('year', 'ALL')
        report_category = request.args.get('report_category', 'pcrwr_report')

        # Build base query for approved reports with quality assessment
        query = db.session.query(TestReportMetadata, QualityAssessment).join(
            QualityAssessment,
            TestReportMetadata.report_id == QualityAssessment.report_id
        ).filter(
            TestReportMetadata.status == 'approved'
        )

        # Apply form_type filter
        if form_type and form_type.lower() == 'priority':
            query = query.filter(TestReportMetadata.form_type == 'priority')
        elif form_type and form_type.lower() == 'full':
            query = query.filter(TestReportMetadata.form_type == 'full')

        # Apply location filters
        if tehsil and tehsil != 'ALL':
            query = query.filter(TestReportMetadata.tehsil == tehsil)
        if village and village != 'ALL':
            query = query.filter(TestReportMetadata.village == village)
        if settlement and settlement != 'ALL':
            query = query.filter(TestReportMetadata.settlement == settlement)
        if sample_type and sample_type != 'ALL':
            query = query.filter(TestReportMetadata.sample_type == sample_type)
        if year and year != 'ALL':
            try:
                year_int = int(year)
                query = query.filter(db.extract('year', TestReportMetadata.sampling_datetime) == year_int)
            except (ValueError, TypeError):
                pass

        query = apply_report_category_filter(query, report_category)
        results = query.all()

        # Initialize monthly data
        month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        monthly_fit = {i: 0 for i in range(12)}  # 0-11 for Jan-Dec
        monthly_unfit = {i: 0 for i in range(12)}

        # Define what counts as "fit" vs "unfit"
        # Fit: All quality assessments are safe/excellent/good or null/N/A
        # Unfit: Any quality assessment is unsafe/poor/contaminated
        unsafe_values = ['unsafe', 'poor', 'contaminated', 'unfit']

        for report, quality in results:
            if report.sampling_datetime:
                month = report.sampling_datetime.month - 1  # 0-indexed

                # Check if sample is fit or unfit
                is_unfit = False

                # Check physical quality
                if quality.physical_quality and quality.physical_quality.lower() in unsafe_values:
                    is_unfit = True
                # Check chemical quality
                if quality.chemical_quality and quality.chemical_quality.lower() in unsafe_values:
                    is_unfit = True
                # Check trace elements quality (for full tests)
                if quality.trace_elements_quality and quality.trace_elements_quality.lower() in unsafe_values:
                    is_unfit = True
                # Check microbial quality
                if quality.microbial_quality and quality.microbial_quality.lower() in unsafe_values:
                    is_unfit = True

                if is_unfit:
                    monthly_unfit[month] += 1
                else:
                    monthly_fit[month] += 1

        # Build monthly data array
        monthly_data = []
        total_fit = 0
        total_unfit = 0

        for i in range(12):
            monthly_data.append({
                'month': month_names[i],
                'month_index': i,
                'fit': monthly_fit[i],
                'unfit': monthly_unfit[i]
            })
            total_fit += monthly_fit[i]
            total_unfit += monthly_unfit[i]

        return jsonify({
            'success': True,
            'monthly_data': monthly_data,
            'total_fit': total_fit,
            'total_unfit': total_unfit,
            'total_samples': total_fit + total_unfit
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Water Quality Parameters Configuration
WATER_QUALITY_PARAMETERS = {
    'Physical & Aesthetic': [
        {'name': 'color', 'label': 'Color', 'units': '-', 'det_limit': '-', 'reference': 'Sensory Evaluation', 'permissible': 'Colorless', 'type': 'priority', 'input_type': 'select', 'options': ['objectionable', 'non-objectionable']},
        {'name': 'odour', 'label': 'Odour', 'units': '-', 'det_limit': '-', 'reference': 'Sensory Evaluation', 'permissible': 'Unobj', 'type': 'priority', 'input_type': 'select', 'options': ['objectionable', 'non-objectionable']},
        {'name': 'taste', 'label': 'Taste', 'units': '-', 'det_limit': '-', 'reference': 'Sensory Evaluation', 'permissible': 'Unobj', 'type': 'priority', 'input_type': 'select', 'options': ['objectionable', 'non-objectionable']},
        {'name': 'electrical_conductivity', 'label': 'Electrical Conductivity (EC)', 'units': 'μS/cm', 'det_limit': '1.0', 'reference': 'APHA 23rd Edition', 'permissible': '< 1500', 'type': 'priority', 'input_type': 'number'},
        {'name': 'ph', 'label': 'pH', 'units': '-', 'det_limit': '0.03', 'reference': 'APHA 23rd Edition', 'permissible': '6.5 - 8.5', 'type': 'priority', 'input_type': 'number'},
        {'name': 'temperature', 'label': 'Temperature', 'units': '°C', 'det_limit': '0.1', 'reference': 'APHA 23rd Edition', 'permissible': 'NGVS', 'type': 'priority', 'input_type': 'number'},
        {'name': 'suspended_solids', 'label': 'Suspended Solids', 'units': 'mg/L', 'det_limit': '1.0', 'reference': 'APHA 23rd Edition', 'permissible': 'NGVS', 'type': 'priority', 'input_type': 'number'},
        {'name': 'tds', 'label': 'Total Dissolved Solids (TDS)', 'units': 'mg/L', 'det_limit': '1.0', 'reference': 'APHA 23rd Edition', 'permissible': '< 1000', 'type': 'priority', 'input_type': 'number'},
        {'name': 'turbidity', 'label': 'Turbidity', 'units': 'NTU', 'det_limit': '0.31', 'reference': 'APHA 23rd Edition', 'permissible': '< 5', 'type': 'priority', 'input_type': 'number'},
    ],
    'Major Chemical': [
        {'name': 'alkalinity', 'label': 'Alkalinity', 'units': 'mg/L', 'det_limit': '5.0', 'reference': 'APHA 23rd Edition', 'permissible': 'NGVS', 'type': 'full', 'input_type': 'number'},
        {'name': 'bicarbonates', 'label': 'Bicarbonates', 'units': 'mg/L', 'det_limit': '5.0', 'reference': 'APHA 23rd Edition', 'permissible': 'NGVS', 'type': 'full', 'input_type': 'number'},
        {'name': 'carbonates', 'label': 'Carbonates', 'units': 'mg/L', 'det_limit': '5.0', 'reference': 'APHA 23rd Edition', 'permissible': 'NGVS', 'type': 'full', 'input_type': 'number'},
        {'name': 'chlorides', 'label': 'Chlorides', 'units': 'mg/L', 'det_limit': '2.0', 'reference': 'APHA 23rd Edition', 'permissible': '< 250', 'type': 'full', 'input_type': 'number'},
        {'name': 'fluorides', 'label': 'Fluorides', 'units': 'mg/L', 'det_limit': '0.1', 'reference': 'APHA 23rd Edition', 'permissible': '< 1.5', 'type': 'full', 'input_type': 'number'},
        {'name': 'hardness_total', 'label': 'Hardness (Total)', 'units': 'mg/L', 'det_limit': '5.0', 'reference': 'APHA 23rd Edition', 'permissible': '< 500', 'type': 'full', 'input_type': 'number'},
        {'name': 'nitrates', 'label': 'Nitrates', 'units': 'mg/L', 'det_limit': '0.5', 'reference': 'APHA 23rd Edition', 'permissible': '< 50', 'type': 'full', 'input_type': 'number'},
        {'name': 'nitrites', 'label': 'Nitrites', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '< 3', 'type': 'full', 'input_type': 'number'},
        {'name': 'phosphates', 'label': 'Phosphates', 'units': 'mg/L', 'det_limit': '0.1', 'reference': 'APHA 23rd Edition', 'permissible': 'NGVS', 'type': 'full', 'input_type': 'number'},
        {'name': 'sulphates', 'label': 'Sulphates', 'units': 'mg/L', 'det_limit': '2.0', 'reference': 'APHA 23rd Edition', 'permissible': '< 250', 'type': 'full', 'input_type': 'number'},
        {'name': 'calcium', 'label': 'Calcium', 'units': 'mg/L', 'det_limit': '1.0', 'reference': 'APHA 23rd Edition', 'permissible': '< 200', 'type': 'full', 'input_type': 'number'},
        {'name': 'magnesium', 'label': 'Magnesium', 'units': 'mg/L', 'det_limit': '0.5', 'reference': 'APHA 23rd Edition', 'permissible': '< 150', 'type': 'full', 'input_type': 'number'},
        {'name': 'sodium', 'label': 'Sodium', 'units': 'mg/L', 'det_limit': '1.0', 'reference': 'APHA 23rd Edition', 'permissible': '< 200', 'type': 'full', 'input_type': 'number'},
        {'name': 'potassium', 'label': 'Potassium', 'units': 'mg/L', 'det_limit': '0.5', 'reference': 'APHA 23rd Edition', 'permissible': 'NGVS', 'type': 'full', 'input_type': 'number'},
        {'name': 'ammonia', 'label': 'Ammonia', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '< 1.5', 'type': 'full', 'input_type': 'number'},
    ],
    'Trace Elements': [
        {'name': 'aluminum', 'label': 'Aluminum', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.2', 'type': 'full', 'input_type': 'number'},
        {'name': 'arsenic', 'label': 'Arsenic', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.01', 'type': 'full', 'input_type': 'number'},
        {'name': 'cadmium', 'label': 'Cadmium', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.003', 'type': 'full', 'input_type': 'number'},
        {'name': 'chromium', 'label': 'Chromium', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.05', 'type': 'full', 'input_type': 'number'},
        {'name': 'copper', 'label': 'Copper', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 2.0', 'type': 'full', 'input_type': 'number'},
        {'name': 'iron', 'label': 'Iron', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.3', 'type': 'full', 'input_type': 'number'},
        {'name': 'lead', 'label': 'Lead', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.01', 'type': 'full', 'input_type': 'number'},
        {'name': 'manganese', 'label': 'Manganese', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.4', 'type': 'full', 'input_type': 'number'},
        {'name': 'mercury', 'label': 'Mercury', 'units': 'mg/L', 'det_limit': '0.0001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.006', 'type': 'full', 'input_type': 'number'},
        {'name': 'nickel', 'label': 'Nickel', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.07', 'type': 'full', 'input_type': 'number'},
        {'name': 'selenium', 'label': 'Selenium', 'units': 'mg/L', 'det_limit': '0.001', 'reference': 'APHA 23rd Edition', 'permissible': '< 0.04', 'type': 'full', 'input_type': 'number'},
        {'name': 'zinc', 'label': 'Zinc', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '< 3.0', 'type': 'full', 'input_type': 'number'},
    ],
    'Microbiological': [
        {'name': 'total_coliforms', 'label': 'Total Coliforms', 'units': 'CFU/100mL', 'det_limit': '1', 'reference': 'APHA 23rd Edition', 'permissible': '0', 'type': 'priority', 'input_type': 'number'},
        {'name': 'fecal_coliforms', 'label': 'Fecal Coliforms', 'units': 'CFU/100mL', 'det_limit': '1', 'reference': 'APHA 23rd Edition', 'permissible': '0', 'type': 'priority', 'input_type': 'number'},
        {'name': 'ecoli', 'label': 'E-coli or thermotolerant coliform bacteria', 'units': 'CFU/100mL', 'det_limit': '1', 'reference': 'APHA 23rd Edition', 'permissible': '0', 'type': 'priority', 'input_type': 'number'},
    ],
    'Parameters Post Treatment': [
        {'name': 'residual_chlorine', 'label': 'Residual Chlorine', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '0.2 - 0.5', 'type': 'priority', 'input_type': 'number'},
        {'name': 'free_chlorine', 'label': 'Free Chlorine', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '0.2 - 0.5', 'type': 'priority', 'input_type': 'number'},
        {'name': 'total_chlorine', 'label': 'Total Chlorine', 'units': 'mg/L', 'det_limit': '0.01', 'reference': 'APHA 23rd Edition', 'permissible': '0.2 - 0.5', 'type': 'priority', 'input_type': 'number'},
    ]
}

def filter_parameters_by_type(form_type):
    """Filter parameters based on form type"""
    filtered_params = {}
    
    for section, params in WATER_QUALITY_PARAMETERS.items():
        if form_type == 'priority':
            # Only include priority parameters
            filtered_list = [p for p in params if p['type'] == 'priority']
        else:
            # Include all parameters for full form
            filtered_list = params
        
        if filtered_list:  # Only add section if it has parameters
            filtered_params[section] = filtered_list
    
    return filtered_params

def extract_form_data(form_type, form_data):
    """Extract and validate form data based on form type"""
    extracted_data = {}
    
    # Get filtered parameters for validation
    filtered_params = filter_parameters_by_type(form_type)
    
    # Extract basic form info
    extracted_data.update({
        'form_type': form_type,
        'location': form_data.get('location'),
        'region': form_data.get('region'),
        'district': form_data.get('district'),
        'tehsil': form_data.get('tehsil'),
        'village': form_data.get('village'),
        'settlement': form_data.get('settlement'),
        'test_date': form_data.get('test_date'),
        'test_time': form_data.get('test_time'),
        'tested_by': form_data.get('tested_by'),
        'contact': form_data.get('contact'),
        'observations': form_data.get('observations'),
    })
    
    # Extract parameter values
    for section, params in filtered_params.items():
        for param in params:
            param_name = param['name']
            param_value = form_data.get(param_name)
            if param_value:
                extracted_data[param_name] = param_value
    
    return extracted_data

@app.route('/add_water_test', methods=['GET', 'POST'])
def add_water_test():
    """Handle water test form with dynamic parameter filtering"""
    if 'user_id' not in session:
        return redirect(url_for('serve_login'))
    
    form_type = request.args.get('form_type', 'priority')
    
    if request.method == 'POST':
        try:
            # Handle form submission
            form_data = request.form.to_dict()
            form_type = form_data.get('form_type', 'priority')
            
            # Extract and validate data
            extracted_data = extract_form_data(form_type, form_data)
            
            # Create water test record
            water_test = WaterTest(
                user_id=session['user_id'],
                form_type=form_type,
                location=extracted_data.get('location'),
                region=extracted_data.get('region'),
                district=extracted_data.get('district'),
                village=extracted_data.get('village'),
                test_date=datetime.strptime(extracted_data.get('test_date'), '%Y-%m-%d').date() if extracted_data.get('test_date') else None,
                test_time=datetime.strptime(extracted_data.get('test_time'), '%H:%M').time() if extracted_data.get('test_time') else None,
                
                # Store parameter values as JSON for flexibility
                parameter_values=json.dumps({k: v for k, v in extracted_data.items() if k not in ['form_type', 'location', 'region', 'district', 'village', 'test_date', 'test_time', 'tested_by', 'contact', 'observations']}),
                
                tested_by=extracted_data.get('tested_by'),
                contact=extracted_data.get('contact'),
                observations=extracted_data.get('observations'),
                status='draft',
                submitted_by_id=session['user_id'],
                submitted_at=datetime.utcnow()
            )
            
            db.session.add(water_test)
            db.session.commit()
            
            flash(f'{form_type.title()} water test submitted successfully!', 'success')
            return redirect(url_for('add_water_test'))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Error submitting water test: {str(e)}', 'error')
    
    # Handle AJAX requests for dynamic form loading
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        filtered_params = filter_parameters_by_type(form_type)
        return render_template('form_parameters.html', 
                             parameters=filtered_params, 
                             form_type=form_type)
    
    # Regular page load
    filtered_params = filter_parameters_by_type(form_type)

    return render_template('add_water_test.html',
                         form_type=form_type,
                         parameters=filtered_params)


# ==================== EMAIL NOTIFICATION & ALERT MANAGEMENT ====================

@app.route('/api/alert-recipients', methods=['GET'])
def get_alert_recipients():
    """Get all alert recipients"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        recipients = AlertRecipient.query.order_by(AlertRecipient.created_at.desc()).all()

        return jsonify({
            'success': True,
            'recipients': [{
                'id': r.id,
                'name': r.name,
                'email': r.email,
                'role': r.role,
                'is_active': r.is_active,
                'created_at': r.created_at.isoformat() if r.created_at else None
            } for r in recipients]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/alert-recipients', methods=['POST'])
def add_alert_recipient():
    """Add a new alert recipient"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        data = request.get_json()

        # Validate required fields
        if not data.get('name') or not data.get('email'):
            return jsonify({'success': False, 'message': 'Name and email are required'}), 400

        # Check if email already exists
        existing = AlertRecipient.query.filter_by(email=data['email']).first()
        if existing:
            return jsonify({'success': False, 'message': 'Email already registered as recipient'}), 400

        recipient = AlertRecipient(
            name=data['name'],
            email=data['email'],
            role=data.get('role', 'Stakeholder'),
            is_active=data.get('is_active', True),
            created_by_id=session['user_id']
        )

        db.session.add(recipient)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Recipient added successfully',
            'recipient': {
                'id': recipient.id,
                'name': recipient.name,
                'email': recipient.email,
                'role': recipient.role,
                'is_active': recipient.is_active
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/alert-recipients/<int:recipient_id>', methods=['PUT'])
def update_alert_recipient(recipient_id):
    """Update an alert recipient"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        recipient = AlertRecipient.query.get(recipient_id)

        if not recipient:
            return jsonify({'success': False, 'message': 'Recipient not found'}), 404

        if data.get('name'):
            recipient.name = data['name']
        if data.get('email'):
            # Check if new email conflicts with another recipient
            existing = AlertRecipient.query.filter(
                AlertRecipient.email == data['email'],
                AlertRecipient.id != recipient_id
            ).first()
            if existing:
                return jsonify({'success': False, 'message': 'Email already in use'}), 400
            recipient.email = data['email']
        if 'role' in data:
            recipient.role = data['role']
        if 'is_active' in data:
            recipient.is_active = data['is_active']

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Recipient updated successfully',
            'recipient': {
                'id': recipient.id,
                'name': recipient.name,
                'email': recipient.email,
                'role': recipient.role,
                'is_active': recipient.is_active
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/alert-recipients/<int:recipient_id>', methods=['DELETE'])
def delete_alert_recipient(recipient_id):
    """Delete an alert recipient"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        recipient = AlertRecipient.query.get(recipient_id)

        if not recipient:
            return jsonify({'success': False, 'message': 'Recipient not found'}), 404

        db.session.delete(recipient)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Recipient deleted successfully'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/alert-history', methods=['GET'])
def get_alert_history():
    """Get alert history with optional filtering"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        status_filter = request.args.get('status', 'all')

        query = AlertHistory.query.order_by(AlertHistory.created_at.desc())

        if status_filter != 'all':
            query = query.filter(AlertHistory.status == status_filter)

        alerts = query.limit(100).all()

        return jsonify({
            'success': True,
            'alerts': [{
                'id': a.id,
                'report_id': a.report_id,
                'category': a.category,
                'unsafe_percentage': float(a.unsafe_percentage) if a.unsafe_percentage else 0,
                'status': a.status,
                'sent_at': (a.sent_at.isoformat() + 'Z') if a.sent_at else None,  # Add 'Z' to indicate UTC
                'recipients': json.loads(a.recipients) if a.recipients else [],
                'error_message': a.error_message,
                'created_at': (a.created_at.isoformat() + 'Z') if a.created_at else None  # Add 'Z' to indicate UTC
            } for a in alerts]
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/alert-history/<int:alert_id>/resend', methods=['POST'])
def resend_alert(alert_id):
    """Resend a previously failed or sent alert"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        alert = AlertHistory.query.get(alert_id)
        if not alert:
            return jsonify({'success': False, 'message': 'Alert not found'}), 404

        if not alert.report_id:
            return jsonify({'success': False, 'message': 'Associated report not found'}), 404

        # Resend the notification
        result = send_report_notification(alert.report_id, is_resend=True)

        return jsonify(result)

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/alert-history/clear', methods=['DELETE'])
def clear_alert_history():
    """Clear all alert history"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        AlertHistory.query.delete()
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Alert history cleared successfully'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/send-email-to-recipients', methods=['POST'])
def send_email_to_recipients():
    """Manually send emails to configured alert recipients for approved reports"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        data = request.get_json() or {}
        report_id = data.get('report_id')

        if not report_id:
            return jsonify({'success': False, 'message': 'report_id is required'}), 400

        # Verify report exists and is approved
        report = TestReportMetadata.query.get(report_id)
        if not report:
            return jsonify({'success': False, 'message': 'Report not found'}), 404

        if report.status != 'approved':
            return jsonify({'success': False, 'message': f'Can only send emails for approved reports. Current status: {report.status}'}), 400

        # Send notification and return result
        result = send_report_notification(report_id, is_resend=False)
        return jsonify(result)

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


def _classify_email_severity(report):
    """
    Score a report's severity based on actual parameter values vs WHO/NSDWQ limits.
    Returns a dict used to set the email subject, priority headers, and template banner.

    Levels:
      SAFE     – all parameters within limits
      CAUTION  – 1+ non-critical parameters above limit
      UNSAFE   – any critical parameter (arsenic, lead, cadmium, mercury, chromium,
                 fecal coliforms, E. coli, nitrate) exceeded
    """
    def _n(val):
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    critical_params  = []   # parameters that trigger UNSAFE
    minor_exceedances = []  # parameters that trigger CAUTION

    physical = report.physical_params
    chemical = report.chemical_params
    trace    = report.trace_elements
    microbio = report.microbio_params

    # ── Physical ──────────────────────────────────────────────────────
    if physical:
        ph = _n(physical.ph)
        if ph is not None and (ph < 6.5 or ph > 8.5):
            minor_exceedances.append(f"pH ({ph})")
        turb = _n(physical.turbidity)
        if turb is not None and turb > 5:
            minor_exceedances.append(f"Turbidity ({turb} NTU)")
        tds = _n(physical.total_dissolved_solids)
        if tds is not None and tds > 1000:
            minor_exceedances.append(f"TDS ({tds} mg/L)")
        ec = _n(physical.electrical_conductivity)
        if ec is not None and ec > 1500:
            minor_exceedances.append(f"Conductivity ({ec} μS/cm)")

    # ── Chemical ──────────────────────────────────────────────────────
    if chemical:
        chem_minor = [
            (chemical.chlorides,     250,  'Chlorides',     'mg/L'),
            (chemical.total_hardness,500,  'Total Hardness','mg/L'),
            (chemical.sodium,        200,  'Sodium',        'mg/L'),
            (chemical.sulphate,      250,  'Sulphate',      'mg/L'),
            (chemical.fluoride,      1.5,  'Fluoride',      'mg/L'),
            (chemical.iron,          0.3,  'Iron',          'mg/L'),
        ]
        for val, limit, name, unit in chem_minor:
            v = _n(val)
            if v is not None and v > limit:
                minor_exceedances.append(f"{name} ({v} {unit})")

        # Nitrate is critical (infant methemoglobinemia)
        nitrate = _n(chemical.nitrate_n)
        if nitrate is not None and nitrate > 10:
            critical_params.append(f"Nitrate-N ({nitrate} mg/L, limit ≤10)")

        nitrite = _n(chemical.nitrite)
        if nitrite is not None and nitrite > 3:
            minor_exceedances.append(f"Nitrite ({nitrite} mg/L)")

    # ── Trace elements ────────────────────────────────────────────────
    if trace:
        trace_critical = [
            (trace.arsenic,  50,    'Arsenic',  'μg/L'),
            (trace.lead,     50,    'Lead',     'μg/L'),
            (trace.cadmium,   5,    'Cadmium',  'μg/L'),
            (trace.chromium, 50,    'Chromium', 'μg/L'),
            (trace.mercury,   0.001,'Mercury',  'mg/L'),
            (trace.selenium, 10,    'Selenium', 'μg/L'),
            (trace.nickel,   20,    'Nickel',   'μg/L'),
        ]
        for val, limit, name, unit in trace_critical:
            v = _n(val)
            if v is not None and v > limit:
                critical_params.append(f"{name} ({v} {unit}, limit ≤{limit})")

        trace_minor = [
            (trace.manganese, 400,  'Manganese', 'μg/L'),
            (trace.copper,   2000,  'Copper',    'μg/L'),
            (trace.zinc,     5000,  'Zinc',      'μg/L'),
            (trace.aluminum,  200,  'Aluminum',  'μg/L'),
        ]
        for val, limit, name, unit in trace_minor:
            v = _n(val)
            if v is not None and v > limit:
                minor_exceedances.append(f"{name} ({v} {unit})")

    # ── Microbiological ───────────────────────────────────────────────
    if microbio:
        micro_fields = [
            (microbio.fecal_coliforms, 'Fecal Coliforms'),
            (microbio.e_coli,          'E. coli'),
            (microbio.total_coliforms, 'Total Coliforms'),
        ]
        for raw, name in micro_fields:
            s = str(raw or '').strip().upper()
            if s == 'TNTC':
                critical_params.append(f"{name} (TNTC)")
            else:
                v = _n(raw)
                if v is not None and v > 0:
                    critical_params.append(f"{name} ({int(v)} CFU/100mL)")

    # ── Build severity dict ───────────────────────────────────────────
    all_exceedances = critical_params + [e for e in minor_exceedances if e not in critical_params]

    if critical_params:
        level = 'UNSAFE'
        n     = len(critical_params)
        subject_prefix = f'UNSAFE — Critical contamination detected ({n} critical parameter{"s" if n > 1 else ""})'
        emoji  = '🚨'
        xpriority = '1'
        importance = 'High'
    elif minor_exceedances:
        level = 'CAUTION'
        n     = len(minor_exceedances)
        subject_prefix = f'CAUTION — {n} parameter{"s" if n > 1 else ""} above limit'
        emoji  = '⚠️'
        xpriority = '2'
        importance = 'High'
    else:
        level = 'SAFE'
        subject_prefix = 'SAFE — All parameters within limits'
        emoji  = '✅'
        xpriority = '3'
        importance = 'Normal'

    return {
        'level':            level,
        'emoji':            emoji,
        'subject_prefix':   subject_prefix,
        'xpriority':        xpriority,
        'importance':       importance,
        'critical_params':  critical_params,
        'minor_exceedances': minor_exceedances,
        'all_exceedances':  all_exceedances,
        'exceedance_count': len(all_exceedances),
    }


def send_report_notification(report_id, is_resend=False):
    """
    Send email notification for an approved water test report.
    Uses Google App Password for Gmail SMTP authentication.
    Returns a dictionary with success status and message.
    """
    print(f"\n{'='*70}")
    print(f"[EMAIL NOTIFICATION] 🚀 Starting email notification service")
    print(f"[EMAIL NOTIFICATION] Report ID: {report_id}")
    print(f"[EMAIL NOTIFICATION] Is resend: {is_resend}")
    print(f"[EMAIL NOTIFICATION] Timestamp: {datetime.utcnow().isoformat()}")
    print(f"{'='*70}")

    try:
        # Get the report with all related data
        report = TestReportMetadata.query.get(report_id)
        if not report:
            print("[EMAIL NOTIFICATION] ❌ ERROR: Report not found!")
            return {'success': False, 'message': 'Report not found'}

        print(f"[EMAIL NOTIFICATION] ✅ Report found: {report.report_serial_no}")

        # Get active alert recipients
        all_recipients = AlertRecipient.query.all()
        print(f"[EMAIL NOTIFICATION] 📊 Total recipients in database: {len(all_recipients)}")
        
        if all_recipients:
            for r in all_recipients:
                status = "✅ ACTIVE" if r.is_active else "❌ INACTIVE"
                print(f"   - {r.name} <{r.email}> [{status}]")
        
        recipients = AlertRecipient.query.filter_by(is_active=True).all()
        
        if not recipients:
            print("[EMAIL NOTIFICATION] ⚠️  WARNING: No active alert recipients configured!")
            print("[EMAIL NOTIFICATION] 📝 To fix:")
            print("[EMAIL NOTIFICATION]    1. Go to Dashboard → Email Notifications & Alert History")
            print("[EMAIL NOTIFICATION]    2. Click 'Add Recipient' button")
            print("[EMAIL NOTIFICATION]    3. Fill in name, email, role")
            print("[EMAIL NOTIFICATION]    4. Check 'Active' checkbox")
            print("[EMAIL NOTIFICATION]    5. Click 'Save Recipient'")
            return {'success': False, 'message': 'No active alert recipients configured'}

        print(f"[EMAIL NOTIFICATION] ✅ Found {len(recipients)} ACTIVE recipient(s):")
        for r in recipients:
            print(f"   ✉️  {r.name} <{r.email}> (Role: {r.role})")

        # Check SMTP configuration
        mail_server = app.config.get('MAIL_SERVER', '')
        mail_port = app.config.get('MAIL_PORT', '')
        mail_username = app.config.get('MAIL_USERNAME', '')
        mail_password = app.config.get('MAIL_PASSWORD', '')
        mail_suppress = app.config.get('MAIL_SUPPRESS_SEND', False)
        
        print(f"\n[EMAIL NOTIFICATION] 🔧 SMTP Configuration:")
        print(f"   Server: {mail_server if mail_server else '❌ NOT SET'}")
        print(f"   Port: {mail_port if mail_port else '❌ NOT SET'}")
        print(f"   Username: {mail_username if mail_username else '❌ NOT SET'}")
        print(f"   Password: {'✅ SET' if mail_password else '❌ NOT SET'}")
        print(f"   TLS Enabled: {app.config.get('MAIL_USE_TLS', False)}")
        print(f"   SSL Enabled: {app.config.get('MAIL_USE_SSL', False)}")
        print(f"   Suppress Send: {mail_suppress} {'(TEST MODE - EMAILS NOT ACTUALLY SENT)' if mail_suppress else ''}")
        
        if mail_suppress:
            print(f"[EMAIL NOTIFICATION] ⚠️  TEST MODE ENABLED - Emails will not be actually sent!")
            print(f"[EMAIL NOTIFICATION] 📝 To disable test mode, set MAIL_SUPPRESS_SEND=False in config.py")
        
        if not all([mail_server, mail_port, mail_username, mail_password]):
            print(f"[EMAIL NOTIFICATION] ❌ ERROR: SMTP not properly configured!")
            print(f"[EMAIL NOTIFICATION] 📝 Update config.py with your SMTP settings")
            return {'success': False, 'message': 'SMTP configuration incomplete'}

        # Build report data for email with formatted test details
        report_data = build_formatted_report_email_data(report)
        print(f"[EMAIL NOTIFICATION] ✅ Report data built successfully")

        # Calculate unsafe percentage for logging
        unsafe_percentage = calculate_unsafe_percentage(report)
        print(f"[EMAIL NOTIFICATION] 📊 Unsafe percentage: {unsafe_percentage}%")

        # ── Severity classification ───────────────────────────────────
        severity = _classify_email_severity(report)
        print(f"[EMAIL NOTIFICATION] 🎯 Severity level: {severity['level']}")
        if severity['critical_params']:
            print(f"[EMAIL NOTIFICATION]    Critical: {', '.join(severity['critical_params'])}")
        if severity['minor_exceedances']:
            print(f"[EMAIL NOTIFICATION]    Minor:    {', '.join(severity['minor_exceedances'])}")

        location_label = f"{report.village}, {report.tehsil}"
        email_subject  = f"{severity['emoji']} {severity['subject_prefix']} — Report {report.report_serial_no}, {location_label}"

        plain_text = (
            f"Water Quality Test Report {report.report_serial_no} | {location_label}\n"
            f"Severity: {severity['level']}\n"
        )
        if severity['critical_params']:
            plain_text += f"Critical parameters exceeded: {', '.join(severity['critical_params'])}\n"
        if severity['minor_exceedances']:
            plain_text += f"Minor exceedances: {', '.join(severity['minor_exceedances'])}\n"
        plain_text += "\nPlease log in to the PRMSC Water Quality Management System to view the full report."

        # Render email HTML with formatted table
        try:
            email_html = render_template(
                'email/water_test_report_formatted.html',
                report=report_data,
                severity=severity,
                is_resend=is_resend
            )
            print(f"[EMAIL NOTIFICATION] ✅ Email HTML rendered ({len(email_html)} characters)")
        except Exception as template_error:
            print(f"[EMAIL NOTIFICATION] ❌ ERROR rendering email template: {template_error}")
            return {'success': False, 'message': f'Failed to render email template: {str(template_error)}'}

        # Create alert history record
        recipient_results = []

        # Send email to each recipient
        print(f"\n[EMAIL NOTIFICATION] 📧 Sending emails to {len(recipients)} recipient(s)...\n")
        for i, recipient in enumerate(recipients, 1):
            print(f"[EMAIL NOTIFICATION] [{i}/{len(recipients)}] Sending to: {recipient.email}...")
            try:
                msg = Message(
                    subject=email_subject,
                    sender=("PRMSC Water Quality System", app.config.get('MAIL_USERNAME')),
                    reply_to=app.config.get('MAIL_USERNAME'),
                    recipients=[recipient.email],
                    html=email_html,
                    body=plain_text
                )
                msg.extra_headers = {
                    'X-Mailer':        'PRMSC-WQMS-Mailer',
                    'X-Priority':      severity['xpriority'],
                    'Importance':      severity['importance'],
                    'Precedence':      'bulk',
                    'List-Unsubscribe': f'<mailto:{app.config.get("MAIL_USERNAME")}?subject=Unsubscribe>',
                    'X-WQMS-Severity': severity['level'],
                }
                mail.send(msg)
                print(f"[EMAIL NOTIFICATION] [{i}/{len(recipients)}] ✅ SUCCESS - Email sent to {recipient.email}")
                recipient_results.append({
                    'email': recipient.email,
                    'name': recipient.name,
                    'status': 'sent',
                    'error_message': None
                })
            except Exception as e:
                error_msg = str(e)
                print(f"[EMAIL NOTIFICATION] [{i}/{len(recipients)}] ❌ FAILED to send to {recipient.email}")
                print(f"[EMAIL NOTIFICATION]     Error: {error_msg}")
                recipient_results.append({
                    'email': recipient.email,
                    'name': recipient.name,
                    'status': 'failed',
                    'error_message': error_msg
                })

        # Determine overall status
        sent_count = sum(1 for r in recipient_results if r['status'] == 'sent')
        total_count = len(recipient_results)

        if sent_count == total_count:
            overall_status = 'sent'
        elif sent_count > 0:
            overall_status = 'partially_sent'
        else:
            overall_status = 'failed'

        # Log summary
        print(f"\n[EMAIL NOTIFICATION] 📋 SUMMARY:")
        print(f"[EMAIL NOTIFICATION]    Successfully sent: {sent_count}/{total_count}")
        print(f"[EMAIL NOTIFICATION]    Overall status: {overall_status.upper()}")
        print(f"[EMAIL NOTIFICATION]    Report ID: {report_id}")
        print(f"[EMAIL NOTIFICATION]    Report Serial: {report.report_serial_no}")

        # Log to alert history
        alert_history = AlertHistory(
            report_id=report_id,
            category=f'{severity["level"]} Report',
            unsafe_percentage=unsafe_percentage,
            status=overall_status,
            sent_at=datetime.utcnow() if sent_count > 0 else None,
            recipients=json.dumps(recipient_results)
        )
        db.session.add(alert_history)
        db.session.commit()
        print(f"[EMAIL NOTIFICATION] ✅ Alert history saved to database (ID: {alert_history.id})")
        print(f"{'='*70}\n")

        return {
            'success': sent_count > 0,
            'message': f'Notification sent to {sent_count}/{total_count} recipients',
            'status': overall_status,
            'recipients': recipient_results
        }

    except Exception as e:
        import traceback
        print(f"[EMAIL NOTIFICATION] ❌ EXCEPTION OCCURRED:")
        print(f"[EMAIL NOTIFICATION]    {str(e)}")
        traceback.print_exc()
        print(f"{'='*70}\n")
        return {'success': False, 'message': str(e)}




def build_formatted_report_email_data(report):
    """
    Build comprehensive report data for formatted email template
    with Test ID, Village, Tehsil, Test Date, Test Type, 
    Physical Quality, Chemical Quality, Trace Elements Quality, 
    Microbial Quality, Remarks, Overall Result, and Status
    Also include parameter details for physical, microbiological,
    chemical and trace element sections depending on `form_type`.
    """
    # Get related data
    physical = report.physical_params
    chemical = report.chemical_params
    trace = report.trace_elements
    microbio = report.microbio_params
    quality = report.quality_assessment

    # Build the main test details table
    # Determine overall result: if any quality is 'UNSAFE' or 'CONTAMINATED', mark as 'UNSAFE', else 'SAFE'
    physical_q = quality.physical_quality.upper() if quality and quality.physical_quality else 'N/A'
    chemical_q = quality.chemical_quality.upper() if quality and quality.chemical_quality else 'N/A'
    microbial_q = quality.microbial_quality.upper() if quality and quality.microbial_quality else 'N/A'
    trace_elements_q = quality.trace_elements_quality.upper() if quality and quality.trace_elements_quality else 'N/A'
    qualities = [physical_q, chemical_q, microbial_q, trace_elements_q]
    if 'UNSAFE' in qualities or 'CONTAMINATED' in qualities:
        overall_result = 'UNSAFE'
    elif all(q == 'SAFE' or q == 'N/A' for q in qualities):
        overall_result = 'SAFE'
    else:
        overall_result = 'UNSAFE'
    test_details = {
        'test_id': report.report_serial_no,
        'village': report.village or 'N/A',
        'tehsil': report.tehsil or 'N/A',
        'test_date': report.sampling_datetime.strftime('%Y-%m-%d') if report.sampling_datetime else 'N/A',
        'test_type': 'Full Parameters' if report.form_type == 'full' else 'Priority Parameters',
        'physical_quality': physical_q,
        'chemical_quality': chemical_q,
        'trace_elements_quality': trace_elements_q,
        'microbial_quality': microbial_q,
        'remarks': quality.remarks if quality and quality.remarks else 'No remarks',
        'overall_result': overall_result,
        'status': 'APPROVED'
    }

    # Additional metadata for context
    data = {
        'test_details': test_details,
        'customer_name': report.customer_name_address or 'N/A',
        'location': report.location or 'N/A',
        'sample_code': report.nwql_sample_code or 'N/A',
        'reporting_date': report.reporting_date.strftime('%Y-%m-%d') if report.reporting_date else 'N/A',
        'form_type': report.form_type,
        
        # Quality assessment summary
        'quality_summary': {
                'physical': quality.physical_quality if quality else 'N/A',
                'chemical': quality.chemical_quality if quality else 'N/A',
                'microbial': quality.microbial_quality if quality else 'N/A',
                'interpretation': (quality.remarks if quality and quality.remarks else 'Sample meets water quality standards')
        }
    }

    # Reuse the richer parameter builder to include parameter detail lists
    try:
        params = build_report_email_data(report)
        for k in ('physical_params', 'microbio_params', 'chemical_params', 'trace_params'):
            if k in params:
                data[k] = params[k]
    except Exception:
        # If something goes wrong, fall back gracefully without breaking the email
        pass

    return data


def build_report_email_data(report):
    """Build comprehensive report data for email template"""

    # Get related data
    physical = report.physical_params
    chemical = report.chemical_params
    trace = report.trace_elements
    microbio = report.microbio_params
    quality = report.quality_assessment

    # Define parameter limits for color coding
    # Column names must match actual model column names
    physical_params_config = [
        {'key': 'ph', 'name': 'pH', 'unit': '', 'limit': (6.5, 8.5), 'limit_type': 'range'},
        {'key': 'electrical_conductivity', 'name': 'Electrical Conductivity', 'unit': 'µS/cm', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'temperature', 'name': 'Temperature', 'unit': '°C', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'color', 'name': 'Color', 'unit': '-', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'odour', 'name': 'Odour', 'unit': '-', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'taste', 'name': 'Taste', 'unit': '-', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'suspended_solids', 'name': 'Suspended Solids', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'total_dissolved_solids', 'name': 'Total Dissolved Solids', 'unit': 'mg/L', 'limit': 1000, 'limit_type': '<='},
        {'key': 'turbidity', 'name': 'Turbidity', 'unit': 'NTU', 'limit': 5, 'limit_type': '<='},
    ]

    chemical_params_config = [
        {'key': 'alkalinity_caco3', 'name': 'Alkalinity (CaCO₃)', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'bicarbonates', 'name': 'Bicarbonates', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'calcium', 'name': 'Calcium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'carbonates', 'name': 'Carbonates', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'chlorides', 'name': 'Chlorides', 'unit': 'mg/L', 'limit': 250, 'limit_type': '<='},
        {'key': 'total_hardness', 'name': 'Total Hardness', 'unit': 'mg/L', 'limit': 500, 'limit_type': '<='},
        {'key': 'magnesium', 'name': 'Magnesium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'potassium', 'name': 'Potassium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'sodium', 'name': 'Sodium', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'sulphate', 'name': 'Sulphate', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'nitrate_n', 'name': 'Nitrate (N)', 'unit': 'mg/L', 'limit': 50, 'limit_type': '<='},
        {'key': 'nitrite', 'name': 'Nitrite', 'unit': 'mg/L', 'limit': 3, 'limit_type': '<='},
        {'key': 'tds', 'name': 'TDS', 'unit': 'mg/L', 'limit': 1000, 'limit_type': '<='},
        {'key': 'iron', 'name': 'Iron', 'unit': 'mg/L', 'limit': 0.3, 'limit_type': '<='},
        {'key': 'fluoride', 'name': 'Fluoride', 'unit': 'mg/L', 'limit': 1.5, 'limit_type': '<='},
        {'key': 'phosphate', 'name': 'Phosphate', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    ]

    trace_params_config = [
        {'key': 'aluminum', 'name': 'Aluminum', 'unit': 'μg/L', 'limit': 200, 'limit_type': '<='},
        {'key': 'arsenic', 'name': 'Arsenic', 'unit': 'μg/L', 'limit': 50, 'limit_type': '<='},
        {'key': 'barium', 'name': 'Barium', 'unit': 'μg/L', 'limit': 700, 'limit_type': '<='},
        {'key': 'cadmium', 'name': 'Cadmium', 'unit': 'μg/L', 'limit': 10, 'limit_type': '<='},
        {'key': 'chromium', 'name': 'Chromium', 'unit': 'μg/L', 'limit': 50, 'limit_type': '<='},
        {'key': 'copper', 'name': 'Copper', 'unit': 'μg/L', 'limit': 2000, 'limit_type': '<='},
        {'key': 'manganese', 'name': 'Manganese', 'unit': 'μg/L', 'limit': 500, 'limit_type': '<='},
        {'key': 'molybdenum', 'name': 'Molybdenum', 'unit': 'μg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'nickel', 'name': 'Nickel', 'unit': 'μg/L', 'limit': 20, 'limit_type': '<='},
        {'key': 'lead', 'name': 'Lead', 'unit': 'μg/L', 'limit': 50, 'limit_type': '<='},
        {'key': 'selenium', 'name': 'Selenium', 'unit': 'μg/L', 'limit': 10, 'limit_type': '<='},
        {'key': 'strontium', 'name': 'Strontium', 'unit': 'μg/L', 'limit': None, 'limit_type': 'NGVS'},
        {'key': 'zinc', 'name': 'Zinc', 'unit': 'μg/L', 'limit': 5000, 'limit_type': '<='},
        {'key': 'boron', 'name': 'Boron', 'unit': 'mg/L', 'limit': 0.3, 'limit_type': '<='},
        {'key': 'antimony', 'name': 'Antimony', 'unit': 'mg/L', 'limit': 0.005, 'limit_type': '<='},
        {'key': 'mercury', 'name': 'Mercury', 'unit': 'mg/L', 'limit': 0.001, 'limit_type': '<='},
        {'key': 'cyanide', 'name': 'Cyanide', 'unit': 'mg/L', 'limit': 0.05, 'limit_type': '<'},
        {'key': 'silica', 'name': 'Silica', 'unit': 'mg/L', 'limit': None, 'limit_type': 'NGVS'},
    ]

    microbio_params_config = [
        {'key': 'total_coliforms', 'name': 'Total Coliforms', 'unit': 'CFU/100mL', 'limit': 0, 'limit_type': '<'},
        {'key': 'fecal_coliforms', 'name': 'Fecal Coliforms', 'unit': 'CFU/100mL', 'limit': 0, 'limit_type': '<'},
        {'key': 'e_coli', 'name': 'E. coli', 'unit': 'CFU/100mL', 'limit': 0, 'limit_type': '<'},
    ]

    def get_param_with_status(obj, config):
        """Get parameter value with compliance status"""
        results = []
        for param in config:
            key = param['key']
            value = getattr(obj, key, None) if obj else None

            # Try to convert to float only for numeric limits
            numeric_value = None
            if value is not None:
                try:
                    numeric_value = float(value)
                except (ValueError, TypeError):
                    # Value is not numeric (e.g., 'non-objectionable')
                    numeric_value = None

            # Determine status
            status = 'safe'  # Default
            if value is None:
                status = 'no_data'
            elif param['limit_type'] == 'NGVS':
                status = 'ngvs'
            elif param['key'] in ['color', 'odour', 'taste']:
                # Handle objectionable/unobjectionable for sensory parameters (exact match)
                v = str(value).strip().lower() if value is not None else ''
                if v in ('', '-', 'none'):
                    status = 'ngvs'
                elif v in ('objectionable',):
                    status = 'unsafe'
                elif v in ('non-objectionable', 'unobj', 'acceptable', 'colorless'):
                    status = 'safe'
                else:
                    status = 'ngvs'
            elif numeric_value is not None:
                # Special logic for microbiological: 0 = safe, >0 = unsafe
                if param['unit'] == 'CFU/100mL':
                    if numeric_value == 0:
                        status = 'safe'
                    elif numeric_value > 0:
                        status = 'unsafe'
                elif param['limit_type'] == 'range':
                    low, high = param['limit']
                    if numeric_value < low or numeric_value > high:
                        status = 'unsafe'
                elif param['limit_type'] == '<':
                    if numeric_value >= param['limit']:
                        status = 'unsafe'
                else:  # <=
                    if numeric_value > param['limit']:
                        status = 'unsafe'
            results.append({
                'name': param['name'],
                'value': value,  # Keep original value (numeric or string)
                'unit': param['unit'],
                'limit': param['limit'],
                'limit_type': param['limit_type'],
                'status': status
            })
        return results

    # Build data structure
    data = {
        'report_serial_no': report.report_serial_no,
        'customer_name_address': report.customer_name_address,
        'nwql_sample_code': report.nwql_sample_code,
        'sampling_datetime': report.sampling_datetime.strftime('%Y-%m-%d %H:%M') if report.sampling_datetime else 'N/A',
        'reporting_date': report.reporting_date.strftime('%Y-%m-%d') if report.reporting_date else 'N/A',
        'form_type': report.form_type,
        'form_type_display': 'Full Parameters' if report.form_type == 'full' else 'Priority Parameters',
        'sample_type': report.sample_type or 'N/A',
        'location': report.location or 'N/A',
        'tehsil': report.tehsil or 'N/A',
        'village': report.village or 'N/A',
        'settlement': report.settlement or 'N/A',

        # Quality Assessment
        'physical_quality': quality.physical_quality if quality else 'N/A',
        'chemical_quality': quality.chemical_quality if quality else 'N/A',
        'microbial_quality': quality.microbial_quality if quality else 'N/A',
        'overall_result': ('APPROVED' if getattr(report, 'status', '').lower() == 'approved' else 'N/A'),
        'interpretation': (quality.remarks if quality and quality.remarks else 'N/A'),
        'remarks': quality.remarks if quality and quality.remarks else '',

        # Parameter sections
        'physical_params': get_param_with_status(physical, physical_params_config),
        'microbio_params': get_param_with_status(microbio, microbio_params_config),
    }

    # Add chemical and trace elements only for full reports
    if report.form_type == 'full':
        data['chemical_params'] = get_param_with_status(chemical, chemical_params_config)
        data['trace_params'] = get_param_with_status(trace, trace_params_config)

    return data


def calculate_unsafe_percentage(report):
    """Calculate percentage of parameters exceeding limits"""
    try:
        quality = report.quality_assessment
        if not quality:
            return 0

        unsafe_count = 0
        total_count = 0

        # Count quality categories
        if quality.physical_quality:
            total_count += 1
            if quality.physical_quality != 'safe':
                unsafe_count += 1

        if quality.microbial_quality:
            total_count += 1
            if quality.microbial_quality != 'safe':
                unsafe_count += 1

        if report.form_type == 'full' and quality.chemical_quality:
            total_count += 1
            if quality.chemical_quality != 'safe':
                unsafe_count += 1

        if total_count == 0:
            return 0

        return round((unsafe_count / total_count) * 100, 1)
    except Exception:
        return 0
        
with app.app_context():
        db.create_all()
        # Auto-migration: add report_category column if it doesn't exist
        try:
            import sqlite3 as _sqlite3
            _db_path = os.path.join(app.instance_path, 'water_quality.db')
            _conn = _sqlite3.connect(_db_path)
            _cur = _conn.cursor()
            _cur.execute("PRAGMA table_info(test_report_metadata)")
            _cols = [row[1] for row in _cur.fetchall()]
            if 'report_category' not in _cols:
                _cur.execute("ALTER TABLE test_report_metadata ADD COLUMN report_category VARCHAR(20) DEFAULT 'pcrwr_report'")
                _conn.commit()
                print('[MIGRATION] Added report_category column to test_report_metadata')
            # Normalise legacy 'pcrwr' values to 'pcrwr_report'
            _cur.execute("UPDATE test_report_metadata SET report_category = 'pcrwr_report' WHERE report_category = 'pcrwr' OR report_category IS NULL")
            _conn.commit()
            _conn.close()
            _report_category_col_exists = True
        except Exception as _me:
            print(f'[MIGRATION] report_category migration skipped: {_me}')

# ==================== MAIN ====================

if __name__ == '__main__':
    
    app.run(debug=True, host='0.0.0.0', port=5000)

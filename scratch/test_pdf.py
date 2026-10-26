import sys
import os

# Adjust path if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db, TestReportMetadata
from io import BytesIO
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Image as RLImage
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

def test_pdf_generation():
    with app.app_context():
        # Get one report
        report = TestReportMetadata.query.first()
        if not report:
            print("No reports found in the database to test with.")
            return
            
        print(f"Testing PDF generation for report ID: {report.report_id}")
        
        # 1. Test standard download-pdf logic style header
        styles = getSampleStyleSheet()
        logo_gop_path = os.path.join(app.static_folder, 'images', 'GOP Logo (1).png')
        logo_prmsc_path = os.path.join(app.static_folder, 'images', 'PRMSC Logo PSD (1).png')
        
        logo_gop_elem = RLImage(logo_gop_path, width=65, height=65) if os.path.exists(logo_gop_path) else Paragraph('', styles['Normal'])
        logo_prmsc_elem = RLImage(logo_prmsc_path, width=65, height=65) if os.path.exists(logo_prmsc_path) else Paragraph('', styles['Normal'])
        
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
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        doc.build([t_header])
        print("Successfully built test PDF matching download-pdf header!")
        
        # 2. Test download-pdf-v2 logic style header
        org_name_style_v2 = ParagraphStyle(
            'OrgNameV2', parent=styles['Normal'],
            fontSize=17, fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1e3c72'),
            alignment=TA_CENTER, spaceAfter=4
        )

        center_col_v2 = [
            Paragraph('Punjab Rural Municipal Services Company', org_name_style_v2),
        ]

        t_header_v2 = Table([[logo_gop_elem, center_col_v2, logo_prmsc_elem]], colWidths=[80, 370, 80])
        t_header_v2.setStyle(TableStyle([
            ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('LINEBELOW',     (0, 0), (-1,  0), 1.2, colors.HexColor('#1e3c72')),
            ('TOPPADDING',    (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        buffer_v2 = BytesIO()
        doc_v2 = SimpleDocTemplate(buffer_v2, pagesize=A4)
        doc_v2.build([t_header_v2])
        print("Successfully built test PDF matching download-pdf-v2 header!")

if __name__ == '__main__':
    test_pdf_generation()

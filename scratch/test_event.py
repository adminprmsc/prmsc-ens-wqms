import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db, TestReportMetadata, PhysicalAestheticParameters
from sqlalchemy.orm import Session
from sqlalchemy import event

def has_test_report_metadata(selectables):
    for s in selectables:
        # Check if it has left/right (Join object)
        if hasattr(s, 'left') and hasattr(s, 'right'):
            if has_test_report_metadata([s.left, s.right]):
                return True
        # Check if it has name (Table object)
        elif hasattr(s, 'name') and s.name == 'test_report_metadata':
            return True
        # In case it's a Mapper or AliasedClass, check description/class_ or similar
        elif hasattr(s, 'description') and s.description == 'test_report_metadata':
            return True
    return False

@event.listens_for(Session, "do_orm_execute")
def do_orm_execute(orm_execute_state):
    if orm_execute_state.is_select:
        statement = orm_execute_state.statement
        froms = statement.get_final_froms()
        if has_test_report_metadata(froms):
            print("[EVENT DETECTED] Adding filter to statement...")
            # Modify query statement!
            orm_execute_state.statement = statement.where(TestReportMetadata.report_serial_no != 'DUMMY')

with app.app_context():
    print("--- Query with join ---")
    q = db.session.query(PhysicalAestheticParameters).join(
        TestReportMetadata,
        TestReportMetadata.report_id == PhysicalAestheticParameters.report_id
    )
    # Print compilation
    print("Compiled SQL:", q)

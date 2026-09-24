from database import SessionLocal, engine, Base
from models import User
from sqlalchemy.orm import Session

# Ensure tables are created
Base.metadata.create_all(bind=engine)

def seed_users():
    db: Session = SessionLocal()
    
    # Check if users already exist
    existing_mobile = db.query(User).filter(User.mobile == "+91 9876543210").first()
    if not existing_mobile:
        user1 = User(name="Mobile User", mobile="+91 9876543210", role="citizen")
        db.add(user1)
        print("Seeded mobile user")

    existing_email = db.query(User).filter(User.email == "rahul.sharma@example.com").first()
    if not existing_email:
        user2 = User(name="Email User", email="rahul.sharma@example.com", role="citizen")
        db.add(user2)
        print("Seeded email user")

    db.commit()
    db.close()
    print("Seeding complete.")

if __name__ == "__main__":
    seed_users()

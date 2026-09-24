from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, index=True)
    mobile = Column(String(20), unique=True, index=True, nullable=True)
    email = Column(String(120), unique=True, index=True, nullable=True)
    name = Column(String(100), nullable=True)
    role = Column(String(50), default='citizen')

    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f'<User {self.mobile or self.email}>'

class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(500), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False)

    user = relationship("User", back_populates="refresh_tokens")

    def __repr__(self):
        return f'<RefreshToken {self.id}>'

class Otp(Base):
    __tablename__ = 'otps'

    id = Column(Integer, primary_key=True, index=True)
    target = Column(String(120), index=True, nullable=False) # mobile or email
    code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)

    def __repr__(self):
        return f'<Otp {self.target}>'

class Complaint(Base):
    __tablename__ = 'complaints'

    id = Column(Integer, primary_key=True, index=True)
    generated_id = Column(String(50), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    department = Column(String(100), nullable=False)
    category = Column(String(100), nullable=False)
    priority = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(String(1000), nullable=False)
    
    country = Column(String(100))
    state = Column(String(100))
    district = Column(String(100))
    city = Column(String(100))
    area = Column(String(100))
    additional_details = Column(String(500))
    
    status = Column(String(50), default="Submitted")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="complaints")
    attachments = relationship("ComplaintAttachment", back_populates="complaint", cascade="all, delete-orphan")

    def __repr__(self):
        return f'<Complaint {self.generated_id}>'

class ComplaintAttachment(Base):
    __tablename__ = 'complaint_attachments'

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey('complaints.id'), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50))
    file_name = Column(String(200))

    complaint = relationship("Complaint", back_populates="attachments")

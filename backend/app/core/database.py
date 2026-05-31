from sqlalchemy import create_engine

from sqlalchemy.ext.declarative import declarative_base

from sqlalchemy.orm import sessionmaker

from app.core.config import settings


# =========================================
# DATABASE ENGINE
# =========================================

engine = create_engine(

    settings.DATABASE_URL,

    connect_args={
        "check_same_thread": False
    } if "sqlite" in settings.DATABASE_URL else {}
)


# =========================================
# SESSION
# =========================================

SessionLocal = sessionmaker(

    autocommit=False,

    autoflush=False,

    bind=engine
)


# =========================================
# BASE
# =========================================

Base = declarative_base()


# =========================================
# DATABASE DEPENDENCY
# =========================================

def get_db():

    db = SessionLocal()

    try:

        yield db

    finally:

        db.close()

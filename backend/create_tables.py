from app.core.database import Base
from app.core.database import engine

from app.models import *


Base.metadata.create_all(bind=engine)

print("Database tables created successfully")
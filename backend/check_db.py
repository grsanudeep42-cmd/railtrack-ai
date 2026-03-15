import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from models import User
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/railtrack")

async def main():
    engine = create_async_engine(DATABASE_URL)
    session_maker = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with session_maker() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        for u in users:
            print(f"User: {u.id} | Email: {u.email} | Google ID: {u.google_id} | Active: {u.is_active}")

asyncio.run(main())

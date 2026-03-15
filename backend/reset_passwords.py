import asyncio
from database import AsyncSessionLocal
from models import User
from auth_utils import get_password_hash
from sqlalchemy import update

async def reset():
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).values(hashed_password=get_password_hash('demo1234')))
        await db.commit()
        print('Passwords reset!')

asyncio.run(reset())


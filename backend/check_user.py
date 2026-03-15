import asyncio
from database import AsyncSessionLocal
from models import User
from sqlalchemy import select
from auth_utils import verify_password

async def check():
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.email == 'controller@demo.rail'))
        u = r.scalar_one_or_none()
        if u:
            print('Found user:', u.email)
            print('Password check:', verify_password('demo1234', u.hashed_password))
        else:
            print('User NOT found')

asyncio.run(check())

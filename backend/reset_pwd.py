import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:anudeep123@localhost:5432/railtrack')
    async with AsyncSession(engine) as session:
        await session.execute(text("UPDATE users SET role = 'ADMIN' WHERE email = 'grsanudeep42@gmail.com'"))
        await session.commit()
        print('Role successfully promoted to ADMIN')

asyncio.run(main())

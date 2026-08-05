import asyncio
from app.core.config import settings
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    try:
        async with engine.begin() as conn:
            res = await conn.execute('select 1')
            print('result=', res.scalar())
    except Exception as e:
        print('ERROR', repr(e))
    finally:
        await engine.dispose()

asyncio.run(main())

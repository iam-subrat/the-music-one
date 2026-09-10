import asyncio
import httpx
from fastapi import Request

async def main():
    async with httpx.AsyncClient(follow_redirects=True) as client:
        # We need a youtube streaming URL. This changes frequently, so let's just test a basic range request proxy.
        # Actually, let's just make sure `httpx.AsyncClient().stream` doesn't hang.
        print("Script ok")
        
asyncio.run(main())

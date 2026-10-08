import asyncio
import websockets
import sounddevice as sd
import json

# Audio configuration matching what Deepgram expects
SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = 'int16'
CHUNK_SIZE = 4096 

async def audio_sender(ws):
    loop = asyncio.get_event_loop()
    audio_queue = asyncio.Queue()

    def audio_callback(indata, frames, time, status):
        if status:
            print(f"Audio Error: {status}")
        # Put the raw bytes of the audio into the queue
        loop.call_soon_threadsafe(audio_queue.put_nowait, bytes(indata))

    print("\n🎙️  Recording... Speak into your mic! (Press Ctrl+C to stop)")
    
    # Start capturing audio from the laptop mic
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype=DTYPE, blocksize=CHUNK_SIZE, callback=audio_callback):
        while True:
            chunk = await audio_queue.get()
            await ws.send(chunk)

async def message_receiver(ws):
    async for message in ws:
        data = json.loads(message)
        
        if data.get("is_final"):
            # Clear the partial line
            print("\r" + " " * 80 + "\r", end="")
            print(f"🗣️  [English]: {data.get('original_text')}")
            print(f"🌐  [Hindi]  : {data.get('translated_text')}\n")
        else:
            # Print partials on the same line to show speed
            print(f"\r⏳ [Partial]: {data.get('original_text')}...", end="", flush=True)

async def main():
    uri = "ws://localhost:8000/ws/translate"
    try:
        async with websockets.connect(uri) as ws:
            print("✅ Connected to Backend WebSocket Server!")
            # Run the microphone sender and the translation receiver at the same time
            await asyncio.gather(
                audio_sender(ws),
                message_receiver(ws)
            )
    except ConnectionRefusedError:
        print("❌ Could not connect. Make sure server.py is running in another terminal first!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")

"""Jev's selected ElevenLabs voice. Credentials and bounded audio cache stay here."""

import asyncio
from collections import OrderedDict

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator

JEV_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh"
MAX_AUDIO_BYTES = 2 * 1024 * 1024


class JevVoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=480)

    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        value = " ".join(value.split())
        if not value:
            raise ValueError("Text must not be blank")
        return value


class JevVoiceSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    voice_id: str = Field(pattern=r"^[A-Za-z0-9]{1,64}$")


class ElevenLabsUnavailable(Exception):
    pass


class ElevenLabsVoice:
    def __init__(self, client=None, api_key=None):
        self.client = client
        self.api_key = api_key
        self.voice_id = JEV_VOICE_ID
        self.model = "eleven_multilingual_v2"
        self.lock = asyncio.Lock()
        self.cache = OrderedDict()
        self.revision = 0

    def set_key(self, key):
        self.api_key = key
        self.revision += 1
        self.cache.clear()

    def set_voice(self, voice_id):
        self.voice_id = voice_id
        self.revision += 1
        self.cache.clear()

    async def speak(self, packet):
        if not self.api_key or self.client is None:
            raise ElevenLabsUnavailable("Add your ElevenLabs API key in Settings")
        if self.lock.locked():
            raise ElevenLabsUnavailable("Voice is busy; replay shortly")
        async with self.lock:
            if packet.text in self.cache:
                self.cache.move_to_end(packet.text)
                return self.cache[packet.text]
            revision = self.revision
            try:
                async with asyncio.timeout(18):
                    async with self.client.stream(
                        "POST",
                        f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}",
                        params={"output_format": "mp3_44100_128"},
                        headers={"xi-api-key": self.api_key},
                        json={"text": packet.text, "model_id": self.model},
                        timeout=17,
                    ) as response:
                        if response.status_code != 200:
                            raise ElevenLabsUnavailable(
                                "Check your ElevenLabs key and access to Jev's selected voice"
                            )
                        if "audio/mpeg" not in response.headers.get("content-type", ""):
                            raise ElevenLabsUnavailable("Voice returned invalid audio")
                        audio = bytearray()
                        async for chunk in response.aiter_bytes():
                            audio.extend(chunk)
                            if len(audio) > MAX_AUDIO_BYTES:
                                raise ElevenLabsUnavailable("Voice exceeded the audio limit")
                if not audio or revision != self.revision:
                    raise ElevenLabsUnavailable("Voice settings changed; replay the line")
            except (httpx.HTTPError, TimeoutError):
                raise ElevenLabsUnavailable("ElevenLabs is unavailable; replay shortly") from None
            result = bytes(audio)
            self.cache[packet.text] = result
            # At most eight lines and 8 MiB, independent of dialogue history.
            while len(self.cache) > 8 or sum(map(len, self.cache.values())) > 8 * 1024 * 1024:
                self.cache.popitem(last=False)
            return result

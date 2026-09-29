from pathlib import Path

root = Path(__file__).parent
payload = (root / "voice_sample.pcm").read_bytes()
lines = [
    "#pragma once",
    "#include <Arduino.h>",
    "// 24 kHz, 16-bit little-endian, stereo. Both channels contain the same voice.",
    "const uint8_t voice_sample_pcm[] PROGMEM = {",
]
for offset in range(0, len(payload), 24):
    block = payload[offset : offset + 24]
    lines.append("  " + ", ".join(f"0x{byte:02x}" for byte in block) + ",")
lines += ["};", f"constexpr size_t voice_sample_pcm_size = {len(payload)};", ""]
(root / "voice_sample_pcm.h").write_text("\n".join(lines), encoding="ascii")

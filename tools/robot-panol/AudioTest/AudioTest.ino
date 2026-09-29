#include <Arduino.h>
#include <ESP_I2S.h>
#include "voice_sample_pcm.h"

// Prueba temporal del MAX98357A: reemplaza el firmware del robot hasta
// volver a cargar KlasePanol. Muestra generica de voz neural argentina.
I2SClass audio;
constexpr int PIN_BCLK = 5;
constexpr int PIN_LRC = 4;
constexpr int PIN_DIN = 6;
constexpr int PIN_SD = 16;
constexpr uint32_t SAMPLE_RATE = 24000;

void playVoice() {
  constexpr size_t chunkSize = 1024;
  for (size_t offset = 0; offset < voice_sample_pcm_size; offset += chunkSize) {
    size_t length = min(chunkSize, voice_sample_pcm_size - offset);
    audio.write(voice_sample_pcm + offset, length);
  }
  const uint8_t silence[1024] = {};
  audio.write(silence, sizeof(silence));
}

void setup() {
  Serial0.begin(115200);
  pinMode(PIN_SD, OUTPUT);
  digitalWrite(PIN_SD, HIGH); // Habilita el MAX98357A para esta prueba.
  delay(20);
  audio.setPins(PIN_BCLK, PIN_LRC, PIN_DIN);
  if (!audio.begin(I2S_MODE_STD, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
    Serial0.println("AUDIO_TEST_ERROR: no se pudo iniciar I2S");
    while (true) delay(1000);
  }
  Serial0.println("AUDIO_TEST_READY: frase de voz cada 3 segundos");
}

void loop() {
  Serial0.println("AUDIO_TEST_VOICE");
  playVoice();
  delay(3000);
}

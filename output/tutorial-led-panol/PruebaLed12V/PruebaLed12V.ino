#include <Arduino.h>

// Solo para módulo con señal compatible con 3,3 V y selector en H / HIGH.
// Prueba independiente: cargarla sustituye el firmware de la carita.
constexpr uint8_t RELAY_PIN = 17;
constexpr uint32_t MAX_ON_MS = 3000;
bool encendido = false;
uint32_t inicio = 0;

void apagar() {
  digitalWrite(RELAY_PIN, LOW);
  encendido = false;
  Serial.println("LED apagado");
}

void setup() {
  digitalWrite(RELAY_PIN, LOW);
  pinMode(RELAY_PIN, OUTPUT);
  Serial.begin(115200);
  // No esperamos al monitor: en el cargador también debe arrancar apagado.
}

void loop() {
  while (Serial.available()) {
    const char orden = Serial.read();
    if (orden == '1') {
      inicio = millis();
      encendido = true;
      digitalWrite(RELAY_PIN, HIGH);
      Serial.println("LED encendido durante 3 segundos");
    } else if (orden == '0') {
      apagar();
    }
  }
  if (encendido && millis() - inicio >= MAX_ON_MS) apagar();
  delay(5);
}

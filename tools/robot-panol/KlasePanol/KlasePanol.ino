#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <NetworkClientSecure.h>
#include <ESP_I2S.h>
#include "esp_http_client.h"
#include "esp_adc/adc_continuous.h"
#include "cloud_ca.h"
#include "logo.h"

/* Robot del pañol.
   - Avisos de ingreso (feed de panol_robot_feed).
   - Voz: mantener apretado el botón graba (hasta 8 s); al soltar manda el WAV
     a la edge function robot-panol-voz, que contesta con texto y voz.
   - Pedido de consumibles: se dicta por voz; se manda a compras recién con
     doble toque cuando la pantalla lo pide.
   La red corre en su propia tarea: la cara y el botón no se traban mientras
   consulta. El micrófono se lee por DMA (ADC continuo) en otra tarea.
   La pantalla se dibuja entera en memoria (PSRAM) y se manda de una: no quedan
   restos de lo anterior. */

Adafruit_ILI9341 tft(&SPI, 9, 10, 8);
constexpr uint32_t TFT_HZ = 20000000;  // con cables largos, bajar a 10 MHz
Preferences prefs;
constexpr uint8_t BUTTON = 7;
constexpr uint8_t AMP_LRC = 4, AMP_BCLK = 5, AMP_DIN = 6, AMP_SD = 16;
constexpr uint32_t AUDIO_RATE = 24000;           // I2S y voz de la respuesta (PCM 24 kHz)
constexpr uint32_t MIC_HZ = 16000;               // grabación
constexpr uint32_t MAX_GRABACION_S = 8;
constexpr size_t MAX_MUESTRAS = MIC_HZ * MAX_GRABACION_S;
constexpr size_t MAX_RESPUESTA = AUDIO_RATE * 2 * 40; // hasta 40 s de voz
constexpr uint32_t CONFIRMAR_MS = 55000;
I2SClass audio;
TaskHandle_t audioTaskHandle = nullptr;
volatile bool audioReady = false;

// Paleta (RGB565), la misma familia que la app: fondo azul noche, acentos
// azul/cian/violeta, verde para "bien" y rojo para "atención". Sin ámbar.
constexpr uint16_t FONDO=0x0863, PANEL=0x10E5, LINEA=0x2189, AZUL=0x5D5F, CIAN=0x4EBD, VIOLETA=0xA3DF,
                   VERDE=0x3EF0, ROJO=0xFACB, BLANCO=0xFFFF, GRIS=0x8CB5, CLARO=0xC67B;

// ─── Micrófono (ADC continuo) ───
uint8_t *wav = nullptr;          // 44 bytes de cabecera + muestras, en PSRAM
int16_t *grabacion = nullptr;
volatile size_t grabadas = 0;
volatile bool grabando = false;
uint32_t localHasta = 0;
bool grabacionLocal = false;
uint32_t lastMicDiag = 0;
volatile uint8_t micLevel = 0;
volatile uint32_t micPico = 0;
volatile uint16_t micRawMin = 0, micRawMax = 0;  // lectura cruda del ADC en la última ventana
float micDc = 2048.0f;
// El MAX9814 deja su salida en ~1,25 V (≈1500 cuentas). Si queda muy lejos,
// el micrófono no está bien alimentado o no está conectado a GPIO1.
bool micSano() { return micDc > 1000.0f && micDc < 2600.0f; }

// ─── Respuesta hablada ───
uint8_t *respuestaPcm = nullptr; // PSRAM
volatile size_t respuestaLen = 0;
volatile bool reproduciendo = false, cortarVoz = false;

// ─── Avisos ───
struct Notice { String id,title,obra,sede,detail; int items; bool urgent; };
Notice notices[20];
int count=0,total=0,urgent=0,page=-1;
String state="login",serialLine;
String cloudUrl,cloudKey,deviceId,deviceToken,funcionesUrl,sedeRobot="Chubut";
String knownIds[20],unseenIds[20];
int knownCount=0,unseenCount=0,cloudOffset=0,detailPage=0;
volatile bool cloudPollNeeded=false;
volatile bool networkTestNeeded=false;
uint32_t lastFeed=0,lastInteraction=0,lastFrame=0,pressedAt=0,lastRawChange=0,wifiAttemptAt=0;
int raw=HIGH,stable=HIGH;
bool held=false,dirty=true,wifiRequested=false,wifiWasConnected=false;
volatile uint32_t buttonEdges=0;
void IRAM_ATTR buttonChanged() { buttonEdges++; }
uint32_t lastDiag=0,toqueEnEspera=0,felizHasta=0;
volatile int lastCloudCode=0; volatile uint32_t lastCloudFeed=0;
volatile uint8_t wifiMotivo=0; // último motivo de desconexión (wifi_err_reason_t); 0 = conectado
String motivoWifi(uint8_t m) {
  switch(m) {
    case 0: return "";
    case 2: case 15: case 202: case 204: return "REVISAR LA CLAVE DEL WI-FI";
    case 201: return "NO VEO ESA RED WI-FI";
    case 210: case 211: return "LA RED PIDE OTRA SEGURIDAD";
    case 205: return "EL ROUTER RECHAZO LA CONEXION";
    default: return "WI-FI SIN CONECTAR (" + String(m) + ")";
  }
}

// ─── Voz: estado de pantalla ───
enum ModoVoz { V_NADA, V_ESCUCHA, V_PIENSA, V_RESPUESTA, V_CONFIRMAR };
ModoVoz modoVoz = V_NADA;
String respuestaTexto, respuestaOido;
uint32_t modoDesde = 0, confirmarHasta = 0, paginaDesde = 0;
int paginaRespuesta = 0, paginasRespuesta = 1;

// ─── Intercambio con la tarea de red ───
enum PedidoRed { R_NADA, R_VOZ, R_CONFIRMAR };
volatile PedidoRed pedidoRed = R_NADA;
SemaphoreHandle_t cerrojo;
String feedPendiente; bool hayFeed=false; bool noAutorizado=false;
struct Contestacion { String texto, oido; bool confirmar; int status; size_t pcm; bool lista; bool eraConfirmacion; } contestacion;

// ════════════════════════════════════════════════════════════════
// Audio de salida
// ════════════════════════════════════════════════════════════════
volatile int16_t audioTestAmplitude = 3200;
void playChime(int16_t amplitude = 1600) {
  // Aviso sin palabras: dos notas suaves; la prueba permite variar el nivel.
  for (int note = 0; note < 2; note++) {
    const float frequency = note ? 880.0f : 660.0f;
    for (int start = 0; start < 3600; start += 128) {
      int16_t samples[256] = {};
      int frames = min(128, 3600 - start);
      for (int i = 0; i < frames; i++) {
        int position = start + i;
        float envelope = min(1.0f, position / 360.0f) * min(1.0f, (3600 - position) / 720.0f);
        int16_t value = (int16_t)(amplitude * envelope * sinf(2.0f * PI * frequency * position / AUDIO_RATE));
        samples[2 * i] = samples[2 * i + 1] = value;
      }
      audio.write((uint8_t *)samples, frames * 4);
    }
    const uint8_t pause[1024] = {};
    audio.write(pause, sizeof(pause));
  }
}
volatile uint16_t vozNivel = 0;   // volumen de lo que está diciendo: mueve la boca
void playRespuesta() {
  // La voz llega mono a 24 kHz; el I2S está en estéreo: se duplica el canal.
  reproduciendo = true; cortarVoz = false;
  const int16_t *mono = (const int16_t *)respuestaPcm;
  const size_t muestras = respuestaLen / 2;
  int16_t estereo[512];
  for (size_t i = 0; i < muestras && !cortarVoz; i += 256) {
    size_t k = min((size_t)256, muestras - i);
    uint16_t pico = 0;
    for (size_t j = 0; j < k; j++) { estereo[2 * j] = estereo[2 * j + 1] = mono[i + j]; pico = max(pico, (uint16_t)abs(mono[i + j])); }
    vozNivel = pico;
    audio.write((uint8_t *)estereo, k * 4);
  }
  vozNivel = 0;
  reproduciendo = false;
}
void audioWorker(void *) {
  pinMode(AMP_SD, OUTPUT);
  digitalWrite(AMP_SD, HIGH);
  audio.setPins(AMP_BCLK, AMP_LRC, AMP_DIN);
  if (!audio.begin(I2S_MODE_STD, AUDIO_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
    Serial0.println("KLASE_AUDIO_ERROR");
    vTaskDelete(nullptr);
  }
  audioReady = true;
  Serial0.println("KLASE_AUDIO_READY");
  while (true) {
    uint32_t event = 0;
    xTaskNotifyWait(0, UINT32_MAX, &event, portMAX_DELAY);
    if (event == 2) playChime();
    else if (event == 4) {
      playChime(audioTestAmplitude);
      Serial0.println("KLASE_AUDIO_TEST_DONE");
    }
    else if (event == 3 && respuestaPcm && respuestaLen) playRespuesta();
    const uint8_t silence[1024] = {};
    audio.write(silence, sizeof(silence));
  }
}
void requestAudio(uint32_t event) {
  if (audioReady && audioTaskHandle) xTaskNotify(audioTaskHandle, event, eSetValueWithOverwrite);
}

// ════════════════════════════════════════════════════════════════
// Micrófono: MAX9814 en GPIO1 (ADC1 canal 0), 16 kHz por DMA
// ════════════════════════════════════════════════════════════════
void micWorker(void *) {
  adc_continuous_handle_t adc = nullptr;
  adc_continuous_handle_cfg_t h = {};
  h.max_store_buf_size = 4096;
  h.conv_frame_size = 512;
  adc_digi_pattern_config_t patron = {};
  patron.atten = ADC_ATTEN_DB_12;
  patron.channel = ADC_CHANNEL_0;
  patron.unit = ADC_UNIT_1;
  patron.bit_width = SOC_ADC_DIGI_MAX_BITWIDTH;
  adc_continuous_config_t c = {};
  c.pattern_num = 1;
  c.adc_pattern = &patron;
  c.sample_freq_hz = MIC_HZ;
  c.conv_mode = ADC_CONV_SINGLE_UNIT_1;
  c.format = ADC_DIGI_OUTPUT_FORMAT_TYPE2;
  if (adc_continuous_new_handle(&h, &adc) != ESP_OK || adc_continuous_config(adc, &c) != ESP_OK || adc_continuous_start(adc) != ESP_OK) {
    Serial0.println("KLASE_MIC_ERROR");
    vTaskDelete(nullptr);
  }
  Serial0.println("KLASE_MIC_READY");
  static uint8_t buf[512];
  uint32_t pico = 0, ventana = 0;
  uint16_t crudoMin = 4095, crudoMax = 0;
  while (true) {
    uint32_t len = 0;
    if (adc_continuous_read(adc, buf, sizeof(buf), &len, 100) != ESP_OK) continue;
    for (uint32_t i = 0; i + SOC_ADC_DIGI_RESULT_BYTES <= len; i += SOC_ADC_DIGI_RESULT_BYTES) {
      adc_digi_output_data_t *d = (adc_digi_output_data_t *)&buf[i];
      if (d->type2.channel != ADC_CHANNEL_0) continue;
      const uint16_t crudo = d->type2.data;
      if (crudo < crudoMin) crudoMin = crudo;
      if (crudo > crudoMax) crudoMax = crudo;
      const float v = crudo;
      micDc += (v - micDc) * 0.0015f;              // saca la continua del MAX9814
      int32_t s = (int32_t)((v - micDc) * 12.0f);   // 12 bits → 16 bits
      s = constrain(s, -32767, 32767);
      const uint32_t a = (uint32_t)abs(s);
      if (a > pico) pico = a;
      if (grabando && grabadas < MAX_MUESTRAS) grabacion[grabadas++] = (int16_t)s;
      if (++ventana >= MIC_HZ / 20) {               // cada 50 ms
        micLevel = pico > 9000 ? 5 : pico > 5000 ? 4 : pico > 2600 ? 3 : pico > 1300 ? 2 : pico > 600 ? 1 : 0;
        micPico = pico; pico = 0; ventana = 0;
        micRawMin = crudoMin; micRawMax = crudoMax; crudoMin = 4095; crudoMax = 0;
      }
    }
  }
}
void escribirCabeceraWav(size_t muestras) {
  const uint32_t datos = muestras * 2, tasa = MIC_HZ;
  memcpy(wav, "RIFF", 4); uint32_t v = 36 + datos; memcpy(wav + 4, &v, 4); memcpy(wav + 8, "WAVEfmt ", 8);
  v = 16; memcpy(wav + 16, &v, 4); uint16_t w = 1; memcpy(wav + 20, &w, 2); memcpy(wav + 22, &w, 2);
  memcpy(wav + 24, &tasa, 4); v = tasa * 2; memcpy(wav + 28, &v, 4); w = 2; memcpy(wav + 32, &w, 2); w = 16; memcpy(wav + 34, &w, 2);
  memcpy(wav + 36, "data", 4); memcpy(wav + 40, &datos, 4);
}

// ════════════════════════════════════════════════════════════════
// Red (tarea propia): avisos cada 15 s y consultas de voz
// ════════════════════════════════════════════════════════════════
// Guarda la respuesta en PSRAM. writeToStream resuelve también el chunked.
class BufferPsram : public Stream {
 public:
  size_t n = 0;
  size_t write(uint8_t b) override { if (n < MAX_RESPUESTA) { respuestaPcm[n++] = b; return 1; } return 0; }
  size_t write(const uint8_t *d, size_t len) override { size_t k = min(len, MAX_RESPUESTA - n); memcpy(respuestaPcm + n, d, k); n += k; return k; }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
};
String urlDecode(const String &s) {
  String out; out.reserve(s.length());
  for (unsigned int i = 0; i < s.length(); i++) {
    if (s[i] == '%' && i + 2 < s.length()) { out += (char)strtol(s.substring(i + 1, i + 3).c_str(), nullptr, 16); i += 2; }
    else if (s[i] == '+') out += ' ';
    else out += s[i];
  }
  return out;
}
void consultarFeed(NetworkClientSecure &cliente) {
  HTTPClient http; http.setConnectTimeout(4000); http.setTimeout(6000); http.setReuse(true);
  if (!http.begin(cliente, cloudUrl)) return;
  http.addHeader("apikey", cloudKey); http.addHeader("Content-Type", "application/json");
  JsonDocument request; request["p_id"] = deviceId; request["p_token"] = deviceToken; request["p_offset"] = cloudOffset;
  String payload; serializeJson(request, payload);
  const int code = http.POST(payload); lastCloudCode = code;
  if (code == 200) {
    String cuerpo = http.getString();
    xSemaphoreTake(cerrojo, portMAX_DELAY); feedPendiente = cuerpo; hayFeed = true; xSemaphoreGive(cerrojo);
    lastCloudFeed = millis();
  } else if (code == 401 || code == 403) {
    xSemaphoreTake(cerrojo, portMAX_DELAY); noAutorizado = true; xSemaphoreGive(cerrojo);
  }
  http.end();
  // Con la conexión reutilizada, un socket que quedó muerto (p. ej. tras un
  // corte de Wi-Fi) daba timeout para siempre: ante cualquier error se cierra.
  if (code < 0) cliente.stop();
}
void probarRed(NetworkClientSecure &cliente) {
  // Petición vacía: comprueba la ruta HTTPS sin mandar audio ni la credencial del robot.
  cliente.stop();
  HTTPClient http;http.setConnectTimeout(5000);http.setTimeout(12000);http.setReuse(false);
  JsonDocument report;report["stage"]="connecting";
  Serial0.print("KLASE_HTTP ");serializeJson(report,Serial0);Serial0.println();
  const uint32_t inicio=millis();
  if(http.begin(cliente,funcionesUrl+"/robot-panol-voz")) {
    http.addHeader("Authorization","Bearer "+cloudKey);http.addHeader("apikey",cloudKey);
    http.addHeader("Content-Type","application/json");
    const int code=http.POST(String("{}"));
    char errorTls[160]={};const int tlsCode=cliente.lastError(errorTls,sizeof(errorTls));
    report["stage"]="done";report["status"]=code;report["ms"]=millis()-inicio;
    report["tlsCode"]=tlsCode;report["tlsError"]=errorTls;report["heap"]=ESP.getFreeHeap();
    if(code<0)report["error"]=HTTPClient::errorToString(code);
    Serial0.print("KLASE_HTTP ");serializeJson(report,Serial0);Serial0.println();
    http.end();
  }
  cliente.stop();
  // Comparar con el cliente HTTP nativo de ESP-IDF, manteniendo la misma CA.
  const String url=funcionesUrl+"/robot-panol-voz";
  esp_http_client_config_t config={};config.url=url.c_str();config.cert_pem=CLOUD_ROOT_CA;
  config.method=HTTP_METHOD_POST;config.timeout_ms=12000;config.disable_auto_redirect=true;config.max_authorization_retries=-1;
  config.buffer_size=1024;config.buffer_size_tx=1024;
  auto nativo=esp_http_client_init(&config);
  if(nativo) {
    esp_http_client_set_header(nativo,"Content-Type","application/json");
    esp_http_client_set_header(nativo,"apikey",cloudKey.c_str());
    const String auth="Bearer "+cloudKey;
    esp_http_client_set_header(nativo,"Authorization",auth.c_str());
    esp_http_client_set_post_field(nativo,"{}",2);
    const uint32_t t0=millis();const esp_err_t err=esp_http_client_perform(nativo);
    JsonDocument nativeReport;nativeReport["stage"]="done";nativeReport["client"]="esp-idf";
    nativeReport["status"]=err==ESP_OK?esp_http_client_get_status_code(nativo):-1;
    nativeReport["error"]=esp_err_to_name(err);nativeReport["ms"]=millis()-t0;
    Serial0.print("KLASE_HTTP ");serializeJson(nativeReport,Serial0);Serial0.println();
    esp_http_client_cleanup(nativo);
  }
}
// `tipo` va como int: Arduino arma los prototipos antes de declarar el enum PedidoRed.
void atenderVoz(NetworkClientSecure &cliente, int tipo) {
  HTTPClient http; http.setConnectTimeout(5000); http.setTimeout(30000);
  Contestacion c; c.confirmar = false; c.pcm = 0; c.status = -1; c.lista = true; c.eraConfirmacion = tipo == R_CONFIRMAR;
  if (http.begin(cliente, funcionesUrl + "/robot-panol-voz?formato=pcm")) {
    http.addHeader("Authorization", "Bearer " + cloudKey); http.addHeader("apikey", cloudKey);
    http.addHeader("x-robot-id", deviceId); http.addHeader("x-robot-token", deviceToken);
    const char *claves[] = {"x-texto", "x-oido", "x-confirmar", "x-pedido"};
    http.collectHeaders(claves, 4);
    int code;
    if (tipo == R_VOZ) {
      const size_t muestras = grabadas;
      escribirCabeceraWav(muestras);
      http.addHeader("Content-Type", "audio/wav");
      code = http.POST(wav, 44 + muestras * 2);
    } else {
      http.addHeader("Content-Type", "application/json");
      code = http.POST(String("{\"accion\":\"confirmar_pedido\"}"));
    }
    c.status = code;
    if (code > 0) {
      c.texto = urlDecode(http.header("x-texto"));
      c.oido = urlDecode(http.header("x-oido"));
      c.confirmar = http.header("x-confirmar") == "1";
      if (code == 200) { BufferPsram destino; http.writeToStream(&destino); c.pcm = destino.n; }
    }
    http.end();
    if (c.status < 0) cliente.stop();
  }
  if (!c.texto.length()) c.texto = c.status == 401 ? "El robot no esta autorizado. Hay que vincularlo de nuevo." : c.status == -11 ? "El servidor no respondio a tiempo. Revisa la conexion a Internet." : "No pude consultar el sistema. Proba de nuevo en un rato.";
  xSemaphoreTake(cerrojo, portMAX_DELAY); contestacion = c; xSemaphoreGive(cerrojo);
}
void netWorker(void *) {
  NetworkClientSecure *cliente = new NetworkClientSecure();
  cliente->setCACert(CLOUD_ROOT_CA);
  uint32_t ultimoFeed = 0;
  bool habiaWifi = false;
  while (true) {
    const bool hayWifi = WiFi.status() == WL_CONNECTED;
    if (habiaWifi && !hayWifi) cliente->stop();   // la conexión TLS no sobrevive a un corte
    habiaWifi = hayWifi;
    const bool listo = hayWifi && time(nullptr) > 1700000000 && cloudUrl.length() && deviceToken.length();
    if (listo && networkTestNeeded && pedidoRed==R_NADA) {
      networkTestNeeded=false;probarRed(*cliente);
    } else if (listo && pedidoRed != R_NADA) {
      atenderVoz(*cliente, pedidoRed);
      pedidoRed = R_NADA;
    } else if (listo && (cloudPollNeeded || millis() - ultimoFeed > 15000)) {
      ultimoFeed = millis(); cloudPollNeeded = false;
      consultarFeed(*cliente);
    } else if (!listo && pedidoRed != R_NADA) {
      Contestacion c; c.texto = WiFi.status() == WL_CONNECTED ? "Todavia no tengo la hora o el vinculo con Klase. Espera un momento." : "No tengo Wi-Fi, no puedo consultar.";
      c.confirmar = false; c.status = -1; c.pcm = 0; c.lista = true; c.eraConfirmacion = false;
      xSemaphoreTake(cerrojo, portMAX_DELAY); contestacion = c; xSemaphoreGive(cerrojo);
      pedidoRed = R_NADA;
    }
    vTaskDelay(pdMS_TO_TICKS(40));
  }
}

// ════════════════════════════════════════════════════════════════
// Pantalla: se dibuja todo en `g` (memoria) y se manda entero
// ════════════════════════════════════════════════════════════════
class Lienzo : public GFXcanvas16 {
 public:
  Lienzo() : GFXcanvas16(320, 240, false) {}
  // Se pide en setup(): en los constructores globales la PSRAM todavía no está lista.
  bool preparar() { if (!buffer) { buffer = (uint16_t *)ps_malloc(320 * 240 * 2); buffer_owned = false; } return buffer != nullptr; }
  bool listo() const { return buffer != nullptr; }
};
Lienzo g;
uint32_t ultimoCuadroMs = 0;

void mostrar() {
  tft.startWrite();
  tft.setAddrWindow(0, 0, 320, 240);
  tft.writePixels(g.getBuffer(), 320 * 240, true, false);
  tft.endWrite();
}

String ascii(String text) {
  const char* from[]={"á","é","í","ó","ú","ñ","Á","É","Í","Ó","Ú","Ñ","ü","Ü","·","—","–","¿","¡","“","”","°","½","’"};
  const char* to[]={"a","e","i","o","u","n","A","E","I","O","U","N","u","U","-","-","-","","","\"","\""," ","1/2","'"};
  for(int i=0;i<24;i++) text.replace(from[i],to[i]);
  String out; for(unsigned int i=0;i<text.length();i++) { uint8_t c=text[i]; if(c>=32&&c<127)out+=(char)c; }
  return out;
}

// Texto con fuente: `y` es la línea de base. Sin fuente (nullptr): `y` es el borde de arriba.
int ancho(const String &s, const GFXfont *f) {
  g.setFont(f); g.setTextSize(1);
  int16_t x1, y1; uint16_t w, h; g.getTextBounds(s, 0, 50, &x1, &y1, &w, &h);
  return w;
}
void texto(const String &s, int x, int y, const GFXfont *f, uint16_t c) {
  g.setFont(f); g.setTextSize(1); g.setTextColor(c); g.setCursor(x, y); g.print(s);
}
void centrado(const String &s, int y, const GFXfont *f, uint16_t c, int cx = 160) {
  const String t = ascii(s);
  texto(t, cx - ancho(t, f) / 2, y, f, c);
}
// Párrafo con corte por palabra. Devuelve cuántas líneas ocupa entero.
int parrafo(const String &s, int x, int y, int w, int alto, int maxLineas, const GFXfont *f, uint16_t c, int saltear = 0) {
  String resto = ascii(s); resto.trim();
  int linea = 0;
  while (resto.length()) {
    int corte = resto.length();
    while (corte > 0 && ancho(resto.substring(0, corte), f) > w) {
      const int espacio = resto.lastIndexOf(' ', corte - 1);
      corte = espacio > 0 ? espacio : corte - 1;
    }
    if (corte <= 0) corte = 1;
    String fila = resto.substring(0, corte);
    resto = resto.substring(corte); resto.trim();
    const int visible = linea - saltear;
    if (visible >= 0 && visible < maxLineas) {
      if (visible == maxLineas - 1 && resto.length() && saltear == 0 && maxLineas < 3) fila += "...";
      texto(fila, x, y + visible * alto, f, c);
    }
    linea++;
  }
  return linea;
}

// ─── Barra de arriba: Klase A, Wi-Fi, servidor y hora ───
void barraSuperior(uint32_t now) {
  g.fillRect(0, 0, 320, 28, PANEL);
  g.drawFastHLine(0, 28, 320, LINEA);
  texto("KLASE A", 10, 19, &FreeSansBold9pt7b, BLANCO);
  texto("PANOL " + ascii(sedeRobot), 88, 11, nullptr, GRIS);

  // Hora local (Argentina, UTC-3).
  int x = 314;
  if (time(nullptr) > 1700000000) {
    struct tm t; time_t ahora = time(nullptr); localtime_r(&ahora, &t);
    char hora[6]; snprintf(hora, sizeof(hora), "%02d:%02d", t.tm_hour, t.tm_min);
    const int w = ancho(hora, &FreeSansBold9pt7b);
    x -= w; texto(hora, x, 19, &FreeSansBold9pt7b, CLARO); x -= 12;
  }
  // Wi-Fi: barritas de señal, o cruz roja.
  const bool conectado = WiFi.status() == WL_CONNECTED;
  const int rssi = conectado ? WiFi.RSSI() : -100;
  const int barras = !conectado ? 0 : rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1;
  x -= 26;
  for (int i = 0; i < 4; i++) {
    const int h = 4 + i * 4;
    g.fillRoundRect(x + i * 6, 21 - h, 4, h, 1, i < barras ? VERDE : LINEA);
  }
  if (!conectado) { g.drawLine(x, 6, x + 22, 22, ROJO); g.drawLine(x + 1, 6, x + 23, 22, ROJO); }
  x -= 10;
  // Servidor de Klase: verde si hubo respuesta en el último minuto.
  const bool enLinea = lastCloudFeed && millis() - lastCloudFeed < 60000;
  g.fillCircle(x, 13, 4, enLinea ? VERDE : conectado ? GRIS : ROJO);
  // Micrófono: cápsula chica; roja y tachada si no da señal.
  x -= 16;
  const uint16_t cm = micSano() ? GRIS : ROJO;
  g.drawRoundRect(x - 3, 5, 7, 11, 3, cm);
  g.drawFastVLine(x, 16, 4, cm); g.drawFastHLine(x - 3, 20, 7, cm);
  if (!micSano()) g.drawLine(x - 6, 21, x + 6, 4, ROJO);
  (void)now;
}

// ─── Barra de abajo: una línea grande y una ayuda chica ───
void barraInferior(const String &principal, uint16_t color, const String &ayuda) {
  g.fillRect(0, 196, 320, 44, FONDO);
  centrado(principal, 214, &FreeSansBold9pt7b, color);
  if (ayuda.length()) centrado(ayuda, 225, nullptr, GRIS);
}

// ─── La cara ───
enum Animo { A_TRANQUILO, A_ENOJADO, A_ESCUCHA, A_PIENSA, A_HABLA, A_FELIZ, A_TRISTE, A_DORMIDO };

void arco(int cx, int cy, int r, float desde, float hasta, int grosor, uint16_t c) {
  for (float a = desde; a <= hasta; a += 0.05f) g.fillCircle(cx + r * cosf(a), cy + r * sinf(a), grosor / 2, c);
}
void ojo(int cx, int cy, int w, int h, uint16_t color, int mx, int my, bool brillo) {
  if (h < 12) { g.fillRoundRect(cx - w / 2, cy - 4, w, 8, 4, color); return; }
  g.fillRoundRect(cx - w / 2, cy - h / 2, w, h, min(w, h) / 3, color);
  if (brillo) g.fillRoundRect(cx - w / 4 + mx, cy - h / 4 + my, w / 4, h / 4, 5, BLANCO);
}
// `animo` va como int: Arduino arma los prototipos antes de declarar el enum Animo.
void cara(int animo, uint32_t now) {
  const int ex[2] = {108, 212}, ey = 100, ew = 64;
  // Mirada que va y viene despacio, y parpadeo cada ~4 s.
  const float fase = (now % 7000) / 7000.0f * 2 * PI;
  int mx = (int)(sinf(fase) * 6), my = (int)(sinf(fase * 2) * 2);
  bool parpado = (now % 4300) < 140;
  uint16_t color = CIAN;
  int eh = 72;
  switch (animo) {
    case A_ENOJADO: color = ROJO; break;
    case A_ESCUCHA: color = VIOLETA; eh = 78; mx = 0; my = 0; parpado = false; break;
    case A_PIENSA: color = AZUL; mx = 8; my = -8; parpado = false; break;
    case A_HABLA: color = CIAN; break;
    case A_FELIZ: color = VERDE; parpado = false; break;
    case A_TRISTE: color = GRIS; eh = 60; my = 4; break;
    case A_DORMIDO: color = LINEA; eh = 8; break;
    default: break;
  }
  if (parpado) eh = 8;
  for (int i = 0; i < 2; i++) ojo(ex[i], ey, ew, eh, color, mx, my, animo != A_DORMIDO);
  // Cejas: se recortan las esquinas de arriba de los ojos con el fondo.
  if (animo == A_ENOJADO) {
    g.fillTriangle(ex[0] - 36, ey - 44, ex[0] + 36, ey - 44, ex[0] + 36, ey - 14, FONDO);
    g.fillTriangle(ex[1] - 36, ey - 44, ex[1] + 36, ey - 44, ex[1] - 36, ey - 14, FONDO);
  } else if (animo == A_TRISTE) {
    g.fillTriangle(ex[0] - 36, ey - 40, ex[0] + 10, ey - 40, ex[0] - 36, ey - 16, FONDO);
    g.fillTriangle(ex[1] + 36, ey - 40, ex[1] - 10, ey - 40, ex[1] + 36, ey - 16, FONDO);
  } else if (animo == A_FELIZ) {
    // Ojos de media luna: se tapa la mitad de abajo.
    for (int i = 0; i < 2; i++) g.fillRoundRect(ex[i] - 36, ey + 4, 72, 44, 20, FONDO);
  }
  // Boca.
  const int bx = 160, by = 158;
  switch (animo) {
    case A_ENOJADO: arco(bx, by + 26, 22, PI * 1.2f, PI * 1.8f, 5, color); break;
    case A_TRISTE: arco(bx, by + 24, 18, PI * 1.25f, PI * 1.75f, 5, color); break;
    case A_ESCUCHA: {
      const int h = 8 + micLevel * 5;
      g.fillRoundRect(bx - 12, by - h / 2, 24, h, 10, color);
      // Ondas a los costados según el micrófono.
      for (int i = 0; i < 3; i++) if (micLevel > i) { arco(bx, by, 26 + i * 9, -0.5f, 0.5f, 3, VIOLETA); arco(bx, by, 26 + i * 9, PI - 0.5f, PI + 0.5f, 3, VIOLETA); }
      break;
    }
    case A_PIENSA:
      for (int i = 0; i < 3; i++) {
        const int salto = ((now / 180) % 3) == (uint32_t)i ? 5 : 0;
        g.fillCircle(bx - 14 + i * 14, by - salto, 4, color);
      }
      break;
    case A_HABLA: {
      const int h = 6 + min(26, (int)(vozNivel / 700));
      g.fillRoundRect(bx - 18, by - h / 2, 36, h, min(10, h / 2), color);
      break;
    }
    case A_FELIZ: arco(bx, by - 18, 26, PI * 0.15f, PI * 0.85f, 6, color); break;
    case A_DORMIDO:
      g.fillRoundRect(bx - 10, by - 2, 20, 4, 2, color);
      texto("z", 250, 70 - (int)((now / 400) % 3) * 4, &FreeSansBold9pt7b, GRIS);
      texto("Z", 262, 54 - (int)((now / 400) % 3) * 4, &FreeSansBold12pt7b, GRIS);
      break;
    default: arco(bx, by - 20, 24, PI * 0.18f, PI * 0.82f, 5, color); break;
  }
}

// ─── Pantallas ───
String estadoServidor() {
  if (state == "stale") return "SIN CONEXION - DATOS DE HACE " + String((millis() - lastFeed) / 60000) + " MIN";
  if (state == "unauthorized") return "VINCULO REVOCADO O INVALIDO";
  if (state == "unpaired") return "CONECTANDO CON KLASE...";
  if (state == "login") return "SIN VINCULO CON KLASE";
  if (state == "error") return "SIN DATOS - REINTENTANDO";
  return String(total) + " AVISOS - " + String(urgent) + " URGENTES";
}
void pantallaCara(uint32_t now) {
  const bool conectado = WiFi.status() == WL_CONNECTED;
  const bool dormido = now - lastInteraction > 45000 && unseenCount == 0 && conectado;
  int animo = A_TRANQUILO;
  if ((int32_t)(felizHasta - now) > 0) animo = A_FELIZ;
  else if (!conectado && wifiRequested && now - wifiAttemptAt > 40000) animo = A_TRISTE;
  else if (unseenCount > 0) animo = A_ENOJADO;
  else if (dormido) animo = A_DORMIDO;
  cara(animo, now);
  if (animo == A_TRISTE) barraInferior("SIN WI-FI", ROJO, wifiMotivo ? motivoWifi(wifiMotivo) : "CONECTANDO AL WI-FI...");
  else if (animo == A_FELIZ) barraInferior("PEDIDO ENVIADO", VERDE, "COMPRAS YA LO TIENE");
  else if (animo == A_ENOJADO) barraInferior(String(unseenCount) + (unseenCount == 1 ? " AVISO POR VER" : " AVISOS POR VER"), ROJO, "TOCA PARA VERLOS - MANTENE PARA HABLAR");
  else if (!conectado) barraInferior("CONECTANDO AL WI-FI...", GRIS, estadoServidor());
  else if (!micSano()) barraInferior("MICROFONO SIN SENAL", ROJO, "REVISAR V+ A 3V3, GND Y OUT A GPIO1");
  else if (animo == A_DORMIDO) barraInferior("EN REPOSO", GRIS, "MANTENE EL BOTON PARA HABLAR");
  else barraInferior("TE ESCUCHO SI ME HABLAS", AZUL, "MANTENE EL BOTON PARA HABLAR - " + estadoServidor());
}
void pantallaEscucha(uint32_t now) {
  cara(A_ESCUCHA, now);
  const float usado = min(1.0f, (float)grabadas / MAX_MUESTRAS);
  g.fillRect(0, 196, 320, 44, FONDO);
  if (micSano()) centrado("TE ESCUCHO...", 214, &FreeSansBold9pt7b, VIOLETA);
  else centrado("MICROFONO SIN SENAL", 214, &FreeSansBold9pt7b, ROJO);
  g.fillRoundRect(60, 226, 200, 6, 3, LINEA);
  g.fillRoundRect(60, 226, max(6, (int)(200 * usado)), 6, 3, VIOLETA);
}
void pantallaPiensa(uint32_t now) {
  cara(A_PIENSA, now);
  String puntos = ""; for (int i = 0; i <= (int)((now / 350) % 3); i++) puntos += ".";
  barraInferior("PENSANDO" + puntos, AZUL, "CONSULTANDO KLASE A");
}
void pantallaRespuesta(uint32_t now) {
  const bool confirmar = modoVoz == V_CONFIRMAR;
  const uint16_t borde = confirmar ? VIOLETA : LINEA;
  g.fillRoundRect(8, 36, 304, 156, 12, PANEL);
  g.drawRoundRect(8, 36, 304, 156, 12, borde);
  // Qué entendió, chiquito arriba.
  if (respuestaOido.length()) {
    String oido = "VOS: " + ascii(respuestaOido);
    if (oido.length() > 50) oido = oido.substring(0, 49) + "...";
    texto(oido, 18, 45, nullptr, GRIS);
    g.drawFastHLine(18, 57, 284, LINEA);
  }
  // Mientras habla, una carita chica que mueve la boca.
  if (reproduciendo) {
    g.fillRoundRect(278, 42, 26, 12, 4, FONDO);
    const int h = 2 + min(8, (int)(vozNivel / 2500));
    for (int i = 0; i < 4; i++) g.fillRect(281 + i * 6, 48 - (h * ((i % 2) ? 1 : 2)) / 3, 3, max(2, (h * ((i % 2) ? 2 : 3)) / 3), CIAN);
  }
  const int y0 = respuestaOido.length() ? 78 : 62;
  const int lineas = (192 - y0) / 20;
  paginasRespuesta = max(1, (parrafo(respuestaTexto, 18, y0, 284, 20, 0, &FreeSans9pt7b, BLANCO) + lineas - 1) / lineas);
  if (paginaRespuesta >= paginasRespuesta) paginaRespuesta = 0;
  parrafo(respuestaTexto, 18, y0, 284, 20, lineas, &FreeSans9pt7b, BLANCO, paginaRespuesta * lineas);
  if (paginasRespuesta > 1) texto(String(paginaRespuesta + 1) + "/" + String(paginasRespuesta), 280, 180, nullptr, GRIS);
  if (confirmar) {
    const int quedan = max(0, (int)((int32_t)(confirmarHasta - now) / 1000));
    barraInferior("DOBLE TOQUE: MANDAR A COMPRAS", VIOLETA, "UN TOQUE: NO - QUEDAN " + String(quedan) + " S");
  } else {
    barraInferior(reproduciendo ? "HABLANDO..." : "LISTO", reproduciendo ? CIAN : AZUL, "TOQUE: VOLVER - MANTENE PARA OTRA PREGUNTA");
  }
}
void pantallaAviso() {
  if (!count) {
    g.fillRoundRect(8, 36, 304, 156, 12, PANEL);
    centrado(state == "ok" ? "NO HAY AVISOS PENDIENTES" : "AVISOS NO DISPONIBLES", 110, &FreeSansBold9pt7b, AZUL);
    centrado(estadoServidor(), 130, nullptr, GRIS);
    barraInferior("PANOL " + sedeRobot, AZUL, "TOQUE: VOLVER");
    return;
  }
  page = constrain(page, 0, count - 1);
  const Notice &n = notices[page];
  markViewed(n.id);
  g.fillRoundRect(8, 36, 304, 156, 12, PANEL);
  g.fillRoundRect(8, 36, 304, 24, 12, n.urgent ? ROJO : LINEA);
  g.fillRect(8, 48, 304, 12, n.urgent ? ROJO : LINEA);
  texto(n.urgent ? "URGENTE - INGRESO PENDIENTE" : "INGRESO PENDIENTE", 18, 44, nullptr, n.urgent ? FONDO : CLARO);
  texto(String(cloudOffset + page + 1) + " / " + String(total), 266, 44, nullptr, n.urgent ? FONDO : CLARO);
  if (detailPage) {
    parrafo(n.title, 18, 80, 284, 18, 1, &FreeSansBold9pt7b, BLANCO);
    parrafo(n.detail, 18, 104, 284, 18, 5, &FreeSans9pt7b, CLARO, (detailPage - 1) * 5);
    barraInferior("MATERIALES", AZUL, "DOBLE: MAS - TOQUE: SIGUIENTE AVISO");
    return;
  }
  parrafo(n.title, 18, 82, 284, 20, 2, &FreeSansBold9pt7b, BLANCO);
  texto("OBRA " + ascii(n.obra), 18, 132, &FreeSansBold9pt7b, AZUL);
  texto(String(n.items) + (n.items == 1 ? " renglon pendiente" : " renglones pendientes"), 18, 146, nullptr, GRIS);
  parrafo(n.detail, 18, 174, 284, 16, 1, &FreeSans9pt7b, GRIS);
  barraInferior("AVISO DE INGRESO", AZUL, "TOQUE: SIGUIENTE - DOBLE: MATERIALES");
}
void dibujar(uint32_t now) {
  const uint32_t inicio = millis();
  g.fillScreen(FONDO);
  barraSuperior(now);
  if (modoVoz == V_ESCUCHA) pantallaEscucha(now);
  else if (modoVoz == V_PIENSA) pantallaPiensa(now);
  else if (modoVoz == V_RESPUESTA || modoVoz == V_CONFIRMAR) pantallaRespuesta(now);
  else if (page >= 0) pantallaAviso();
  else pantallaCara(now);
  mostrar();
  ultimoCuadroMs = millis() - inicio;
}

// ════════════════════════════════════════════════════════════════
// Avisos
// ════════════════════════════════════════════════════════════════
void markViewed(const String &id) {
  for(int i=0;i<unseenCount;i++)if(unseenIds[i]==id){for(int j=i;j<unseenCount-1;j++)unseenIds[j]=unseenIds[j+1];unseenCount--;break;}
}
void acceptFeed(JsonDocument &doc) {
  if(doc["type"]!="feed")return;
  String newState=doc["status"]|"error";
  if(newState!="ok"&&newState!="limit") {
    // Una consulta fallida no borra lo que había: los avisos por ver siguen por ver.
    state=newState;dirty=true;return;
  }
  JsonArray array=doc["notices"].as<JsonArray>();
  const String sede=doc["sede"]|"";
  if(sede.length())sedeRobot=sede;
  count=0; total=doc["total"]|0;urgent=doc["urgent"]|0;
  String selectedId=page>=0?notices[constrain(page,0,19)].id:"";
  for(JsonObject row:array) {
    if(sede.length()&&String(row["sede"]|"")!=sede)continue;
    if(count==20)break;
    Notice &n=notices[count++];n.id=row["id"]|"";n.title=row["title"]|"";n.obra=row["obra"]|"";
    n.sede=row["sede"]|"";n.detail=row["detail"]|"";n.items=row["items"]|0;n.urgent=row["urgent"]|false;
  }
  if(!sede.length()){total=count;urgent=0;for(int i=0;i<count;i++)if(notices[i].urgent)urgent++;}
  cloudOffset=doc["offset"]|0;
  bool newArrival=false;
  for(int i=0;cloudOffset==0&&i<count;i++) {
    bool known=false;for(int j=0;j<knownCount;j++)if(knownIds[j]==notices[i].id)known=true;
    bool pending=false;for(int j=0;j<unseenCount;j++)if(unseenIds[j]==notices[i].id)pending=true;
    if(!known&&!pending&&unseenCount<20){unseenIds[unseenCount++]=notices[i].id;newArrival=true;}
  }
  for(int i=unseenCount-1;i>=0;i--) {
    bool present=false;for(int j=0;j<count;j++)if(unseenIds[i]==notices[j].id)present=true;
    if(!present&&cloudOffset==0){for(int j=i;j<unseenCount-1;j++)unseenIds[j]=unseenIds[j+1];unseenCount--;}
  }
  if(cloudOffset==0){knownCount=count;for(int i=0;i<count;i++)knownIds[i]=notices[i].id;}
  if(newArrival&&modoVoz==V_NADA){lastInteraction=millis();page=-1;detailPage=0;requestAudio(2);}
  else if(selectedId.length())for(int i=0;i<count;i++)if(notices[i].id==selectedId)page=i;
  state=newState;lastFeed=millis();dirty=true;
  Serial0.println("KLASE_FEED_OK");
  if(page>=count)page=count?0:-1;
}

// ════════════════════════════════════════════════════════════════
// USB
// ════════════════════════════════════════════════════════════════
void serialCommand(String &line) {
  JsonDocument doc; if(deserializeJson(doc,line))return;
  if(doc["type"]=="feed")acceptFeed(doc);
  else if(doc["type"]=="network_test")networkTestNeeded=true;
  else if(doc["type"]=="status") Serial0.println("KLASE_VERSION {\"firmware\":\"2026-10-05-audio\",\"localRecording\":true}");
  else if(doc["type"]=="test_audio") {
    if(!audioReady || reproduciendo || grabando || modoVoz==V_PIENSA || pedidoRed!=R_NADA) {
      Serial0.println("KLASE_AUDIO_TEST_BUSY");
      return;
    }
    audioTestAmplitude = constrain(doc["percent"] | 10, 1, 15) * 32767 / 100;
    requestAudio(4);
  }
  else if(doc["type"]=="record_local") {
    if(!wav || grabando || reproduciendo || modoVoz==V_PIENSA || pedidoRed!=R_NADA) {
      Serial0.println("KLASE_LOCAL {\"error\":\"El robot esta ocupado o no tiene memoria.\"}");
      return;
    }
    grabadas=0; grabacionLocal=true; grabando=true;
    localHasta=millis()+constrain(doc["seconds"]|3,1,8)*1000;
    Serial0.println("KLASE_LOCAL {\"state\":\"recording\"}");
  }
  else if(doc["type"]=="dump_audio" && wav && !grabando && pedidoRed==R_NADA) volcarGrabacion();
  else if(doc["type"]=="test_mic") {
    // Graba 2 s mientras suena el parlante: si el micrófono anda, el tono aparece fuerte.
    grabadas=0;grabando=true;requestAudio(2);
    const uint32_t t0=millis();while(millis()-t0<2000)delay(5);
    grabando=false;
    Serial0.printf("KLASE_MIC_TEST raw_min=%u raw_max=%u\n",(unsigned)micRawMin,(unsigned)micRawMax);
    volcarGrabacion();
  }
  else if(doc["type"]=="wifi") {
    String ssid=doc["ssid"]|"",password=doc["password"]|"";
    prefs.putString("ssid",ssid);prefs.putString("pass",password);
    WiFi.disconnect();WiFi.mode(WIFI_STA);WiFi.setSleep(false);WiFi.setAutoReconnect(true);WiFi.begin(ssid.c_str(),password.c_str());wifiRequested=true;wifiAttemptAt=millis();dirty=true;
  } else if(doc["type"]=="cloud") {
    cloudUrl=doc["url"]|"";cloudKey=doc["apikey"]|"";deviceId=doc["id"]|"";deviceToken=doc["token"]|"";
    prefs.putString("cloudUrl",cloudUrl);prefs.putString("cloudKey",cloudKey);prefs.putString("deviceId",deviceId);prefs.putString("deviceToken",deviceToken);
    funcionesUrl=cloudUrl.substring(0,max(0,cloudUrl.indexOf("/rest/v1")))+"/functions/v1";
    cloudPollNeeded=true;state="unpaired";dirty=true;
    Serial0.println("KLASE_CLOUD_CONFIGURED");
  }
}
// Diagnóstico: manda por USB la última grabación, en base64, para escucharla en la PC.
void volcarGrabacion() {
  static const char *B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const size_t total = 44 + grabadas * 2;
  escribirCabeceraWav(grabadas);
  Serial0.printf("KLASE_WAV_INICIO %u\n", (unsigned)total);
  char linea[520];
  for (size_t i = 0; i < total; i += 384) {
    const size_t n = min((size_t)384, total - i);
    size_t k = 0;
    for (size_t j = 0; j < n; j += 3) {
      const uint32_t a = wav[i + j], b = j + 1 < n ? wav[i + j + 1] : 0, c = j + 2 < n ? wav[i + j + 2] : 0;
      const uint32_t t = (a << 16) | (b << 8) | c;
      linea[k++] = B64[(t >> 18) & 63]; linea[k++] = B64[(t >> 12) & 63];
      linea[k++] = j + 1 < n ? B64[(t >> 6) & 63] : '='; linea[k++] = j + 2 < n ? B64[t & 63] : '=';
    }
    linea[k] = 0;
    Serial0.print("KLASE_WAV "); Serial0.println(linea);
  }
  Serial0.println("KLASE_WAV_FIN");
}
void readSerial() {
  while(Serial0.available()) {
    char c=Serial0.read();if(c=='\n'){serialCommand(serialLine);serialLine="";}
    else if(c!='\r'){serialLine+=c;if(serialLine.length()>20000)serialLine="";}
  }
}

// ════════════════════════════════════════════════════════════════
// Voz: grabar, mandar, mostrar
// ════════════════════════════════════════════════════════════════
void mostrarMensaje(const String &mensaje, uint32_t now) {
  modoVoz=V_RESPUESTA;respuestaOido="";respuestaTexto=mensaje;modoDesde=now;paginaRespuesta=0;paginaDesde=now;lastInteraction=now;dirty=true;
}
void empezarGrabacion(uint32_t now) {
  if(!wav){mostrarMensaje("No tengo memoria para grabar (PSRAM).",now);return;}
  if(reproduciendo)cortarVoz=true;
  grabadas=0;grabando=true;modoVoz=V_ESCUCHA;modoDesde=now;dirty=true;page=-1;
}
void terminarGrabacion(uint32_t now) {
  grabando=false;
  if(grabadas<MIC_HZ*4/10) { mostrarMensaje("Mantene apretado el boton mientras hablas.",now); return; }
  pedidoRed=R_VOZ;modoVoz=V_PIENSA;modoDesde=now;dirty=true;
}
void tomarContestacion(uint32_t now) {
  Contestacion c;
  xSemaphoreTake(cerrojo,portMAX_DELAY);
  const bool hay=contestacion.lista;
  if(hay){c=contestacion;contestacion.lista=false;}
  xSemaphoreGive(cerrojo);
  if(!hay)return;
  respuestaTexto=c.texto;respuestaOido=c.oido;paginaRespuesta=0;paginaDesde=now;modoDesde=now;lastInteraction=now;
  JsonDocument voiceDiag; voiceDiag["texto"]=c.texto;voiceDiag["oido"]=c.oido;voiceDiag["status"]=c.status;voiceDiag["pcmBytes"]=c.pcm;
  Serial0.print("KLASE_VOICE ");serializeJson(voiceDiag,Serial0);Serial0.println();
  modoVoz=c.confirmar?V_CONFIRMAR:V_RESPUESTA;
  if(c.confirmar)confirmarHasta=now+CONFIRMAR_MS;
  if(c.eraConfirmacion&&c.status==200){felizHasta=now+6000;modoVoz=V_NADA;page=-1;}
  respuestaLen=c.pcm;
  if(c.pcm)requestAudio(3);else requestAudio(2);
  dirty=true;
}

// ════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);Serial0.setRxBufferSize(24576);Serial0.begin(115200);pinMode(BUTTON,INPUT_PULLUP);
  cerrojo=xSemaphoreCreateMutex();
  contestacion.lista=false;
  wav=(uint8_t*)ps_malloc(44+MAX_MUESTRAS*2);
  grabacion=wav?(int16_t*)(wav+44):nullptr;
  respuestaPcm=(uint8_t*)ps_malloc(MAX_RESPUESTA);
  if(!wav||!respuestaPcm||!g.preparar())Serial0.println("KLASE_PSRAM_ERROR");
  xTaskCreatePinnedToCore(audioWorker,"klase-audio",4096,nullptr,1,&audioTaskHandle,0);
  xTaskCreatePinnedToCore(micWorker,"klase-mic",4096,nullptr,2,nullptr,0);
  delay(1000); // Dejar estabilizar la alimentacion del cargador antes de iniciar el TFT.
  SPI.begin(12,-1,11,10);
  tft.begin(TFT_HZ);tft.setRotation(1);tft.fillScreen(FONDO);
  // Arranque: logo y barra de carga, dibujados en memoria.
  for(int x=0;x<=200;x+=10){
    g.fillScreen(FONDO);
    g.drawBitmap(128,40,KLASE_LOGO,64,64,AZUL);
    centrado("KLASE A",134,&FreeSansBold12pt7b,BLANCO);
    centrado("TU ASISTENTE DE PANOL",150,nullptr,GRIS);
    g.fillRoundRect(60,178,200,6,3,LINEA);g.fillRoundRect(60,178,max(6,x),6,3,AZUL);
    mostrar();
  }
  prefs.begin("klase-panol",false);
  cloudUrl=prefs.getString("cloudUrl","");cloudKey=prefs.getString("cloudKey","");deviceId=prefs.getString("deviceId","");deviceToken=prefs.getString("deviceToken","");
  funcionesUrl=cloudUrl.substring(0,max(0,cloudUrl.indexOf("/rest/v1")))+"/functions/v1";
  // El motivo de cada desconexión va al diagnóstico y a la pantalla: "clave
  // incorrecta" y "no veo la red" se resuelven distinto.
  WiFi.onEvent([](WiFiEvent_t evento, WiFiEventInfo_t info) {
    if(evento==ARDUINO_EVENT_WIFI_STA_DISCONNECTED)wifiMotivo=info.wifi_sta_disconnected.reason;
    else if(evento==ARDUINO_EVENT_WIFI_STA_GOT_IP)wifiMotivo=0;
  });
  String ssid=prefs.getString("ssid","");
  if(ssid.length()){WiFi.mode(WIFI_STA);WiFi.setSleep(false);WiFi.setAutoReconnect(true);WiFi.begin(ssid.c_str(),prefs.getString("pass","").c_str());wifiRequested=true;wifiAttemptAt=millis();}
  // Hora de Argentina para la barra; la validación TLS usa el reloj UTC igual.
  configTzTime("<-03>3","pool.ntp.org","time.google.com");
  if(cloudUrl.length())state="unpaired";
  raw=stable=digitalRead(BUTTON);lastInteraction=millis();
  attachInterrupt(digitalPinToInterrupt(BUTTON),buttonChanged,CHANGE);
  xTaskCreatePinnedToCore(netWorker,"klase-red",12288,nullptr,1,nullptr,0);
  Serial0.println("KLASE_ROBOT_READY");
  Serial0.println("KLASE_VERSION {\"firmware\":\"2026-10-02-monitor\",\"localRecording\":true}");
}

void toqueSimple(uint32_t now) {
  lastInteraction=now;detailPage=0;
  if(modoVoz==V_RESPUESTA){modoVoz=V_NADA;cortarVoz=true;page=-1;dirty=true;return;}
  if(modoVoz==V_CONFIRMAR){mostrarMensaje("Listo, no lo mando. El pedido sigue guardado.",now);return;}
  if(modoVoz!=V_NADA)return;
  if(page>=0&&page==count-1&&total<=count){page=-1;dirty=true;return;}   // después del último, vuelve a la cara
  if(page==count-1&&total>count&&cloudUrl.length()) {
    cloudOffset=(cloudOffset+count>=total)?0:cloudOffset+count;
    cloudPollNeeded=true;page=0;
  } else page=count?(page+1)%count:0;
  dirty=true;
}
void toqueDoble(uint32_t now) {
  lastInteraction=now;
  if(modoVoz==V_CONFIRMAR&&now<confirmarHasta){pedidoRed=R_CONFIRMAR;modoVoz=V_PIENSA;modoDesde=now;dirty=true;return;}
  if(modoVoz!=V_NADA)return;
  if(page>=0&&count) {
    int pages=max(1,((int)ascii(notices[page].detail).length()+159)/160);detailPage=(detailPage+1)%(pages+1);dirty=true;
  }
}

void loop() {
  readSerial();uint32_t now=millis();int v=digitalRead(BUTTON);
  if(grabacionLocal && (int32_t)(now-localHasta)>=0) {
    grabando=false;grabacionLocal=false;
    Serial0.println("KLASE_LOCAL {\"state\":\"transferring\"}");
    volcarGrabacion(); // Sólo USB: no inicia una consulta de voz ni envía audio a Internet.
    now=millis();v=digitalRead(BUTTON);
  }

  // Avisos que trajo la tarea de red.
  String feed;bool hay=false,revocado=false;
  xSemaphoreTake(cerrojo,portMAX_DELAY);
  if(hayFeed){feed=feedPendiente;feedPendiente="";hayFeed=false;hay=true;}
  if(noAutorizado){revocado=true;noAutorizado=false;}
  xSemaphoreGive(cerrojo);
  if(hay){JsonDocument doc;if(!deserializeJson(doc,feed))acceptFeed(doc);}
  if(revocado){state="unauthorized";count=total=urgent=unseenCount=0;page=-1;dirty=true;}
  tomarContestacion(now);
  // acceptFeed anota lastFeed con millis(): si `now` quedara de antes, now-lastFeed
  // da negativo, en unsigned es enorme, y los datos recién llegados parecían viejos.
  now=millis();

  // Botón: mantener = hablar; toque y doble toque se deciden al soltar.
  if(v!=raw){raw=v;lastRawChange=now;}
  if(raw!=stable&&now-lastRawChange>=40){
    stable=raw;dirty=true;lastInteraction=now;
    if(stable==LOW){pressedAt=now;held=grabacionLocal;}
    else if(held){ if(modoVoz==V_ESCUCHA)terminarGrabacion(now); }
    else if(toqueEnEspera&&now-toqueEnEspera<380){toqueEnEspera=0;toqueDoble(now);}
    else toqueEnEspera=now;
  }
  if(toqueEnEspera&&now-toqueEnEspera>=380){toqueEnEspera=0;toqueSimple(now);}
  if(stable==LOW&&!held&&now-pressedAt>=400&&modoVoz!=V_PIENSA&&!grabacionLocal){held=true;toqueEnEspera=0;empezarGrabacion(now);}
  if(modoVoz==V_ESCUCHA&&grabadas>=MAX_MUESTRAS)terminarGrabacion(now);

  // Vencimientos.
  if(modoVoz==V_PIENSA&&now-modoDesde>45000)mostrarMensaje("Tardo demasiado. Proba de nuevo.",now);
  if(modoVoz==V_CONFIRMAR&&(int32_t)(now-confirmarHasta)>0){modoVoz=V_NADA;page=-1;dirty=true;}
  if(modoVoz==V_RESPUESTA&&!reproduciendo&&now-lastInteraction>25000){modoVoz=V_NADA;page=-1;dirty=true;}
  if((modoVoz==V_RESPUESTA||modoVoz==V_CONFIRMAR)&&paginasRespuesta>1&&now-paginaDesde>6000){paginaDesde=now;paginaRespuesta=(paginaRespuesta+1)%paginasRespuesta;dirty=true;}
  if(modoVoz==V_NADA&&page>=0&&now-lastInteraction>45000){page=-1;dirty=true;}
  if(lastFeed&&now-lastFeed>90000&&state!="stale"&&state!="unauthorized"){state="stale";dirty=true;}
  bool connected=WiFi.status()==WL_CONNECTED;
  if(connected!=wifiWasConnected){wifiWasConnected=connected;dirty=true;}
  // Con WPA3 los primeros intentos a veces fallan por autenticación y el
  // Wi-Fi deja de reintentar solo: cada 30 s sin conexión se vuelve a empezar.
  static uint32_t ultimoReintento=0;
  if(wifiRequested&&!connected&&now-wifiAttemptAt>30000&&now-ultimoReintento>30000) {
    ultimoReintento=now;
    String ssid=prefs.getString("ssid","");
    if(ssid.length()){WiFi.disconnect();WiFi.begin(ssid.c_str(),prefs.getString("pass","").c_str());}
  }

  // Dibujo: cuadro entero cuando algo cambia, y ~12 por segundo si hay animación.
  const bool animado=page<0||modoVoz!=V_NADA;
  if(g.listo()&&(dirty||(animado&&now-lastFrame>=80)||now-lastFrame>=1000)){
    dibujar(now);
    dirty=false;lastFrame=now;
  }
  if(now-lastDiag>=1000) {
    lastDiag=now;
    Serial0.printf("KLASE_NET {\"wifi\":%d,\"configured\":%s,\"paired\":%s,\"clock\":%s,\"http\":%d,\"cloudAgeMs\":%lu,\"motivo\":%u,\"ssid\":\"%s\",\"rssi\":%d}\n",(int)WiFi.status(),wifiRequested?"true":"false",deviceToken.length()&&deviceId.length()?"true":"false",time(nullptr)>1700000000?"true":"false",lastCloudCode,(unsigned long)(lastCloudFeed?millis()-lastCloudFeed:0),(unsigned)wifiMotivo,WiFi.SSID().c_str(),(int)WiFi.RSSI());
    Serial0.printf("KLASE_DIAG {\"raw\":%d,\"stable\":%d,\"edges\":%lu,\"page\":%d,\"count\":%d,\"total\":%d,\"unseen\":%d,\"state\":\"%s\",\"voz\":%d,\"frameMs\":%lu}\n",digitalRead(BUTTON),stable,(unsigned long)buttonEdges,page,count,total,unseenCount,state.c_str(),(int)modoVoz,(unsigned long)ultimoCuadroMs);
  }
  if(now-lastMicDiag>=100) {
    lastMicDiag=now;
    Serial0.printf("KLASE_MIC {\"pico\":%lu,\"level\":%u,\"grabadas\":%u,\"crudoMin\":%u,\"crudoMax\":%u,\"dc\":%d}\n",(unsigned long)micPico,micLevel,(unsigned)grabadas,(unsigned)micRawMin,(unsigned)micRawMax,(int)micDc);
  }
  delay(2);
}

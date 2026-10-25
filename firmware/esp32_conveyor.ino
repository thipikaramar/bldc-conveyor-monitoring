/**
 * ==============================================================================
 * ESP32 BLDC Conveyor Belt Telemetry & Predictive Maintenance Hub
 * Sensors:
 *  - INA226: Bus Voltage (V) & Shunt Current (A) via I2C (0x40)
 *  - ADXL345: 3-Axis Accelerometer Vibration (g RMS) via I2C (0x53)
 *  - DS18B20: Stator Temperature (deg C) via 1-Wire (GPIO 4)
 *  - Hall Effect: RPM counting via GPIO Interrupt (GPIO 18)
 *  - SimonK 30A ESC: 50Hz PWM output for Conveyor Belt Motor (GPIO 25)
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <INA226_WE.h>
#include <ESP32Servo.h>

// --- Wi-Fi & Cloud Server Configuration ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
// Point to your deployed Vercel domain or local IP
const char* SERVER_URL = "https://your-conveyor-project.vercel.app/api/telemetry";
const char* STATUS_URL = "https://your-conveyor-project.vercel.app/api/conveyor/status";

// --- Pin Definitions ---
#define PIN_ONEWIRE 4      // DS18B20 Data
#define PIN_HALL 18        // Hall Effect Sensor (RPM Interrupt)
#define PIN_ESC_PWM 25     // ESC Control Signal (50Hz PWM)

// --- Sensor Objects ---
INA226_WE ina226(0x40);
Adafruit_ADXL345_Unified adxl = Adafruit_ADXL345_Unified(12345);
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature tempSensor(&oneWire);
Servo esc;

// --- RPM Variables ---
volatile unsigned long pulseCount = 0;
unsigned long lastRpmCalcTime = 0;
float currentRpm = 0.0;

// Interrupt Service Routine for Hall Sensor
void IRAM_ATTR onHallPulse() {
  pulseCount++;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // SDA = 21, SCL = 22

  // 1. Initialize INA226
  if (!ina226.init()) {
    Serial.println("❌ INA226 not found! Check I2C wiring.");
  } else {
    ina226.setResistorRange(0.01, 15.0); // 10mOhm shunt, 15A max
    Serial.println("✅ INA226 initialized.");
  }

  // 2. Initialize ADXL345
  if (!adxl.begin()) {
    Serial.println("❌ ADXL345 not found!");
  } else {
    adxl.setRange(ADXL345_RANGE_16_G);
    Serial.println("✅ ADXL345 initialized.");
  }

  // 3. Initialize DS18B20
  tempSensor.begin();

  // 4. Initialize Hall Interrupt
  pinMode(PIN_HALL, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_HALL), onHallPulse, FALLING);

  // 5. Initialize ESC PWM
  ESP32PWM::allocateTimer(0);
  esc.setPeriodHertz(50); // 50 Hz standard servo/ESC frequency
  esc.attach(PIN_ESC_PWM, 1000, 2000); // 1000us (idle) to 2000us (full)
  esc.writeMicroseconds(1000); // Arm ESC at 0 throttle

  // 6. Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\n✅ Wi-Fi Connected! IP: " + WiFi.localIP().toString());
}

void loop() {
  unsigned long now = millis();

  // 1. Calculate Motor RPM (every 500ms)
  if (now - lastRpmCalcTime >= 500) {
    noInterrupts();
    unsigned long pulses = pulseCount;
    pulseCount = 0;
    interrupts();

    // For 7 pole-pairs (14 poles), 7 pulses per revolution
    float revs = (float)pulses / 7.0;
    float dtSec = (float)(now - lastRpmCalcTime) / 1000.0;
    currentRpm = (revs / dtSec) * 60.0;
    lastRpmCalcTime = now;
  }

  // 2. Read Voltage and Current from INA226
  float voltage = ina226.getBusVoltage_V();
  float current = ina226.getCurrent_mA() / 1000.0; // in Amperes

  // 3. Read Stator Temperature from DS18B20
  tempSensor.requestTemperatures();
  float temperature = tempSensor.getTempCByIndex(0);

  // 4. Read Vibration from ADXL345
  sensors_event_t event;
  adxl.getEvent(&event);
  // Convert m/s^2 to g (1g = 9.80665 m/s^2)
  float gx = event.acceleration.x / 9.80665;
  float gy = event.acceleration.y / 9.80665;
  float gz = event.acceleration.z / 9.80665;
  float vibRms = sqrt((gx*gx + gy*gy + gz*gz) / 3.0);

  // 5. Check Cloud Status for Conveyor ON/OFF command
  bool conveyorRunning = checkCloudControl();

  // 6. Control ESC based on ON/OFF State
  if (conveyorRunning) {
    esc.writeMicroseconds(1450); // Run conveyor at ~3600 RPM
  } else {
    esc.writeMicroseconds(1000); // Stop motor
  }

  // 7. Transmit JSON Telemetry to Cloud
  sendTelemetry(voltage, current, currentRpm, temperature, vibRms, conveyorRunning);

  delay(250); // 4Hz transmission loop
}

bool checkCloudControl() {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.begin(STATUS_URL);
  int httpCode = http.GET();
  bool running = false;
  if (httpCode == 200) {
    String payload = http.getString();
    // Parse JSON field "conveyor_running"
    if (payload.indexOf("\"conveyor_running\":true") > 0) {
      running = true;
    }
  }
  http.end();
  return running;
}

void sendTelemetry(float v, float i, float rpm, float temp, float vib, bool running) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String json = "{";
  json += "\"device_id\":\"CONVEYOR_BLDC_01\",";
  json += "\"voltage\":" + String(v, 2) + ",";
  json += "\"current\":" + String(i, 2) + ",";
  json += "\"rpm\":" + String(rpm, 0) + ",";
  json += "\"temperature\":" + String(temp, 1) + ",";
  json += "\"vibration_rms\":" + String(vib, 3) + ",";
  json += "\"conveyor_running\":" + String(running ? "true" : "false");
  json += "}";

  int code = http.POST(json);
  http.end();
}

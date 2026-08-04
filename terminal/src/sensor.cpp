#include "sensor.h"

#include <algorithm>
#include <random>

SensorSimulator::SensorSimulator()
    : engine_(std::random_device{}()),
      temperature_(24.0, 3.0),
      humidity_(65.0, 8.0),
      soilMoisture_(48.0, 10.0),
      light_(18000.0, 5000.0) {}

SensorReadings SensorSimulator::sample() {
    return {
        std::clamp(temperature_(engine_), -20.0, 60.0),
        std::clamp(humidity_(engine_), 0.0, 100.0),
        std::clamp(soilMoisture_(engine_), 0.0, 100.0),
        std::clamp(light_(engine_), 0.0, 120000.0),
    };
}

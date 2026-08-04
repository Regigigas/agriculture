#pragma once

#include <random>

struct SensorReadings {
    double temperature;
    double humidity;
    double soilMoisture;
    double light;
};

class SensorSimulator {
public:
    SensorSimulator();
    SensorReadings sample();

private:
    std::mt19937 engine_;
    std::normal_distribution<double> temperature_;
    std::normal_distribution<double> humidity_;
    std::normal_distribution<double> soilMoisture_;
    std::normal_distribution<double> light_;
};

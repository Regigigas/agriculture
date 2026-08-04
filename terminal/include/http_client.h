#pragma once

#include "config.h"
#include "sensor.h"

#include <string>

struct HttpResult {
    bool transportOk = false;
    int statusCode = 0;
    std::string statusLine;
    std::string error;

    bool successful() const {
        return transportOk && statusCode >= 200 && statusCode < 300;
    }
};

class HttpClient {
public:
    HttpClient();
    ~HttpClient();

    HttpClient(const HttpClient&) = delete;
    HttpClient& operator=(const HttpClient&) = delete;

    HttpResult postTelemetry(const Config& config, const SensorReadings& readings) const;

private:
    bool initialized_ = false;
    std::string initializationError_;
};

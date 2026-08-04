#include "config.h"
#include "http_client.h"
#include "sensor.h"

#include <chrono>
#include <csignal>
#include <ctime>
#include <exception>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

namespace {

volatile std::sig_atomic_t gRunning = 1;

void signalHandler(int) {
    gRunning = 0;
}

#ifdef _WIN32
BOOL WINAPI consoleHandler(DWORD event) {
    if (event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT || event == CTRL_CLOSE_EVENT ||
        event == CTRL_LOGOFF_EVENT || event == CTRL_SHUTDOWN_EVENT) {
        gRunning = 0;
        return TRUE;
    }
    return FALSE;
}
#endif

std::string timestamp() {
    const std::time_t now = std::time(nullptr);
    std::tm local{};
#ifdef _WIN32
    localtime_s(&local, &now);
#else
    localtime_r(&now, &local);
#endif
    std::ostringstream output;
    output << std::put_time(&local, "%Y-%m-%d %H:%M:%S");
    return output.str();
}

void log(const std::string& level, const std::string& message) {
    std::cout << '[' << timestamp() << "] [" << level << "] " << message << std::endl;
}

void sleepInterruptibly(unsigned int seconds) {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(seconds);
    while (gRunning != 0 && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

}  // namespace

int main(int argc, char* argv[]) {
    ConfigParseResult parsed;
    try {
        parsed = parseConfig(argc, argv);
    } catch (const std::exception& error) {
        std::cerr << "Configuration error: " << error.what() << '\n'
                  << usage(argv[0]);
        return 2;
    }

    if (parsed.showHelp) {
        std::cout << usage(argv[0]);
        return 0;
    }

    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);
#ifdef _WIN32
    SetConsoleCtrlHandler(consoleHandler, TRUE);
#else
    std::signal(SIGPIPE, SIG_IGN);
#endif

    const Config& config = parsed.config;
    log("INFO", "Terminal started: host=" + config.host + ':' + std::to_string(config.port) +
                    ", device=" + config.deviceId +
                    ", interval=" + std::to_string(config.intervalSeconds) + "s");

    SensorSimulator sensors;
    HttpClient client;
    do {
        const SensorReadings readings = sensors.sample();
        std::ostringstream values;
        values << std::fixed << std::setprecision(2)
               << "temperature=" << readings.temperature
               << ", humidity=" << readings.humidity
               << ", soilMoisture=" << readings.soilMoisture
               << ", light=" << readings.light;
        log("INFO", "Sampled " + values.str());

        const HttpResult result = client.postTelemetry(config, readings);
        if (result.successful()) {
            log("INFO", "Telemetry accepted: " + result.statusLine);
        } else if (result.transportOk) {
            log("WARN", "Server rejected telemetry: " + result.statusLine);
        } else {
            log("ERROR", "Telemetry delivery failed: " + result.error);
        }

        if (config.once) {
            break;
        }
        sleepInterruptibly(config.intervalSeconds);
    } while (gRunning != 0);

    log("INFO", "Terminal stopped");
    return 0;
}

#pragma once

#include <cstdint>
#include <string>

struct Config {
    std::string host = "127.0.0.1";
    std::uint16_t port = 3100;
    std::string deviceId = "DEV-001";
    unsigned int intervalSeconds = 5;
    bool once = false;
};

struct ConfigParseResult {
    Config config;
    bool showHelp = false;
};

ConfigParseResult parseConfig(int argc, char* argv[]);
std::string usage(const char* programName);

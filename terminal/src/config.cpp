#include "config.h"

#include <limits>
#include <stdexcept>
#include <string>
#include <unordered_set>

namespace {

unsigned long parseUnsigned(const std::string& option, const std::string& value,
                            unsigned long minimum, unsigned long maximum) {
    if (value.empty() || value.front() == '-') {
        throw std::invalid_argument(option + " requires a positive integer");
    }

    std::size_t consumed = 0;
    unsigned long parsed = 0;
    try {
        parsed = std::stoul(value, &consumed, 10);
    } catch (const std::exception&) {
        throw std::invalid_argument(option + " requires a valid integer");
    }

    if (consumed != value.size() || parsed < minimum || parsed > maximum) {
        throw std::invalid_argument(option + " must be between " +
                                    std::to_string(minimum) + " and " +
                                    std::to_string(maximum));
    }
    return parsed;
}

std::string requireValue(int& index, int argc, char* argv[], const std::string& option) {
    if (index + 1 >= argc) {
        throw std::invalid_argument(option + " requires a value");
    }
    const std::string value = argv[++index];
    if (value.empty() || value.front() == '-') {
        throw std::invalid_argument(option + " requires a value (use " + option + " VALUE)");
    }
    return value;
}

void validateText(const std::string& option, const std::string& value) {
    if (value.empty()) {
        throw std::invalid_argument(option + " cannot be empty");
    }
    if (value.find('\r') != std::string::npos || value.find('\n') != std::string::npos) {
        throw std::invalid_argument(option + " cannot contain line breaks");
    }
}

}  // namespace

ConfigParseResult parseConfig(int argc, char* argv[]) {
    ConfigParseResult result;
    std::unordered_set<std::string> seen;

    for (int i = 1; i < argc; ++i) {
        const std::string option = argv[i];
        if (option == "--help") {
            result.showHelp = true;
            continue;
        }
        if (option == "--once") {
            if (!seen.insert(option).second) {
                throw std::invalid_argument("duplicate option: " + option);
            }
            result.config.once = true;
            continue;
        }
        if (option != "--host" && option != "--port" && option != "--device" &&
            option != "--interval") {
            throw std::invalid_argument("unknown option: " + option);
        }
        if (!seen.insert(option).second) {
            throw std::invalid_argument("duplicate option: " + option);
        }

        const std::string value = requireValue(i, argc, argv, option);
        if (option == "--host") {
            validateText(option, value);
            result.config.host = value;
        } else if (option == "--port") {
            result.config.port = static_cast<std::uint16_t>(
                parseUnsigned(option, value, 1, std::numeric_limits<std::uint16_t>::max()));
        } else if (option == "--device") {
            validateText(option, value);
            result.config.deviceId = value;
        } else {
            result.config.intervalSeconds = static_cast<unsigned int>(
                parseUnsigned(option, value, 1, 86400));
        }
    }

    return result;
}

std::string usage(const char* programName) {
    return std::string("Usage: ") + programName +
           " [--host HOST] [--port PORT] [--device ID] [--interval SECONDS] [--once]\n"
           "Defaults: --host 127.0.0.1 --port 3100 --device DEV-001 --interval 5\n";
}

#include "http_client.h"

#include <cerrno>
#include <cstring>
#include <iomanip>
#include <sstream>
#include <string>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <fcntl.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#endif

namespace {

#ifdef _WIN32
using SocketHandle = SOCKET;
constexpr SocketHandle kInvalidSocket = INVALID_SOCKET;

void closeSocket(SocketHandle socket) {
    closesocket(socket);
}

std::string socketError() {
    return "Winsock error " + std::to_string(WSAGetLastError());
}
#else
using SocketHandle = int;
constexpr SocketHandle kInvalidSocket = -1;

void closeSocket(SocketHandle socket) {
    close(socket);
}

std::string socketError() {
    return std::strerror(errno);
}
#endif

class SocketGuard {
public:
    explicit SocketGuard(SocketHandle socket = kInvalidSocket) : socket_(socket) {}
    ~SocketGuard() {
        if (socket_ != kInvalidSocket) {
            closeSocket(socket_);
        }
    }

    SocketGuard(const SocketGuard&) = delete;
    SocketGuard& operator=(const SocketGuard&) = delete;

private:
    SocketHandle socket_;
};

std::string encodePathSegment(const std::string& value) {
    constexpr char hex[] = "0123456789ABCDEF";
    std::string encoded;
    for (const unsigned char character : value) {
        const bool unreserved =
            (character >= 'A' && character <= 'Z') ||
            (character >= 'a' && character <= 'z') ||
            (character >= '0' && character <= '9') ||
            character == '-' || character == '.' || character == '_' || character == '~';
        if (unreserved) {
            encoded.push_back(static_cast<char>(character));
        } else {
            encoded.push_back('%');
            encoded.push_back(hex[character >> 4]);
            encoded.push_back(hex[character & 0x0F]);
        }
    }
    return encoded;
}

std::string buildBody(const SensorReadings& readings) {
    std::ostringstream body;
    body << std::fixed << std::setprecision(2)
         << "{\"temperature\":" << readings.temperature << ','
         << "\"humidity\":" << readings.humidity << ','
         << "\"soilMoisture\":" << readings.soilMoisture << ','
         << "\"light\":" << readings.light << '}';
    return body.str();
}

bool setSocketTimeouts(SocketHandle socket) {
#ifdef _WIN32
    const DWORD timeout = 5000;
    return setsockopt(socket, SOL_SOCKET, SO_SNDTIMEO,
                      reinterpret_cast<const char*>(&timeout), sizeof(timeout)) == 0 &&
           setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO,
                      reinterpret_cast<const char*>(&timeout), sizeof(timeout)) == 0;
#else
    const timeval timeout{5, 0};
    return setsockopt(socket, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)) == 0 &&
           setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) == 0;
#endif
}

bool setBlocking(SocketHandle socket, bool blocking, std::string& error) {
#ifdef _WIN32
    u_long mode = blocking ? 0UL : 1UL;
    if (ioctlsocket(socket, FIONBIO, &mode) != 0) {
        error = "setting socket mode failed: " + socketError();
        return false;
    }
#else
    const int flags = fcntl(socket, F_GETFL, 0);
    if (flags < 0 || fcntl(socket, F_SETFL,
                           blocking ? (flags & ~O_NONBLOCK) : (flags | O_NONBLOCK)) < 0) {
        error = "setting socket mode failed: " + socketError();
        return false;
    }
#endif
    return true;
}

bool connectWithTimeout(SocketHandle socket, const addrinfo& address, std::string& error) {
    if (!setBlocking(socket, false, error)) {
        return false;
    }

    const int connectResult = connect(socket, address.ai_addr,
#ifdef _WIN32
                                      static_cast<int>(address.ai_addrlen)
#else
                                      address.ai_addrlen
#endif
    );
    if (connectResult != 0) {
#ifdef _WIN32
        const int code = WSAGetLastError();
        if (code != WSAEWOULDBLOCK && code != WSAEINPROGRESS) {
            error = "connect failed: Winsock error " + std::to_string(code);
            return false;
        }
#else
        if (errno != EINPROGRESS) {
            error = "connect failed: " + socketError();
            return false;
        }
#endif

        fd_set writable;
        FD_ZERO(&writable);
        FD_SET(socket, &writable);
        timeval timeout{5, 0};
#ifdef _WIN32
        const int selected = select(0, nullptr, &writable, nullptr, &timeout);
#else
        const int selected = select(socket + 1, nullptr, &writable, nullptr, &timeout);
#endif
        if (selected == 0) {
            error = "connect timed out after 5 seconds";
            return false;
        }
        if (selected < 0) {
            error = "connect wait failed: " + socketError();
            return false;
        }

        int socketStatus = 0;
#ifdef _WIN32
        int statusLength = sizeof(socketStatus);
        if (getsockopt(socket, SOL_SOCKET, SO_ERROR,
                       reinterpret_cast<char*>(&socketStatus), &statusLength) != 0) {
#else
        socklen_t statusLength = sizeof(socketStatus);
        if (getsockopt(socket, SOL_SOCKET, SO_ERROR, &socketStatus, &statusLength) != 0) {
#endif
            error = "reading connect status failed: " + socketError();
            return false;
        }
        if (socketStatus != 0) {
#ifdef _WIN32
            error = "connect failed: Winsock error " + std::to_string(socketStatus);
#else
            error = std::string("connect failed: ") + std::strerror(socketStatus);
#endif
            return false;
        }
    }

    if (!setBlocking(socket, true, error)) {
        return false;
    }
    if (!setSocketTimeouts(socket)) {
        error = "setting socket timeout failed: " + socketError();
        return false;
    }
    return true;
}

bool sendAll(SocketHandle socket, const std::string& request, std::string& error) {
    std::size_t sent = 0;
    while (sent < request.size()) {
        const std::size_t remaining = request.size() - sent;
#ifdef _WIN32
        const int chunk = send(socket, request.data() + sent,
                               static_cast<int>(remaining), 0);
#else
#ifdef MSG_NOSIGNAL
        const ssize_t chunk = send(socket, request.data() + sent, remaining, MSG_NOSIGNAL);
#else
        const ssize_t chunk = send(socket, request.data() + sent, remaining, 0);
#endif
#endif
        if (chunk <= 0) {
            error = "send failed: " + socketError();
            return false;
        }
        sent += static_cast<std::size_t>(chunk);
    }
    return true;
}

bool receiveStatusLine(SocketHandle socket, std::string& statusLine, std::string& error) {
    std::string response;
    char buffer[512];
    while (response.size() < 8192) {
#ifdef _WIN32
        const int received = recv(socket, buffer, sizeof(buffer), 0);
#else
        const ssize_t received = recv(socket, buffer, sizeof(buffer), 0);
#endif
        if (received < 0) {
            error = "receive failed: " + socketError();
            return false;
        }
        if (received == 0) {
            error = "connection closed before HTTP status line";
            return false;
        }
        response.append(buffer, static_cast<std::size_t>(received));
        const std::size_t end = response.find("\r\n");
        if (end != std::string::npos) {
            statusLine = response.substr(0, end);
            return true;
        }
    }
    error = "HTTP status line exceeds 8192 bytes";
    return false;
}

bool parseStatusCode(const std::string& statusLine, int& statusCode) {
    std::istringstream stream(statusLine);
    std::string version;
    stream >> version >> statusCode;
    return stream && version.rfind("HTTP/", 0) == 0 && statusCode >= 100 && statusCode <= 599;
}

}  // namespace

HttpClient::HttpClient() {
#ifdef _WIN32
    WSADATA data{};
    const int result = WSAStartup(MAKEWORD(2, 2), &data);
    if (result != 0) {
        initializationError_ = "WSAStartup failed: " + std::to_string(result);
        return;
    }
#endif
    initialized_ = true;
}

HttpClient::~HttpClient() {
#ifdef _WIN32
    if (initialized_) {
        WSACleanup();
    }
#endif
}

HttpResult HttpClient::postTelemetry(const Config& config,
                                     const SensorReadings& readings) const {
    HttpResult result;
    if (!initialized_) {
        result.error = initializationError_;
        return result;
    }

    addrinfo hints{};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;
    addrinfo* addresses = nullptr;
    const std::string port = std::to_string(config.port);
    const int lookup = getaddrinfo(config.host.c_str(), port.c_str(), &hints, &addresses);
    if (lookup != 0) {
#ifdef _WIN32
        result.error = "DNS lookup failed: " + std::to_string(lookup);
#else
        result.error = std::string("DNS lookup failed: ") + gai_strerror(lookup);
#endif
        return result;
    }

    SocketHandle connected = kInvalidSocket;
    std::string lastError = "no IPv4 address returned";
    for (addrinfo* address = addresses; address != nullptr; address = address->ai_next) {
        SocketHandle candidate = socket(address->ai_family, address->ai_socktype,
                                        address->ai_protocol);
        if (candidate == kInvalidSocket) {
            lastError = "socket creation failed: " + socketError();
            continue;
        }
        if (connectWithTimeout(candidate, *address, lastError)) {
            connected = candidate;
            break;
        }
        closeSocket(candidate);
    }
    freeaddrinfo(addresses);

    if (connected == kInvalidSocket) {
        result.error = lastError;
        return result;
    }
    SocketGuard socketGuard(connected);

    const std::string body = buildBody(readings);
    std::ostringstream request;
    request << "POST /api/devices/" << encodePathSegment(config.deviceId)
            << "/telemetry HTTP/1.1\r\n"
            << "Host: " << config.host << ':' << config.port << "\r\n"
            << "x-device-key: agri-terminal-2026\r\n"
            << "Content-Type: application/json\r\n"
            << "Content-Length: " << body.size() << "\r\n"
            << "Connection: close\r\n\r\n"
            << body;

    std::string requestText = request.str();
    if (!sendAll(connected, requestText, result.error)) {
        return result;
    }
    if (!receiveStatusLine(connected, result.statusLine, result.error)) {
        return result;
    }
    if (!parseStatusCode(result.statusLine, result.statusCode)) {
        result.error = "invalid HTTP status line: " + result.statusLine;
        return result;
    }

    result.transportOk = true;
    return result;
}

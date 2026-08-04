# Agriculture IoT Collection Terminal

A dependency-free C++17 terminal that simulates agricultural sensor readings and sends them to the NestJS telemetry API over HTTP/1.1.

## Build

```sh
cmake -S . -B build
cmake --build build --config Release
```

On Windows, the executable is usually `build/Release/agri_terminal.exe` for multi-config generators. On POSIX and single-config generators it is usually `build/agri_terminal`.

## Run

```sh
agri_terminal
agri_terminal --host 127.0.0.1 --port 3100 --device DEV-001 --interval 5
agri_terminal --once
agri_terminal --help
```

All options use named values; positional values are rejected.

| CLI option | Default | `config.example.json` field | Description |
| --- | --- | --- | --- |
| `--host HOST` | `127.0.0.1` | `host` | NestJS DNS name or IPv4 address |
| `--port PORT` | `3100` | `port` | TCP port, range 1-65535 |
| `--device ID` | `DEV-001` | `deviceId` | Device identifier used in the URL and JSON body |
| `--interval SECONDS` | `5` | `intervalSeconds` | Sampling period, range 1-86400 seconds |
| `--once` | disabled | `once` | Send one sample and exit |

`config.example.json` documents the equivalent settings but is not loaded by the program. CLI options are the configuration source.

## Protocol

Each sample is sent to:

```text
POST /api/devices/:id/telemetry HTTP/1.1
x-device-key: agri-terminal-2026
Content-Type: application/json
```

The body contains `temperature`, `humidity`, `soilMoisture`, and `light`; the device ID is URL-encoded into the endpoint path. The client resolves DNS to IPv4, applies five-second send/receive timeouts, parses the HTTP status line, and treats any 2xx response as success. DNS, connection, transport, and HTTP errors are logged; continuous mode waits for the next interval instead of exiting. Press Ctrl+C to stop.

This client intentionally implements plain HTTP only. Use a trusted local network or a TLS-terminating proxy when transport encryption is required.

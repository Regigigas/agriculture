cmake_minimum_required(VERSION 3.16)

project(agri_terminal VERSION 1.0.0 LANGUAGES CXX)

find_package(Threads REQUIRED)

add_executable(agri_terminal
    src/config.cpp
    src/http_client.cpp
    src/main.cpp
    src/sensor.cpp
)

target_include_directories(agri_terminal PRIVATE include)
target_compile_features(agri_terminal PRIVATE cxx_std_17)
target_link_libraries(agri_terminal PRIVATE Threads::Threads)

if(MSVC)
    target_compile_options(agri_terminal PRIVATE /W4 /permissive-)
else()
    target_compile_options(agri_terminal PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(WIN32)
    target_link_libraries(agri_terminal PRIVATE ws2_32)
endif()

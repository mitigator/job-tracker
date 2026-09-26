@echo off
rem Double-click to start Job Tracker (backend + frontend). Close the window or press Ctrl+C to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*

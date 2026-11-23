@echo off
cd /d "%~dp0"
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0private\scripts\start-local-admin.ps1"
if errorlevel 1 pause

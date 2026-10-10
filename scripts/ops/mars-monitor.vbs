' Launches the health monitor with no visible window (same trick as the watchdog).
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\MARS TST\mars-ops\mars-monitor.ps1""", 0, False

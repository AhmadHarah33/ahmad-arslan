' Launches the watchdog PowerShell script with no visible window.
' powershell.exe -WindowStyle Hidden still flashes a console for a moment when
' started by Task Scheduler; WScript.Shell.Run with intWindowStyle=0 does not.
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\MARS TST\mars-ops\mars-watchdog.ps1""", 0, False

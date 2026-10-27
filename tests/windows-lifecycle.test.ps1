param([string]$NodePath = (Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { Write-Output 'SKIP: Windows lifecycle test'; exit 0 }
$root = Split-Path -Parent $PSScriptRoot
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ("dsh lifecycle '" + [char]0x6D4B + [char]0x8BD5 + '-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$app = Join-Path $testDirectory 'Fake Desktop.exe'
Add-Type -OutputAssembly $app -OutputType WindowsApplication -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
public class FakeDesktop {
  public static void Main() {
    var p = Process.GetCurrentProcess();
    var electron = Environment.GetEnvironmentVariable("ELECTRON_RUN_AS_NODE") ?? "";
    var value = Environment.GetEnvironmentVariable("DSH_TEST_VALUE") ?? "";
    var cwd = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(Environment.CurrentDirectory));
    File.WriteAllText(Environment.GetEnvironmentVariable("DSH_TEST_OUTPUT"),
      "{\"pid\":" + p.Id + ",\"session\":" + p.SessionId + ",\"electron\":\"" + electron +
      "\",\"value\":\"" + value + "\",\"cwd\":\"" + cwd + "\"}");
    Thread.Sleep(60000);
  }
}
'@
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LifecycleJob {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr handle);
}
'@
function Assert($condition, $message) { if (!$condition) { throw $message } }
function Wait-OutputFile($directory, $name) {
  $path = Join-Path $directory $name
  $deadline = [DateTime]::UtcNow.AddSeconds(25)
  while (!(Test-Path -LiteralPath $path)) {
    $errorFile = Join-Path $directory 'error'
    if (Test-Path -LiteralPath $errorFile) { throw (Get-Content -LiteralPath $errorFile -Raw) }
    if ([DateTime]::UtcNow -gt $deadline) { throw "Timed out waiting for $name" }
    Start-Sleep -Milliseconds 100
  }
  # The producer may still be completing its small JSON write.
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { Start-Sleep -Milliseconds 50 }
  }
  throw "Invalid output: $name"
}
foreach ($mode in @('close-host', 'close-desktop')) {
  $directory = Join-Path $testDirectory $mode
  New-Item -ItemType Directory -Path $directory | Out-Null
  $job = [LifecycleJob]::CreateJobObject([IntPtr]::Zero, $null)
  $controller = $null; $desktop = $null; $control = $null
  try {
    Assert ($job -ne [IntPtr]::Zero) 'Cannot create test job'
    $controller = Start-Process -FilePath $NodePath -ArgumentList @(
      ('"' + (Join-Path $root 'tests\fixtures\lifecycle-host.mjs') + '"'),
      ('"' + $directory + '"'), ('"' + $app + '"')
    ) -PassThru -WindowStyle Hidden
    Assert ([LifecycleJob]::AssignProcessToJobObject($job, $controller.Handle)) 'Cannot assign test host to job'
    New-Item -ItemType File -Path (Join-Path $directory 'go') | Out-Null
    $desktopInfo = Wait-OutputFile $directory 'desktop.json'
    $controlInfo = Wait-OutputFile $directory 'control.json'
    $desktop = Get-Process -Id $desktopInfo.pid
    $control = Get-Process -Id $controlInfo.pid
    $inJob = $false
    Assert ([LifecycleJob]::IsProcessInJob($control.Handle, $job, [ref]$inJob)) 'Cannot inspect control job'
    Assert $inJob 'Control child should inherit the host job'
    Assert ([LifecycleJob]::IsProcessInJob($desktop.Handle, $job, [ref]$inJob)) 'Cannot inspect desktop job'
    Assert (!$inJob) 'Desktop inherited the host job'
    Assert ($desktopInfo.session -eq [Diagnostics.Process]::GetCurrentProcess().SessionId) 'Desktop is not in the interactive session'
    Assert ($desktopInfo.electron -eq '') 'ELECTRON_RUN_AS_NODE leaked into desktop'
    $expectedValue = [string][char]0x4E2D + [char]0x6587 + ' path with spaces'
    Assert ($desktopInfo.value -eq $expectedValue) 'Custom environment was lost'
    $actualCwd = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($desktopInfo.cwd))
    Assert ($actualCwd -eq $testDirectory) 'Desktop working directory is incorrect'
    if ($mode -eq 'close-host') {
      Assert ([LifecycleJob]::TerminateJobObject($job, 1)) 'Cannot terminate test host job'
      Assert ($controller.WaitForExit(5000)) 'Host did not close'
      Assert ($control.WaitForExit(5000)) 'Control child did not close with host'
      Start-Sleep -Milliseconds 300
      $desktop.Refresh()
      Assert (!$desktop.HasExited) 'Desktop closed with host'
    } else {
      Stop-Process -Id $desktop.Id
      Assert ($desktop.WaitForExit(5000)) 'Desktop did not close'
      $controller.Refresh()
      Assert (!$controller.HasExited) 'Closing desktop also closed host'
    }
    Write-Output "PASS: $mode; independent job, interactive session, environment and quoted Unicode paths"
  } finally {
    if ($job -ne [IntPtr]::Zero) {
      [LifecycleJob]::TerminateJobObject($job, 1) | Out-Null
      [LifecycleJob]::CloseHandle($job) | Out-Null
    }
    if ($desktop) { $desktop.Refresh(); if (!$desktop.HasExited) { Stop-Process -Id $desktop.Id -ErrorAction SilentlyContinue } }
  }
}


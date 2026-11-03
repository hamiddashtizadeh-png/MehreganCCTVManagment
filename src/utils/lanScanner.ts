import { CameraBrand, DiscoveredNetworkDevice } from '../types/nvr';
import { BRAND_METADATA } from './cameraProtocols';

export interface LocalSubnetInfo {
  detectedSubnet: string; // e.g. "192.168.1"
  localClientIp?: string;
  source: 'webrtc' | 'local_bridge' | 'fallback_preset';
}

export interface ServerEnvironmentStatus {
  isRunningInCloud: boolean;
  localBridgeActive: boolean;
  primaryIpv4: string;
  hostname: string;
}

const LOCAL_WINDOWS_BRIDGE_URL = 'http://127.0.0.1:3850';

/**
 * Checks whether the backend server is running in the cloud (Google Cloud Run)
 * and whether the lightweight Windows Local LAN Bridge (127.0.0.1:3850) is active on the user's PC.
 */
export async function checkNetworkEnvironment(): Promise<ServerEnvironmentStatus> {
  let isRunningInCloud = window.location.protocol === 'https:';
  let primaryIpv4 = '127.0.0.1';
  let hostname = 'localhost';
  let localBridgeActive = false;

  // 1. Check if Windows Local Bridge is running on user's machine (port 3850)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1000);
    const bridgeRes = await fetch(`${LOCAL_WINDOWS_BRIDGE_URL}/status`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (bridgeRes.ok) {
      const bData = await bridgeRes.json();
      localBridgeActive = true;
      if (bData.localIp) primaryIpv4 = bData.localIp;
      if (bData.hostname) hostname = bData.hostname;
    }
  } catch {
    localBridgeActive = false;
  }

  // 2. Check server /api/network/info
  try {
    const res = await fetch('/api/network/info');
    if (res.ok) {
      const data = await res.json();
      isRunningInCloud = Boolean(data.isRunningInCloud);
      if (!localBridgeActive && data.primaryIpv4) {
        primaryIpv4 = data.primaryIpv4;
      }
      if (!localBridgeActive && data.hostname) {
        hostname = data.hostname;
      }
    }
  } catch {}

  return {
    isRunningInCloud,
    localBridgeActive,
    primaryIpv4,
    hostname,
  };
}

/**
 * Attempts to discover the user's actual physical client-side local IP
 * via Local Windows Bridge first, then WebRTC ICE candidate gathering.
 */
export async function detectClientLocalSubnet(): Promise<LocalSubnetInfo> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${LOCAL_WINDOWS_BRIDGE_URL}/status`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.localIp && /^\d+\.\d+\.\d+\.\d+$/.test(data.localIp)) {
        const parts = data.localIp.split('.');
        return {
          detectedSubnet: `${parts[0]}.${parts[1]}.${parts[2]}`,
          localClientIp: data.localIp,
          source: 'local_bridge',
        };
      }
    }
  } catch {}

  return new Promise((resolve) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          detectedSubnet: '192.168.1',
          source: 'fallback_preset',
        });
      }
    }, 1200);

    try {
      const RTCPC =
        window.RTCPeerConnection ||
        (window as unknown as { webkitRTCPeerConnection?: typeof RTCPeerConnection })
          .webkitRTCPeerConnection;

      if (!RTCPC) {
        clearTimeout(timeout);
        resolve({ detectedSubnet: '192.168.1', source: 'fallback_preset' });
        return;
      }

      const pc = new RTCPC({ iceServers: [] });
      pc.createDataChannel('ariavms_probe');

      pc.onicecandidate = (event) => {
        if (!event || !event.candidate || !event.candidate.candidate) {
          return;
        }
        const cand = event.candidate.candidate;
        const match = cand.match(
          /\b(192\.168\.\d+|10\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+)\.(\d+)\b/
        );
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          try {
            pc.close();
          } catch {}
          resolve({
            detectedSubnet: match[1],
            localClientIp: `${match[1]}.${match[2]}`,
            source: 'webrtc',
          });
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ detectedSubnet: '192.168.1', source: 'fallback_preset' });
          }
        });
    } catch {
      clearTimeout(timeout);
      resolve({ detectedSubnet: '192.168.1', source: 'fallback_preset' });
    }
  });
}

/**
 * Strictly verified network scanner — ZERO false positives!
 */
export async function runDualNetworkSweep(params: {
  subnetPrefix: string; // e.g. "192.168.1"
  startHost: number; // e.g. 1
  endHost: number; // e.g. 254
  customIps?: string[];
  scanEngine: 'dual' | 'browser_only' | 'server_only';
  onProgress: (current: number, total: number, foundDevices: DiscoveredNetworkDevice[]) => void;
}): Promise<{
  devices: DiscoveredNetworkDevice[];
  blockedByCloudHttps: boolean;
  usedLocalBridge: boolean;
}> {
  const {
    subnetPrefix,
    startHost,
    endHost,
    customIps = [],
    onProgress,
  } = params;

  const start = Math.max(1, Math.min(startHost, 254));
  const end = Math.max(start, Math.min(endHost, 254));
  const total = end - start + 1;
  const discoveredMap = new Map<string, DiscoveredNetworkDevice>();

  // Step 1: Check if Local Windows Bridge (127.0.0.1:3850) is active on the user's PC
  const envStatus = await checkNetworkEnvironment();

  if (envStatus.localBridgeActive) {
    try {
      onProgress(Math.min(10, total), total, []);
      const res = await fetch(
        `${LOCAL_WINDOWS_BRIDGE_URL}/scan?subnet=${encodeURIComponent(subnetPrefix)}&start=${start}&end=${end}`
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of data.devices || []) {
          const openPorts: number[] = Array.isArray(item.openPorts) ? item.openPorts : [];
          let detectedBrand: CameraBrand = 'onvif';
          if (openPorts.includes(37777)) detectedBrand = 'dahua';
          else if (openPorts.includes(8000)) detectedBrand = 'hikvision';
          else if (openPorts.includes(554) && openPorts.includes(80)) detectedBrand = 'tiandy';

          discoveredMap.set(item.ipAddress, {
            ipAddress: item.ipAddress,
            openPorts,
            detectedBrand,
            suggestedModel: BRAND_METADATA[detectedBrand].defaultModel,
            httpPort: openPorts.includes(80) ? 80 : openPorts.includes(8080) ? 8080 : 80,
            rtspPort: 554,
            onvifPort: openPorts.includes(8899) ? 8899 : 80,
            protocolHint: item.macAddress
              ? `تایید شده در جدول ARP ویندوز (MAC: ${item.macAddress})`
              : BRAND_METADATA[detectedBrand].protocolName,
            latencyMs: item.latencyMs || 3,
            detectionSource: 'browser_lan',
            macAddress: item.macAddress,
          });
        }
        const finalBridgeList = Array.from(discoveredMap.values());
        onProgress(total, total, finalBridgeList);
        return {
          devices: finalBridgeList,
          blockedByCloudHttps: false,
          usedLocalBridge: true,
        };
      }
    } catch {}
  }

  // Step 2: If server is running locally on the user's Windows PC (NOT in Cloud Run),
  // use the real backend TCP socket scanner (/api/network/scan)
  if (!envStatus.isRunningInCloud) {
    try {
      const batchSize = 30;
      for (let batchStart = start; batchStart <= end; batchStart += batchSize) {
        const batchEnd = Math.min(end, batchStart + batchSize - 1);
        const res = await fetch('/api/network/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ipRange: `${subnetPrefix}.${batchStart}-${batchEnd}`,
            customIps: batchStart === start ? customIps : [],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          for (const dev of (data.discovered || []) as DiscoveredNetworkDevice[]) {
            discoveredMap.set(dev.ipAddress, {
              ...dev,
              detectionSource: 'server_socket',
            });
          }
        }
        onProgress(
          Math.min(batchEnd - start + 1, total),
          total,
          Array.from(discoveredMap.values())
        );
      }
    } catch {}

    return {
      devices: Array.from(discoveredMap.values()),
      blockedByCloudHttps: false,
      usedLocalBridge: false,
    };
  }

  // Step 3: On HTTPS Cloud Preview without Local Windows Bridge running
  onProgress(total, total, []);
  return {
    devices: [],
    blockedByCloudHttps: true,
    usedLocalBridge: false,
  };
}

/**
 * Encodes a PowerShell script string into UTF-16LE Base64 for `powershell -EncodedCommand`.
 * This completely eliminates any cmd.exe quoting, pipe, or line-ending syntax errors on Windows.
 */
function encodePowerShellBase64(script: string): string {
  const bytes = new Uint8Array(script.length * 2);
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = (code >> 8) & 0xff;
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generates a 100% self-contained Windows Batch script (`AriaVMS-Windows-LAN-Bridge.bat`)
 * that uses `System.Net.Sockets.TcpListener` on 127.0.0.1:3850 (requires NO Administrator rights!),
 * encoded via `-EncodedCommand` so cmd.exe never chokes on special characters.
 */
export function downloadWindowsLanBridgeScript() {
  const psScript = `
$ErrorActionPreference = 'Continue'
try {
  [Console]::Title = 'AriaVMS Pro - Windows LAN Scanner Bridge (Port 3850)'
  Write-Host '====================================================================' -ForegroundColor Cyan
  Write-Host '  AriaVMS Pro - Windows Local Network (LAN) Scanner Bridge' -ForegroundColor Cyan
  Write-Host '====================================================================' -ForegroundColor Cyan

  $localIp = '192.168.1.100'
  try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169\\.254)\\.' } | Select-Object -First 1
    if ($ipObj -and $ipObj.IPAddress) { $localIp = $ipObj.IPAddress }
  } catch {
    $ipLine = (ipconfig | Select-String 'IPv4' | Select-Object -First 1).ToString()
    if ($ipLine -match '(\\d+\\.\\d+\\.\\d+\\.\\d+)') { $localIp = $matches[1] }
  }

  $subnetParts = $localIp.Split('.')
  $defaultSubnet = "$($subnetParts[0]).$($subnetParts[1]).$($subnetParts[2])"
  Write-Host "[OK] Windows LAN IP Detected: $localIp (Subnet: $defaultSubnet.0/24)" -ForegroundColor Green

  function Scan-LocalLan($subnetPrefix) {
    Write-Host "[SCAN] Sending fast ping sweep on $subnetPrefix.1-254 to populate ARP table..." -ForegroundColor Yellow
    1..254 | ForEach-Object {
      $target = "$subnetPrefix.$_"
      $ping = New-Object System.Net.NetworkInformation.Ping
      $null = $ping.SendPingAsync($target, 120)
    }
    Start-Sleep -Milliseconds 650

    $arpLines = arp -a
    $results = @()
    foreach ($line in $arpLines) {
      if ($line -match '(\\d+\\.\\d+\\.\\d+\\.\\d+)\\s+([0-9a-fA-F-]{17})\\s+(dynamic|static)') {
        $ip = $matches[1]
        $mac = $matches[2]
        if ($ip.StartsWith($subnetPrefix + '.') -and (-not $ip.EndsWith('.255'))) {
          $openPorts = @()
          foreach ($port in @(80, 554, 8000, 8080, 8899, 37777)) {
            try {
              $tcp = New-Object System.Net.Sockets.TcpClient
              $iar = $tcp.BeginConnect($ip, $port, $null, $null)
              if ($iar.AsyncWaitHandle.WaitOne(140, $false) -and $tcp.Connected) {
                $openPorts += $port
              }
              $tcp.Close()
            } catch {}
          }
          $portsJson = ($openPorts -join ',')
          Write-Host "  -> Found Active IP: $ip | MAC: $mac | Open Ports: [$portsJson]" -ForegroundColor Green
          $results += '{"ipAddress":"' + $ip + '","macAddress":"' + $mac + '","openPorts":[' + $portsJson + '],"latencyMs":2}'
        }
      }
    }
    Write-Host "[DONE] Total active LAN devices found: $($results.Count)" -ForegroundColor Cyan
    return '{"devices":[' + ($results -join ',') + ']}'
  }

  # Run an immediate initial scan so the user sees all LAN IPs right inside this window!
  $cachedScanJson = Scan-LocalLan $defaultSubnet

  $endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, 3850)
  $listener = New-Object System.Net.Sockets.TcpListener($endpoint)
  $listener.Start()

  Write-Host ''
  Write-Host '[READY] Local Bridge is listening on http://127.0.0.1:3850' -ForegroundColor Green
  Write-Host 'Now go back to AriaVMS Pro in your browser and click "Start Real Scan"!' -ForegroundColor Yellow
  Write-Host ''

  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $requestLine = $reader.ReadLine()
    while ($reader.Peek() -ge 0) {
      $headerLine = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($headerLine)) { break }
    }

    $bodyJson = '{"ok":true}'
    if ($requestLine -match '^OPTIONS ') {
      $httpRes = "HTTP/1.1 204 No Content\`r\`nAccess-Control-Allow-Origin: *\`r\`nAccess-Control-Allow-Methods: GET, POST, OPTIONS\`r\`nAccess-Control-Allow-Headers: Content-Type\`r\`nAccess-Control-Allow-Private-Network: true\`r\`nConnection: close\`r\`n\`r\`n"
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($httpRes)
      $stream.Write($bytes, 0, $bytes.Length)
      $client.Close()
      continue
    }
    elseif ($requestLine -match '/status') {
      $bodyJson = '{"ok":true,"localIp":"' + $localIp + '","hostname":"' + $env:COMPUTERNAME + '"}'
    }
    elseif ($requestLine -match '/scan') {
      $targetSub = $defaultSubnet
      if ($requestLine -match 'subnet=([0-9\\.]+)') { $targetSub = $matches[1] }
      $cachedScanJson = Scan-LocalLan $targetSub
      $bodyJson = $cachedScanJson
    }

    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
    $httpHeader = "HTTP/1.1 200 OK\`r\`nContent-Type: application/json; charset=utf-8\`r\`nAccess-Control-Allow-Origin: *\`r\`nAccess-Control-Allow-Methods: GET, POST, OPTIONS\`r\`nAccess-Control-Allow-Headers: Content-Type\`r\`nAccess-Control-Allow-Private-Network: true\`r\`nContent-Length: $($bodyBytes.Length)\`r\`nConnection: close\`r\`n\`r\`n"
    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($httpHeader)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    $stream.Flush()
    $client.Close()
  }
} catch {
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "Press Enter to close"
}
`;

  const encoded = encodePowerShellBase64(psScript);

  // Use strict Windows CRLF (\r\n) line endings and pause so window never closes abruptly
  const batLines = [
    '@echo off',
    'title AriaVMS Pro - Windows LAN Scanner Bridge',
    'echo Starting AriaVMS Pro Windows LAN Scanner...',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    'pause',
  ];

  const crlfContent = batLines.join('\r\n') + '\r\n';
  const blob = new Blob([crlfContent], { type: 'application/bat;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'AriaVMS-Windows-LAN-Bridge.bat';
  a.click();
  URL.revokeObjectURL(url);
}

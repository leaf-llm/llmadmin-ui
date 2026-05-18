; Local LLM Gateway - Inno Setup Installer Script
; Version is injected via ISCC command-line: /DAppVersion=x.y.z

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{com-local-llm-gateway-app}
AppName=Local LLM Gateway
AppVersion={#AppVersion}
AppPublisher=Portkey AI
AppPublisherURL=https://portkey.ai
AppSupportURL=https://github.com/Portkey-AI/gateway
DefaultDirName={autopf}\Local LLM Gateway
DefaultGroupName=Local LLM Gateway
UninstallDisplayName=Local LLM Gateway
UninstallDisplayIcon={app}\local-llm-gateway-win_x64.exe
OutputBaseFilename=Local-LLM-Gateway-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
SetupIconFile=icon.ico
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "local-llm-gateway-win_x64.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "portkey-gateway.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "resources.neu"; DestDir: "{app}"; Flags: ignoreversion
#if DirExists("public")
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
#endif

[Icons]
Name: "{group}\Local LLM Gateway"; Filename: "{app}\local-llm-gateway-win_x64.exe"
Name: "{group}\Uninstall Local LLM Gateway"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Local LLM Gateway"; Filename: "{app}\local-llm-gateway-win_x64.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\local-llm-gateway-win_x64.exe"; Description: "&Launch Local LLM Gateway"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

; LLM Admin - Inno Setup Installer Script
; Version is injected via ISCC command-line: /DAppVersion=x.y.z

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{com-llm-admin-app}
AppName=LLM Admin
AppVersion={#AppVersion}
AppPublisher=LLM Admin
AppPublisherURL=https://llmadmin.dev
AppSupportURL=https://github.com/llm-admin/gateway
DefaultDirName={autopf}\LLM Admin
DefaultGroupName=LLM Admin
UninstallDisplayName=LLM Admin
UninstallDisplayIcon={app}\llm-admin-win_x64.exe
OutputBaseFilename=LLM-Admin-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
SetupIconFile=icon.ico
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "llm-admin-win_x64.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "llm-gateway.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion
#if DirExists("public")
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
#endif

[Icons]
Name: "{group}\LLM Admin"; Filename: "{app}\llm-admin-win_x64.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\Uninstall LLM Admin"; Filename: "{uninstallexe}"
Name: "{autodesktop}\LLM Admin"; Filename: "{app}\llm-admin-win_x64.exe"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\llm-admin-win_x64.exe"; Description: "&Launch LLM Admin"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

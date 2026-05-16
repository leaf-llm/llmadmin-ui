; Inno Setup Script for Local LLM Gateway
; Requires Inno Setup 6.x (https://jrsoftware.org/isinfo.php)

#define MyAppName "Local LLM Gateway"
#define MyAppVersion "1.15.2"
#define MyAppPublisher "Portkey AI"
#define MyAppURL "https://github.com/Portkey-AI/gateway"
#define MyAppExeName "local-llm-gateway.exe"
#define MyAppSourceDir "."

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=LocalLLMGateway-{#MyAppVersion}-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
SourceDir={#MyAppSourceDir}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "local-llm-gateway-win_x64.exe"; DestDir: "{app}"; DestName: "local-llm-gateway.exe"; Flags: ignoreversion
Source: "resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "portkey-gateway.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.ts,*.map"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
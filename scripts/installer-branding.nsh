Var playeriumShortcutName
!undef SHORTCUT_NAME
!define SHORTCUT_NAME "$playeriumShortcutName"

!macro detectPlayeriumName
  System::Call 'kernel32::GetUserDefaultUILanguage() i.r0'
  IntOp $0 $0 & 0x3ff
  System::Call 'kernel32::GetUserGeoID(i 16) i.r1'
  StrCpy $playeriumShortcutName "Playerium"
  ${If} $0 == 25
    StrCpy $playeriumShortcutName "Проигрыватель"
  ${ElseIf} $1 == 203
    StrCpy $playeriumShortcutName "Проигрыватель"
  ${EndIf}
!macroend

!macro customInit
  !insertmacro detectPlayeriumName
!macroend

!macro customUnInit
  !insertmacro detectPlayeriumName
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayName "$playeriumShortcutName"
!macroend

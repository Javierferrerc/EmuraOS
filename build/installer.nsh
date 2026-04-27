; INSTDIR override removed in 0.1.5: we now install per-user under
; %LOCALAPPDATA%\Programs\EmuraOS (electron-builder default for
; perMachine: false). That removes the manifest requireAdministrator
; flag that broke auto-updates on broken v0.1.2 / v0.1.3 clients.

!macro customUnInstall
  MessageBox MB_YESNO "¿Desea eliminar también los datos de la aplicación (ROMs, emuladores, configuración)? Se encuentran en $PROFILE\EmuraOS\" IDYES deleteUserData IDNO skipDelete
  deleteUserData:
    RMDir /r "$PROFILE\EmuraOS"
    RMDir /r "$APPDATA\EmuraOS"
    RMDir /r "$LOCALAPPDATA\EmuraOS"
  skipDelete:
!macroend

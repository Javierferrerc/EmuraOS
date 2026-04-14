!macro customUnInstall
  MessageBox MB_YESNO "¿Desea eliminar también los datos de la aplicación (ROMs, emuladores, configuración)? Se encuentran en $PROFILE\EmuraOS\" IDYES deleteUserData IDNO skipDelete
  deleteUserData:
    RMDir /r "$PROFILE\EmuraOS"
    RMDir /r "$APPDATA\EmuraOS"
    RMDir /r "$LOCALAPPDATA\EmuraOS"
  skipDelete:
!macroend

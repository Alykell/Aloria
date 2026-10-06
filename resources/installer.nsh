; Inclus automatiquement par electron-builder (dossier buildResources).
; Propose de créer le raccourci du bureau à la première installation ; les mises à jour
; automatiques (silencieuses) ne posent pas la question et gardent le raccourci existant.

!macro customInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Créer un raccourci Aloria sur le bureau ?" /SD IDYES IDNO aloria_no_shortcut
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    aloria_no_shortcut:
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${endIf}
!macroend

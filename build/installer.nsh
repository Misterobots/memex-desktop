; Every installer run requires a fresh in-app setup pass. This marker lives in
; the install directory, leaving existing userData (projects/sessions/settings)
; untouched until setup finishes.
!macro customInstall
  FileOpen $0 "$INSTDIR\.memex-setup-required" w
  FileWrite $0 "setup required after install"
  FileClose $0
!macroend

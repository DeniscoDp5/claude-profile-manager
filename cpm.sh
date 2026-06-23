# cpm - Claude Profile Manager - integrazione shell (bash / zsh)
# ---------------------------------------------------------------------------
# Aggiungi questa riga al tuo ~/.bashrc o ~/.zshrc:
#
#     source "/percorso/assoluto/cpm.sh"
#
# Modo rapido per scriverla automaticamente:
#
#     cpm shell-init >> ~/.bashrc      # oppure ~/.zshrc
#
# Poi riapri il terminale (o esegui: source ~/.bashrc).
# ---------------------------------------------------------------------------

# Marker: segnala al binario Node che l'integrazione shell e' attiva.
export CPM_SHELL_INTEGRATION=1

# All'avvio della shell: carica il profilo di default persistito da `cpm use`/
# `cpm login`, ma solo se CLAUDE_CONFIG_DIR non e' gia' impostata manualmente.
if [ -z "$CLAUDE_CONFIG_DIR" ] && [ -f "$HOME/.claude_profiles/.active" ]; then
  __cpm_active="$(cat "$HOME/.claude_profiles/.active" 2>/dev/null)"
  if [ -n "$__cpm_active" ] && [ -d "$HOME/.claude_profiles/$__cpm_active" ]; then
    export CLAUDE_CONFIG_DIR="$HOME/.claude_profiles/$__cpm_active"
  fi
  unset __cpm_active
fi

# Funzione che intercetta `use` (e il post-login) per modificare DAVVERO
# l'ambiente della shell corrente; tutto il resto e' delegato al bin Node.
cpm() {
  case "$1" in
    use)
      shift
      local __cpm_out
      # NB: dichiarazione e assegnazione separate, altrimenti `local`
      # maschererebbe il codice di uscita di cpm.
      __cpm_out="$(command cpm use "$@")" || return $?
      eval "$__cpm_out"
      ;;
    login)
      shift
      command cpm login "$@" || return $?
      # Dopo un login andato a buon fine, attiva il profilo anche nella
      # shell corrente (l'ultimo argomento e' il nome del profilo).
      local __cpm_out
      __cpm_out="$(command cpm use "$@")" || return $?
      eval "$__cpm_out"
      ;;
    *)
      command cpm "$@"
      ;;
  esac
}

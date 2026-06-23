# cpm — Claude Profile Manager

> `nvm` per le versioni di Node, `--profile` per AWS… **`cpm` per i tuoi account Claude.**

`cpm` è un profile switcher per la CLI ufficiale di Claude. Pensato per programmatori e agenti AI, permette di **alternare istantaneamente più profili/account** (es. *personale* e *lavoro*), mantenendo ogni sessione di login **completamente isolata** — inclusa l'identità dell'account (email) mostrata in console.

Funziona impostando nativamente la variabile d'ambiente **`CLAUDE_CONFIG_DIR`**: quando è valorizzata, la CLI di Claude scrive *tutta* la sua configurazione in quel percorso, invece che nelle directory standard condivise. Ogni profilo diventa così una cartella autosufficiente e autonoma.

Zero dipendenze esterne — solo i moduli nativi di Node.

---

## ✨ Caratteristiche

- 🔀 **Switch istantaneo** tra account Claude con un solo comando.
- 🔒 **Isolamento totale**: ogni profilo ha i suoi token, le sue sessioni, la sua cronologia **e il suo `.claude.json`** (quindi la sua email/account).
- 🪶 **Leggerissimo**: nessuna dipendenza, solo moduli nativi di Node.
- 🪟 **Cross-platform**: nessun privilegio speciale richiesto (niente Developer Mode su Windows).

---

## 📦 Installazione

### Installazione globale (uso normale)

```bash
npm install -g @deniscodp/claude-profile-manager
```

Dopo l'installazione avrai il comando `cpm` disponibile ovunque nel terminale.

### Modalità sviluppo (`npm link`)

```bash
git clone https://github.com/DeniscoDp5/claude-profile-manager.git
cd claude-profile-manager
npm link
```

`npm link` registra il comando `cpm` globalmente facendolo puntare alla tua copia locale. Per rimuoverlo: `npm unlink -g @deniscodp/claude-profile-manager`.

---

## ⚙️ Setup della shell (Perché è necessario?)

**Importante:** Un processo figlio (come uno script Node) non può modificare le variabili d'ambiente del terminale "genitore" che lo ha lanciato. Poiché `cpm` funziona modificando la variabile `CLAUDE_CONFIG_DIR`, ha bisogno di una "shell function" (un wrapper caricato all'avvio) per intercettare il comando e applicare la modifica all'ambiente corrente.
Se non completi il setup, vedrai un errore giallo `⚠ Shell integration non attiva` e i comandi di switch non avranno alcun effetto sul tuo terminale.

### Linux / macOS / WSL (bash o zsh)

Il modo più rapido:
```bash
cpm setup
```
*(Questo aggiungerà la riga di inizializzazione al tuo file `~/.bashrc` o `~/.zshrc`).* Riapri poi il terminale.

### Windows (PowerShell)

```powershell
cpm setup
```
*(Questo aggiornerà il tuo `$PROFILE` di PowerShell).* Riapri poi il terminale o esegui:
```powershell
. "$PROFILE"
```

### 🤖 Utilizzo per Agenti AI e Automazioni (Senza Setup)

Se sei un **Agente AI** o stai automatizzando uno script e non puoi appoggiarti al file `.bashrc` o `$PROFILE`, puoi bypassare l'integrazione shell valutando direttamente l'output del comando.
`cpm use <nome>` stampa infatti su `stdout` il comando di esportazione corretto:
- **Bash/Zsh:** `eval "$(cpm use nome_profilo)"`
- **PowerShell:** `Invoke-Expression (cpm use nome_profilo)`

---

## 🚀 Workflow Principale (Guida Rapida)

### 0. Salvare la configurazione esistente
Se usavi già la CLI di Claude prima di installare `cpm`, la tua configurazione (e il tuo login attuale) si trovano nei percorsi standard del sistema. Non sovrascriverla! Importala come tuo primo profilo (es. chiamalo `personale`):

```bash
cpm save personale
```
Questo comando copierà tutti i tuoi token correnti nel nuovo profilo e lo imposterà come attivo. Non dovrai fare un nuovo login!

### 1. Aggiungere un nuovo profilo
Vuoi aggiungere un nuovo account (es. per il lavoro)? Usa il comando `login`:

```bash
cpm login lavoro
```
`cpm` crea la cartella del profilo isolato e avvia direttamente l'autenticazione ufficiale della CLI (`claude auth login`). Completa l'autenticazione dal browser: al termine, il profilo `lavoro` è pronto e attivo.

### 2. Verificare lo stato
Vuoi sapere con quale account stai parlando o vedere tutti i tuoi profili?

```bash
cpm list
```
Vedrai un output chiaro con le email associate a ogni profilo e un asterisco `*` su quello correntemente attivo:
```text
Profili Claude (/home/tu/.claude_profiles)

  * lavoro      <lavoro@azienda.com>
    personale   <io@gmail.com>

Attivo: lavoro (via CLAUDE_CONFIG_DIR)
```

### 3. Switch istantaneo
Per passare da un account all'altro basta un comando:

```bash
cpm use personale
```
Fatto. Da questo momento la CLI di Claude userà il tuo account *personale*. Nessun login richiesto, nessun file sovrascritto.

---

## 🧰 Tabella dei Comandi

| Comando             | Descrizione                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `cpm save <nome>`   | Importa la configurazione Claude esistente di default in un nuovo profilo.  |
| `cpm login <nome>`  | Autentica un nuovo profilo isolato tramite browser e lo attiva.             |
| `cpm use <nome>`    | Attiva un profilo esistente (imposta `CLAUDE_CONFIG_DIR`).                  |
| `cpm list` (`ls`)   | Elenca i profili con la relativa email e mostra quello attivo.             |
| `cpm setup`         | Configura l'integrazione automatica per la tua shell corrente.              |
| `cpm shell-init`    | Stampa il codice per l'integrazione shell (per uso manuale).                |
| `cpm help`          | Mostra l'aiuto.                                                            |

---

## 🔬 Come funziona sotto il cofano

La CLI ufficiale di Claude, se trova la variabile `CLAUDE_CONFIG_DIR`, vi colloca **l'intera** configurazione — compreso `.claude.json` (che altrimenti vivrebbe in `~/.claude.json`, condiviso e fuori dal controllo dei profili).

```text
~/.claude_profiles/
├── .active         <- nome dell'ultimo profilo attivato (default dei nuovi terminali)
├── lavoro/         <- CLAUDE_CONFIG_DIR completa del profilo "lavoro"
│   ├── .claude.json        (account OAuth + email + impostazioni)
│   ├── .credentials.json   (token)
│   ├── projects/  sessions/  ...
└── personale/      <- CLAUDE_CONFIG_DIR completa del profilo "personale"

cpm use <nome>   ─►   export CLAUDE_CONFIG_DIR=~/.claude_profiles/<nome>
```

Lo switch è estremamente robusto perché supporta nativamente le scritture atomiche con cui la CLI rigenera i suoi file ad ogni avvio.

---

## 🖥️ Piattaforme supportate

| Piattaforma | Shell supportata | Integrazione |
|-------------|-----------------|--------------|
| Linux       | bash, zsh       | `cpm.sh`     |
| macOS       | bash, zsh       | `cpm.sh`     |
| WSL         | bash, zsh       | `cpm.sh`     |
| Windows     | PowerShell      | `cpm.ps1`    |

> **CMD**: non supporta l'integrazione automatica. Usa PowerShell per un'esperienza completa.

---

## ⚠️ Note e limiti

- Apri al massimo una sessione interattiva per profilo alla volta per evitare scritture concorrenti sullo stesso `.claude.json`.
- `cpm login` richiede che la CLI ufficiale `claude` sia installata e nel `PATH`.
- Su Windows, assicurati che l'execution policy di PowerShell consenta l'esecuzione di script: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`.

---

## 📄 Licenza

[MIT](./LICENSE) © Denis Constantin Petrisor (@deniscodp)

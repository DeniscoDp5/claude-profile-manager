# cpm — Claude Profile Manager

> `nvm` per le versioni di Node, `--profile` per AWS… **`cpm` per i tuoi account Claude.**

`cpm` è una piccola CLI globale che ti permette di **alternare istantaneamente più profili/account della CLI ufficiale di Claude** (es. *personale* e *lavoro*), mantenendo ogni sessione di login **completamente isolata** — inclusa l'identità dell'account (email) mostrata in console.

Funziona impostando la variabile d'ambiente **`CLAUDE_CONFIG_DIR`**: quando è valorizzata, la CLI di Claude scrive *tutta* la sua configurazione lì dentro — non solo il contenuto di `~/.claude` (credenziali, sessioni, progetti) ma anche il file `~/.claude.json` che contiene l'account OAuth e l'email. Ogni profilo diventa così una cartella autosufficiente in `~/.claude_profiles/`, e i profili non si "contaminano" più a vicenda.

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

## ⚙️ Setup della shell (una tantum)

Poiché un processo non può modificare l'ambiente della shell che lo ha lanciato, `cpm use` ha bisogno di una piccola funzione di shell per esportare davvero `CLAUDE_CONFIG_DIR` (esattamente come fa `nvm`).

### Linux / macOS / WSL (bash o zsh)

Il modo più rapido:

```bash
cpm setup
```

Oppure manualmente:

```bash
cpm shell-init >> ~/.bashrc      # oppure ~/.zshrc
```

Poi riapri il terminale (o esegui `source ~/.bashrc`).

> Non vuoi toccare il file di configurazione? Puoi sempre usare la forma esplicita:
> ```bash
> eval "$(cpm use lavoro)"
> ```

### Windows (PowerShell)

```powershell
cpm setup
```

Questo rileva il profilo PowerShell (`$PROFILE`) e vi aggiunge l'integrazione automaticamente. Poi riapri il terminale o esegui:

```powershell
. "$PROFILE"
```

> Forma esplicita senza integrazione:
> ```powershell
> Invoke-Expression (cpm use lavoro)
> ```

### Cosa fa l'integrazione

- Abilita il comando `cpm use <nome>` a cambiare profilo nella shell corrente.
- Fa sì che **anche i nuovi terminali** ripartano automaticamente dall'ultimo profilo attivato.

---

## 🚀 Guida rapida

### 1. Crea il tuo primo profilo

```bash
cpm login lavoro
```

`cpm` crea la cartella del profilo e avvia il login isolato della CLI ufficiale (`claude auth login`) con `CLAUDE_CONFIG_DIR` già puntato al profilo. Completa l'autenticazione: al termine il profilo `lavoro` è autenticato e attivo.

Ripeti per ogni account:

```bash
cpm login personale
```

### 2. Elenca i profili e vedi quale è attivo

```bash
cpm list
```

```text
Profili Claude (/home/tu/.claude_profiles)

  * lavoro      <lavoro@azienda.com>
    personale   <io@gmail.com>

Attivo: lavoro (via CLAUDE_CONFIG_DIR)
Default per i nuovi terminali: lavoro
```

Il profilo attivo è contrassegnato da `*` e accanto a ogni profilo vedi l'email dell'account associato.

### 3. Cambia profilo

```bash
cpm use personale
```

```text
OK Profilo attivo: personale
```

Da questo momento la CLI di Claude userà l'account *personale*. Per tornare al lavoro: `cpm use lavoro`. Istantaneo, nessun nuovo login.

---

## 🧰 Comandi

| Comando             | Descrizione                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `cpm login <nome>`  | Autentica un nuovo profilo isolato e lo attiva.                             |
| `cpm use <nome>`    | Attiva un profilo esistente (imposta `CLAUDE_CONFIG_DIR`).                  |
| `cpm list` (`ls`)   | Elenca i profili con la relativa email e mostra quello attivo.             |
| `cpm shell-init`    | Stampa la riga da aggiungere a `~/.bashrc` / `~/.zshrc`.                    |
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

- **`cpm use <nome>`** stampa una riga `export CLAUDE_CONFIG_DIR=...` che la funzione di shell valuta, cambiando profilo nella sessione corrente. Salva inoltre il nome in `~/.claude_profiles/.active` come default per i nuovi terminali.
- **`cpm login <nome>`** crea la cartella del profilo ed esegue `claude auth login` con `CLAUDE_CONFIG_DIR` impostata, così le credenziali finiscono direttamente nel profilo.

Lo switch è robusto anche rispetto alle scritture atomiche con cui la CLI rigenera `.claude.json` ad ogni avvio.

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

- L'integrazione della shell è necessaria perché `cpm use` possa modificare l'ambiente del terminale corrente (vedi *Setup della shell*).
- Apri al massimo una sessione interattiva per profilo alla volta per evitare scritture concorrenti sullo stesso `.claude.json`.
- `cpm login` richiede che la CLI ufficiale `claude` sia installata e nel `PATH`.
- Su Windows, assicurati che l'execution policy di PowerShell consenta l'esecuzione di script: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`.

---

## 📄 Licenza

[MIT](./LICENSE) © Denis Constantin Petrisor (@deniscodp)

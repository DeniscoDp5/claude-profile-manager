# cpm — Claude Profile Manager

> `nvm` per le versioni di Node, `--profile` per AWS… **`cpm` per i tuoi account Claude.**

`cpm` è una piccola CLI globale che ti permette di **alternare istantaneamente più profili/account della CLI ufficiale di Claude** (es. *personale* e *lavoro*), mantenendo ogni sessione di login completamente isolata.

Funziona scambiando un **link simbolico**: la cartella `~/.claude` letta da Claude diventa un semplice puntatore verso il profilo attivo, mentre i dati reali di ciascun profilo vivono al sicuro in `~/.claude_profiles/`.

Zero dipendenze esterne — solo i moduli nativi di Node.

---

## ✨ Caratteristiche

- 🔀 **Switch istantaneo** tra account Claude con un solo comando.
- 🔒 **Sessioni isolate**: ogni profilo ha i suoi token, la sua cronologia e la sua configurazione.
- 🪶 **Leggerissimo**: nessuna dipendenza, solo `fs`, `path`, `os`, `readline`.
- 🛟 **Sicuro**: se trova una cartella `~/.claude` reale (non gestita), ne fa automaticamente un backup invece di cancellarla.
- 🪟 **Cross-platform**: usa i symlink su macOS/Linux e le *junction* su Windows (niente privilegi di amministratore).

---

## 📦 Installazione

### Installazione globale (uso normale)

```bash
npm install -g claude-profile-manager
```

Dopo l'installazione avrai il comando `cpm` disponibile ovunque nel terminale.

### Modalità sviluppo (`npm link`)

Se vuoi clonare il repository e lavorare sul codice:

```bash
git clone https://github.com/your-username/claude-profile-manager.git
cd claude-profile-manager
npm link
```

`npm link` registra il comando `cpm` globalmente facendolo puntare alla tua copia locale. Per rimuoverlo: `npm unlink -g claude-profile-manager`.

> **Nota per Windows:** la creazione dei link richiede la *Developer Mode* attiva (Impostazioni → Privacy e sicurezza → Per sviluppatori) **oppure** un terminale eseguito come amministratore. `cpm` usa le *junction*, che nella maggior parte dei casi funzionano senza permessi speciali.

---

## 🚀 Guida rapida

### 1. Crea il tuo primo profilo

```bash
cpm login lavoro
```

`cpm` svuota temporaneamente `~/.claude` e ti chiede di effettuare il login con la CLI ufficiale di Claude in un altro terminale. Quando hai finito, torni nel terminale di `cpm` e premi **INVIO**: i dati appena generati vengono salvati nel profilo `lavoro` e attivati.

```text
Login profilo: lavoro

[1/3] Preparazione di una sessione pulita...
[2/3] La cartella ~/.claude e' ora vuota e pronta.

>>> Esegui ORA il login con la CLI ufficiale di Claude in un altro terminale.
    (completa l'autenticazione web / inserisci le credenziali)

Premi [INVIO] qui SOLO dopo aver completato il login...

[3/3] OK Profilo lavoro salvato e attivato!
```

Ripeti per ogni account:

```bash
cpm login personale
```

### 2. Elenca i profili e vedi quale è attivo

```bash
cpm list
```

```text
Profili Claude disponibili (/Users/tu/.claude_profiles)

  * lavoro
    personale

Attivo: lavoro
```

Il profilo attivo è contrassegnato da `*`.

### 3. Cambia profilo

```bash
cpm use personale
```

```text
OK Ora stai usando il profilo Claude: personale
```

Da questo momento la CLI di Claude userà l'account *personale*. Per tornare al lavoro: `cpm use lavoro`. Istantaneo, nessun nuovo login.

---

## 🧰 Comandi

| Comando             | Descrizione                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `cpm login <nome>`  | Effettua un login pulito e lo salva come nuovo profilo (poi lo attiva).  |
| `cpm use <nome>`    | Attiva un profilo già esistente scambiando il link simbolico.            |
| `cpm list` (`ls`)   | Elenca i profili disponibili e mostra quello attivo.                     |
| `cpm help`          | Mostra l'aiuto.                                                          |

---

## 🔬 Come funziona sotto il cofano

La CLI ufficiale di Claude legge **sempre** la sua configurazione (token di login, sessioni, impostazioni) dalla cartella `~/.claude`. `cpm` non modifica né intercetta in alcun modo la CLI di Claude: si limita a **cambiare cosa rappresenta quella cartella**.

```text
~/.claude_profiles/
├── lavoro/         <- dati reali del profilo "lavoro"
├── personale/      <- dati reali del profilo "personale"
└── sistema_backup/ <- eventuale backup della ~/.claude originale

~/.claude  ───►  symlink ───►  ~/.claude_profiles/<profilo attivo>
```

- **`cpm use <nome>`** rimuove il link corrente e crea un nuovo link simbolico `~/.claude → ~/.claude_profiles/<nome>`. Per Claude è del tutto trasparente: continua a leggere `~/.claude` come sempre.
- **`cpm login <nome>`** crea una cartella `~/.claude` vuota e reale così da forzare un login pulito; al termine sposta i file generati nel profilo dedicato e ripristina il link.
- **Backup automatico**: se all'avvio `~/.claude` è una cartella reale (non un link) — tipicamente la tua configurazione preesistente — `cpm` la mette al sicuro in `~/.claude_profiles/sistema_backup` invece di cancellarla, così non perdi nulla.

Poiché i dati reali restano sempre dentro `~/.claude_profiles/`, lo switch tra profili è istantaneo e non distrugge mai una sessione di login.

---

## ⚠️ Note e limiti

- Chiudi le sessioni interattive di Claude prima di cambiare profilo, per evitare che processi attivi tengano in uso i file della cartella.
- Su Windows servono i permessi per creare i link (vedi sezione installazione).
- `sistema_backup` è un nome riservato: non usarlo come nome di profilo.

---

## 📄 Licenza

[MIT](./LICENSE) © Denis Petrisor

#!/usr/bin/env node

/**
 * cpm - Claude Profile Manager
 *
 * Gestisce piu' account/profili della CLI ufficiale di Claude (~/.claude)
 * usando i link simbolici, nello stile di `nvm` o del flag `--profile` di AWS.
 *
 * Nessuna dipendenza esterna: solo moduli nativi di Node.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

// ---------------------------------------------------------------------------
// Costanti e percorsi
// ---------------------------------------------------------------------------

const HOME = os.homedir();

/** La configurazione "attiva" letta dalla CLI di Claude. */
const CLAUDE_ACTIVE_DIR = path.join(HOME, '.claude');

/** Cartella che contiene i dati reali di ogni profilo. */
const CLAUDE_PROFILES_DIR = path.join(HOME, '.claude_profiles');

/** Nome riservato usato per il backup della configurazione di sistema. */
const SYSTEM_BACKUP_NAME = 'sistema_backup';

/**
 * Su Windows i symlink "veri" richiedono privilegi di amministratore (o la
 * Developer Mode). Le "junction" puntano a cartelle e NON richiedono permessi
 * speciali: sono quindi la scelta migliore per la massima compatibilita'.
 */
const SYMLINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

// Colori ANSI (degradano a stringa vuota se l'output non e' un TTY).
const useColor = process.stdout.isTTY;
const c = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  green: useColor ? '\x1b[32m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  red: useColor ? '\x1b[31m' : '',
};

// ---------------------------------------------------------------------------
// Utility generiche
// ---------------------------------------------------------------------------

/** Esiste un percorso (anche se e' un link rotto)? Usa lstat per non seguire i link. */
function pathExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

/** Il percorso e' un link simbolico (o junction)? */
function isSymlink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Stampa un errore e termina con codice 1. */
function fail(message) {
  console.error(`${c.red}Errore:${c.reset} ${message}`);
  process.exit(1);
}

/**
 * Valida il nome di un profilo: niente caratteri di percorso o nomi pericolosi
 * che potrebbero far uscire dalla cartella dei profili.
 */
function assertValidProfileName(name) {
  if (!name) {
    fail('devi specificare il nome di un profilo.');
  }
  if (name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) {
    fail(`nome profilo non valido: "${name}".`);
  }
  if (name === SYSTEM_BACKUP_NAME) {
    fail(`"${SYSTEM_BACKUP_NAME}" e' un nome riservato.`);
  }
}

/** Percorso assoluto della cartella di un profilo. */
function profilePath(name) {
  return path.join(CLAUDE_PROFILES_DIR, name);
}

/**
 * Rimuove ~/.claude qualunque cosa sia (link, file o cartella reale).
 * Se e' un link rimuove solo il puntatore, non la cartella di destinazione.
 */
function removeActiveDir() {
  if (!pathExists(CLAUDE_ACTIVE_DIR)) return;

  if (isSymlink(CLAUDE_ACTIVE_DIR)) {
    // Su un link a cartella, unlinkSync potrebbe fallire su alcuni FS Windows:
    // proviamo prima unlink, poi rm come fallback.
    try {
      fs.unlinkSync(CLAUDE_ACTIVE_DIR);
    } catch {
      fs.rmSync(CLAUDE_ACTIVE_DIR, { recursive: true, force: true });
    }
  } else {
    fs.rmSync(CLAUDE_ACTIVE_DIR, { recursive: true, force: true });
  }
}

/** Crea il link simbolico ~/.claude -> <profilo>. */
function linkProfile(name) {
  fs.symlinkSync(profilePath(name), CLAUDE_ACTIVE_DIR, SYMLINK_TYPE);
}

/**
 * Se ~/.claude e' una cartella reale (non un link), la mette al sicuro
 * spostandola in ~/.claude_profiles/sistema_backup prima di sovrascriverla.
 * Ritorna true se il backup e' stato effettuato.
 */
function backupSystemDirIfNeeded() {
  if (!pathExists(CLAUDE_ACTIVE_DIR) || isSymlink(CLAUDE_ACTIVE_DIR)) {
    return false;
  }

  let backupDir = profilePath(SYSTEM_BACKUP_NAME);
  // Non sovrascrivere un backup esistente: aggiungi un suffisso numerico.
  let n = 1;
  while (pathExists(backupDir)) {
    backupDir = profilePath(`${SYSTEM_BACKUP_NAME}_${n++}`);
  }

  fs.renameSync(CLAUDE_ACTIVE_DIR, backupDir);
  console.log(
    `${c.yellow}[Info]${c.reset} La cartella ~/.claude esistente e' stata messa al sicuro in:\n` +
    `       ${c.dim}${backupDir}${c.reset}`
  );
  return true;
}

/**
 * Copia ricorsivamente una cartella. Usa fs.cpSync (nativo da Node 16.7)
 * con un fallback manuale per versioni piu' vecchie.
 */
function copyDir(from, to) {
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(from, to, { recursive: true });
    return;
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(src), dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

/** Restituisce il nome del profilo attivo, oppure un descrittore di stato. */
function getActiveProfile() {
  if (!pathExists(CLAUDE_ACTIVE_DIR)) {
    return { state: 'none' };
  }
  if (isSymlink(CLAUDE_ACTIVE_DIR)) {
    const target = fs.readlinkSync(CLAUDE_ACTIVE_DIR);
    return { state: 'profile', name: path.basename(target.replace(/[\\/]+$/, '')) };
  }
  return { state: 'system' };
}

/** Elenco ordinato dei profili disponibili. */
function listProfileNames() {
  if (!pathExists(CLAUDE_PROFILES_DIR)) return [];
  return fs
    .readdirSync(CLAUDE_PROFILES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Domanda all'utente che ritorna una Promise risolta alla pressione di INVIO. */
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Assicura l'esistenza della cartella base dei profili. */
function ensureProfilesDir() {
  if (!pathExists(CLAUDE_PROFILES_DIR)) {
    fs.mkdirSync(CLAUDE_PROFILES_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Comandi
// ---------------------------------------------------------------------------

function cmdList() {
  const active = getActiveProfile();
  const profiles = listProfileNames();

  console.log(`${c.bold}Profili Claude disponibili${c.reset} ${c.dim}(${CLAUDE_PROFILES_DIR})${c.reset}\n`);

  if (profiles.length === 0) {
    console.log(`  ${c.dim}(nessun profilo salvato - creane uno con: cpm login <nome>)${c.reset}`);
  } else {
    for (const name of profiles) {
      const isActive = active.state === 'profile' && active.name === name;
      const marker = isActive ? `${c.green}*${c.reset}` : ' ';
      const label = isActive ? `${c.green}${name}${c.reset}` : name;
      console.log(`  ${marker} ${label}`);
    }
  }

  console.log('');
  if (active.state === 'profile') {
    console.log(`${c.bold}Attivo:${c.reset} ${c.green}${active.name}${c.reset}`);
  } else if (active.state === 'system') {
    console.log(`${c.bold}Attivo:${c.reset} ${c.yellow}[Profilo di Sistema / Default]${c.reset}`);
    console.log(`${c.dim}~/.claude e' una cartella reale, non gestita da cpm.${c.reset}`);
  } else {
    console.log(`${c.bold}Attivo:${c.reset} ${c.dim}(nessuno - ~/.claude non esiste)${c.reset}`);
  }
}

function cmdUse(name) {
  assertValidProfileName(name);
  ensureProfilesDir();

  if (!pathExists(profilePath(name))) {
    fail(`il profilo "${name}" non esiste. Creane uno con: cpm login ${name}`);
  }

  // Se l'attivo e' una cartella reale di sistema, mettila al sicuro.
  backupSystemDirIfNeeded();

  removeActiveDir();
  linkProfile(name);

  console.log(`${c.green}OK${c.reset} Ora stai usando il profilo Claude: ${c.bold}${name}${c.reset}`);
}

async function cmdLogin(name) {
  assertValidProfileName(name);
  ensureProfilesDir();

  console.log(`${c.bold}Login profilo:${c.reset} ${name}\n`);
  console.log(`${c.dim}[1/3]${c.reset} Preparazione di una sessione pulita...`);

  // Salva l'eventuale cartella reale di sistema prima di toccare ~/.claude.
  backupSystemDirIfNeeded();

  // Azzera ~/.claude e crea una cartella vuota e reale per il nuovo login.
  removeActiveDir();
  fs.mkdirSync(CLAUDE_ACTIVE_DIR, { recursive: true });

  console.log(`${c.dim}[2/3]${c.reset} La cartella ~/.claude e' ora vuota e pronta.\n`);
  console.log(`${c.cyan}>>> Esegui ORA il login con la CLI ufficiale di Claude in un altro terminale.${c.reset}`);
  console.log(`${c.dim}    (completa l'autenticazione web / inserisci le credenziali)${c.reset}\n`);

  await prompt(`${c.bold}Premi [INVIO] qui SOLO dopo aver completato il login...${c.reset}\n`);

  const dest = profilePath(name);

  // Salva ciò che il login ha generato nella cartella del profilo.
  // Pulisci una eventuale versione precedente dello stesso profilo.
  if (pathExists(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  // ~/.claude e' una cartella reale (l'abbiamo appena creata). La spostiamo
  // direttamente nella cartella del profilo: piu' veloce di una copia.
  fs.renameSync(CLAUDE_ACTIVE_DIR, dest);

  // Ricrea ~/.claude come link simbolico verso il profilo appena salvato.
  removeActiveDir();
  linkProfile(name);

  console.log(`\n${c.dim}[3/3]${c.reset} ${c.green}OK${c.reset} Profilo ${c.bold}${name}${c.reset} salvato e attivato!`);
}

function showHelp() {
  console.log(`
${c.bold}cpm${c.reset} - Claude Profile Manager
Gestisci piu' account Claude come fa ${c.bold}nvm${c.reset} con le versioni di Node.

${c.bold}Uso:${c.reset}
  cpm <comando> [nome_profilo]

${c.bold}Comandi:${c.reset}
  ${c.cyan}list${c.reset}            Elenca i profili e mostra quello attivo
  ${c.cyan}login${c.reset} <nome>    Effettua un login pulito e salvalo come nuovo profilo
  ${c.cyan}use${c.reset} <nome>      Attiva un profilo gia' esistente
  ${c.cyan}help${c.reset}            Mostra questo messaggio

${c.bold}Esempi:${c.reset}
  cpm login lavoro
  cpm login personale
  cpm list
  cpm use personale

${c.dim}I dati reali vivono in ~/.claude_profiles/<nome>; ~/.claude e' un link
simbolico verso il profilo attivo.${c.reset}
`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const [command, profileName] = process.argv.slice(2);

  try {
    switch (command) {
      case 'list':
      case 'ls':
        cmdList();
        break;
      case 'use':
        cmdUse(profileName);
        break;
      case 'login':
        await cmdLogin(profileName);
        break;
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        showHelp();
        break;
      default:
        console.error(`${c.red}Comando sconosciuto:${c.reset} ${command}\n`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    if (err && err.code === 'EPERM') {
      fail(
        'permessi insufficienti per creare il link simbolico.\n' +
        '       Su Windows attiva la "Developer Mode" oppure esegui il terminale come amministratore.'
      );
    }
    fail(err && err.message ? err.message : String(err));
  }
}

main();

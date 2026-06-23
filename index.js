#!/usr/bin/env node

/**
 * cpm - Claude Profile Manager
 *
 * Gestisce piu' account/profili della CLI ufficiale di Claude isolando
 * COMPLETAMENTE la configurazione di ciascuno tramite la variabile d'ambiente
 * `CLAUDE_CONFIG_DIR`.
 *
 * Quando `CLAUDE_CONFIG_DIR` e' impostata, la CLI di Claude scrive TUTTO la'
 * dentro: non solo il contenuto di ~/.claude (credenziali, sessioni, progetti)
 * ma anche il file ~/.claude.json (che contiene l'account OAuth e l'email).
 * Cosi' ogni profilo e' una cartella autosufficiente e i profili non si
 * "contaminano" piu' a vicenda.
 *
 * Poiche' un processo Node non puo' modificare l'ambiente della shell padre,
 * il comando `use` STAMPA una riga `export ...` che viene valutata dalla
 * funzione di shell `cpm` (vedi cpm.sh). In alternativa: eval "$(cpm use X)".
 *
 * Nessuna dipendenza esterna: solo moduli nativi di Node.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Costanti e percorsi
// ---------------------------------------------------------------------------

const HOME = os.homedir();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_WINDOWS = process.platform === 'win32';

/** Cartella che contiene i dati reali di ogni profilo (una CLAUDE_CONFIG_DIR per profilo). */
const PROFILES_DIR = path.join(HOME, '.claude_profiles');

/** File che ricorda l'ultimo profilo attivato (default per i nuovi terminali). */
const ACTIVE_FILE = path.join(PROFILES_DIR, '.active');

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

/** realpath che non lancia: in caso di errore normalizza e basta. */
function realpathSafe(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Stampa un errore (su stderr) e termina con codice 1. */
function fail(message) {
  console.error(`${c.red}Errore:${c.reset} ${message}`);
  process.exit(1);
}

/**
 * Cita una stringa per inserirla in modo sicuro dentro codice shell
 * (single-quoting POSIX, con escape dei singoli apici).
 */
function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Cita una stringa per inserirla in modo sicuro dentro codice PowerShell
 * (single-quoting, con escape del singolo apice tramite raddoppio).
 */
function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * Rileva il tipo di shell in uso: 'powershell', 'cmd', 'zsh', 'bash'.
 * L'integrazione shell (cpm.sh / cpm.ps1) imposta CPM_SHELL_TYPE per certezza;
 * in sua assenza si usa un'euristica ragionevole.
 */
function detectShellType() {
  if (process.env.CPM_SHELL_TYPE) return process.env.CPM_SHELL_TYPE;
  if (IS_WINDOWS) {
    return process.env.PSModulePath ? 'powershell' : 'cmd';
  }
  const shell = process.env.SHELL || '';
  return /\bzsh\b/.test(shell) ? 'zsh' : 'bash';
}

/**
 * Formatta un'istruzione di export di variabile d'ambiente nella sintassi
 * corretta per la shell rilevata.
 */
function formatExport(varName, value) {
  const shell = detectShellType();
  switch (shell) {
    case 'powershell':
      return `$env:${varName} = ${psQuote(value)}\n`;
    case 'cmd':
      return `set "${varName}=${value}"\n`;
    default:
      return `export ${varName}=${shQuote(value)}\n`;
  }
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
}

/** Percorso assoluto della cartella di un profilo. */
function profilePath(name) {
  return path.join(PROFILES_DIR, name);
}

/** Assicura l'esistenza della cartella base dei profili. */
function ensureProfilesDir() {
  if (!pathExists(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

/** Elenco ordinato dei profili disponibili (solo cartelle). */
function listProfileNames() {
  if (!pathExists(PROFILES_DIR)) return [];
  return fs
    .readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Salva il profilo attivo come default persistente. */
function writeActive(name) {
  ensureProfilesDir();
  fs.writeFileSync(ACTIVE_FILE, `${name}\n`, 'utf8');
}

/** Legge il default persistente (o null). */
function readActive() {
  try {
    const v = fs.readFileSync(ACTIVE_FILE, 'utf8').trim();
    return v || null;
  } catch {
    return null;
  }
}

/** Legge l'email dell'account OAuth dal .claude.json di un profilo (o null). */
function readProfileEmail(name) {
  try {
    const raw = fs.readFileSync(path.join(profilePath(name), '.claude.json'), 'utf8');
    const json = JSON.parse(raw);
    return json?.oauthAccount?.emailAddress || null;
  } catch {
    return null;
  }
}

/** L'integrazione shell (cpm.sh) e' stata caricata nella sessione corrente? */
function isShellIntegrationActive() {
  return process.env.CPM_SHELL_INTEGRATION === '1';
}

/** Nome del profilo attualmente attivo secondo CLAUDE_CONFIG_DIR (o null). */
function activeProfileName() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (!env) return null;
  const activeDir = realpathSafe(env);
  return listProfileNames().find((n) => realpathSafe(profilePath(n)) === activeDir) || null;
}

// ---------------------------------------------------------------------------
// Comandi
// ---------------------------------------------------------------------------

function cmdList() {
  const profiles = listProfileNames();
  const env = process.env.CLAUDE_CONFIG_DIR;
  const activeDir = env ? realpathSafe(env) : null;
  const persisted = readActive();

  console.log(`${c.bold}Profili Claude${c.reset} ${c.dim}(${PROFILES_DIR})${c.reset}\n`);

  if (profiles.length === 0) {
    console.log(`  ${c.dim}(nessun profilo - creane uno con: cpm login <nome>)${c.reset}`);
  } else {
    for (const name of profiles) {
      const isActive = activeDir && realpathSafe(profilePath(name)) === activeDir;
      const marker = isActive ? `${c.green}*${c.reset}` : ' ';
      const label = isActive ? `${c.green}${name}${c.reset}` : name;
      const email = readProfileEmail(name);
      const emailStr = email
        ? `${c.dim}<${email}>${c.reset}`
        : `${c.dim}<email sconosciuta>${c.reset}`;
      console.log(`  ${marker} ${label}  ${emailStr}`);
    }
  }

  console.log('');
  if (activeDir) {
    const name = profiles.find((n) => realpathSafe(profilePath(n)) === activeDir);
    if (name) {
      console.log(`${c.bold}Attivo:${c.reset} ${c.green}${name}${c.reset} ${c.dim}(via CLAUDE_CONFIG_DIR)${c.reset}`);
    } else {
      console.log(`${c.bold}Attivo:${c.reset} ${c.yellow}${activeDir}${c.reset} ${c.dim}(CLAUDE_CONFIG_DIR non gestita da cpm)${c.reset}`);
    }
  } else {
    console.log(`${c.bold}Attivo:${c.reset} ${c.yellow}(CLAUDE_CONFIG_DIR non impostata)${c.reset}`);
    console.log(`${c.dim}Senza profilo la CLI usa ~/.claude e ~/.claude.json condivisi.${c.reset}`);
    console.log(`${c.dim}Attiva un profilo con: cpm use <nome>${c.reset}`);
  }
  if (persisted) {
    console.log(`${c.dim}Default per i nuovi terminali: ${persisted}${c.reset}`);
  }

  console.log('');
  if (isShellIntegrationActive()) {
    const intFile = detectShellType() === 'powershell' ? 'cpm.ps1' : 'cpm.sh';
    console.log(`${c.green}Shell:${c.reset} integrazione attiva ${c.dim}(funzione shell da ${intFile})${c.reset}`);
  } else {
    const shellType = detectShellType();
    const isPSorCmd = shellType === 'powershell' || shellType === 'cmd';
    const reloadCmd = isPSorCmd ? `. "$PROFILE"` : `source ~/.bashrc`;
    console.log(`${c.yellow}Shell:${c.reset} integrazione ${c.red}non attiva${c.reset} ${c.dim}(stai usando solo il binario Node)${c.reset}`);
    console.log(`${c.dim}  "cpm use" non modifichera' la shell corrente.${c.reset}`);
    console.log(`${c.dim}  Correggi con: ${c.cyan}${reloadCmd}${c.reset}${c.dim}  oppure: ${c.cyan}cpm setup${c.reset}`);
  }
}

function cmdUse(name) {
  assertValidProfileName(name);
  ensureProfilesDir();

  const dir = profilePath(name);
  if (!pathExists(dir)) {
    fail(`il profilo "${name}" non esiste. Crealo con: cpm login ${name}`);
  }

  writeActive(name);

  // Se l'integrazione shell non e' attiva E stdout e' un TTY, l'output
  // export non verra' catturato da nessuno — avvisa l'utente.
  const shellOk = isShellIntegrationActive();
  const directCall = process.stdout.isTTY;

  if (!shellOk && directCall) {
    const shellType = detectShellType();
    const isPSorCmd = shellType === 'powershell' || shellType === 'cmd';
    const evalCmd = isPSorCmd
      ? `Invoke-Expression (cpm use ${name})`
      : `eval "$(command cpm use ${name})"`;
    const reloadCmd = isPSorCmd
      ? `. "$PROFILE"`
      : `source ~/.bashrc`;

    console.error(`${c.yellow}⚠  Shell integration non attiva${c.reset}`);
    console.error(`   Stai usando il binario Node direttamente.`);
    console.error(`   Il profilo "${name}" e' salvato come default per i nuovi terminali,`);
    console.error(`   ma ${c.bold}CLAUDE_CONFIG_DIR non e' stata impostata${c.reset} in questa shell.\n`);
    console.error(`   Per attivare adesso:`);
    console.error(`     ${c.cyan}${evalCmd}${c.reset}`);
    console.error(`   Per abilitare l'integrazione permanente:`);
    console.error(`     ${c.cyan}cpm setup${c.reset}  ${c.dim}e poi${c.reset}  ${c.cyan}${reloadCmd}${c.reset}\n`);
  } else {
    // Messaggio umano su stderr: resta visibile anche quando stdout viene
    // catturato/valutato dalla funzione di shell.
    console.error(`${c.green}OK${c.reset} Profilo attivo: ${c.bold}${name}${c.reset}`);
  }

  // Su stdout solo il codice shell da valutare (eval / Invoke-Expression).
  process.stdout.write(formatExport('CLAUDE_CONFIG_DIR', dir));
}

function cmdLogin(name) {
  assertValidProfileName(name);
  ensureProfilesDir();

  const dir = profilePath(name);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`${c.bold}Login profilo:${c.reset} ${name}`);
  console.log(`${c.dim}Avvio l'autenticazione isolata in ${dir}${c.reset}\n`);

  const res = spawnSync('claude', ['auth', 'login'], {
    stdio: 'inherit',
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
  });

  if (res.error) {
    fail(`impossibile avviare "claude": ${res.error.message}\n       Assicurati che la CLI ufficiale di Claude sia installata e nel PATH.`);
  }
  if (typeof res.status === 'number' && res.status !== 0) {
    fail(`login annullato o fallito (claude e' uscito con codice ${res.status}).`);
  }

  writeActive(name);
  console.log(`\n${c.green}OK${c.reset} Profilo ${c.bold}${name}${c.reset} autenticato e impostato come attivo.`);
}

function cmdSave(name) {
  assertValidProfileName(name);
  ensureProfilesDir();

  const dir = profilePath(name);
  if (pathExists(dir)) {
    fail(`il profilo "${name}" esiste già. Scegli un altro nome o eliminalo prima.`);
  }

  const defaultClaudeDir = path.join(HOME, '.claude');
  const defaultClaudeJson = path.join(HOME, '.claude.json');

  const hasDir = pathExists(defaultClaudeDir) && fs.statSync(defaultClaudeDir).isDirectory();
  const hasJson = pathExists(defaultClaudeJson) && fs.statSync(defaultClaudeJson).isFile();

  if (!hasDir && !hasJson) {
    fail(
      `nessuna configurazione Claude trovata.\n` +
      `       Cercavo: ${defaultClaudeDir} e/o ${defaultClaudeJson}\n` +
      `       Assicurati di aver già usato la CLI di Claude almeno una volta.`
    );
  }

  console.log(`${c.bold}Salvataggio configurazione esistente → profilo "${name}"${c.reset}\n`);

  if (hasDir) {
    fs.cpSync(defaultClaudeDir, dir, { recursive: true });
    console.log(`  ${c.green}✓${c.reset} Copiata cartella ${c.dim}${defaultClaudeDir}${c.reset}`);
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (hasJson) {
    fs.copyFileSync(defaultClaudeJson, path.join(dir, '.claude.json'));
    console.log(`  ${c.green}✓${c.reset} Copiato file    ${c.dim}${defaultClaudeJson}${c.reset}`);
  }

  writeActive(name);

  const email = readProfileEmail(name);
  const emailStr = email ? ` ${c.dim}<${email}>${c.reset}` : '';

  console.log(`\n${c.green}OK${c.reset} Profilo ${c.bold}${name}${c.reset}${emailStr} creato e impostato come default.`);
  console.log(`${c.dim}Per attivarlo nella shell corrente: cpm use ${name}${c.reset}`);
}

function cmdShellInit() {
  const shellType = detectShellType();
  if (shellType === 'powershell') {
    const psFile = path.join(__dirname, 'cpm.ps1');
    process.stdout.write(`. ${psQuote(psFile)}\n`);
  } else {
    const shFile = path.join(__dirname, 'cpm.sh');
    process.stdout.write(`source ${shQuote(shFile)}\n`);
  }
}

function cmdSetup() {
  const shellType = detectShellType();

  if (shellType === 'powershell') {
    return cmdSetupPowerShell();
  }
  if (shellType === 'cmd') {
    console.log(`${c.yellow}CMD non supporta l'integrazione automatica.${c.reset}`);
    console.log(`Usa PowerShell oppure attiva manualmente con:`);
    console.log(`  ${c.cyan}for /f "delims=" %a in ('cpm use <nome>') do @%a${c.reset}`);
    console.log(`\n${c.dim}Consiglio: usa PowerShell per un'esperienza completa.${c.reset}`);
    return;
  }

  // bash / zsh
  const isZsh = shellType === 'zsh';
  const rcFile = path.join(HOME, isZsh ? '.zshrc' : '.bashrc');
  const shFile = path.join(__dirname, 'cpm.sh');
  const sourceLine = `source ${shQuote(shFile)}`;

  let existing = '';
  try { existing = fs.readFileSync(rcFile, 'utf8'); } catch {}

  if (existing.includes(sourceLine)) {
    console.log(`${c.green}Già configurato${c.reset} — ${rcFile} contiene già l'integrazione cpm.`);
    console.log(`\nSe la funzione shell non è attiva nella sessione corrente, esegui:`);
    console.log(`  ${c.cyan}source ${rcFile}${c.reset}`);
    return;
  }

  fs.appendFileSync(rcFile, `\n# cpm - Claude Profile Manager\n${sourceLine}\n`, 'utf8');

  console.log(`${c.green}Setup completato!${c.reset}`);
  console.log(`  Shell rilevata  : ${c.bold}${isZsh ? 'zsh' : 'bash'}${c.reset}`);
  console.log(`  File aggiornato : ${c.bold}${rcFile}${c.reset}`);
  console.log(`\nAttiva subito nella shell corrente con:`);
  console.log(`  ${c.cyan}source ${rcFile}${c.reset}`);
  console.log(`\n${c.dim}Nei nuovi terminali verrà caricato automaticamente.${c.reset}`);
}

function cmdSetupPowerShell() {
  const psFile = path.join(__dirname, 'cpm.ps1');
  const sourceLine = `. ${psQuote(psFile)}`;

  // Determina il vero percorso del profilo interrogando PowerShell stesso.
  // Questo gestisce correttamente le lingue del sistema (es. "Documenti")
  // e la differenza tra Windows PowerShell 5.1 e PowerShell Core (pwsh).
  let psProfile = process.env.PS_PROFILE;
  if (!psProfile) {
    try {
      const psExe = (process.env.PSModulePath && process.env.PSModulePath.includes('PowerShell\\\\Modules') && !process.env.PSModulePath.includes('WindowsPowerShell')) ? 'pwsh' : 'powershell';
      const res = spawnSync(psExe, ['-NoProfile', '-Command', 'Write-Output $PROFILE'], { encoding: 'utf8' });
      if (res.status === 0 && res.stdout) {
        psProfile = res.stdout.trim();
      }
    } catch (e) {}
  }

  // Fallback se l'interrogazione fallisce
  if (!psProfile) {
    psProfile = path.join(HOME, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1');
  }

  // Assicura che la cartella del profilo esista.
  const profileDir = path.dirname(psProfile);
  if (!pathExists(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  let existing = '';
  try { existing = fs.readFileSync(psProfile, 'utf8'); } catch {}

  if (existing.includes(sourceLine)) {
    console.log(`${c.green}Già configurato${c.reset} — ${psProfile} contiene già l'integrazione cpm.`);
    console.log(`\nSe la funzione shell non è attiva nella sessione corrente, esegui:`);
    console.log(`  ${c.cyan}. "$PROFILE"${c.reset}`);
    return;
  }

  fs.appendFileSync(psProfile, `\n# cpm - Claude Profile Manager\n${sourceLine}\n`, 'utf8');

  console.log(`${c.green}Setup completato!${c.reset}`);
  console.log(`  Shell rilevata  : ${c.bold}PowerShell${c.reset}`);
  console.log(`  File aggiornato : ${c.bold}${psProfile}${c.reset}`);
  console.log(`\nAttiva subito nella sessione corrente con:`);
  console.log(`  ${c.cyan}. "$PROFILE"${c.reset}`);
  console.log(`\n${c.dim}Nelle nuove sessioni PowerShell verrà caricato automaticamente.${c.reset}`);
}

function showHelp() {
  const isPSorCmd = detectShellType() === 'powershell' || detectShellType() === 'cmd';
  const evalHint = isPSorCmd
    ? `Invoke-Expression (cpm use <nome>)`
    : `eval "$(cpm use <nome>)"`;
  const rcHint = isPSorCmd
    ? `$PROFILE (PowerShell)`
    : `~/.bashrc / ~/.zshrc`;

  console.log(`
${c.bold}cpm${c.reset} - Claude Profile Manager
Gestisci piu' account Claude isolando ${c.bold}CLAUDE_CONFIG_DIR${c.reset} per profilo.

${c.bold}Uso:${c.reset}
  cpm <comando> [nome_profilo]

${c.bold}Comandi:${c.reset}
  ${c.cyan}setup${c.reset}           Setup one-time: rileva la shell e configura ${rcHint}
  ${c.cyan}list${c.reset}            Elenca i profili (con email) e mostra quello attivo
  ${c.cyan}save${c.reset} <nome>     Salva la configurazione Claude esistente (~/.claude) come profilo
  ${c.cyan}login${c.reset} <nome>    Autentica un nuovo profilo isolato e attivalo
  ${c.cyan}use${c.reset} <nome>      Attiva un profilo esistente
  ${c.cyan}shell-init${c.reset}      Stampa la riga da aggiungere manualmente a ${rcHint}
  ${c.cyan}help${c.reset}            Mostra questo messaggio

${c.bold}Setup (una tantum):${c.reset}
  ${c.dim}# rileva la shell e scrive da solo nel file RC appropriato${c.reset}
  cpm setup
  ${c.dim}# poi esegui il source indicato (o apri un nuovo terminale)${c.reset}

${c.bold}Esempi:${c.reset}
  cpm save personale       ${c.dim}# importa la config esistente come profilo${c.reset}
  cpm login lavoro
  cpm login personale
  cpm list
  cpm use personale

${c.dim}Ogni profilo vive in ~/.claude_profiles/<nome> ed e' una CLAUDE_CONFIG_DIR
completa (credenziali, sessioni, progetti e .claude.json con l'account).${c.reset}

${c.dim}Senza la funzione di shell puoi comunque usare:  ${evalHint}${c.reset}
`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
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
        cmdLogin(profileName);
        break;
      case 'save':
        cmdSave(profileName);
        break;
      case 'setup':
        cmdSetup();
        break;
      case 'shell-init':
        cmdShellInit();
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
    fail(err && err.message ? err.message : String(err));
  }
}

main();

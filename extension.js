let vscode = require('vscode');
const { execFileSync } = require("child_process");
const temp = require('temp');
const fs = require('fs');
const shellQuote = require('shell-quote');

let ScreenSend = {
  session: {},

  list(send=false, paste=false) {
    try {
      let config = vscode.workspace.getConfiguration('screensend');
      const sessions = (() => { switch (config.get('terminalType')) {
        case 'ttypaste': return this.ttypasteSessions();
        case 'iTerm 2': return this.itermSessions();
        case 'MacOS X Terminal': return this.macosxTerminalSessions();
        case 'Konsole': return this.konsoleSessions();
        case 'GNU Screen': return this.screenSessions();
        case 'Tmux': return this.tmuxSessions();
        default: throw `Unknown terminal type: ${config.get('terminalType')}`;
      } })();
      let fileName = vscode.window.activeTextEditor.document.fileName;
      vscode.window.showQuickPick(sessions).then((session)=>{
        this.session[fileName] = session;
        if (send) { return this.send(paste); }
      });
    }
    catch (err) {
      console.log(err);
      throw err;
    }
  },
  
  sendPaste() {
    try {
      return this.send(true);
    }
    catch (err) {
      console.log(err);
      throw err;
    }
  },

  send(paste=false) {
    try {
      let config = vscode.workspace.getConfiguration('screensend');
      let fileName = vscode.window.activeTextEditor.document.fileName;
      if (!this.session[fileName]) {
        this.list(true, paste);
        return;
      }
      const text = paste? ["\x1b[200~"].concat(this.getSelectedText(true)).concat(["\x1b[201~\n"]) : this.getSelectedText();
      //console.log("send: session=",this.session," text=",{text})
      const sleep = paste? 0 : config.get('sleepTime');
      const sendFn = (() => { switch (config.get('terminalType')) {
        case 'ttypaste': return this.ttypasteSend;
        case 'iTerm 2': return this.itermSend;
        case 'MacOS X Terminal': return this.macosxTerminalSend;
        case 'Konsole': return this.konsoleSend;
        case 'GNU Screen': return this.screenSend;
        case 'Tmux': return this.tmuxSend;
        default: throw `Unknown terminal type: ${config.get('terminalType')}`;
      } })();
      return this.sendText(text, sleep, sendFn, this.session[fileName]);
    }
    catch (err) {
      console.log(err);
      throw err;
    }
  },

  sendText(text, sleep, sendFn, session) {
    if (text.length === 0) { return; }
    if (!sleep) {
      for (let t of text) {
        sendFn.call(this, t, session);
      }
    }
    else {
      sendFn.call(this, text[0], session);
      if (text.length === 1) { return; }
      return setTimeout(( () => {
        return this.sendText(text.slice(1), sleep, sendFn, session);
      }
      ), sleep);
    }
  },

  getSelectedText(paste=false) {
    let config = vscode.workspace.getConfiguration('screensend');
    const editor = vscode.window.activeTextEditor;
    let text;
    if (editor.selection.isEmpty) {
      // get the text of the current paragraph
      let line = editor.selection.active.line;
      if (editor.document.lineAt(line).text.match(/^\s*$/)) {
        text = "";
      }
      else {
        let start = line;
        while (start > 0 && !editor.document.lineAt(start).text.match(/^\s*$/)) { 
          start -= 1; 
        }
        let end = line;
        while (end < editor.document.lineCount && !editor.document.lineAt(end).text.match(/^\s*$/)) { 
          end += 1; 
        }
        text = editor.document.getText(
          new vscode.Range(
            new vscode.Position(start, 0), 
            new vscode.Position(end, 0)));
        if (!text.match(/\n$/)) { text += "\n"; }
      }
    }
    else {
      // get the selected text
      text = editor.selections.map((s)=>editor.document.getText(s)).join('\n');
      if (text.match(/\n/) && !text.match(/\n$/)) { text += "\n"; }
      // clear the selection
      // TODO: this doesn't work when vim mode is enabled... not sure how to fix it
      //editor.selection = new vscode.Selection(editor.selection.start, editor.selection.start);
      // if using vim emulation, switch to normal mode
    }

    let chunkSize = config.get('chunkSize');
    if (chunkSize < 1 || paste) {
      return [text];
    }
    const lines = text.split(/^/m);
    const chunks = [''];
    for (let line of lines) {
      chunks[chunks.length-1] += line;
      if (chunks[chunks.length-1].length >= chunkSize) { chunks.push(''); }
    }
    return chunks;
  },

  macosxTerminalSessions() {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('osascriptPath'));
    const cmd = args.shift();
    if (!cmd) { throw "osascript not found in PATH" }
    const stdout = execFileSync(cmd, args.concat(['-e','tell application "Terminal" to tell windows to tell tabs to return tty']));
    const list = stdout.toString('utf8').replace(/\n$/,'').split(",[ \n]*");
    return list;
  },

  macosxTerminalSend(text, session) {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('osascriptPath'));
    const cmd = args.shift();
    if (!cmd) { throw "osascript not found in PATH" }
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    execFileSync(cmd, args.concat([
      '-e',`set f to \"${path}\"`,
      '-e','open for access f',
      '-e','set c to (read f)',
      '-e',`tell application \"Terminal\" to do script c in first tab of first window where tty is \"${session}\"`,
    ]));
    return fs.unlinkSync(path);
  },

  ttypasteSessions() {
    const stdout = execFileSync('/bin/sh', ['-c','(u=$(id -ur); for p in /dev/pts/* /dev/ttys*; do if [ -e "$p" ] && [ $(stat -c "%u" "$p" 2>/dev/null || stat -f "%u" "$p" 2>/dev/null) = "$u" ]; then echo "$p"; echo >"$p"; echo "$p" >"$p"; fi; done) || true']);
    const list = (stdout.toString('utf8').trim().split("\n").map((item) => item.trim()));
    return list;
  },

  ttypasteSend(text, session) {
    //console.log("sending text=", text)
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('ttypastePath'));
    const cmd = args.shift();
    if (!cmd) { throw "ttypaste not found in PATH" }
    return execFileSync(cmd, args.concat([session, text]));
  },

  itermSessions() {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('osascriptPath'));
    const cmd = args.shift();
    if (!cmd) { throw "osascript not found in PATH" }
    const stdout = execFileSync(cmd, args.concat(['-e','tell application "iTerm" to tell windows to tell tabs to return sessions']));
    const list = (stdout.toString('utf8').split(",").map((item) => item.trim()));
    return list;
  },

  itermSend(text, session) {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('osascriptPath'));
    const cmd = args.shift();
    if (!cmd) { throw "osascript not found in PATH" }
    session = session.replace(/session id (\S+)/, 'session id "$1"');
    session = session.replace(/window id (\S+)/, 'window id "$1"');
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    execFileSync(config.get('osascriptPath'), args.concat(['-e',`tell application \"iTerm\" to tell ${session} to write contents of file \"${path}\"`]));
    //console.log("sending text=", text)
    return fs.unlinkSync(path);
  },

  konsoleSessions() {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('qdbusPath'));
    const cmd = args.shift();
    if (!cmd) { throw "qdbus not found in PATH" }
    let stdout = execFileSync(cmd, args.concat(['org.kde.konsole*']));
    const konsole = stdout.toString('utf8').split(/\r?\n/);
    const list = [];
    for (let k of konsole) {
      if (k) {
        stdout = execFileSync(cmd, args.concat([k]));
        const input = stdout.toString('utf8');
        let matches = []; const regex = /^\/Sessions\/([^\n]+)$/gm;
        while ((matches = regex.exec(input))) { list.push(k+"\t"+matches[1]); }
      }
    }
    return list;
  },

  konsoleSend(text, session) {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('qdbusPath'));
    const cmd = args.shift();
    if (!cmd) { throw "qdbus not found in PATH" }
    const [k, s] = session.split("\t");
    return execFileSync(cmd, args.concat([k,`/Sessions/${s}`,'sendText',text]));
  },

  screenSessions() {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('screenPath'));
    const cmd = args.shift();
    if (!cmd) { throw "screen not found in PATH" }
    const stdout = execFileSync(cmd, args.concat(['-list']));
    const input = stdout.toString('utf8');
    let matches = []; const list = []; const regex = /^\s+(\S+)/gm;
    while ((matches = regex.exec(input))) { list.push(matches[1]); }
    return list;
  },

  screenSend(text, session) {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('screenPath'));
    const cmd = args.shift();
    if (!cmd) { throw "screen not found in PATH" }
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    execFileSync(cmd, args.concat([
      '-S', session,
      '-X', 'eval',
      'msgminwait 0',
      'msgwait 0',
      `readbuf \"${path}\"`,
      'paste .',
      'msgwait 5',
      'msgminwait 1',
    ]));
    return fs.unlinkSync(path);
  },

  tmuxSessions() {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('tmuxPath'));
    const cmd = args.shift();
    if (!cmd) { throw "tmux not found in PATH" }
    const stdout = execFileSync(cmd, args.concat(['list-sessions']));
    const input = stdout.toString('utf8');
    let matches = []; const list = []; const regex = /^([^:]*):/gm;
    while ((matches = regex.exec(input))) { list.push(matches[1]); }
    return list;
  },

  tmuxSend(text, session) {
    const config = vscode.workspace.getConfiguration('screensend');
    const args = shellQuote.parse(config.get('tmuxPath'));
    const cmd = args.shift();
    if (!cmd) { throw "tmux not found in PATH" }
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    execFileSync(cmd, args.concat([
      'load-buffer', path, ';',
      'paste-buffer','-t',session,';'
    ]));
    return fs.unlinkSync(path);
  }
};

function activate(context) {
    let list = vscode.commands.registerCommand('screensend.list', function () {
        ScreenSend.list();
    });
    context.subscriptions.push(list);

    let send = vscode.commands.registerCommand('screensend.send', function () {
        ScreenSend.send();
    });
    context.subscriptions.push(send);

    let sendPaste = vscode.commands.registerCommand('screensend.sendPaste', function () {
        ScreenSend.sendPaste();
    });
    context.subscriptions.push(sendPaste);
}
exports.activate = activate;

function deactivate() {
}
exports.deactivate = deactivate;

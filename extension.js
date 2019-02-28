let vscode = require('vscode');
const { execFileSync } = require("child_process");
const temp = require('temp');
const fs = require('fs');

let ScreenSend = {
  session: {},

  list(send) {
    try {
      let config = vscode.workspace.getConfiguration('screensend');
      const sessions = (() => { switch (config.get('terminalType')) {
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
        if (send) { return this.send(); }
      });
    }
    catch (err) {
      console.log(err);
      throw err;
    }
  },

  send() {
    try {
      let config = vscode.workspace.getConfiguration('screensend');
      let fileName = vscode.window.activeTextEditor.document.fileName;
      if (!this.session[fileName]) {
        this.list(true);
        return;
      }
      const text = this.getSelectedText();
      //console.log("send: session=",this.session," text=",{text})
      const sleep = config.get('sleepTime');
      const sendFn = (() => { switch (config.get('terminalType')) {
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
    sendFn.call(this, text[0], session);
    if (text.length === 1) { return; }
    return setTimeout(( () => {
      return this.sendText(text.slice(1), sleep, sendFn, session);
    }
    ), sleep);
  },

  getSelectedText() {
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
    if (chunkSize < 1) { chunkSize = text.length; }

    const lines = text.split(/^/m);
    const chunks = [''];
    for (let line of lines) {
      chunks[chunks.length-1] += line;
      if (chunks[chunks.length-1].length >= chunkSize) { chunks.push(''); }
    }
    return chunks;
  },

  macosxTerminalSessions() {
    const stdout = execFileSync('osascript', ['-e','tell application "Terminal" to tell windows to tell tabs to return tty']);
    const list = stdout.toString('utf8').replace(/\n$/,'').split(",[ \n]*");
    return list;
  },

  macosxTerminalSend(text, session) {
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    execFileSync('osascript', [
      '-e',`set f to \"${path}\"`,
      '-e','open for access f',
      '-e','set c to (read f)',
      '-e',`tell application \"Terminal\" to do script c in first tab of first window where tty is \"${session}\"`,
    ]);
    return fs.unlinkSync(path);
  },

  itermSessions() {
    const stdout = execFileSync('osascript', ['-e','tell application "iTerm" to tell windows to tell tabs to return sessions']);
    const list = (stdout.toString('utf8').split(",").map((item) => item.trim()));
    return list;
  },

  itermSend(text, session) {
    session = session.replace(/session id (\S+)/, 'session id "$1"');
    session = session.replace(/window id (\S+)/, 'window id "$1"');
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    const cmd = ['-e',`tell application \"iTerm\" to tell ${session} to write contents of file \"${path}\"`]
    execFileSync('osascript', cmd);
    //console.log("sending text=", text)
    return fs.unlinkSync(path);
  },

  konsoleSessions() {
    let stdout = execFileSync('qdbus', ['org.kde.konsole*']);
    const konsole = stdout.toString('utf8').split(/\r?\n/);
    const list = [];
    for (let k of konsole) {
      if (k) {
        stdout = execFileSync('qdbus', [k]);
        const input = stdout.toString('utf8');
        let matches = []; const regex = /^\/Sessions\/([^\n]+)$/gm;
        while ((matches = regex.exec(input))) { list.push(k+"\t"+matches[1]); }
      }
    }
    return list;
  },

  konsoleSend(text, session) {
    const [k, s] = session.split("\t");
    return execFileSync('qdbus', [k,`/Sessions/${s}`,'sendText',text]);
  },

  screenSessions() {
    const stdout = execFileSync('screen', ['-list']);
    const input = stdout.toString('utf8');
    let matches = []; const list = []; const regex = /^\s+(\S+)/gm;
    while ((matches = regex.exec(input))) { list.push(matches[1]); }
    return list;
  },

  screenSend(text, session) {
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    execFileSync('screen', [
      '-S', session,
      '-X', 'eval',
      'msgminwait 0',
      'msgwait 0',
      `readbuf \"${path}\"`,
      'paste .',
      'msgwait 5',
      'msgminwait 1',
    ]);
    return fs.unlinkSync(path);
  },

  tmuxSessions() {
    const stdout = execFileSync('tmux', ['list-sessions']);
    const input = stdout.toString('utf8');
    let matches = []; const list = []; const regex = /^([^:]*):/gm;
    while ((matches = regex.exec(input))) { list.push(matches[1]); }
    return list;
  },

  tmuxSend(text, session) {
    const {path, fd} = temp.openSync('screensend.');
    fs.writeSync(fd, text);
    execFileSync('tmux', [
      'load-buffer', path, ';',
      'paste-buffer','-t',session,';'
    ]);
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
}
exports.activate = activate;

function deactivate() {
}
exports.deactivate = deactivate;
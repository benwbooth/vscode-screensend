# ttypaste

Send text to a terminal pty

# NOTES

This program must be run as root. By default it uses the SUID permission bit to
achieve this.

For cases where running a SUID binary is not allowed, the following strategy
can be used:

- Create a passphraseless ssh keypair using `ssh-keygen -f ttypaste`. This will
  create a `ttypaste` and `ttypaste.pub` file in your `~/.ssh` folder. Just hit
  `ENTER` both times when prompted for a passphrase.
- Edit `/root/.ssh/authorized_keys` as root, and add the contents of
  `~/.ssh/ttypaste.pub`, prefixed with:
  `command="/usr/local/bin/ttypaste.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding`,
  separated with a space. Make sure to `chmod 600 /root/.ssh/authorized_keys`.
- Edit `~/.ssh/config`, add the following to the end of the file:
```
Host ttypaste
    HostName localhost
    User root
    IdentityFile ~/.ssh/ttypaste

```
- Make sure to `chmod 600 ~/.ssh/config`
- In VS Code, under the screensend settings, change the
  `screensend.ttypastePath` from `ttypaste` to `ssh ttypaste`.

This strategy uses SSH for privilege elevation instead of SUID permissions. The
`ttypaste.sh` wrapper script referenced in the `authorized_keys` file parses the 
`SSH_ORIGINAL_COMMAND` environment variable to get the pty device and the text to 
send.

Another technique would be to use systemd run0, but run0 currently does not
have a way to enable passwordless privilege escalation for a specified binary
file path. run0 uses PolicyKit, but systemd doesn't send any metadata on which
binary is being executed so there is no way to whitelist it.

"""System PTY harness: passwords travel through the terminal, never child argv/env."""
import json
import os
import pty
import select
import signal
import subprocess
import sys
import termios


def report(value):
    print(json.dumps(value), flush=True)


def terminate(signum, _frame):
    # SIGTERM must enter finally so cancelling the driver also reaps its child.
    raise SystemExit(128 + signum)


master, slave = pty.openpty()
before = termios.tcgetattr(slave)
child = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave)
commands = b""
try:
    signal.signal(signal.SIGTERM, terminate)
    while child.poll() is None:
        readable, _, _ = select.select([master, sys.stdin], [], [], 0.1)
        if master in readable:
            chunk = os.read(master, 65536)
            if chunk:
                report({"output": chunk.decode("utf-8")})
        if sys.stdin in readable:
            chunk = os.read(sys.stdin.fileno(), 65536)
            if not chunk:
                child.terminate()
                continue
            commands += chunk
            while b"\n" in commands:
                line, commands = commands.split(b"\n", 1)
                command = json.loads(line)
                if "input" in command:
                    os.write(master, command["input"].encode("utf-8"))
                elif "signal" in command:
                    os.kill(child.pid, getattr(signal, command["signal"]))
    while select.select([master], [], [], 0)[0]:
        chunk = os.read(master, 65536)
        if not chunk:
            break
        report({"output": chunk.decode("utf-8")})
    report({"exitCode": child.returncode,
            "terminalRestored": termios.tcgetattr(slave) == before})
finally:
    if child.poll() is None:
        child.kill()
        child.wait()
    os.close(master)
    os.close(slave)
